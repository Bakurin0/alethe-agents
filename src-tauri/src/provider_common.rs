use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Resolve `~/<segments>` a partir de `USERPROFILE` (Windows) ou `HOME` (Unix).
/// Usado pelos módulos de sessão/uso por provider (Claude, Codex, Antigravity)
/// para achar o diretório de dados do CLI correspondente.
pub(crate) fn provider_home_dir(segments: &[&str]) -> Option<PathBuf> {
    let home = env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)?;
    Some(segments.iter().fold(home, |acc, seg| acc.join(seg)))
}

/// mtime de um arquivo em milissegundos desde a época UNIX, com fallback 0
/// (arquivo sem mtime legível não deve quebrar a listagem, só perde a
/// ordenação por recência).
pub(crate) fn file_modified_ms(metadata: &fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|m| m.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Agora em milissegundos desde a época UNIX, com fallback 0.
pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Normaliza um cwd pra comparação: sem separador final, case-insensitive só
/// no Windows (filesystems Unix são case-sensitive). Usado pelos módulos de
/// sessão que filtram por cwd exato (Codex, Antigravity).
pub(crate) fn normalize_cwd(cwd: &str) -> String {
    let trimmed = cwd.trim().trim_end_matches(|c: char| c == '\\' || c == '/');
    if cfg!(windows) {
        trimmed.replace('/', "\\").to_ascii_lowercase()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn now_ms_is_nonzero() {
        assert!(now_ms() > 0);
    }

    #[test]
    fn normalize_cwd_trims_trailing_separators() {
        assert_eq!(normalize_cwd("C:/foo/bar/"), normalize_cwd("C:/foo/bar"));
    }
}
