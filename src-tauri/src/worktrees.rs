//! RFC-003 — Worktree Manager (dual-mode).
//!
//! Isolamento físico por agente, com dois modos escolhidos por projeto:
//!
//! - **GitWorktree** (rápido/leve): `git worktree add` em
//!   `<repo>/.alethe/worktrees/<id>/`, compartilhando o `.git` do repo. Nesse
//!   modo o `.git` do worktree é um ARQUIVO (ponteiro gitdir).
//! - **LocalCopy** (pesado/mais funcional): `git clone --local` gera um repo
//!   independente (objetos por hardlink), sem as limitações do worktree nativo.
//!   Aqui o `.git` é um DIRETÓRIO — é justamente esse marcador que distingue os
//!   dois modos ao listar/remover.
//!
//! Reusa os helpers defensivos de [`crate::git_control`] (resolução/validação de
//! repositório, `git` com console oculto no Windows).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::git_control::{checked_output, git_command, repository_root, with_lock_awareness};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorktreeMode {
    GitWorktree,
    LocalCopy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub agent_id: String,
    pub path: String,
    pub branch: String,
    pub mode: WorktreeMode,
}

/// Só aceita ids alfanuméricos + `-`/`_`. Impede path traversal (o id vira nome
/// de diretório e sufixo de branch), então nada de `/`, `\\`, `..` ou espaços.
fn sanitize_id(agent_id: &str) -> Result<String, String> {
    let trimmed = agent_id.trim();
    if trimmed.is_empty() {
        return Err("invalid_agent_id".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid_agent_id".to_string());
    }
    Ok(trimmed.to_string())
}

fn worktrees_base(root: &Path) -> PathBuf {
    root.join(".alethe").join("worktrees")
}

/// Remove o prefixo verbatim `\\?\` do Windows. `repository_root` canonicaliza os
/// caminhos, e o `git` rejeita esse prefixo quando ele chega como ARGUMENTO
/// (ex.: destino de `worktree add`/`clone`) — como `current_dir` funciona normal.
/// No-op para caminhos que não têm o prefixo (incl. fora do Windows).
pub(crate) fn git_arg(path: &Path) -> String {
    let raw = path.to_string_lossy();
    let stripped = raw
        .strip_prefix(r"\\?\UNC\")
        .map(|rest| format!(r"\\{rest}"))
        .or_else(|| raw.strip_prefix(r"\\?\").map(|rest| rest.to_string()))
        .unwrap_or_else(|| raw.into_owned());
    stripped
}

/// `.git` ARQUIVO ⇒ worktree nativo; `.git` DIRETÓRIO ⇒ clone local. `None` se o
/// diretório não parece um checkout gerenciado por nós.
fn detect_mode(dir: &Path) -> Option<WorktreeMode> {
    let marker = dir.join(".git");
    if marker.is_file() {
        Some(WorktreeMode::GitWorktree)
    } else if marker.is_dir() {
        Some(WorktreeMode::LocalCopy)
    } else {
        None
    }
}

fn current_branch(dir: &Path) -> String {
    git_command(dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub fn worktree_provision(
    repo: String,
    agent_id: String,
    mode: WorktreeMode,
) -> Result<WorktreeInfo, String> {
    let root = repository_root(&repo)?;
    let id = sanitize_id(&agent_id)?;
    let base = worktrees_base(&root);
    std::fs::create_dir_all(&base).map_err(|error| format!("mkdir_failed:{error}"))?;

    let dest = base.join(&id);
    if dest.exists() {
        return Err("worktree_exists".to_string());
    }
    let branch = format!("alethe/agent-{id}");
    let dest_arg = git_arg(&dest);

    match mode {
        WorktreeMode::GitWorktree => {
            checked_output(&root, &["worktree", "add", "-b", &branch, &dest_arg, "HEAD"])?;
        }
        WorktreeMode::LocalCopy => {
            let root_arg = git_arg(&root);
            // `--local` usa hardlinks nos objetos: independente do repo original,
            // porém rápido. A cópia crua (replicar node_modules/build) fica como
            // evolução — ver decisão em aberto no blueprint (RFC-003).
            checked_output(&root, &["clone", "--local", &root_arg, &dest_arg])?;
            checked_output(&dest, &["checkout", "-b", &branch])?;
        }
    }

    Ok(WorktreeInfo {
        agent_id: id,
        path: dest.to_string_lossy().into_owned(),
        branch,
        mode,
    })
}

#[tauri::command]
pub fn worktree_list(repo: String) -> Result<Vec<WorktreeInfo>, String> {
    let root = repository_root(&repo)?;
    let base = worktrees_base(&root);
    let mut result = Vec::new();
    if !base.is_dir() {
        return Ok(result);
    }
    let entries = std::fs::read_dir(&base).map_err(|error| format!("read_dir_failed:{error}"))?;
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let Some(mode) = detect_mode(&dir) else {
            continue;
        };
        let agent_id = dir
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        result.push(WorktreeInfo {
            agent_id,
            path: dir.to_string_lossy().into_owned(),
            branch: current_branch(&dir),
            mode,
        });
    }
    result.sort_by(|a, b| a.agent_id.cmp(&b.agent_id));
    Ok(result)
}

#[tauri::command]
pub fn worktree_remove(repo: String, agent_id: String, force: bool) -> Result<(), String> {
    let root = repository_root(&repo)?;
    let id = sanitize_id(&agent_id)?;
    let base = worktrees_base(&root);
    let dest = base.join(&id);
    if !dest.exists() {
        return Err("worktree_not_found".to_string());
    }

    // Trava dupla contra apagar fora da árvore gerenciada: canonicaliza e exige
    // que o destino esteja dentro de `<repo>/.alethe/worktrees`.
    let canon_base = base
        .canonicalize()
        .map_err(|_| "invalid_worktree_path".to_string())?;
    let canon_dest = dest
        .canonicalize()
        .map_err(|_| "invalid_worktree_path".to_string())?;
    if !canon_dest.starts_with(&canon_base) {
        return Err("invalid_worktree_path".to_string());
    }

    match detect_mode(&dest) {
        Some(WorktreeMode::GitWorktree) => {
            let dest_arg = git_arg(&canon_dest);
            // `lock_target = canon_dest` (não `root`): quem pode estar travado
            // administrativamente é o worktree-alvo, não o repo principal de onde
            // o comando roda. `checked_output` internamente já é lock-aware sobre
            // `root` (retry de index.lock genérico) — esta camada extra cobre o
            // caso específico do lock administrativo do worktree sendo removido.
            with_lock_awareness(&canon_dest, || {
                if force {
                    checked_output(&root, &["worktree", "remove", "--force", &dest_arg])
                } else {
                    checked_output(&root, &["worktree", "remove", &dest_arg])
                }
            })?;
        }
        // Clone local (ou diretório órfão): remove a pasta. O branch é preservado
        // de propósito — remover trabalho não-mergeado exige ação explícita.
        _ => {
            std::fs::remove_dir_all(&canon_dest)
                .map_err(|error| format!("remove_failed:{error}"))?;
        }
    }
    Ok(())
}

/// Trava administrativamente um worktree (`git worktree lock`), com motivo
/// opcional — o motivo fica gravado no arquivo físico `locked` que o
/// `admin_lock_reason` (git_control.rs) lê pra dar precedência absoluta sobre
/// retries de `index.lock` transitório.
#[tauri::command]
pub fn worktree_lock(repo: String, agent_id: String, reason: Option<String>) -> Result<(), String> {
    let root = repository_root(&repo)?;
    let id = sanitize_id(&agent_id)?;
    let dest = worktrees_base(&root).join(&id);
    if !dest.exists() {
        return Err("worktree_not_found".to_string());
    }
    let dest_arg = git_arg(&dest);
    match reason.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => checked_output(&root, &["worktree", "lock", "--reason", value, &dest_arg])?,
        None => checked_output(&root, &["worktree", "lock", &dest_arg])?,
    };
    Ok(())
}

#[tauri::command]
pub fn worktree_unlock(repo: String, agent_id: String) -> Result<(), String> {
    let root = repository_root(&repo)?;
    let id = sanitize_id(&agent_id)?;
    let dest = worktrees_base(&root).join(&id);
    if !dest.exists() {
        return Err("worktree_not_found".to_string());
    }
    let dest_arg = git_arg(&dest);
    // `git worktree unlock` não passa por `with_lock_awareness`/precedência —
    // é o próprio mecanismo de destravar, não deve ser bloqueado pelo lock que
    // ele mesmo está removendo.
    checked_output(&root, &["worktree", "unlock", &dest_arg])?;
    Ok(())
}

/// Integração do modo LocalCopy: o branch `alethe/agent-<id>` vive no CLONE, não
/// no `.git` principal — traz ele para o repo antes do ciclo de merge.
/// No modo GitWorktree o branch já é visível e isso é um no-op ok.
#[tauri::command]
pub fn worktree_fetch_branch(repo: String, agent_id: String) -> Result<(), String> {
    let root = repository_root(&repo)?;
    let id = sanitize_id(&agent_id)?;
    let env = worktrees_base(&root).join(&id);
    let branch = format!("alethe/agent-{id}");

    match detect_mode(&env) {
        Some(WorktreeMode::LocalCopy) => {
            let env_arg = git_arg(&env);
            let refspec = format!("+refs/heads/{branch}:refs/heads/{branch}");
            checked_output(&root, &["fetch", &env_arg, &refspec])?;
            Ok(())
        }
        Some(WorktreeMode::GitWorktree) => Ok(()),
        None => Err("worktree_not_found".to_string()),
    }
}

#[tauri::command]
pub fn worktree_cleanup(repo: String) -> Result<(), String> {
    let root = repository_root(&repo)?;
    checked_output(&root, &["worktree", "prune"])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_repo() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("alethe-worktrees-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        let run = |args: &[&str]| checked_output(&root, args).unwrap();
        run(&["init"]);
        run(&["config", "user.name", "Alethe Test"]);
        run(&["config", "user.email", "alethe@example.invalid"]);
        fs::write(root.join("file.txt"), "one\n").unwrap();
        run(&["add", "file.txt"]);
        run(&["commit", "-m", "init"]);
        root
    }

    #[test]
    fn rejects_unsafe_ids() {
        assert!(sanitize_id("../evil").is_err());
        assert!(sanitize_id("a/b").is_err());
        assert!(sanitize_id("has space").is_err());
        assert!(sanitize_id("").is_err());
        assert!(sanitize_id("agent-01_x").is_ok());
    }

    #[test]
    fn fetch_branch_brings_local_copy_work_into_main_repo() {
        let root = temp_repo();
        let root_str = root.to_string_lossy().into_owned();

        let lc = worktree_provision(root_str.clone(), "fetchme".into(), WorktreeMode::LocalCopy).unwrap();
        let env = Path::new(&lc.path);
        // Commit no CLONE — invisível ao repo principal até o fetch.
        fs::write(env.join("file.txt"), "changed in copy\n").unwrap();
        checked_output(env, &["config", "user.name", "Alethe Test"]).unwrap();
        checked_output(env, &["config", "user.email", "alethe@example.invalid"]).unwrap();
        checked_output(env, &["commit", "-am", "copy work"]).unwrap();

        let missing = git_command(&root, &["rev-parse", "--verify", "refs/heads/alethe/agent-fetchme"])
            .unwrap();
        assert!(!missing.status.success(), "branch não devia existir antes do fetch");

        worktree_fetch_branch(root_str.clone(), "fetchme".into()).unwrap();
        let present = git_command(&root, &["rev-parse", "--verify", "refs/heads/alethe/agent-fetchme"])
            .unwrap();
        assert!(present.status.success(), "branch devia existir após o fetch");

        // GitWorktree: no-op ok. Inexistente: erro limpo.
        let wt = worktree_provision(root_str.clone(), "wtnoop".into(), WorktreeMode::GitWorktree).unwrap();
        assert_eq!(wt.mode, WorktreeMode::GitWorktree);
        worktree_fetch_branch(root_str.clone(), "wtnoop".into()).unwrap();
        assert!(worktree_fetch_branch(root_str.clone(), "nope".into()).is_err());

        worktree_remove(root_str.clone(), "fetchme".into(), true).unwrap();
        worktree_remove(root_str, "wtnoop".into(), true).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn provisions_lists_and_removes_both_modes() {
        let root = temp_repo();
        let root_str = root.to_string_lossy().into_owned();

        let wt = worktree_provision(root_str.clone(), "wt1".into(), WorktreeMode::GitWorktree).unwrap();
        assert_eq!(wt.mode, WorktreeMode::GitWorktree);
        assert!(Path::new(&wt.path).join(".git").is_file());

        let lc = worktree_provision(root_str.clone(), "lc1".into(), WorktreeMode::LocalCopy).unwrap();
        assert_eq!(lc.mode, WorktreeMode::LocalCopy);
        assert!(Path::new(&lc.path).join(".git").is_dir());

        let listed = worktree_list(root_str.clone()).unwrap();
        assert_eq!(listed.len(), 2);

        // Reprovisionar o mesmo id deve falhar (destino já existe).
        assert!(worktree_provision(root_str.clone(), "wt1".into(), WorktreeMode::GitWorktree).is_err());

        worktree_remove(root_str.clone(), "wt1".into(), false).unwrap();
        worktree_remove(root_str.clone(), "lc1".into(), false).unwrap();
        assert_eq!(worktree_list(root_str.clone()).unwrap().len(), 0);

        worktree_cleanup(root_str).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn worktree_remove_reports_admin_lock_reason_without_retry() {
        let root = temp_repo();
        let root_str = root.to_string_lossy().into_owned();

        let wt = worktree_provision(root_str.clone(), "ambiente-a".into(), WorktreeMode::GitWorktree).unwrap();

        // Trava administrativa real via `git worktree lock --reason`, como um
        // usuário faria fora do Alethe.
        checked_output(&root, &["worktree", "lock", "--reason", "Aguardando homologacao", &wt.path]).unwrap();

        // A garantia de "nunca faz retry" é estrutural (with_lock_awareness
        // checa admin_lock_reason ANTES de chamar run()) e já é coberta por
        // timing em git_control::tests::admin_lock_takes_precedence_and_is_never_retried.
        // Aqui só confirmamos que a integração real com worktree_remove propaga o
        // motivo correto.
        let error = worktree_remove(root_str.clone(), "ambiente-a".into(), true).unwrap_err();
        assert_eq!(error, "admin_locked:Aguardando homologacao");

        // Destrava e confirma que a remoção funciona normalmente depois.
        worktree_unlock(root_str.clone(), "ambiente-a".into()).unwrap();
        worktree_remove(root_str.clone(), "ambiente-a".into(), true).unwrap();
        assert_eq!(worktree_list(root_str).unwrap().len(), 0);

        fs::remove_dir_all(root).unwrap();
    }
}
