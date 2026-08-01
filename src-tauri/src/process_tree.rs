use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use sysinfo::{ProcessesToUpdate, System};

/// Mapeia ptyId → PID raiz do PTY (pwsh.exe / bash).
static PTY_ROOTS: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();

/// Cache da árvore de processos: PID → lista de PIDs filhos diretos.
/// Atualizado a cada pedido com staleness > 2s.
static TREE_CACHE: OnceLock<Mutex<Option<(Instant, HashMap<u32, Vec<u32>>)>>> = OnceLock::new();

fn roots() -> &'static Mutex<HashMap<String, u32>> {
    PTY_ROOTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn tree_cache() -> &'static Mutex<Option<(Instant, HashMap<u32, Vec<u32>>)>> {
    TREE_CACHE.get_or_init(|| Mutex::new(None))
}

/// Monta um mapa pai→filhos de todos os processos do sistema via sysinfo.
fn build_parent_map(sys: &mut System) -> HashMap<u32, Vec<u32>> {
    sys.refresh_processes(ProcessesToUpdate::All);
    let mut map: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, process) in sys.processes() {
        // Threads de /proc/<pid>/task/<tid> entram no mesmo mapa do sysinfo
        // (thread_kind() == Some) — sem filtrar, a árvore fica cheia de
        // "PIDs" que na verdade são threads do mesmo processo, inflando
        // contagem/kill de PTY tree e deixando spawn/kill bem mais lentos.
        if process.thread_kind().is_some() {
            continue;
        }
        if let Some(parent) = process.parent() {
            let parent_pid = parent.as_u32();
            map.entry(parent_pid).or_default().push(pid.as_u32());
        }
    }
    map
}

/// Retorna a árvore de processos (cached 2s).
fn get_parent_map() -> HashMap<u32, Vec<u32>> {
    let cache = tree_cache();
    let mut guard = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some((at, map)) = guard.as_ref() {
        if at.elapsed() < Duration::from_secs(2) {
            return map.clone();
        }
    }
    let mut sys = System::new();
    let fresh = build_parent_map(&mut sys);
    *guard = Some((Instant::now(), fresh.clone()));
    fresh
}

/// Obtém todos os descendentes (BFS) de um PID raiz.
fn collect_descendants(root: u32, parent_map: &HashMap<u32, Vec<u32>>) -> Vec<u32> {
    let mut result = Vec::new();
    let mut frontier = vec![root];
    let mut visited = std::collections::HashSet::new();
    while let Some(pid) = frontier.pop() {
        if !visited.insert(pid) {
            continue;
        }
        if pid != root {
            result.push(pid);
        }
        if let Some(children) = parent_map.get(&pid) {
            for &child in children {
                frontier.push(child);
            }
        }
    }
    result
}

#[derive(Serialize)]
pub struct PtyTreeInfo {
    pub pty_id: String,
    pub root_pid: Option<u32>,
    pub descendants: Vec<u32>,
    pub alive: bool,
}

pub fn register_pty_root(pty_id: &str, pid: u32) {
    if let Ok(mut guard) = roots().lock() {
        guard.insert(pty_id.to_string(), pid);
    }
}

pub fn unregister_pty(pty_id: &str) {
    if let Ok(mut guard) = roots().lock() {
        guard.remove(pty_id);
    }
}

pub fn get_pty_tree(pty_id: &str) -> Option<PtyTreeInfo> {
    let root_pid = {
        let guard = roots().lock().ok()?;
        guard.get(pty_id).copied()
    };
    let parent_map = get_parent_map();
    let (live_descendants, alive) = if let Some(root) = root_pid {
        let desc = collect_descendants(root, &parent_map);
        // Inclui o root se ele ainda estiver vivo (aparece no parent_map)
        let root_alive = parent_map.contains_key(&root) || desc.iter().any(|&p| p == root);
        let alive = root_alive || !desc.is_empty();
        (desc, alive)
    } else {
        (Vec::new(), false)
    };
    Some(PtyTreeInfo {
        pty_id: pty_id.to_string(),
        root_pid,
        descendants: live_descendants,
        alive,
    })
}

/// Mata um PID (Windows via taskkill /F, Unix via SIGKILL).
fn kill_pid(pid: u32) {
    #[cfg(windows)]
    {
        let mut command = std::process::Command::new("taskkill");
        command.args(["/F", "/PID", &pid.to_string()]);
        crate::git_control::hide_console(&mut command);
        let _ = command.output();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
}

/// Mata a árvore inteira de um PTY (raiz + todos os descendentes).
/// Ordem: folhas primeiro → raiz por último para evitar reparentamento.
pub fn kill_pty_tree(pty_id: &str) -> Result<Vec<u32>, String> {
    let root_pid = {
        let guard = roots().lock().map_err(|_| "PTY roots lock poisoned")?;
        guard.get(pty_id).copied()
    };
    let root = root_pid.ok_or_else(|| format!("No root PID registered for PTY: {pty_id}"))?;

    let parent_map = get_parent_map();
    let mut all = collect_descendants(root, &parent_map);
    // Garante que root é o último a morrer (ordem reversa de profundidade)
    all.reverse();
    all.push(root);

    for &pid in &all {
        kill_pid(pid);
    }

    if let Ok(mut guard) = roots().lock() {
        guard.remove(pty_id);
    }

    Ok(all)
}

#[tauri::command]
pub fn get_pty_tree_info(pty_id: String) -> Option<PtyTreeInfo> {
    get_pty_tree(&pty_id)
}

#[tauri::command]
pub fn kill_pty_tree_cmd(pty_id: String) -> Result<Vec<u32>, String> {
    kill_pty_tree(&pty_id)
}
