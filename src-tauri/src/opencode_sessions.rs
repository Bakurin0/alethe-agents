use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize)]
pub struct OpenCodeSessionSnapshot {
    pub id: String,
    pub modified_at_ms: u128,
}

/// Normaliza um path pra comparação: lowercase, separadores unificados e sem
/// separador final. Windows é case-insensitive e o OpenCode grava `directory`
/// com backslashes.
fn normalize_path(path: &str) -> String {
    let mut normalized = path.replace('\\', "/").to_lowercase();
    while normalized.ends_with('/') {
        normalized.pop();
    }
    normalized
}

/// Executa `opencode session list --format json` NO cwd do projeto e parseia a
/// saída. O OpenCode escopa a listagem pelo diretório atual do processo, e cada
/// entrada traz o campo `directory` — filtramos por ele pra nunca vazar sessão
/// de outro projeto (ex.: `--continue` global pegando a sessão errada).
/// Retorna as sessões ordenadas por data de modificação (mais recente primeiro).
#[tauri::command]
pub fn snapshot_opencode_sessions(cwd: String) -> Result<Vec<OpenCodeSessionSnapshot>, String> {
    let mut command = Command::new("opencode");
    command.args(["session", "list", "--format", "json", "--max-count", "50"]);
    if !cwd.is_empty() && Path::new(&cwd).is_dir() {
        command.current_dir(&cwd);
    }
    let output = command
        .output()
        .map_err(|e| format!("falha ao executar opencode: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("opencode session list falhou: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries: Vec<serde_json::Value> =
        serde_json::from_str(&stdout).map_err(|e| format!("falha ao parsear JSON: {e}"))?;

    let target = normalize_path(&cwd);
    let mut sessions: Vec<OpenCodeSessionSnapshot> = entries
        .into_iter()
        .filter_map(|entry| {
            let id = entry.get("id")?.as_str()?.to_string();
            let updated = entry.get("updated")?.as_f64()? as u128;
            // `directory` ausente (versões antigas do CLI) não filtra — melhor
            // incluir do que esconder a sessão do próprio projeto.
            if !target.is_empty() {
                if let Some(directory) = entry.get("directory").and_then(|d| d.as_str()) {
                    if normalize_path(directory) != target {
                        return None;
                    }
                }
            }
            Some(OpenCodeSessionSnapshot {
                id,
                modified_at_ms: updated,
            })
        })
        .collect();

    sessions.sort_by(|a, b| b.modified_at_ms.cmp(&a.modified_at_ms));
    Ok(sessions)
}
