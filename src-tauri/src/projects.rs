use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tokio::sync::Mutex as AsyncMutex;
use serde_json::Value;

use crate::paths::projects_file_path;

/// Serializa gravações de `projects.json` — evita que duas chamadas concorrentes
/// (reload do front, múltiplas abas/telas) façam `rename` fora de ordem.
static SAVE_MUTEX: OnceLock<AsyncMutex<()>> = OnceLock::new();

/// Sequência (timestamp monotônico) da última gravação física bem-sucedida.
/// Só avança após o `fs::rename` confirmar sucesso — uma falha de I/O não
/// avança isto, permitindo retry com a mesma sequência.
static LAST_WRITE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Acima desse atraso (ms) entre `sequence` e o relógio local do backend, uma
/// gravação com `sequence <= LAST_WRITE_SEQUENCE` é tratada como delay de IPC
/// (mensagem antiga que chegou fora de ordem) e descartada. Abaixo disso, é
/// tratada como plausível (ex.: recuo de relógio do SO) e aceita.
const STALE_WRITE_THRESHOLD_MS: i64 = 2000;

fn save_mutex() -> &'static AsyncMutex<()> {
    SAVE_MUTEX.get_or_init(|| AsyncMutex::new(()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn external_todo_path(content: &str) -> Option<PathBuf> {
    let parsed: Value = serde_json::from_str(content).ok()?;
    let directory = parsed
        .get("preferences")?
        .get("todoStoragePath")?
        .as_str()?
        .trim();
    if directory.is_empty() {
        return None;
    }
    Some(PathBuf::from(directory).join("todos.jsonc"))
}

fn merge_external_todos(content: String) -> String {
    let Some(path) = external_todo_path(&content) else {
        return content;
    };
    let Ok(external) = fs::read_to_string(path) else {
        return content;
    };
    let Ok(external_json) = serde_json::from_str::<Value>(&external) else {
        return content;
    };
    let Some(todos) = external_json.get("todos").filter(|value| value.is_array()) else {
        return content;
    };
    let Ok(mut parsed) = serde_json::from_str::<Value>(&content) else {
        return content;
    };
    parsed["todos"] = todos.clone();
    serde_json::to_string(&parsed).unwrap_or(content)
}

fn save_external_todos(content: &str) -> Result<(), String> {
    let Some(path) = external_todo_path(content) else {
        return Ok(());
    };
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let parsed: Value = serde_json::from_str(content).map_err(|error| error.to_string())?;
    let external = serde_json::json!({
        "version": 1,
        "todos": parsed.get("todos").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
    });
    let temporary = path.with_extension("jsonc.tmp");
    fs::write(&temporary, serde_json::to_string_pretty(&external).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

/// Lê `projects.json` cru. Retorna None se o arquivo não existir (primeira
/// abertura). Erros de leitura/parse ficam no front pra decidir se reseta ou
/// mostra erro. Mantemos opaque (String) pra schema poder evoluir só no TS
/// durante o MVP, sem recompilar Rust.
#[tauri::command]
pub fn load_projects(app: AppHandle) -> Result<Option<String>, String> {
    let path = projects_file_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(|content| Some(merge_external_todos(content)))
        .map_err(|error| error.to_string())
}

/// Persiste o JSON cru em `projects.json`. Frontend faz debounce 500ms antes
/// de chamar, e envia `sequence` (timestamp monotônico, ver `writeSequence`
/// em `projectsStore.ts`) pra garantir last-write-wins mesmo se duas chamadas
/// chegarem fora de ordem (reload concorrente, IPC atrasado).
///
/// Escrita atômica via tmp + rename pra não corromper o arquivo se o app
/// crashar no meio (perde no máx. a última escrita).
#[tauri::command]
pub async fn save_projects(app: AppHandle, content: String, sequence: u64) -> Result<(), String> {
    let _guard = save_mutex().lock().await;
    // rust_now só é lido depois do lock adquirido, imediatamente antes da
    // comparação — evita que o tempo de espera pelo mutex conte como "atraso
    // de IPC" da própria mensagem.
    let rust_now = now_ms();
    let last = LAST_WRITE_SEQUENCE.load(Ordering::SeqCst);

    if sequence <= last {
        let delay_ms = rust_now as i64 - sequence as i64;
        if delay_ms > STALE_WRITE_THRESHOLD_MS {
            // Mensagem antiga chegando fora de ordem (IPC delay) — descarta
            // silenciosamente, preservando o que já está em disco.
            return Ok(());
        }
        // sequence <= last mas próximo do relógio atual (ex.: recuo de
        // relógio do SO/NTP) — aceita e deixa LAST_WRITE_SEQUENCE regredir.
        eprintln!(
            "[projects] aviso: sequence {sequence} <= last {last}, mas dentro do limiar \
             de {STALE_WRITE_THRESHOLD_MS}ms (possível recuo de relógio) — gravando mesmo assim."
        );
    }

    let path = projects_file_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &content).map_err(|error| error.to_string())?;
    fs::rename(&tmp, &path).map_err(|error| error.to_string())?;
    save_external_todos(&content)?;

    // Só avança a sequência após a gravação física confirmar sucesso — uma
    // falha acima (write/rename) retorna Err antes de chegar aqui, e o
    // próximo retry com a mesma `sequence` é aceito normalmente.
    LAST_WRITE_SEQUENCE.store(sequence, Ordering::SeqCst);
    Ok(())
}
