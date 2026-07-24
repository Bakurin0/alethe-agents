mod agent_cost;
mod agent_events;
mod activity_stats;
mod agent_library;
mod backup;
mod claude_sessions;
mod claude_usage;
mod cli_resolver;
mod codex_sessions;
mod crash_watch;
mod codex_usage;
mod diagnostics;
mod discord_presence;
mod economy_agents;
mod filesystem;
mod ghostty_bridge;
#[cfg(all(target_os = "macos", ghostty_linked))]
mod ghostty_ffi;
mod git_control;
mod github_sync;
mod logging;
mod paths;
mod projects;
mod profiles;
mod pty;
mod resources;
mod process_tree;
mod resource_manager;
mod session_watcher;
mod spotify;
mod stats;
#[cfg(windows)]
mod windows_webview;
mod worktrees;
mod event_bus;
mod telemetry;
mod validation;
mod planning;
mod scheduler;
mod supervisor;
mod merge_analyzer;
mod conflict_resolution;
mod graphify;
mod plugins;
mod opencode_sessions;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::pty::{PtySession, PtySessions};
#[cfg(any(debug_assertions, desktop))]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    // Instala o panic hook cedo (antes do builder). O diretório de logs só é
    // resolvido no .setup(); panics anteriores a isso caem só no stderr.
    logging::install_panic_hook();
    // Rede de segurança contra terminais órfãos: se o app morrer por crash/kill
    // forçado (onde RunEvent::Exit não roda), o Job Object mata a árvore de PTYs.
    pty::install_kill_on_close_guard();
    let sessions: PtySessions = Arc::new(Mutex::new(HashMap::<String, PtySession>::new()));
    let sessions_for_exit = Arc::clone(&sessions);
    let sessions_for_resources = Arc::clone(&sessions);
    let resource_supervisor = Arc::new(resources::ResourceSupervisor::default());
    let resource_supervisor_for_setup = Arc::clone(&resource_supervisor);

    let mut builder = tauri::Builder::default()
        .manage(sessions)
        .manage(resource_supervisor)
        .manage(ghostty_bridge::GhosttySurfaces::default())
        .manage(filesystem::FileWatchers::default())
        .manage(discord_presence::DiscordPresence::new())
        .manage(planning::PlanningWatchers::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    // Impede execuções paralelas do Alethe — pré-requisito real da guarda de
    // monotonicidade de `save_projects` (projects.rs): duas instâncias teriam
    // cada uma seu próprio LAST_WRITE_SEQUENCE em memória, e a garantia de
    // last-write-wins deixaria de valer entre processos. Segunda instância só
    // foca a janela existente em vez de abrir outra.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .setup(move |app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("(DEV) Alethe");
            }
            logging::set_logs_dir(app.handle());
            // Detecta saída suja anterior (crash/OOM/kill) e sobe o heartbeat.
            crash_watch::start(app.handle().clone());
            resources::start(
                app.handle().clone(),
                Arc::clone(&sessions_for_resources),
                Arc::clone(&resource_supervisor_for_setup),
            );
            // Limpa scrollback órfão antes de qualquer spawn (sem corrida).
            pty::cleanup_orphan_scrollback(app.handle());
            agent_events::start_listener(app.handle().clone());
            session_watcher::start_watcher(app.handle().clone());

            // Multi-Agent & Telemetry Event Loops
            telemetry::start_telemetry_watcher(app.handle().clone());
            planning::start_planning_autocommit_loop();
            scheduler::start_scheduler_event_loop();
            supervisor::start_supervisor_event_loop();

            // Resource Manager (memory pressure, policy engine, task scheduler)
            resource_manager::start(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_events::agent_hooks_settings_path,
            agent_events::agent_hooks_endpoint,
            activity_stats::record_activity_samples,
            activity_stats::get_activity_summary,
            activity_stats::clear_activity_stats,
            agent_library::list_installed_agents,
            agent_library::install_agent,
            agent_library::uninstall_agent,
            economy_agents::set_economy_agents,
            economy_agents::economy_agents_enabled,
            filesystem::list_directory,
            filesystem::read_text_file,
            filesystem::ensure_todo_template,
            filesystem::watch_file,
            filesystem::unwatch_file,
            pty::pty_exists,
            pty::spawn_pty,
            pty::attach_pty,
            pty::restart_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
            pty::suspend_pty,
            pty::get_pty_cwd,
            pty::set_pty_read_state,
            pty::set_pty_priority,
            ghostty_bridge::ghostty_spawn,
            ghostty_bridge::ghostty_sync_frame,
            ghostty_bridge::ghostty_set_hidden,
            ghostty_bridge::ghostty_kill,
            ghostty_bridge::ghostty_kill_all,
            ghostty_bridge::ghostty_debug_send_read,
            pty::list_pty_processes,
            resource_manager::get_resource_metrics,
            process_tree::get_pty_tree_info,
            process_tree::kill_pty_tree_cmd,
            projects::load_projects,
            projects::save_projects,
            profiles::list_profiles,
            profiles::get_active_profile,
            profiles::set_active_profile,
            profiles::create_profile,
            profiles::rename_profile,
            profiles::delete_profile,
            cli_resolver::find_cli_launcher,
            backup::export_backup,
            backup::import_backup,
            github_sync::github_sync_status,
            github_sync::github_sync_set_token,
            github_sync::github_sync_logout,
            github_sync::github_sync_push,
            github_sync::github_sync_pull,
            git_control::git_status,
            git_control::git_stage,
            git_control::git_unstage,
            git_control::git_discard,
            git_control::git_commit,
            git_control::git_push,
            git_control::git_pull,
            git_control::git_list_branches,
            diagnostics::open_data_folder,
            diagnostics::open_spawn_log,
            diagnostics::open_in_file_explorer,
            diagnostics::open_in_vscode,
            diagnostics::open_in_browser,
            diagnostics::read_clipboard_text,
            diagnostics::write_clipboard_text,
            diagnostics::reset_app_data,
            diagnostics::open_logs_folder,
            diagnostics::export_logs,
            logging::record_frontend_error,
            discord_presence::set_discord_presence,
            discord_presence::clear_discord_presence,
            stats::get_memory_stats,
            resources::get_runtime_snapshot,
            resources::set_resource_policy,
            resources::update_pty_runtime_meta,
            spotify::spotify_login,
            spotify::spotify_logout,
            spotify::spotify_status,
            spotify::spotify_get_current,
            claude_sessions::snapshot_claude_sessions,
            claude_sessions::list_claude_sessions,
            claude_sessions::get_claude_activity,
            codex_sessions::snapshot_codex_sessions,
            claude_usage::get_claude_usage,
            codex_usage::get_codex_usage,
            agent_cost::get_session_cost,
            agent_cost::get_transcript_cost,
            agent_cost::get_model_pricing,
            crash_watch::get_last_crash_report,
            quit_app,
            worktrees::worktree_provision,
            worktrees::worktree_list,
            worktrees::worktree_remove,
            worktrees::worktree_cleanup,
            worktrees::worktree_fetch_branch,
            worktrees::worktree_lock,
            worktrees::worktree_unlock,
            event_bus::publish_event,
            telemetry::get_telemetry_metrics,
            telemetry::get_telemetry_traces,
            validation::run_validation,
            planning::start_gsd_watcher,
            planning::stop_gsd_watcher,
            planning::planning_audit_record,
            planning::planning_audit_history,
            planning::set_planning_autocommit,
            planning::get_planning_autocommit,
            scheduler::get_scheduler_tasks,
            scheduler::trigger_scheduler_tick,
            scheduler::cancel_task,
            merge_analyzer::merge_analyze,
            conflict_resolution::merge_prepare,
            conflict_resolution::merge_finalize,
            conflict_resolution::merge_abort,
            conflict_resolution::merge_preflight_abort,
            conflict_resolution::merge_rebase_onto_target,
            conflict_resolution::merge_force_cleanup,
            graphify::graphify_ensure_graph,
            graphify::graphify_detect,
            graphify::graphify_mcp_config_path,
            graphify::graphify_opencode_config_write,
            graphify::graphify_codex_config_write,
            graphify::graphify_read_graph,
            graphify::graphify_snapshot,
            graphify::graphify_list_snapshots,
            graphify::graphify_diff_snapshot,
            graphify::graphify_rollback,
            graphify::graphify_prune_snapshots,
            plugins::plugins_list,
            plugins::plugin_install,
            plugins::plugin_uninstall,
            opencode_sessions::snapshot_opencode_sessions,
            ping,
        ])
        .build(tauri::generate_context!())
        .expect("error while building alethe")
        .run(move |_app_handle, event| {
            // Saída limpa (event loop encerrou normalmente) → marca a sessão como
            // OK. Se o processo for morto/crashar, isto NÃO roda e o próximo boot
            // reporta a saída suja.
            if let tauri::RunEvent::Exit = event {
                pty::kill_all_sessions(&sessions_for_exit);
                crash_watch::mark_clean_exit();
            }
        });
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rebuilt_path_is_non_empty_on_windows() {
        if !cfg!(windows) {
            return;
        }
        assert!(!cli_resolver::build_rebuilt_path().is_empty());
    }
}
