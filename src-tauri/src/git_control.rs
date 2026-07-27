use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Output};
use std::thread::sleep;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    path: String,
    original_path: Option<String>,
    status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepositoryStatus {
    repo_root: String,
    branch: String,
    detached: bool,
    ahead: u32,
    behind: u32,
    staged: Vec<GitFileChange>,
    changes: Vec<GitFileChange>,
    untracked: Vec<GitFileChange>,
    conflicts: Vec<GitFileChange>,
}

/// Aplica CREATE_NO_WINDOW no Windows pra que `git.exe` NÃO abra uma janela de
/// console a cada chamada. O GitControl faz polling de status a cada 3s (+ no
/// focus), então sem isso o usuário vê um festival de "terminais" piscando —
/// janelas de console abrindo e fechando sozinhas. No-op fora do Windows.
#[cfg(windows)]
pub(crate) fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn hide_console(_command: &mut Command) {}

/// Delays de backoff incremental pro retry de `index.lock` transitório.
const INDEX_LOCK_RETRY_DELAYS_MS: [u64; 3] = [200, 400, 800];

/// Resolve o "diretório administrativo" do git para o checkout em `dir`:
/// - Repo/clone normal (`.git` é DIRETÓRIO) ⇒ o próprio `.git` (nunca carrega o
///   marcador `locked` de worktree secundária — lock check aqui sempre reporta
///   "não travado").
/// - Worktree (`.git` é ARQUIVO, contém `gitdir: <path>`) ⇒ o `<path>` apontado,
///   que é `<repo-principal>/.git/worktrees/<id>` — é lá que vivem `locked` e
///   `index.lock` desse worktree específico.
fn git_admin_dir(dir: &Path) -> Option<PathBuf> {
    let dot_git = dir.join(".git");
    if dot_git.is_dir() {
        return Some(dot_git);
    }
    if dot_git.is_file() {
        let content = std::fs::read_to_string(&dot_git).ok()?;
        let gitdir = content.lines().find_map(|line| line.trim().strip_prefix("gitdir:"))?;
        return Some(PathBuf::from(gitdir.trim()));
    }
    None
}

/// Lê o motivo do lock ADMINISTRATIVO (`git worktree lock`), se o checkout em
/// `dir` estiver travado dessa forma. `None` = não travado administrativamente
/// (pode ainda ter um `index.lock` transitório — ver `index_lock_present`).
fn admin_lock_reason(dir: &Path) -> Option<String> {
    let locked_file = git_admin_dir(dir)?.join("locked");
    if !locked_file.is_file() {
        return None;
    }
    let reason = std::fs::read_to_string(&locked_file).unwrap_or_default();
    let trimmed = reason.trim();
    Some(if trimmed.is_empty() {
        "sem motivo especificado".to_string()
    } else {
        trimmed.to_string()
    })
}

fn index_lock_present(dir: &Path) -> bool {
    git_admin_dir(dir)
        .map(|admin_dir| admin_dir.join("index.lock").is_file())
        .unwrap_or(false)
}

/// Prefixo de erro estruturado pra lock administrativo — o front (`mergeStore`,
/// `projectsStore`) distingue isso de `git_command_failed:` pra não incrementar
/// `retryCount` nem tratar como corrupção (`TerminalError`) por engano.
pub(crate) fn admin_locked_error(reason: &str) -> String {
    format!("admin_locked:{reason}")
}

/// Camada de consciência de locks em cima de uma chamada git que já interpreta
/// código de saída (`Result<T, String>`). Precedência ABSOLUTA: lock
/// administrativo nunca tenta de novo — falha imediato com o motivo. Só
/// `index.lock` (transitório) aciona o retry com backoff 200/400/800ms.
///
/// `lock_target` é o checkout cujo estado de lock importa — nem sempre é o
/// mesmo diretório onde o comando roda (ex.: remover um worktree a partir da
/// raiz do repo principal, mas quem pode estar travado é o worktree-alvo).
pub(crate) fn with_lock_awareness<T>(
    lock_target: &Path,
    mut run: impl FnMut() -> Result<T, String>,
) -> Result<T, String> {
    if let Some(reason) = admin_lock_reason(lock_target) {
        return Err(admin_locked_error(&reason));
    }
    let mut attempt = 0;
    loop {
        match run() {
            Ok(value) => return Ok(value),
            Err(error) => {
                // Corrida rara: o lock administrativo pode ter aparecido entre a
                // checagem inicial e esta falha — reavalia antes de decidir retry.
                if let Some(reason) = admin_lock_reason(lock_target) {
                    return Err(admin_locked_error(&reason));
                }
                if attempt >= INDEX_LOCK_RETRY_DELAYS_MS.len() || !index_lock_present(lock_target) {
                    return Err(error);
                }
                sleep(Duration::from_millis(INDEX_LOCK_RETRY_DELAYS_MS[attempt]));
                attempt += 1;
            }
        }
    }
}

pub(crate) fn git_command(cwd: &Path, args: &[&str]) -> Result<Output, String> {
    let mut command = Command::new("git");
    command.current_dir(cwd).args(args);
    hide_console(&mut command);
    command.output().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "git_not_found".to_string()
        } else {
            format!("git_exec_failed:{error}")
        }
    })
}

fn push_if_dir(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if path.is_dir() && !candidates.iter().any(|candidate| candidate == &path) {
        candidates.push(path);
    }
}

fn drive_roots() -> Vec<PathBuf> {
    ('A'..='Z')
        .map(|letter| PathBuf::from(format!("{letter}:\\")))
        .filter(|path| path.is_dir())
        .collect()
}

fn resolve_input_directory(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("directory_not_found".to_string());
    }

    let expanded = if trimmed == "~" {
        dirs_next::home_dir().unwrap_or_else(|| PathBuf::from(trimmed))
    } else if let Some(rest) = trimmed.strip_prefix("~/").or_else(|| trimmed.strip_prefix("~\\")) {
        dirs_next::home_dir()
            .unwrap_or_else(|| PathBuf::from("~"))
            .join(rest.replace('/', "\\"))
    } else {
        PathBuf::from(trimmed)
    };

    if expanded.is_dir() {
        return expanded
            .canonicalize()
            .map_err(|_| "directory_not_found".to_string());
    }

    let mut candidates = Vec::new();
    let looks_unix_root = trimmed.starts_with('/') && !trimmed.starts_with("//") && !trimmed.starts_with("/mnt/");
    if looks_unix_root {
        let relative = trimmed.trim_start_matches('/').replace('/', "\\");
        let username = dirs_next::home_dir()
            .and_then(|home| home.file_name().map(|name| name.to_string_lossy().into_owned()));
        for drive in drive_roots() {
            push_if_dir(&mut candidates, drive.join(&relative));
            if let Some(name) = username.as_deref() {
                push_if_dir(&mut candidates, drive.join(name).join(&relative));
                push_if_dir(&mut candidates, drive.join("Users").join(name).join(&relative));
            }
        }
    }

    candidates
        .into_iter()
        .next()
        .and_then(|candidate| candidate.canonicalize().ok())
        .ok_or_else(|| "directory_not_found".to_string())
}

pub(crate) fn checked_output(cwd: &Path, args: &[&str]) -> Result<Output, String> {
    with_lock_awareness(cwd, || {
        let output = git_command(cwd, args)?;
        if output.status.success() {
            return Ok(output);
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "git_command_failed".to_string()
        } else {
            format!("git_command_failed:{stderr}")
        })
    })
}

pub(crate) fn repository_root(path: &str) -> Result<PathBuf, String> {
    let cwd = resolve_input_directory(path)?;
    let output = git_command(&cwd, &["rev-parse", "--show-toplevel"])?;
    if !output.status.success() {
        return Err("not_a_git_repository".to_string());
    }
    let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if root.is_empty() {
        return Err("not_a_git_repository".to_string());
    }
    PathBuf::from(root)
        .canonicalize()
        .map_err(|_| "not_a_git_repository".to_string())
}

fn validated_root(path: &str) -> Result<PathBuf, String> {
    let requested = resolve_input_directory(path).map_err(|_| "not_a_git_repository".to_string())?;
    let actual = repository_root(path)?;
    if requested != actual {
        return Err("invalid_repository_root".to_string());
    }
    Ok(actual)
}

fn validate_paths(paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
        return Err("no_paths".to_string());
    }
    for path in paths {
        let parsed = Path::new(path);
        let bytes = path.as_bytes();
        let has_windows_drive_root = bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'/' | b'\\');
        let is_cross_platform_rooted =
            matches!(bytes.first(), Some(b'/' | b'\\')) || has_windows_drive_root;
        let has_cross_platform_parent = path.split(['/', '\\']).any(|component| component == "..");
        if parsed.is_absolute()
            || is_cross_platform_rooted
            || has_cross_platform_parent
            || path.trim().is_empty()
            || parsed.components().any(|part| {
                matches!(
                    part,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err("invalid_git_path".to_string());
        }
    }
    Ok(())
}

fn run_path_command(root: &Path, args: &[&str], paths: &[String]) -> Result<(), String> {
    validate_paths(paths)?;
    with_lock_awareness(root, || {
        let mut command = Command::new("git");
        command.current_dir(root).args(args).arg("--");
        for path in paths {
            command.arg(path);
        }
        hide_console(&mut command);
        let output = command.output().map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "git_not_found".to_string()
            } else {
                format!("git_exec_failed:{error}")
            }
        })?;
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(format!("git_command_failed:{stderr}"))
        }
    })
}

fn change(path: String, original_path: Option<String>, status: char) -> GitFileChange {
    GitFileChange {
        path,
        original_path,
        status: status.to_string(),
    }
}

fn is_conflict(x: char, y: char) -> bool {
    matches!(
        (x, y),
        ('D', 'D') | ('A', 'U') | ('U', 'D') | ('U', 'A') | ('D', 'U') | ('A', 'A') | ('U', 'U')
    )
}

fn parse_porcelain(
    output: &[u8],
) -> (
    Vec<GitFileChange>,
    Vec<GitFileChange>,
    Vec<GitFileChange>,
    Vec<GitFileChange>,
) {
    let fields = output.split(|byte| *byte == 0).collect::<Vec<_>>();
    let mut staged = Vec::new();
    let mut changes = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicts = Vec::new();
    let mut index = 0;

    while index < fields.len() {
        let field = fields[index];
        index += 1;
        if field.len() < 3 {
            continue;
        }
        let x = field[0] as char;
        let y = field[1] as char;
        let path = String::from_utf8_lossy(&field[3..]).into_owned();
        let renamed = matches!(x, 'R' | 'C') || matches!(y, 'R' | 'C');
        let original_path = if renamed && index < fields.len() {
            let value = String::from_utf8_lossy(fields[index]).into_owned();
            index += 1;
            Some(value)
        } else {
            None
        };

        if x == '?' && y == '?' {
            untracked.push(change(path, None, '?'));
        } else if is_conflict(x, y) {
            conflicts.push(change(path, original_path, 'U'));
        } else {
            if x != ' ' {
                staged.push(change(path.clone(), original_path.clone(), x));
            }
            if y != ' ' {
                changes.push(change(path, original_path, y));
            }
        }
    }
    (staged, changes, untracked, conflicts)
}

fn branch_info(root: &Path) -> Result<(String, bool, u32, u32), String> {
    let symbolic = git_command(root, &["symbolic-ref", "--short", "-q", "HEAD"])?;
    let (branch, detached) = if symbolic.status.success() {
        (
            String::from_utf8_lossy(&symbolic.stdout).trim().to_string(),
            false,
        )
    } else {
        let short = checked_output(root, &["rev-parse", "--short", "HEAD"])
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .unwrap_or_else(|_| "HEAD".to_string());
        (short, true)
    };

    let divergence = git_command(
        root,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )?;
    let (ahead, behind) = if divergence.status.success() {
        let values = String::from_utf8_lossy(&divergence.stdout)
            .split_whitespace()
            .filter_map(|value| value.parse::<u32>().ok())
            .collect::<Vec<_>>();
        (
            values.first().copied().unwrap_or(0),
            values.get(1).copied().unwrap_or(0),
        )
    } else {
        (0, 0)
    };
    Ok((branch, detached, ahead, behind))
}

#[tauri::command]
pub fn git_status(path: String) -> Result<GitRepositoryStatus, String> {
    let root = repository_root(&path)?;
    let status = checked_output(
        &root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    let (staged, changes, untracked, conflicts) = parse_porcelain(&status.stdout);
    let (branch, detached, ahead, behind) = branch_info(&root)?;
    Ok(GitRepositoryStatus {
        repo_root: root.to_string_lossy().into_owned(),
        branch,
        detached,
        ahead,
        behind,
        staged,
        changes,
        untracked,
        conflicts,
    })
}

#[tauri::command]
pub fn git_stage(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    let root = validated_root(&repo_root)?;
    run_path_command(&root, &["add"], &paths)
}

#[tauri::command]
pub fn git_unstage(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    let root = validated_root(&repo_root)?;
    let has_head = git_command(&root, &["rev-parse", "--verify", "HEAD"])
        .map(|output| output.status.success())
        .unwrap_or(false);
    if has_head {
        run_path_command(&root, &["restore", "--staged"], &paths)
            .or_else(|_| run_path_command(&root, &["reset", "HEAD"], &paths))
    } else {
        run_path_command(&root, &["rm", "-r", "--cached"], &paths)
    }
}

#[tauri::command]
pub fn git_discard(repo_root: String, paths: Vec<String>, untracked: bool) -> Result<(), String> {
    let root = validated_root(&repo_root)?;
    if untracked {
        run_path_command(&root, &["clean", "-fd"], &paths)
    } else {
        run_path_command(&root, &["restore", "--worktree"], &paths)
    }
}

#[tauri::command]
pub fn git_commit(repo_root: String, message: String) -> Result<String, String> {
    let root = validated_root(&repo_root)?;
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err("empty_commit_message".to_string());
    }
    let output = checked_output(&root, &["commit", "-m", trimmed])?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Comando git que fala com o remoto (push/pull). `GIT_TERMINAL_PROMPT=0` faz o
/// git FALHAR rápido em vez de TRAVAR esperando credenciais num prompt que não
/// existe (sem TTY no PTY oculto) — usa o credential helper / SSH agent já
/// configurados na máquina. stdout+stderr são combinados porque o git escreve o
/// progresso de rede no stderr mesmo em sucesso.
fn remote_command(root: &Path, args: &[&str]) -> Result<String, String> {
    with_lock_awareness(root, || {
        let mut command = Command::new("git");
        command
            .current_dir(root)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0");
        hide_console(&mut command);
        let output = command.output().map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "git_not_found".to_string()
            } else {
                format!("git_exec_failed:{error}")
            }
        })?;
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(format!("{} {}", stdout.trim(), stderr.trim()).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(format!("git_command_failed:{stderr}"))
        }
    })
}

#[tauri::command]
pub fn git_push(repo_root: String) -> Result<String, String> {
    let root = validated_root(&repo_root)?;
    match remote_command(&root, &["push"]) {
        // Branch sem upstream: publica em origin/<branch> (equivalente ao
        // "Publish Branch" do VSCode). Falha se o remoto não se chamar 'origin'.
        Err(error) if error.contains("no upstream") || error.contains("has no upstream") => {
            remote_command(&root, &["push", "--set-upstream", "origin", "HEAD"])
        }
        other => other,
    }
}

/// Lista os branches locais (nome curto). Usado pelo ciclo de merge (RFC-006)
/// para escolher source/target.
#[tauri::command]
pub fn git_list_branches(repo_root: String) -> Result<Vec<String>, String> {
    let root = repository_root(&repo_root)?;
    let output = checked_output(&root, &["branch", "--format=%(refname:short)"])?;
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect())
}

#[tauri::command]
pub fn git_pull(repo_root: String) -> Result<String, String> {
    let root = validated_root(&repo_root)?;
    // --ff-only evita merge commit/conflito surpresa: se a branch divergiu, erra
    // limpo em vez de criar um merge automático.
    remote_command(&root, &["pull", "--ff-only"])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parses_staged_unstaged_untracked_conflict_and_rename() {
        let input = b"M  staged.txt\0 M changed file.txt\0?? new.txt\0UU conflict.txt\0R  renamed.txt\0old.txt\0";
        let (staged, changes, untracked, conflicts) = parse_porcelain(input);
        assert_eq!(staged.len(), 2);
        assert_eq!(staged[1].path, "renamed.txt");
        assert_eq!(staged[1].original_path.as_deref(), Some("old.txt"));
        assert_eq!(changes[0].path, "changed file.txt");
        assert_eq!(untracked[0].path, "new.txt");
        assert_eq!(conflicts[0].path, "conflict.txt");
    }

    #[test]
    fn keeps_both_sides_of_partially_staged_file() {
        let (staged, changes, _, _) = parse_porcelain(b"MM both.txt\0");
        assert_eq!(staged[0].path, "both.txt");
        assert_eq!(changes[0].path, "both.txt");
    }

    #[test]
    fn rejects_paths_outside_repository() {
        assert!(validate_paths(&["../secret".to_string()]).is_err());
        assert!(validate_paths(&["..\\secret".to_string()]).is_err());
        // Caminho absoluto Unix — rejeitado em qualquer plataforma.
        assert!(validate_paths(&["/etc/secret".to_string()]).is_err());
        // O prefixo de drive do Windows só é reconhecido como `Component::Prefix`
        // no próprio Windows; em Unix `C:\secret` é um nome relativo válido.
        #[cfg(windows)]
        assert!(validate_paths(&["C:\\secret".to_string()]).is_err());
        assert!(validate_paths(&["/secret".to_string()]).is_err());
        assert!(validate_paths(&["\\\\server\\share".to_string()]).is_err());
        assert!(validate_paths(&["src/main.rs".to_string()]).is_ok());
        assert!(validate_paths(&["src\\main.rs".to_string()]).is_ok());
    }

    #[test]
    fn performs_stage_unstage_discard_and_commit() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("alethe-git-control-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        let root_string = root.to_string_lossy().into_owned();
        let run = |args: &[&str]| checked_output(&root, args).unwrap();
        run(&["init"]);
        run(&["config", "user.name", "Alethe Test"]);
        run(&["config", "user.email", "alethe@example.invalid"]);

        fs::write(root.join("tracked.txt"), "one\n").unwrap();
        git_stage(root_string.clone(), vec!["tracked.txt".to_string()]).unwrap();
        assert_eq!(git_status(root_string.clone()).unwrap().staged.len(), 1);
        git_unstage(root_string.clone(), vec!["tracked.txt".to_string()]).unwrap();
        assert_eq!(git_status(root_string.clone()).unwrap().untracked.len(), 1);

        git_stage(root_string.clone(), vec!["tracked.txt".to_string()]).unwrap();
        git_commit(root_string.clone(), "initial".to_string()).unwrap();
        fs::write(root.join("tracked.txt"), "two\n").unwrap();
        assert_eq!(git_status(root_string.clone()).unwrap().changes.len(), 1);
        git_discard(root_string.clone(), vec!["tracked.txt".to_string()], false).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("tracked.txt")).unwrap().trim(),
            "one"
        );

        fs::write(root.join("untracked.txt"), "remove me\n").unwrap();
        git_discard(root_string, vec!["untracked.txt".to_string()], true).unwrap();
        assert!(!root.join("untracked.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }

    fn temp_dir(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("alethe-git-control-{label}-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn admin_lock_takes_precedence_and_is_never_retried() {
        // Repo comum (não-worktree): `.git` é diretório — o `locked` físico fica
        // direto dentro dele, simulando o mesmo layout que `.git/worktrees/<id>/`
        // teria para um worktree secundário.
        let root = temp_dir("adminlock");
        checked_output(&root, &["init"]).unwrap();
        fs::write(root.join(".git").join("locked"), "Aguardando homologacao\n").unwrap();

        let start = std::time::Instant::now();
        let error = checked_output(&root, &["status"]).unwrap_err();
        // Sem retry: falha imediata, bem abaixo do menor delay de backoff (200ms).
        assert!(start.elapsed() < Duration::from_millis(150));
        assert_eq!(error, "admin_locked:Aguardando homologacao");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn transient_index_lock_is_retried_and_recovers() {
        let root = temp_dir("indexlock");
        checked_output(&root, &["init"]).unwrap();
        let lock_file = root.join(".git").join("index.lock");
        fs::write(&lock_file, b"").unwrap();

        // Simula outro processo git segurando o index.lock brevemente — some
        // antes do teto de 3 tentativas (200+400+800ms).
        let lock_file_clone = lock_file.clone();
        std::thread::spawn(move || {
            sleep(Duration::from_millis(250));
            let _ = fs::remove_file(&lock_file_clone);
        });

        // git recusa operações com index.lock presente — a chamada real falha até
        // o arquivo sumir; o retry do with_lock_awareness é o que faz isso
        // eventualmente ter sucesso sem o chamador precisar saber disso.
        let result = checked_output(&root, &["status"]);
        assert!(result.is_ok(), "esperava sucesso após o lock transitório sumir: {result:?}");

        fs::remove_dir_all(root).unwrap();
    }
}
