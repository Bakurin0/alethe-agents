# Graph Report - .  (2026-07-24)

## Corpus Check
- Large corpus: 253 files · ~899,164 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2085 nodes · 5214 edges · 116 communities (79 shown, 37 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 123 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Merge & Conflict Resolution
- App Data, Paths & Backup
- Tauri IPC Command Surface
- App Shell & Modals
- Agent Canvas & Cost Tracking
- Ghostty Native Bridge (macOS)
- Project & Workspace State
- PTY Session Management
- Agent Usage UI & Icons
- Event Bus & Resource Manager
- Docs & Plugin System
- Workspace Layout Engine
- Dev Dependencies (package.json)
- Graphify Backend (Rust)
- Profile Management (Backend)
- Terminal View & Themes
- Home & Preferences UI
- Session Resume & Terminal Store
- Ghostty Shim (Objective-C)
- Release Assets & URLs
- Graphify UI & Now Playing
- TypeScript Config
- GitHub Sync (Gist Backup)
- Time Analytics Widget
- Claude Session Snapshots (Backend)
- Spotify Integration (Backend)
- Git Control UI
- Error Boundary
- Planning / GSD Audit (Backend)
- Claude Usage Tracking (Backend)
- Task Scheduler (Backend)
- Claude History Modal
- Agent Cost Aggregation (Backend)
- CLI Resolver (Backend)
- Tauri Capabilities Config
- Agent Completion Monitor
- Process Tree (Backend)
- New Terminal/Tab Modals
- Activity Tracker (Frontend)
- Telemetry (Backend)
- Now Playing Hook (Frontend)
- Markdown Pane
- UI Dependencies (package.json)
- Sync Modal & Greeting
- Merge IPC Bindings (Frontend)
- Codex Session Snapshots (Backend)
- Filesystem Watcher (Backend)
- Discord Presence (Backend)
- Memory Analytics Modal
- Logging (Backend)
- Release Script
- Ghostty Surface (Frontend)
- Terminal Link Detection
- Crash Watch (Backend)
- Windows Screenshot Content
- Main Menu & Dialogs
- Agent Hook Events (Backend)
- macOS Screenshot Content
- Activity Graph Widget
- Vite/TS Node Config
- Spawn Queue (Frontend)
- Agent Library (Backend)
- Supervisor (Backend)
- Validation Pipeline (Backend)
- Preview GIF Content
- Session Launch (Frontend)
- Session Discovery (Frontend)
- Economy Agents (Backend)
- File Explorer UI
- OpenCode Session Snapshots (Backend)
- Windows Webview Suspend/Resume
- Session Watch (Frontend)
- Alethe Branding Assets
- Release Publish Script
- Ghostty Smoke Test Script
- Tauri Build Script
- Session Watcher (Backend)
- Loading Mark Branding
- Claude Code Icon
- Codex Icon
- Shell Icon
- Cytoscape Dependency
- DnD Kit Dependency
- CI Workflows
- Nanoid Dependency
- Radix Dialog Dependency
- React DOM Dependency
- Resizable Panels Dependency
- Remark GFM Dependency
- Tauri API Dependency
- Tauri Dialog Plugin
- Tauri Process Plugin
- Tauri Updater Plugin
- Cytoscape Types Dependency
- XTerm Canvas Addon
- XTerm Fit Addon
- XTerm Serialize Addon
- XTerm WebGL Addon
- Zustand Dependency
- Capture Window Script
- Alethe Mark SVG
- Ghostty Vendor Fetch Script
- GitHub Funding Config
- Default Profile Icon
- Freebuff Icon
- Open Icon (Dark)
- Open Icon (Light)
- VS Code Icon
- Default Profile Image URL
- App Icon Asset

## God Nodes (most connected - your core abstractions)
1. `useT()` - 112 edges
2. `useProjectsStore` - 93 edges
3. `useUiStore` - 81 edges
4. `XTermView()` - 37 edges
5. `AgentCanvasInner()` - 32 edges
6. `AletheGhosttyView` - 31 edges
7. `checked_output()` - 29 edges
8. `repository_root()` - 26 edges
9. `translate()` - 25 edges
10. `AgentType` - 25 edges

## Surprising Connections (you probably didn't know these)
- `XTermView()` --indirect_call--> `snapshot()`  [INFERRED]
  src/components/XTermView/index.tsx → tests/workspaceNavigation.test.ts
- `CI Workflow` --conceptually_related_to--> `Alethe (desktop multi-agent workspace)`  [INFERRED]
  .github/workflows/ci.yml → README.md
- `DesignerInner()` --indirect_call--> `r()`  [INFERRED]
  src/components/modals/LayoutDesignerModal.tsx → src/lib/webRect.test.ts
- `selectRecentTerminals()` --indirect_call--> `t()`  [INFERRED]
  src/stores/projectsStore.ts → src/stores/mergeStore.ts
- `migrateWorkspaceNavigation()` --indirect_call--> `snapshot()`  [INFERRED]
  src/stores/projectsStore.ts → tests/workspaceNavigation.test.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Safe Merge Cycle (analyze → prepare/resolve → validate → finalize)** — docs_handoff_plataforma_multiagente_merge_analyzer, docs_handoff_plataforma_multiagente_conflict_resolution_agent, docs_handoff_plataforma_multiagente_validation_pipeline [EXTRACTED 1.00]
- **External tools integrated, not reimplemented, by Alethe** — docs_handoff_plataforma_multiagente_graphify, docs_handoff_plataforma_multiagente_gsd, alethe [EXTRACTED 1.00]
- **Event-driven coordination layer (Event Bus + Scheduler + Supervisor)** — docs_handoff_plataforma_multiagente_event_bus, docs_handoff_plataforma_multiagente_scheduler, docs_handoff_plataforma_multiagente_supervisor [INFERRED 0.85]

## Communities (116 total, 37 thin omitted)

### Community 0 - "Merge & Conflict Resolution"
Cohesion: 0.07
Nodes (98): ConflictFile, Output, abort_destroys_environment(), build_prompt(), clean_merge_skips_agent_and_integrates(), ConflictEnv, emit(), env_dir() (+90 more)

### Community 1 - "App Data, Paths & Backup"
Cohesion: 0.07
Nodes (76): BTreeMap, Default, R, ActivitySample, ActivityStatsFile, ActivitySummary, add_agent_totals(), add_project_totals() (+68 more)

### Community 2 - "Tauri IPC Command Surface"
Cohesion: 0.03
Nodes (65): RFC-001, RFC-008, RFC-012, MultiagentPage(), ActivitySummary, ActivityTimeTotals, AgentTimeStats, cancelTask() (+57 more)

### Community 3 - "App Shell & Modals"
Cohesion: 0.07
Nodes (54): AgentCanvasPOC, App(), HomeView, InAppNotifications(), LayoutDesignerModal, MemoryAnalyticsModal, ToastItem(), RFC-002 (+46 more)

### Community 4 - "Agent Canvas & Cost Tracking"
Cohesion: 0.06
Nodes (57): AgentModal(), AGENT_COLORS, AgentCanvasInner(), AgentCanvasPOC(), AgentChip(), AgentChipProps, CodexWorker, colorFor() (+49 more)

### Community 5 - "Ghostty Native Bridge (macOS)"
Cohesion: 0.08
Nodes (60): AletheSurface, c_void, GhosttyState, MainThreadMarker, NSRect, Retained, content_view(), debug_send_read() (+52 more)

### Community 6 - "Project & Workspace State"
Cohesion: 0.06
Nodes (45): RFC-007, listProfiles(), loadProjectsFile(), ProfileMeta, ProfilesState, saveProjectsFile(), DEFAULT_PREFERENCES, EMPTY_PROJECTS_FILE (+37 more)

### Community 7 - "PTY Session Management"
Cohesion: 0.09
Nodes (50): Child, Condvar, MasterPty, PtySessions, append_and_maybe_compact(), attach_pty(), cleanup_orphan_scrollback(), delete_scrollback() (+42 more)

### Community 8 - "Agent Usage UI & Icons"
Cohesion: 0.06
Nodes (41): iconMap, terminal.svg (generic terminal/console icon), fmtReset(), meterColor(), Row(), UsageDropdown(), CardHead(), ClaudeCard() (+33 more)

### Community 9 - "Event Bus & Resource Manager"
Cohesion: 0.08
Nodes (48): FnOnce, Receiver, EventBusPayload, get_sender(), publish(), publish_event(), publish_event_simple(), Option (+40 more)

### Community 10 - "Docs & Plugin System"
Cohesion: 0.08
Nodes (46): Alethe (desktop multi-agent workspace), Alethe Brand and Design Tokens, Alethe Strict Design System (tokens, no gradients, real data), Alethe Features, Handoff — Plataforma Multiagente do Alethe, Configuration System (RFC-009, v4→v5 migration), Conflict Resolution Agent (RFC-007, ephemeral), Event Bus (RFC-001, event-driven decoupling) (+38 more)

### Community 11 - "Workspace Layout Engine"
Cohesion: 0.07
Nodes (36): Action, EmptyState(), EmptyStateProps, Context, DesignerChild, DesignerInner(), LayoutDesignerModal(), Stepper() (+28 more)

### Community 12 - "Dev Dependencies (package.json)"
Cohesion: 0.05
Nodes (42): jsdom, devDependencies, jsdom, @tauri-apps/cli, terser, @testing-library/jest-dom, @testing-library/react, @types/react (+34 more)

### Community 13 - "Graphify Backend (Rust)"
Cohesion: 0.16
Nodes (42): emit(), ensure_graph_bootstrap_states(), first_str(), generating_set(), graph_path(), GraphData, GraphDiff, GraphEdge (+34 more)

### Community 14 - "Profile Management (Backend)"
Cohesion: 0.24
Nodes (41): active_profile_state(), copy_dir_missing(), create_profile(), create_profile_state(), default_profiles_index(), delete_profile(), delete_profile_state(), discover_profiles() (+33 more)

### Community 15 - "Terminal View & Themes"
Cohesion: 0.09
Nodes (38): canHibernate(), DARK_LEMON_THEME, DARK_THEME, DRACULA_THEME, getPoolLimit(), getXtermTheme(), GRUVBOX_THEME, LIGHT_THEME (+30 more)

### Community 16 - "Home & Preferences UI"
Cohesion: 0.12
Nodes (27): HomeView(), NOTIF_AGENT_CLASS, AGENTS, OnboardingModal(), AccountPage(), AGENTS, AppearancePage(), Category (+19 more)

### Community 17 - "Session Resume & Terminal Store"
Cohesion: 0.10
Nodes (32): buildResumeArgs(), collectLivePanes(), latestSessionId(), pickSessionId(), resetLastSession(), ResetLastSessionResult, RESUMABLE, ResumeTarget (+24 more)

### Community 18 - "Ghostty Shim (Objective-C)"
Cohesion: 0.07
Nodes (34): ghostty_surface_t, NSMutableArray, NSObject, NSString, NSTextInputClient, AletheGhosttyView, -acceptsFirstResponder, -alethe_composeForEventdeadPending (+26 more)

### Community 19 - "Release Assets & URLs"
Cohesion: 0.06
Nodes (33): https://github.com/Kc1t/alethe-agents/releases/latest/download/latest.json, icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, app, security (+25 more)

### Community 20 - "Graphify UI & Now Playing"
Cohesion: 0.10
Nodes (23): GraphifyView(), GraphifyViewProps, token(), RFC-004, NowPlayingWidget(), Props, collectDescendants(), ContextMenuState (+15 more)

### Community 21 - "TypeScript Config"
Cohesion: 0.07
Nodes (29): DOM, DOM.Iterable, ES2020, src, src/test, src/**/*.test.ts, src/**/*.test.tsx, compilerOptions (+21 more)

### Community 22 - "GitHub Sync (Gist Backup)"
Cohesion: 0.24
Nodes (29): RequestBuilder, auth(), collect_files(), config_path(), create_gist(), gist_file_content(), gist_payload(), github_sync_logout() (+21 more)

### Community 23 - "Time Analytics Widget"
Cohesion: 0.10
Nodes (20): datesFor(), duration(), Range, RANGE_KEYS, TimeAnalytics(), AgentIcon(), TerminalPage(), SubTabsLane() (+12 more)

### Community 24 - "Claude Session Snapshots (Backend)"
Cohesion: 0.21
Nodes (29): ActivityDay, build_activity_window(), claude_projects_dir(), ClaudeSessionMeta, ClaudeSessionSnapshot, count_messages_per_day(), days_ago_ymd(), empty_activity_window() (+21 more)

### Community 25 - "Spotify Integration (Backend)"
Cohesion: 0.22
Nodes (28): delete_tokens(), ensure_fresh_access_token(), exchange_code(), http_client(), load_tokens(), LoginGuard, now_secs(), NowPlaying (+20 more)

### Community 26 - "Git Control UI"
Cohesion: 0.11
Nodes (27): buildTree(), ChangeGroup(), collectPaths(), compareNodes(), compress(), DirNode, ERROR_KEYS, errorCode() (+19 more)

### Community 27 - "Error Boundary"
Cohesion: 0.12
Nodes (19): ErrorBoundary, Props, State, getGreeting(), getLocale(), interpolate(), translate(), agentLabel() (+11 more)

### Community 28 - "Planning / GSD Audit (Backend)"
Cohesion: 0.19
Nodes (24): audit_record(), get_planning_autocommit(), planning_audit_history(), planning_audit_record(), planning_has_changes(), planning_repo(), PlanningCommit, PlanningWatchers (+16 more)

### Community 29 - "Claude Usage Tracking (Backend)"
Cohesion: 0.15
Nodes (22): ClaudeUsage, discover_token(), get_claude_usage(), http_client(), read_credentials_file_with_retry(), Client, Option, Path (+14 more)

### Community 30 - "Task Scheduler (Backend)"
Cohesion: 0.21
Nodes (23): cancel_task(), get_scheduler(), get_scheduler_tasks(), load_gsd_tasks(), mode_for_project(), parse_gsd_markdown(), project_modes(), HashMap (+15 more)

### Community 31 - "Claude History Modal"
Cohesion: 0.13
Nodes (19): ClaudeHistoryModal(), formatRelative(), formatSize(), Props, DICTIONARIES, Locale, LocaleMeta, Params (+11 more)

### Community 32 - "Agent Cost Aggregation (Backend)"
Cohesion: 0.26
Nodes (21): aggregate(), find_codex_session_path(), get_model_pricing(), get_session_cost(), get_session_cost_inner(), get_transcript_cost(), get_transcript_cost_inner(), ModelCost (+13 more)

### Community 33 - "CLI Resolver (Backend)"
Cohesion: 0.27
Nodes (21): CommandBuilder, agent_search_dirs(), build_rebuilt_path(), command_builder_for_terminal(), dedupe_paths(), default_shell(), expand_windows_env_vars(), find_cli_launcher() (+13 more)

### Community 34 - "Tauri Capabilities Config"
Cohesion: 0.09
Nodes (21): core:default, core:event:allow-emit, core:event:allow-listen, core:event:allow-unlisten, core:webview:allow-set-webview-zoom, core:window:allow-close, core:window:allow-is-maximized, core:window:allow-minimize (+13 more)

### Community 35 - "Agent Completion Monitor"
Cohesion: 0.17
Nodes (12): AgentCompletionMonitor, AgentCompletionMonitorOptions, agentLabel(), buildNotificationBody(), MonitorState, shortPath(), stripTerminalControls(), appInForeground() (+4 more)

### Community 36 - "Process Tree (Backend)"
Cohesion: 0.24
Nodes (21): build_parent_map(), collect_descendants(), get_parent_map(), get_pty_tree(), get_pty_tree_info(), kill_pid(), kill_pty_tree(), kill_pty_tree_cmd() (+13 more)

### Community 37 - "New Terminal/Tab Modals"
Cohesion: 0.16
Nodes (18): AGENTS, NewSubTabModal(), AGENTS, NewTerminalModal(), RFC-003, LayoutFooter(), isZoomInKey(), isZoomKey() (+10 more)

### Community 38 - "Activity Tracker (Frontend)"
Cohesion: 0.16
Nodes (20): AgentMeta, agentMetadata(), currentAgents(), flush(), flushActivityTracker(), flushChain, lastInteractionAt, lastSampleAt (+12 more)

### Community 39 - "Telemetry (Backend)"
Cohesion: 0.23
Nodes (19): EventBusPayload, add_trace(), append_telemetry_log(), get_metrics(), get_telemetry_metrics(), get_telemetry_traces(), get_traces(), MetricData (+11 more)

### Community 40 - "Now Playing Hook (Frontend)"
Cohesion: 0.19
Nodes (16): loadLastTrack(), NowPlayingState, saveLastTrack(), useNowPlaying(), NowPlaying, SpotifyCredentials, spotifyGetCurrent(), spotifyLogin() (+8 more)

### Community 41 - "Markdown Pane"
Cohesion: 0.13
Nodes (13): LIGHT_THEMES, MarkdownPane, MarkdownPaneProps, ensureMermaid(), MarkdownRenderer, MarkdownRendererProps, MermaidDiagram(), useGridResize() (+5 more)

### Community 42 - "UI Dependencies (package.json)"
Cohesion: 0.12
Nodes (17): lucide-react, mermaid, dependencies, lucide-react, mermaid, react, react-markdown, @tauri-apps/plugin-notification (+9 more)

### Community 43 - "Sync Modal & Greeting"
Cohesion: 0.21
Nodes (15): RecentProjectCard(), Busy, KNOWN_ERRORS, SyncModal(), formatHomeDate(), formatRelativeTimestamp(), monthShort(), weekdayShort() (+7 more)

### Community 44 - "Merge IPC Bindings (Frontend)"
Cohesion: 0.12
Nodes (13): ConflictEnv, mergeAbort(), MergeAnalysis, mergeAnalyze(), mergeFinalize(), MergeOutcome, mergePrepare(), worktreeFetchBranch() (+5 more)

### Community 45 - "Codex Session Snapshots (Backend)"
Cohesion: 0.28
Nodes (15): codex_sessions_dir(), CodexSessionSnapshot, collect_jsonl_files(), modified_ms(), normalize_cwd(), parse_codex_session(), Metadata, Option (+7 more)

### Community 46 - "Filesystem Watcher (Backend)"
Cohesion: 0.25
Nodes (15): DirectoryEntry, FileWatchers, list_directory(), normalize(), read_text_file(), AppHandle, Arc, HashMap (+7 more)

### Community 47 - "Discord Presence (Backend)"
Cohesion: 0.24
Nodes (12): DiscordIpcClient, clear_discord_presence(), connect(), DiscordPresence, PresenceCommand, Option, Result, Self (+4 more)

### Community 48 - "Memory Analytics Modal"
Cohesion: 0.27
Nodes (13): average(), Bucket, BUCKETS, buildDiagnostics(), CategoryBars(), dominantBucket(), formatMb(), formatTime() (+5 more)

### Community 49 - "Logging (Backend)"
Cohesion: 0.25
Nodes (12): append_log(), install_panic_hook(), logs_dir(), prune(), record_frontend_error(), AppHandle, Option, Path (+4 more)

### Community 50 - "Release Script"
Cohesion: 0.17
Nodes (10): args, branch, bumpFile(), cur, dirty, dryRun, fail(), [major, minor, patch] (+2 more)

### Community 51 - "Ghostty Surface (Frontend)"
Cohesion: 0.26
Nodes (10): GhosttySurface(), GhosttySurfaceProps, pendingKills, ghosttyKill(), ghosttySetHidden(), ghosttySpawn(), ghosttySyncFrame(), WebRect (+2 more)

### Community 52 - "Terminal Link Detection"
Cohesion: 0.24
Nodes (11): classifyFileLink(), DetectedTerminalLink, detectTerminalLinks(), FileLinkKind, findLinkEnd(), getLogicalTerminalLine(), HARD_LINK_DELIMITERS, LogicalTerminalLine (+3 more)

### Community 53 - "Crash Watch (Backend)"
Cohesion: 0.27
Nodes (11): append_unclean_log(), get_last_crash_report(), mark_clean_exit(), now_ms(), AppHandle, Option, Path, String (+3 more)

### Community 54 - "Windows Screenshot Content"
Cohesion: 0.18
Nodes (12): Dark-themed desktop UI with monospace/terminal-style typography, Alethe Home dashboard screenshot, NOSTROMO project group (Nostromo Pod, Discord Assistant, RecrutOr, Alethe), Project sidebar (groups, projects, terminals tree), Recent Projects cards (Alethe, Superteam Thinker, Discord Assistant, Nostromo Pod, RecrutOr, Kori), "start an agents session" call-to-action (orchestrate subagents in a dedicated canvas), Time & focus panel (active focus, agent wall time, background work, focused idle), Title bar with multiple project/session tabs (+4 more)

### Community 55 - "Main Menu & Dialogs"
Cohesion: 0.33
Nodes (10): MainMenu(), pickFile(), saveFile(), exportBackup(), exportLogs(), importBackup(), openDataFolder(), openLogsFolder() (+2 more)

### Community 56 - "Agent Hook Events (Backend)"
Cohesion: 0.33
Nodes (11): agent_hooks_endpoint(), agent_hooks_settings_path(), current_listener_port(), listener_addr(), listener_endpoint(), AppHandle, Option, Result (+3 more)

### Community 57 - "macOS Screenshot Content"
Cohesion: 0.24
Nodes (11): Alethe App Window (DEV), Alethe project (self-referential, 0 terminals), ASCEND project, ASCEND tab with file viewer, daily-routine file (Projetos-Pessoais path), 'Inicio' (Home) sidebar item, Profile 'Default', Project Sidebar (PROJETOS-PESSOAIS group) (+3 more)

### Community 58 - "Activity Graph Widget"
Cohesion: 0.35
Nodes (9): ActivityGraph(), buildGrid(), computeStreak(), formatDateBR(), intensityClass(), totalAndDelta(), getCachedClaudeActivity(), ActivityDay (+1 more)

### Community 59 - "Vite/TS Node Config"
Cohesion: 0.20
Nodes (9): vite.config.ts, compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict (+1 more)

### Community 60 - "Spawn Queue (Frontend)"
Cohesion: 0.27
Nodes (7): acquireSpawnSlot(), Listener, listeners, notify(), releaseSpawnSlot(), setMaxConcurrentSpawns(), waiters

### Community 61 - "Agent Library (Backend)"
Cohesion: 0.40
Nodes (9): agents_dir(), install_agent(), InstalledAgent, list_installed_agents(), PathBuf, Result, String, Vec (+1 more)

### Community 62 - "Supervisor (Backend)"
Cohesion: 0.42
Nodes (9): get_monitored_agents(), MonitoredAgent, HashMap, Mutex, String, start_monitoring(), start_supervisor_event_loop(), stop_monitoring() (+1 more)

### Community 63 - "Validation Pipeline (Backend)"
Cohesion: 0.33
Nodes (9): hide_console(), Command, Result, String, Vec, run_validation(), test_validation_pipeline_failure(), test_validation_pipeline_success() (+1 more)

### Community 64 - "Preview GIF Content"
Cohesion: 0.33
Nodes (9): Two Claude Code CLI panes (v2.1.177, Opus model) running in telemetry-api project, OpenAI Codex CLI pane (v0.139.0, gpt-5.1 medium, full-access mode), Dark theme UI with black background and red/orange accent color, Alethe app preview (animated GIF, 800x450), Illustrates Alethe tagline: reveal the state of every agent, shell, and project, opencode CLI pane (nemotron-3-nano-30b-a3b model, build agent), Project sidebar with groups Apex Racing (telemetry-api, race-dashboard, strategy-engine) and Personal, Title bar showing app name Alethe and active project/tab (telemetry-api) (+1 more)

### Community 65 - "Session Launch (Frontend)"
Cohesion: 0.39
Nodes (7): AgentLaunch, buildAgentLaunch(), stripClaudeSessionArgs(), stripCodexSessionArgs(), stripFlagWithValue(), stripOpenCodeSessionArgs(), RFC-004

### Community 66 - "Session Discovery (Frontend)"
Cohesion: 0.43
Nodes (6): claimDiscoveredSession(), claimedIds, claimKey(), registerSessionClaim(), resetSessionClaimsForTests(), SessionSnapshot

### Community 67 - "Economy Agents (Backend)"
Cohesion: 0.39
Nodes (7): agents_dir(), economy_agents_enabled(), PathBuf, Result, String, Vec, set_economy_agents()

### Community 68 - "File Explorer UI"
Cohesion: 0.38
Nodes (6): DirectoryNode(), FileExplorer(), FileExplorerProps, rootName(), DirectoryEntry, listDirectory()

### Community 69 - "OpenCode Session Snapshots (Backend)"
Cohesion: 0.48
Nodes (6): normalize_path(), OpenCodeSessionSnapshot, Result, String, Vec, snapshot_opencode_sessions()

### Community 70 - "Windows Webview Suspend/Resume"
Cohesion: 0.48
Nodes (6): resume(), Result, String, set_memory_mode(), suspend(), WebViewMemoryMode

### Community 71 - "Session Watch (Frontend)"
Cohesion: 0.50
Nodes (4): ensureStarted(), waiters, waitForSessionHint(), WatchAgent

### Community 72 - "Alethe Branding Assets"
Cohesion: 0.50
Nodes (4): Alethe (desktop app for managing Claude Code/Codex/OpenCode agents and terminals), Dithered profile portrait of armored woman (pixel-art style), Alethe App Logo, Logo Loading Image (pixel-art knight profile icon)

## Knowledge Gaps
- **388 isolated node(s):** `name`, `version`, `license`, `private`, `type` (+383 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Observability (RFC-011)` connect `Docs & Plugin System` to `Telemetry (Backend)`?**
  _High betweenness centrality (0.228) - this node is a cross-community bridge._
- **What connects `name`, `version`, `license` to the rest of the system?**
  _388 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Merge & Conflict Resolution` be split into smaller, more focused modules?**
  _Cohesion score 0.06703296703296703 - nodes in this community are weakly interconnected._
- **Should `App Data, Paths & Backup` be split into smaller, more focused modules?**
  _Cohesion score 0.07052600646488393 - nodes in this community are weakly interconnected._
- **Should `Tauri IPC Command Surface` be split into smaller, more focused modules?**
  _Cohesion score 0.03296703296703297 - nodes in this community are weakly interconnected._
- **Should `App Shell & Modals` be split into smaller, more focused modules?**
  _Cohesion score 0.06720321931589537 - nodes in this community are weakly interconnected._
- **Should `Agent Canvas & Cost Tracking` be split into smaller, more focused modules?**
  _Cohesion score 0.06153846153846154 - nodes in this community are weakly interconnected._