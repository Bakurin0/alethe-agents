use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use serde::{Serialize, Deserialize};
use nanoid::nanoid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    Pending,
    Ready,
    Running,
    Completed,
    Failed,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub dependencies: Vec<String>,
    pub status: TaskStatus,
    pub assigned_agent_id: Option<String>,
    pub lease_resource: Option<String>,
    pub priority: i32,
}

pub struct Scheduler {
    pub tasks: HashMap<String, Task>,
    pub leases: HashSet<String>,
}

static SCHEDULER: OnceLock<Mutex<Scheduler>> = OnceLock::new();

/// Modo de worktree por projeto (RFC-003/009). O backend não lê `projects.json`;
/// o front informa o modo no `trigger_scheduler_tick` e o autotick (event-loop,
/// sem acesso à config) reusa o último modo conhecido. Default: GitWorktree.
static PROJECT_MODES: OnceLock<Mutex<HashMap<String, crate::worktrees::WorktreeMode>>> =
    OnceLock::new();

fn project_modes() -> &'static Mutex<HashMap<String, crate::worktrees::WorktreeMode>> {
    PROJECT_MODES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn mode_for_project(project_id: &str) -> crate::worktrees::WorktreeMode {
    project_modes()
        .lock()
        .ok()
        .and_then(|map| map.get(project_id).copied())
        .unwrap_or(crate::worktrees::WorktreeMode::GitWorktree)
}

pub fn get_scheduler() -> &'static Mutex<Scheduler> {
    SCHEDULER.get_or_init(|| Mutex::new(Scheduler {
        tasks: HashMap::new(),
        leases: HashSet::new(),
    }))
}

fn parse_gsd_markdown(project_id: &str, file_path: &std::path::Path, content: &str) -> Option<Task> {
    let mut id = file_path.file_stem()?.to_string_lossy().to_string();
    let mut title = id.clone();
    let mut dependencies = Vec::new();
    let mut status = TaskStatus::Pending;

    if content.starts_with("---") {
        if let Some(end_idx) = content[3..].find("---") {
            let frontmatter = &content[3..end_idx + 3];
            for line in frontmatter.lines() {
                let parts: Vec<&str> = line.splitn(2, ':').collect();
                if parts.len() == 2 {
                    let key = parts[0].trim().to_lowercase();
                    let val = parts[1].trim();
                    match key.as_str() {
                        "id" => id = val.trim_matches('"').trim_matches('\'').to_string(),
                        "title" => title = val.trim_matches('"').trim_matches('\'').to_string(),
                        "status" => {
                            let s = val.trim_matches('"').trim_matches('\'').to_lowercase();
                            status = match s.as_str() {
                                "completed" | "done" => TaskStatus::Completed,
                                "running" | "in_progress" => TaskStatus::Running,
                                "failed" => TaskStatus::Failed,
                                "blocked" => TaskStatus::Blocked,
                                "ready" => TaskStatus::Ready,
                                _ => TaskStatus::Pending,
                            };
                        }
                        "dependencies" | "depends_on" => {
                            let cleaned = val.trim_matches('[').trim_matches(']');
                            for dep in cleaned.split(',') {
                                let dep_trimmed = dep.trim().trim_matches('"').trim_matches('\'');
                                if !dep_trimmed.is_empty() {
                                    dependencies.push(dep_trimmed.to_string());
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    Some(Task {
        id,
        project_id: project_id.to_string(),
        title,
        dependencies,
        status,
        assigned_agent_id: None,
        lease_resource: None,
        priority: 0,
    })
}

pub fn load_gsd_tasks(project_id: &str, repo_path: &str) -> Result<(), String> {
    let repo_root = crate::git_control::repository_root(repo_path)?;
    let planning_dir = repo_root.join(".planning");
    if !planning_dir.is_dir() {
        return Ok(());
    }

    let mut parsed_tasks = HashMap::new();
    let mut scan_dir = |dir: &std::path::Path| -> Result<(), String> {
        let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Some(task) = parse_gsd_markdown(project_id, &path, &content) {
                        parsed_tasks.insert(task.id.clone(), task);
                    }
                }
            }
        }
        Ok(())
    };

    let _ = scan_dir(&planning_dir);
    let tasks_sub = planning_dir.join("tasks");
    if tasks_sub.is_dir() {
        let _ = scan_dir(&tasks_sub);
    }

    let mut scheduler = get_scheduler().lock().unwrap();
    for (id, mut task) in parsed_tasks {
        if let Some(existing) = scheduler.tasks.get(&id) {
            if existing.status == TaskStatus::Running || existing.status == TaskStatus::Completed {
                task.status = existing.status.clone();
                task.assigned_agent_id = existing.assigned_agent_id.clone();
                task.lease_resource = existing.lease_resource.clone();
            }
        }
        scheduler.tasks.insert(id, task);
    }

    Ok(())
}

pub fn run_scheduler_tick(project_id: &str, repo_path: &str) -> Result<(), String> {
    let mut scheduler = get_scheduler().lock().unwrap();

    // 1. Pending -> Ready se todas as dependências estão resolvidas
    let mut to_ready = Vec::new();
    for task in scheduler.tasks.values() {
        if task.project_id == project_id && task.status == TaskStatus::Pending {
            let mut all_completed = true;
            for dep in &task.dependencies {
                if let Some(dep_task) = scheduler.tasks.get(dep) {
                    if dep_task.status != TaskStatus::Completed {
                        all_completed = false;
                        break;
                    }
                } else {
                    all_completed = false;
                    break;
                }
            }
            if all_completed {
                to_ready.push(task.id.clone());
            }
        }
    }

    for id in to_ready {
        if let Some(t) = scheduler.tasks.get_mut(&id) {
            t.status = TaskStatus::Ready;
            crate::event_bus::publish_event_simple(
                "TaskReserved",
                &format!("sched-{}", nanoid!()),
                Some(t.project_id.clone()),
                Some(t.id.clone()),
                serde_json::json!({}),
            );
        }
    }

    // 2. Ready -> Running se puder obter lease
    let mut to_start = Vec::new();
    for task in scheduler.tasks.values() {
        if task.project_id == project_id && task.status == TaskStatus::Ready {
            let resource = format!("worktree:{}", task.id);
            if !scheduler.leases.contains(&resource) {
                to_start.push((task.id.clone(), resource, task.title.clone()));
            }
        }
    }

    for (id, resource, task_title) in to_start {
        scheduler.leases.insert(resource.clone());
        if let Some(t) = scheduler.tasks.get_mut(&id) {
            t.status = TaskStatus::Running;
            let agent_id = format!("agent-{}", id);
            t.assigned_agent_id = Some(agent_id.clone());
            t.lease_resource = Some(resource);

            crate::event_bus::publish_event_simple(
                "TaskStarted",
                &format!("sched-{}", nanoid!()),
                Some(t.project_id.clone()),
                Some(t.id.clone()),
                serde_json::json!({ "agent_id": agent_id }),
            );

            let repo_path_clone = repo_path.to_string();
            let agent_id_clone = agent_id.clone();
            let project_id_clone = t.project_id.clone();
            let task_id_clone = t.id.clone();

            let mode = mode_for_project(&t.project_id);
            tauri::async_runtime::spawn(async move {
                match crate::worktrees::worktree_provision(
                    repo_path_clone.clone(),
                    agent_id_clone.clone(),
                    mode,
                ) {
                    Ok(info) => {
                        crate::supervisor::start_monitoring(
                            agent_id_clone.clone(),
                            info.path.clone(),
                            project_id_clone.clone(),
                            task_id_clone.clone(),
                        );
                        // O SPAWN do agente é do FRONT (humano-no-terminal): o
                        // backend só pede — o front cria um Terminal visível no
                        // projeto com cwd na worktree (padrão do mergeStore).
                        crate::event_bus::publish_event_simple(
                            "AgentSpawnRequested",
                            &format!("sched-{}", nanoid!()),
                            Some(project_id_clone.clone()),
                            Some(task_id_clone.clone()),
                            serde_json::json!({
                                "agent_id": agent_id_clone,
                                "worktree_path": info.path,
                                "task_title": task_title,
                            }),
                        );
                    }
                    Err(e) => {
                        eprintln!("[Scheduler] Falha ao provisionar worktree para {}: {}", task_id_clone, e);
                        let mut sched = get_scheduler().lock().unwrap();
                        let mut to_remove_lease = None;
                        if let Some(task) = sched.tasks.get_mut(&task_id_clone) {
                            task.status = TaskStatus::Failed;
                            to_remove_lease = task.lease_resource.take();
                            task.assigned_agent_id = None;
                        }
                        if let Some(ref res) = to_remove_lease {
                            sched.leases.remove(res);
                        }
                        crate::event_bus::publish_event_simple(
                            "TaskFailed",
                            &format!("sched-{}", nanoid!()),
                            Some(project_id_clone),
                            Some(task_id_clone),
                            serde_json::json!({ "error": e }),
                        );
                    }
                }
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_scheduler_tasks(project_id: String) -> Result<Vec<Task>, String> {
    let scheduler = get_scheduler().lock().unwrap();
    let list: Vec<Task> = scheduler.tasks.values()
        .filter(|t| t.project_id == project_id)
        .cloned()
        .collect();
    Ok(list)
}

#[tauri::command]
pub fn trigger_scheduler_tick(
    project_id: String,
    repo_path: String,
    worktree_mode: Option<crate::worktrees::WorktreeMode>,
) -> Result<(), String> {
    if let Some(mode) = worktree_mode {
        if let Ok(mut map) = project_modes().lock() {
            map.insert(project_id.clone(), mode);
        }
    }
    let _ = load_gsd_tasks(&project_id, &repo_path);
    run_scheduler_tick(&project_id, &repo_path)?;
    Ok(())
}

#[tauri::command]
pub fn cancel_task(task_id: String) -> Result<(), String> {
    let mut scheduler = get_scheduler().lock().unwrap();
    let mut to_remove_lease = None;
    let mut to_stop_agent = None;
    let project_id = if let Some(task) = scheduler.tasks.get_mut(&task_id) {
        if task.status == TaskStatus::Running {
            task.status = TaskStatus::Failed;
            to_stop_agent = task.assigned_agent_id.take();
            to_remove_lease = task.lease_resource.take();
            Some(task.project_id.clone())
        } else {
            None
        }
    } else {
        None
    };

    if let Some(proj_id) = project_id {
        if let Some(ref agent_id) = to_stop_agent {
            crate::supervisor::stop_monitoring(agent_id);
        }
        if let Some(ref resource) = to_remove_lease {
            scheduler.leases.remove(resource);
        }

        crate::event_bus::publish_event_simple(
            "TaskFailed",
            &format!("cancel-{}", nanoid!()),
            Some(proj_id),
            Some(task_id),
            serde_json::json!({ "reason": "Cancelled by user" }),
        );
    }
    Ok(())
}

pub fn start_scheduler_event_loop() {
    tauri::async_runtime::spawn(async move {
        let mut rx = crate::event_bus::subscribe();
        while let Ok(event) = rx.recv().await {
            if event.event_type == "PlanningUpdated" {
                if let Some(ref project_id) = event.task_id {
                    if let serde_json::Value::Object(map) = &event.data {
                        if let Some(planning_dir) = map.get("planning_dir").and_then(|v| v.as_str()) {
                            let repo_path = std::path::Path::new(planning_dir).parent()
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_default();
                            if !repo_path.is_empty() {
                                eprintln!("[Scheduler] Autotick disparado por PlanningUpdated para {}", project_id);
                                let _ = trigger_scheduler_tick(project_id.clone(), repo_path, None);
                            }
                        }
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gsd_markdown_parser() {
        let content = r#"---
id: task-foo
title: "Foo Task"
dependencies: [task-bar, task-baz]
status: done
---
# Descricao da Task
"#;
        let file_path = std::path::Path::new("task-foo.md");
        let task = parse_gsd_markdown("proj-1", file_path, content).unwrap();
        assert_eq!(task.id, "task-foo");
        assert_eq!(task.title, "Foo Task");
        assert_eq!(task.dependencies, vec!["task-bar", "task-baz"]);
        assert_eq!(task.status, TaskStatus::Completed);
    }
}
