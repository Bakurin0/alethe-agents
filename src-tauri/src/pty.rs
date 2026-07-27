use portable_pty::{native_pty_system, MasterPty, PtySize};
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

use crate::cli_resolver::{command_builder_for_terminal, find_windows_cli_launcher};
use crate::diagnostics::append_spawn_log;
use crate::paths::{scrollback_dir, scrollback_path};
use crate::process_tree;

pub const SCROLLBACK_CAP_BYTES: usize = 4 * 1024 * 1024;
pub const SCROLLBACK_FLUSH_INTERVAL_MS: u128 = 250;
/// Acima disso o `.bin` (append-only) é compactado pra cauda de
/// `SCROLLBACK_CAP_BYTES`. 2× o cap = ~2× de write-amplification amortizada
/// sobre a saída real, e no máximo ~8 MB por terminal em disco.
pub const SCROLLBACK_COMPACT_BYTES: u64 = SCROLLBACK_CAP_BYTES as u64 * 2;
const TEARDOWN_NORMAL: u8 = 0;
const TEARDOWN_KILLED: u8 = 1;
const TEARDOWN_SUSPENDED: u8 = 2;
const TEARDOWN_RESTARTED: u8 = 3;

pub struct ScrollbackBuffer {
    pub data: VecDeque<u8>,
    pub last_flush: Instant,
    pub dirty: bool,
    /// Bytes novos ainda não escritos em disco. O flush faz APPEND só disto —
    /// não reescreve os 4 MB do anel. Sem isso, um spinner (poucos bytes/s)
    /// forçava um rewrite de 4 MB a cada 250ms (~16 MB/s por terminal ativo).
    pub pending: Vec<u8>,
}

impl ScrollbackBuffer {
    pub fn new(initial: VecDeque<u8>) -> Self {
        Self {
            data: initial,
            last_flush: Instant::now(),
            dirty: false,
            pending: Vec::new(),
        }
    }
}

/// Quantos bytes do início de `buf` formam UTF-8 válido. O resto (0–3 bytes) é
/// a cauda de um caractere multibyte que o `read()` do PTY partiu no limite do
/// buffer — esses bytes esperam a próxima leitura pra não virarem `�`.
fn valid_utf8_prefix_len(buf: &[u8]) -> usize {
    match std::str::from_utf8(buf) {
        Ok(s) => s.len(),
        Err(error) => error.valid_up_to(),
    }
}

pub struct PtySession {
    pub pty_id: String,
    pub master: Box<dyn MasterPty + Send>,
    // writer fica em Arc<Mutex> pra write_pty poder soltar o lock global de
    // sessions antes de escrever. Sem isso, escritas longas de um PTY bloqueiam
    // qualquer outra operacao (resize, attach, kill) em todos os outros PTYs.
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    pub scrollback: Arc<Mutex<ScrollbackBuffer>>,
    /// Sinaliza que o reader terminou de persistir a cauda final. Suspensão
    /// espera esta barreira antes de permitir que o mesmo id seja retomado.
    pub reader_done: Arc<(Mutex<Option<bool>>, Condvar)>,
    /// Motivo do teardown. Kill/restart pulam o flush final; suspend espera o
    /// flush final do reader antes de permitir a retomada do mesmo `ptyId`.
    pub teardown: Arc<AtomicU8>,
    pub command: Option<String>,
    pub cwd: Option<String>,
    pub read_active: Arc<(std::sync::Mutex<bool>, std::sync::Condvar)>,
}

pub type PtySessions = Arc<Mutex<HashMap<String, PtySession>>>;

/// Coordena somente spawns do MESMO id. O mutex de `PtySessions` não pode
/// permanecer travado durante `openpty`/resolução/spawn do processo: isso
/// serializava todos os terminais apesar da fila do frontend permitir paralelismo.
static SPAWN_COORDINATOR: OnceLock<(Mutex<HashSet<String>>, Condvar)> = OnceLock::new();

struct SpawnReservation {
    id: String,
}

impl Drop for SpawnReservation {
    fn drop(&mut self) {
        let (spawning, ready) =
            SPAWN_COORDINATOR.get_or_init(|| (Mutex::new(HashSet::new()), Condvar::new()));
        if let Ok(mut ids) = spawning.lock() {
            ids.remove(&self.id);
            ready.notify_all();
        }
    }
}

fn reserve_spawn(
    sessions: &PtySessions,
    id: &str,
) -> Result<Option<SpawnReservation>, String> {
    let (spawning, ready) =
        SPAWN_COORDINATOR.get_or_init(|| (Mutex::new(HashSet::new()), Condvar::new()));
    let mut ids = spawning
        .lock()
        .map_err(|_| "PTY spawn coordinator lock poisoned".to_string())?;

    loop {
        let already_spawned = sessions
            .lock()
            .map_err(|_| "PTY sessions lock poisoned".to_string())?
            .contains_key(id);
        if already_spawned {
            return Ok(None);
        }
        if ids.insert(id.to_string()) {
            return Ok(Some(SpawnReservation { id: id.to_string() }));
        }
        ids = ready
            .wait(ids)
            .map_err(|_| "PTY spawn coordinator wait poisoned".to_string())?;
    }
}

#[derive(Serialize)]
pub struct SpawnPtyResponse {
    pub id: String,
}

#[derive(Clone, Serialize)]
pub struct PtyExitPayload {
    pub code: Option<i32>,
    pub reason: &'static str,
}

#[derive(Clone, Serialize)]
pub struct PtySuspendedPayload {
    pub id: String,
    pub reason: &'static str,
}

#[derive(Serialize)]
pub struct PtyProcessSnapshot {
    pub id: String,
    pub pid: Option<u32>,
    pub command: Option<String>,
    pub cwd: Option<String>,
    pub process_name: Option<String>,
    pub cmdline: Option<String>,
    pub memory_mb: f64,
    pub alive: bool,
}

#[tauri::command]
pub fn pty_exists(sessions: State<'_, PtySessions>, id: String) -> Result<bool, String> {
    let sessions = sessions
        .lock()
        .map_err(|_| "PTY sessions lock poisoned".to_string())?;
    Ok(sessions.contains_key(&id))
}

#[tauri::command]
pub fn spawn_pty(
    app: AppHandle,
    sessions: State<'_, PtySessions>,
    cols: u16,
    rows: u16,
    id: Option<String>,
    command: Option<String>,
    cwd: Option<String>,
    extra_args: Option<Vec<String>>,
    // launcher_override: path absoluto que supersede o auto-detect. Frontend
    // passa quando o user configurou um path manual via cliPaths.
    launcher_override: Option<String>,
    // env extra só deste PTY (ex.: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 no
    // canvas) — nunca polui o ambiente global nem outros terminais.
    env: Option<std::collections::HashMap<String, String>>,
) -> Result<SpawnPtyResponse, String> {
    let extras: Vec<String> = extra_args.unwrap_or_default();
    let spawn_started = Instant::now();
    let id = id.unwrap_or_else(|| nanoid::nanoid!());
    let requested_command = command.clone();

    let sessions_ref = Arc::clone(sessions.inner());
    let Some(_spawn_reservation) = reserve_spawn(&sessions_ref, &id)? else {
        return Ok(SpawnPtyResponse { id });
    };

    let scrollback = Arc::new(Mutex::new(ScrollbackBuffer::new(load_scrollback(
        &app, &id,
    )?)));
    let teardown = Arc::new(AtomicU8::new(TEARDOWN_NORMAL));
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let resolve_started = Instant::now();
    // 1. Se frontend mandou override (user configurou via cliPaths), usa ele
    //    direto — só validando que existe pra evitar PathBuf vazio fantasma.
    // 2. Senão, auto-detect via find_windows_cli_launcher.
    let resolved_launcher = if let Some(override_path) = launcher_override
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .filter(|p| p.is_file())
    {
        Some(override_path.to_string_lossy().to_string())
    } else {
        requested_command
            .as_deref()
            .and_then(|raw| {
                let trimmed = raw.trim();
                if trimmed.is_empty() {
                    return None;
                }
                find_windows_cli_launcher(trimmed)
            })
            .map(|path| path.to_string_lossy().to_string())
    };
    let mut command = command_builder_for_terminal(
        requested_command.as_deref(),
        resolved_launcher.as_deref(),
        &extras,
    );
    if let Some(extra_env) = env.as_ref() {
        for (key, value) in extra_env {
            command.env(key, value);
        }
    }
    let resolve_ms = resolve_started.elapsed().as_millis();
    let builder_ms = spawn_started.elapsed().as_millis();
    let effective_path_preview = command
        .get_env("Path")
        .or_else(|| command.get_env("PATH"))
        .map(|value| {
            let s = value.to_string_lossy();
            let limit = s.len().min(240);
            s[..limit].to_string()
        })
        .unwrap_or_else(|| "<none>".to_string());
    let cwd_warning = if let Some(cwd_value) = cwd.as_deref().filter(|cwd| !cwd.is_empty()) {
        if PathBuf::from(cwd_value).is_dir() {
            command.cwd(cwd_value);
            None
        } else {
            Some(format!(
                "\r\nWarning: cwd not found, using default directory: {cwd_value}\r\n"
            ))
        }
    } else {
        None
    };
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    let shell_spawn_ms = spawn_started.elapsed().as_millis();
    let child = Arc::new(Mutex::new(child));
    let child_pid = child.lock().ok().and_then(|child| child.process_id());
    if let Some(pid) = child_pid {
        process_tree::register_pty_root(&id, pid);
    }
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = Arc::new(Mutex::new(
        pair.master
            .take_writer()
            .map_err(|error| error.to_string())?,
    ));
    let event_name = format!("pty://data/{id}");
    let exit_event_name = format!("pty://exit/{id}");
    let event_app = app.clone();
    let scrollback_app = app.clone();
    let scrollback_id = id.clone();
    let thread_scrollback = Arc::clone(&scrollback);
    let thread_teardown = Arc::clone(&teardown);
    let reader_done = Arc::new((Mutex::new(None), Condvar::new()));
    let thread_reader_done = Arc::clone(&reader_done);
    let thread_child = Arc::clone(&child);
    let thread_sessions = Arc::clone(sessions.inner());
    let initial_warning = cwd_warning.clone();
    let read_active = Arc::new((std::sync::Mutex::new(true), std::sync::Condvar::new()));
    let thread_read_active = Arc::clone(&read_active);

    // Reader síncrono na thread-pool bloqueante do Tokio manda chunks por um
    // canal MPSC; o batcher async coalesce por até 16ms (60 FPS) ou 64 KB antes
    // de emitir. Resultado: 1 evento IPC + 1 push_scrollback por LOTE em vez de
    // 1 por read — elimina micro-stutters com N terminais em saída pesada.
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(1024);

    tauri::async_runtime::spawn(async move {
        tokio::task::spawn_blocking(move || {
            // 32 KiB: menos syscalls sob saída pesada (builds, cat de arquivo
            // grande) sem custo de latência pra outputs pequenos.
            let mut buffer = [0_u8; 32 * 1024];
            loop {
                // Checa se leitura está ativa. Se não, bloqueia no Condvar.
                {
                    let (lock, cvar) = &*thread_read_active;
                    let mut active = lock.lock().unwrap();
                    while !*active {
                        active = cvar.wait(active).unwrap();
                    }
                }

                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        if tx.blocking_send(buffer[..count].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        // Cauda de um caractere UTF-8 multibyte partido entre dois lotes.
        let mut carry: Vec<u8> = Vec::new();
        let mut batch: Vec<u8> = Vec::new();

        if let Some(warning) = initial_warning {
            let _ = event_app.emit(&event_name, &warning);
            let _ = push_scrollback(
                &scrollback_app,
                &scrollback_id,
                &thread_scrollback,
                warning.as_bytes(),
            );
        }

        loop {
            // Bloqueia até o primeiro chunk — zero wakeups quando o terminal
            // está ocioso. None = reader terminou (EOF/erro) e canal fechou.
            let Some(first) = rx.recv().await else { break };
            batch.extend_from_slice(&first);

            // Coalesce o que chegar em até 16ms ou até encher 64 KB.
            let batch_started = Instant::now();
            while batch.len() < 64 * 1024 {
                let remaining =
                    Duration::from_millis(16).saturating_sub(batch_started.elapsed());
                if remaining.is_zero() {
                    break;
                }
                match tokio::time::timeout(remaining, rx.recv()).await {
                    Ok(Some(chunk)) => batch.extend_from_slice(&chunk),
                    // None = canal fechou; ainda emitimos o lote acumulado.
                    Ok(None) => break,
                    // Timeout de 16ms estourou.
                    Err(_) => break,
                }
            }

            let count = batch.len();
            // Scrollback recebe os bytes crus do lote (sempre corretos — só o
            // emit precisa de fronteira de caractere).
            let _ = push_scrollback(&scrollback_app, &scrollback_id, &thread_scrollback, &batch);

            // Emit PRIMEIRO o que é UTF-8 completo — user vê o echo na hora,
            // sem disk I/O no caminho da tecla. Caractere partido no limite do
            // lote fica em `carry` pro próximo ciclo.
            if carry.is_empty() {
                // Caminho rápido (caso comum): nada pendente, zero alloc.
                let valid = valid_utf8_prefix_len(&batch);
                if valid > 0 {
                    // SAFETY: batch[..valid] é UTF-8 válido por construção.
                    let text = unsafe { std::str::from_utf8_unchecked(&batch[..valid]) };
                    let _ = event_app.emit(&event_name, text);
                }
                if valid < count {
                    carry.extend_from_slice(&batch[valid..]);
                }
            } else {
                carry.extend_from_slice(&batch);
                let valid = valid_utf8_prefix_len(&carry);
                if valid > 0 {
                    // SAFETY: carry[..valid] é UTF-8 válido por construção.
                    let text = unsafe { std::str::from_utf8_unchecked(&carry[..valid]) };
                    let _ = event_app.emit(&event_name, text);
                    carry.drain(..valid);
                }
            }

            // `carry` só deve guardar a cauda de UM caractere (≤3 bytes).
            // Se passar disso, são bytes inválidos que nunca completam:
            // emite lossy (mostra �) e zera pra não vazar nem travar.
            if carry.len() > 3 {
                let lossy = String::from_utf8_lossy(&carry).into_owned();
                let _ = event_app.emit(&event_name, lossy.as_str());
                carry.clear();
            }

            batch.clear();

            // Backpressure leve pra dar vazão à fila IPC do webview.
            tokio::time::sleep(Duration::from_millis(2)).await;
        }

        // Flush de qualquer cauda restante no fim do stream.
        if !carry.is_empty() {
            let lossy = String::from_utf8_lossy(&carry).into_owned();
            let _ = event_app.emit(&event_name, lossy.as_str());
        }

        // PTY morreu: garante o scrollback no disco e LIBERA o buffer em RAM (até
        // 4 MiB). A sessão fica no HashMap; attach_pty recarrega do disco se preciso.
        // Só libera se o flush deu certo, pra nunca perder dados não persistidos.
        //
        // EXCEÇÃO kill/restart (`killed`): NÃO reescreve o .bin. Em kill_pty o
        // delete_scrollback já removeu o arquivo; em restart_pty um novo spawn
        // reusou o mesmo id — em ambos, um Overwrite tardio deste reader morto
        // ressuscitaria/corromperia o arquivo. Aqui só liberamos o buffer em RAM.
        let teardown_reason = thread_teardown.load(Ordering::SeqCst);
        let persisted = if teardown_reason == TEARDOWN_KILLED
            || teardown_reason == TEARDOWN_RESTARTED
        {
            if let Ok(mut buffer) = thread_scrollback.lock() {
                buffer.data = VecDeque::new();
                buffer.pending.clear();
                buffer.dirty = false;
            }
            true
        } else {
            let flushed = flush_scrollback(&scrollback_app, &scrollback_id, &thread_scrollback)
                .and_then(|_| {
                    if teardown_reason == TEARDOWN_SUSPENDED {
                        wait_for_scrollback_writer()
                    } else {
                        Ok(())
                    }
                })
                .is_ok();
            if flushed {
                if let Ok(mut buffer) = thread_scrollback.lock() {
                    buffer.data = VecDeque::new();
                    buffer.dirty = false;
                }
            }
            flushed
        };

        let (done_lock, done_ready) = &*thread_reader_done;
        if let Ok(mut done) = done_lock.lock() {
            *done = Some(persisted);
            done_ready.notify_all();
        }

        let code = thread_child
            .lock()
            .ok()
            .and_then(|mut child| child.wait().ok())
            .map(|status| status.exit_code() as i32);
        let reason = match teardown_reason {
            TEARDOWN_KILLED => "killed",
            TEARDOWN_SUSPENDED => "suspended",
            TEARDOWN_RESTARTED => "restarted",
            _ => "exited",
        };
        let _ = event_app.emit(&exit_event_name, PtyExitPayload { code, reason });

        if let Some(pid) = child_pid {
            if let Ok(mut sessions) = thread_sessions.lock() {
                let should_remove = sessions
                    .get(&scrollback_id)
                    .and_then(|session| session.child.lock().ok()?.process_id())
                    .map(|current_pid| current_pid == pid)
                    .unwrap_or(false);
                if should_remove {
                    sessions.remove(&scrollback_id);
                }
            }
        }
    });

    let _ = append_spawn_log(
        &app,
        &format!(
            "spawn id={id} command={:?} launcher={:?} resolve_ms={resolve_ms} builder_ms={builder_ms} shell_spawn_ms={shell_spawn_ms} total_ms={} path_preview={effective_path_preview:?}",
            requested_command,
            resolved_launcher,
            spawn_started.elapsed().as_millis()
        ),
    );

    let session = PtySession {
        pty_id: id.clone(),
        master: pair.master,
        writer,
        child,
        scrollback,
        reader_done,
        teardown,
        command: requested_command,
        cwd,
        read_active,
    };

    sessions
        .lock()
        .map_err(|_| "PTY sessions lock poisoned".to_string())?
        .insert(id.clone(), session);

    Ok(SpawnPtyResponse { id })
}

/// Mata a árvore de processos inteira (o filho direto + todos os descendentes) a
/// partir do PID. `portable_pty::Child::kill()` no Windows só mata o processo
/// direto (o shell/ConPTY) — `node`/`claude`/`codex` e seus filhos (MCP, workers)
/// ficam órfãos, vazando processos e RAM a cada close/restart. `taskkill /F /T`
/// derruba a árvore toda. Deve ser chamado ANTES de `child.kill()` (com o pai
/// ainda vivo, senão a travessia da árvore não encontra os netos reparentados).
#[cfg(windows)]
fn kill_process_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(not(windows))]
fn kill_process_tree(_pid: u32) {}

#[tauri::command]
pub fn restart_pty(
    app: AppHandle,
    sessions: State<'_, PtySessions>,
    id: String,
    command: Option<String>,
    cwd: Option<String>,
    extra_args: Option<Vec<String>>,
    launcher_override: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<SpawnPtyResponse, String> {
    {
        let mut sessions = sessions
            .lock()
            .map_err(|_| "PTY sessions lock poisoned".to_string())?;
        if let Some(session) = sessions.remove(&id) {
            session.teardown.store(TEARDOWN_RESTARTED, Ordering::SeqCst);
            if let Ok(mut child) = session.child.lock() {
                if let Some(pid) = child.process_id() {
                    kill_process_tree(pid);
                }
                let _ = child.kill();
            }
        }
    }

    delete_scrollback(&app, &id)?;
    spawn_pty(
        app,
        sessions,
        80,
        24,
        Some(id),
        command,
        cwd,
        extra_args,
        launcher_override,
        env,
    )
}

#[tauri::command]
pub fn attach_pty(
    app: AppHandle,
    sessions: State<'_, PtySessions>,
    id: String,
    max_bytes: Option<usize>,
) -> Result<String, String> {
    let max_bytes = max_bytes.unwrap_or(512 * 1024).max(16 * 1024);

    // Caminho comum: serve do buffer em memória.
    {
        let sessions = sessions
            .lock()
            .map_err(|_| "PTY sessions lock poisoned".to_string())?;
        if let Some(session) = sessions.get(&id) {
            let mut buffer = session
                .scrollback
                .lock()
                .map_err(|_| "PTY scrollback lock poisoned".to_string())?;
            if !buffer.data.is_empty() {
            // make_contiguous + slice evita a cópia extra do iter().skip().collect().
            let slice = buffer.data.make_contiguous();
            let start = slice.len().saturating_sub(max_bytes);
                return Ok(String::from_utf8_lossy(&slice[start..]).into_owned());
            }
        }
    }

    // Buffer vazio: PTY recém-criado (sem output) ou PTY morto cujo buffer foi
    // liberado. Em ambos os casos o disco tem a verdade (vazio ou o scrollback final).
    let disk = load_scrollback(&app, &id)?;
    let bytes: Vec<u8> = disk.into_iter().collect();
    let start = bytes.len().saturating_sub(max_bytes);
    Ok(String::from_utf8_lossy(&bytes[start..]).into_owned())
}

#[tauri::command]
pub fn write_pty(sessions: State<'_, PtySessions>, id: String, data: String) -> Result<(), String> {
    // Pega o handle do writer e SOLTA o lock global de sessions antes de
    // escrever. Escrita pode bloquear no PTY (buffer cheio); se segurassemos o
    // lock, qualquer attach/resize/kill/spawn em outro PTY ficaria parado.
    let writer = {
        let sessions = sessions
            .lock()
            .map_err(|_| "PTY sessions lock poisoned".to_string())?;
        let session = sessions
            .get(&id)
            .ok_or_else(|| format!("PTY not found: {id}"))?;
        Arc::clone(&session.writer)
    };
    let mut writer = writer
        .lock()
        .map_err(|_| "PTY writer lock poisoned".to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resize_pty(
    sessions: State<'_, PtySessions>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = sessions
        .lock()
        .map_err(|_| "PTY sessions lock poisoned".to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("PTY not found: {id}"))?;

    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    // OpenCode no Windows/Linux/macOS nem sempre redesenha a TUI após resize — a
    // tela fica truncada até a próxima tecla. Ctrl+L (Form Feed) força o
    // redraw em todas as plataformas.
    if session.command.as_deref() == Some("opencode") {
        if let Ok(mut writer) = session.writer.lock() {
            let _ = writer.write_all(&[12]);
            let _ = writer.flush();
        }
    }

    Ok(())
}

fn terminate_session(session: PtySession) {
    process_tree::unregister_pty(&session.pty_id);
    {
        let (lock, cvar) = &*session.read_active;
        if let Ok(mut active) = lock.lock() {
            *active = true;
            cvar.notify_all();
        }
    }
    if let Ok(mut child) = session.child.lock() {
        if let Some(pid) = child.process_id() {
            kill_process_tree(pid);
        }
        let _ = child.kill();
    }
}

#[tauri::command]
pub fn kill_pty(
    app: AppHandle,
    sessions: State<'_, PtySessions>,
    id: String,
) -> Result<(), String> {
    let mut sessions = sessions
        .lock()
        .map_err(|_| "PTY sessions lock poisoned".to_string())?;

    if let Some(session) = sessions.remove(&id) {
        session.teardown.store(TEARDOWN_KILLED, Ordering::SeqCst);
        terminate_session(session);
    }

    delete_scrollback(&app, &id)?;
    Ok(())
}

/// Estaciona um runtime sem apagar scrollback nem identidade de sessão.
///
/// Encerra o processo e espera o reader persistir sua última cauda. Assim um
/// novo spawn com o mesmo id nunca disputa com writes do reader antigo.
pub fn suspend_session(app: &AppHandle, sessions: &PtySessions, id: &str) -> Result<bool, String> {
    let session = {
        let mut sessions = sessions
            .lock()
            .map_err(|_| "PTY sessions lock poisoned".to_string())?;
        sessions.remove(id)
    };
    let Some(session) = session else {
        return Ok(false);
    };

    session
        .teardown
        .store(TEARDOWN_SUSPENDED, Ordering::SeqCst);
    if let Ok(mut child) = session.child.lock() {
        if let Some(pid) = child.process_id() {
            kill_process_tree(pid);
        }
        let _ = child.kill();
    }
    let (done_lock, done_ready) = &*session.reader_done;
    let done = done_lock
        .lock()
        .map_err(|_| "PTY reader barrier lock poisoned".to_string())?;
    let (done, timeout) = done_ready
        .wait_timeout_while(done, Duration::from_secs(5), |status| status.is_none())
        .map_err(|_| "PTY reader barrier lock poisoned".to_string())?;
    if timeout.timed_out() && done.is_none() {
        return Err("PTY reader flush barrier timed out".to_string());
    }
    if *done != Some(true) {
        return Err("PTY reader failed to persist scrollback".to_string());
    }
    let _ = app.emit(
        "resource://pty-suspended",
        PtySuspendedPayload {
            id: id.to_string(),
            reason: "memory-pressure",
        },
    );
    let _ = append_spawn_log(app, &format!("suspend id={id} reason=memory-pressure"));
    Ok(true)
}

#[tauri::command]
pub fn suspend_pty(
    app: AppHandle,
    sessions: State<'_, PtySessions>,
    id: String,
) -> Result<bool, String> {
    suspend_session(&app, sessions.inner(), &id)
}

#[tauri::command]
pub fn get_pty_cwd(sessions: State<'_, PtySessions>, id: String) -> Option<String> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    let sessions = sessions.lock().ok()?;
    let session = sessions.get(&id)?;
    let pid_u32 = session.child.lock().ok()?.process_id()?;
    drop(sessions);

    let mut sys = System::new();
    let pid = Pid::from_u32(pid_u32);
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        ProcessRefreshKind::new().with_cwd(sysinfo::UpdateKind::Always),
    );
    let cwd = sys.process(pid)?.cwd()?.to_string_lossy().to_string();
    Some(cwd)
}

#[tauri::command]
pub fn set_pty_read_state(
    sessions: State<'_, PtySessions>,
    id: String,
    active: bool,
) -> Result<(), String> {
    let sessions = sessions
        .lock()
        .map_err(|_| "PTY sessions lock poisoned".to_string())?;
    if let Some(session) = sessions.get(&id) {
        let (lock, cvar) = &*session.read_active;
        if let Ok(mut read_active) = lock.lock() {
            *read_active = active;
            if active {
                cvar.notify_all();
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_pty_priority(
    _sessions: State<'_, PtySessions>,
    _id: String,
    _active: bool,
) -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        let sessions = _sessions
            .lock()
            .map_err(|_| "PTY sessions lock poisoned".to_string())?;
        if let Some(session) = sessions.get(&_id) {
            if let Ok(child) = session.child.lock() {
                if let Some(pid) = child.process_id() {
                    use windows_sys::Win32::Foundation::CloseHandle;
                    use windows_sys::Win32::System::Threading::{
                        OpenProcess, SetPriorityClass, IDLE_PRIORITY_CLASS,
                        NORMAL_PRIORITY_CLASS, PROCESS_SET_INFORMATION,
                    };

                    let handle = OpenProcess(PROCESS_SET_INFORMATION, 0, pid);
                    if !handle.is_null() {
                        let priority = if active {
                            NORMAL_PRIORITY_CLASS
                        } else {
                            IDLE_PRIORITY_CLASS
                        };
                        let _ = SetPriorityClass(handle, priority);
                        let _ = CloseHandle(handle);
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_pty_processes(sessions: State<'_, PtySessions>) -> Vec<PtyProcessSnapshot> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

    let raw = {
        let Ok(sessions) = sessions.lock() else {
            return Vec::new();
        };
        sessions
            .iter()
            .map(|(id, session)| {
                let pid = session.child.lock().ok().and_then(|child| child.process_id());
                (id.clone(), pid, session.command.clone(), session.cwd.clone())
            })
            .collect::<Vec<_>>()
    };

    let pids = raw
        .iter()
        .filter_map(|(_, pid, _, _)| pid.map(Pid::from_u32))
        .collect::<Vec<_>>();
    let mut sys = System::new();
    if !pids.is_empty() {
        sys.refresh_processes_specifics(
            ProcessesToUpdate::Some(&pids),
            ProcessRefreshKind::everything(),
        );
    }

    raw.into_iter()
        .map(|(id, pid, command, cwd)| {
            let process = pid.and_then(|pid| sys.process(Pid::from_u32(pid)));
            let memory_mb = process
                .map(|process| process.memory() as f64 / 1024.0 / 1024.0)
                .unwrap_or(0.0);
            let process_name = process.map(|process| process.name().to_string_lossy().to_string());
            let cmdline = process.map(|process| {
                process
                    .cmd()
                    .iter()
                    .map(|part| part.to_string_lossy())
                    .collect::<Vec<_>>()
                    .join(" ")
            });
            PtyProcessSnapshot {
                id,
                pid,
                command,
                cwd,
                process_name,
                cmdline,
                memory_mb,
                alive: process.is_some(),
            }
        })
        .collect()
}

pub fn load_scrollback(app: &AppHandle, id: &str) -> Result<VecDeque<u8>, String> {
    let path = scrollback_path(app, id)?;
    if !path.exists() {
        return Ok(VecDeque::new());
    }

    let mut data = fs::read(path).map_err(|error| error.to_string())?;
    if data.len() > SCROLLBACK_CAP_BYTES {
        data = data[data.len() - SCROLLBACK_CAP_BYTES..].to_vec();
    }
    Ok(data.into())
}

/// Writer global de scrollback: uma única thread em background recebe
/// `(path, bytes)` e escreve. Evita spawnar uma thread a cada flush (250ms por
/// PTY ativo). Vive pela vida do processo — sem teardown por PTY, sem vazar thread.
enum ScrollbackWrite {
    /// Anexa `bytes` ao fim do `.bin` (cria se não existir). Compacta pra cauda
    /// de `SCROLLBACK_CAP_BYTES` se o arquivo passar de `SCROLLBACK_COMPACT_BYTES`.
    Append { path: PathBuf, bytes: Vec<u8> },
    /// Reescreve o arquivo inteiro (usado no teardown do PTY, uma vez).
    Overwrite { path: PathBuf, bytes: Vec<u8> },
    /// Confirma que todos os appends/overwrites anteriores já chegaram ao disco.
    Barrier(std::sync::mpsc::Sender<()>),
}

/// Anexa e, se o arquivo cresceu além do limite, compacta pra cauda do cap.
/// Compactar é raro (a cada ~4 MB de saída), então o custo é amortizado.
fn append_and_maybe_compact(path: &Path, bytes: &[u8]) {
    let mut file = match fs::OpenOptions::new().create(true).append(true).open(path) {
        Ok(file) => file,
        Err(_) => return,
    };
    if file.write_all(bytes).is_err() {
        return;
    }
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    drop(file);
    if len > SCROLLBACK_COMPACT_BYTES {
        if let Ok(all) = fs::read(path) {
            if all.len() > SCROLLBACK_CAP_BYTES {
                let tail = &all[all.len() - SCROLLBACK_CAP_BYTES..];
                let _ = fs::write(path, tail);
            }
        }
    }
}

/// Writer global de scrollback: uma única thread em background recebe comandos
/// e escreve. Evita spawnar uma thread a cada flush (250ms por PTY ativo).
/// Vive pela vida do processo — sem teardown por PTY, sem vazar thread.
fn scrollback_writer() -> &'static std::sync::mpsc::Sender<ScrollbackWrite> {
    static WRITER: std::sync::OnceLock<std::sync::mpsc::Sender<ScrollbackWrite>> =
        std::sync::OnceLock::new();
    WRITER.get_or_init(|| {
        let (tx, rx) = std::sync::mpsc::channel::<ScrollbackWrite>();
        thread::spawn(move || {
            while let Ok(msg) = rx.recv() {
                match &msg {
                    ScrollbackWrite::Append { path, bytes } => {
                        if let Some(parent) = path.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        append_and_maybe_compact(path, bytes);
                    }
                    ScrollbackWrite::Overwrite { path, bytes } => {
                        if let Some(parent) = path.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        let _ = fs::write(path, bytes);
                    }
                    ScrollbackWrite::Barrier(done) => {
                        let _ = done.send(());
                    }
                }
            }
        });
        tx
    })
}

fn wait_for_scrollback_writer() -> Result<(), String> {
    let (done_tx, done_rx) = std::sync::mpsc::channel();
    scrollback_writer()
        .send(ScrollbackWrite::Barrier(done_tx))
        .map_err(|_| "scrollback writer unavailable".to_string())?;
    done_rx
        .recv_timeout(std::time::Duration::from_secs(3))
        .map_err(|_| "scrollback writer barrier timed out".to_string())
}

pub fn push_scrollback(
    app: &AppHandle,
    id: &str,
    scrollback: &Arc<Mutex<ScrollbackBuffer>>,
    data: &[u8],
) -> Result<(), String> {
    let mut buffer = scrollback
        .lock()
        .map_err(|_| "PTY scrollback lock poisoned".to_string())?;
    buffer.data.extend(data);
    // Drena de uma vez em vez de pop_front em loop (uma operação vs N).
    if buffer.data.len() > SCROLLBACK_CAP_BYTES {
        let excess = buffer.data.len() - SCROLLBACK_CAP_BYTES;
        buffer.data.drain(..excess);
    }
    // Acumula SÓ os bytes novos pro append. O anel em memória (`data`) continua
    // servindo o getScrollback; o disco recebe só o delta, não os 4 MB inteiros.
    buffer.pending.extend_from_slice(data);
    buffer.dirty = true;

    if buffer.last_flush.elapsed().as_millis() < SCROLLBACK_FLUSH_INTERVAL_MS {
        return Ok(());
    }

    if buffer.data.capacity() > SCROLLBACK_CAP_BYTES * 2 {
        buffer.data.shrink_to(SCROLLBACK_CAP_BYTES);
    }
    let bytes = std::mem::take(&mut buffer.pending);
    buffer.last_flush = Instant::now();
    buffer.dirty = false;
    drop(buffer);

    if bytes.is_empty() {
        return Ok(());
    }

    // Disk write em thread separada — segurar o reader thread aqui causava
    // latência visível de digitação (10-50ms por flush no Windows) propagando
    // pra TODOS os terminais com qualquer atividade.
    let path = scrollback_path(app, id)?;
    // Envia pro writer global em vez de spawnar uma thread por flush.
    let _ = scrollback_writer().send(ScrollbackWrite::Append { path, bytes });
    Ok(())
}

pub fn flush_scrollback(
    app: &AppHandle,
    id: &str,
    scrollback: &Arc<Mutex<ScrollbackBuffer>>,
) -> Result<(), String> {
    let mut buffer = scrollback
        .lock()
        .map_err(|_| "PTY scrollback lock poisoned".to_string())?;
    if !buffer.dirty {
        return Ok(());
    }
    // No teardown reescrevemos o anel inteiro (capado a 4 MB) — é a compactação
    // final do arquivo. `data` já inclui o que estava em `pending`.
    let bytes = buffer.data.iter().copied().collect::<Vec<_>>();
    buffer.pending.clear();
    buffer.last_flush = Instant::now();
    buffer.dirty = false;
    drop(buffer);

    // Via o writer global pra manter ordem FIFO com Appends ainda na fila —
    // senão um Append pendente poderia sobrescrever este Overwrite e duplicar
    // a cauda no disco.
    let path = scrollback_path(app, id)?;
    let _ = scrollback_writer().send(ScrollbackWrite::Overwrite { path, bytes });
    Ok(())
}

pub fn delete_scrollback(app: &AppHandle, id: &str) -> Result<(), String> {
    let path = scrollback_path(app, id)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    let _ = scrollback_dir(app);
    Ok(())
}

/// Remove `.bin` órfãos — scrollback de terminais que não existem mais no
/// projects.json. Roda no startup, ANTES de qualquer spawn (sem corrida).
/// Conservador: só apaga se o id NÃO aparecer em nenhum lugar do texto do
/// projects.json (ids são nanoids; colisão com texto não-relacionado é
/// improvável). Se o projects.json não puder ser lido, não apaga nada.
pub fn cleanup_orphan_scrollback(app: &AppHandle) {
    let Ok(dir) = scrollback_dir(app) else {
        return;
    };
    if !dir.is_dir() {
        return;
    }
    let projects_text = match crate::paths::projects_file_path(app) {
        Ok(path) => fs::read_to_string(&path).unwrap_or_default(),
        Err(_) => return,
    };
    // Vazio = sem projects.json legível → melhor não arriscar apagar nada.
    if projects_text.is_empty() {
        return;
    }
    let Ok(entries) = fs::read_dir(&dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("bin") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !projects_text.contains(stem) {
            let _ = fs::remove_file(&path);
        }
    }
}

pub fn kill_all_sessions(sessions: &PtySessions) {
    let drained = sessions
        .lock()
        .ok()
        .map(|mut sessions| sessions.drain().map(|(_, session)| session).collect::<Vec<_>>())
        .unwrap_or_default();

    for session in drained {
        terminate_session(session);
    }
}

/// Rede de segurança no Windows contra terminais órfãos. Cria um Job Object com
/// KILL_ON_JOB_CLOSE e assigna o PRÓPRIO processo do app; todos os shells ConPTY
/// e seus descendentes (node/claude/codex/MCP) herdam o job. Enquanto o app vive,
/// o handle do job fica aberto; quando o app morre por QUALQUER via — fechar
/// normal, crash ou kill forçado (onde `RunEvent::Exit` NÃO roda) — o SO fecha o
/// handle e mata a árvore inteira. Complementa (não substitui) `kill_all_sessions`.
/// Deve ser chamado bem cedo no boot, antes de qualquer spawn. Falha silenciosa
/// (no-op) se o SO recusar — sem regressão.
#[cfg(windows)]
pub fn install_kill_on_close_guard() {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) == 0
        {
            return;
        }
        let _ = AssignProcessToJobObject(job, GetCurrentProcess());
        // Handle vazado DE PROPÓSITO: fechá-lo dispararia o kill enquanto o app
        // ainda vive. Fica aberto até o processo morrer, quando o SO o fecha.
    }
}

#[cfg(not(windows))]
pub fn install_kill_on_close_guard() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrollback_cap_keeps_long_agent_chats() {
        assert!(SCROLLBACK_CAP_BYTES >= 4 * 1024 * 1024);
    }

    #[test]
    fn valid_utf8_prefix_passes_complete_ascii_and_multibyte() {
        assert_eq!(valid_utf8_prefix_len(b"hello"), 5);
        // "café" — o "é" são 2 bytes (0xC3 0xA9), todos presentes.
        let cafe = "café".as_bytes();
        assert_eq!(valid_utf8_prefix_len(cafe), cafe.len());
        // Box-drawing "─" (3 bytes) completo.
        let line = "─".as_bytes();
        assert_eq!(valid_utf8_prefix_len(line), 3);
    }

    #[test]
    fn valid_utf8_prefix_stops_before_split_multibyte() {
        // Primeiro byte de "é" sozinho (read partiu aqui) → 0 bytes válidos.
        assert_eq!(valid_utf8_prefix_len(&[0xC3]), 0);
        // "a" + primeiro byte de "é" → só o "a" é válido.
        assert_eq!(valid_utf8_prefix_len(&[b'a', 0xC3]), 1);
        // Emoji 😀 (4 bytes) com só os 2 primeiros → 0 válidos.
        let grin = "😀".as_bytes();
        assert_eq!(valid_utf8_prefix_len(&grin[..2]), 0);
    }

    #[test]
    fn valid_utf8_prefix_carry_reassembles_split_char() {
        // Simula o split: "x" + "é" partido entre dois reads.
        let full = "xé".as_bytes(); // [b'x', 0xC3, 0xA9]
        let first = &full[..2]; // "x" + 0xC3
        let valid = valid_utf8_prefix_len(first);
        assert_eq!(valid, 1); // só "x" emitido
        // carry = [0xC3]; chega o resto do próximo read.
        let mut carry = first[valid..].to_vec();
        carry.extend_from_slice(&full[2..]); // + 0xA9
        assert_eq!(valid_utf8_prefix_len(&carry), carry.len()); // "é" completo
    }
}
