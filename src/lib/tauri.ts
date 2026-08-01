import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'



export async function loadProjectsFile(): Promise<string | null> {
  return invoke<string | null>('load_projects')
}

export async function saveProjectsFile(content: string, sequence: number): Promise<void> {
  await invoke('save_projects', { content, sequence })
}

export async function setWindowOpacity(opacity: number): Promise<void> {
  await invoke('set_window_opacity', { opacity })
}

export type ProfileMeta = {
  id: string
  name: string
  created_at_ms: number
  last_used_at_ms: number
}

export type ProfilesState = {
  active_profile_id: string
  profiles: ProfileMeta[]
}

export async function listProfiles(): Promise<ProfilesState> {
  return invoke<ProfilesState>('list_profiles')
}

export async function getActiveProfile(): Promise<ProfileMeta> {
  return invoke<ProfileMeta>('get_active_profile')
}

export async function setActiveProfile(profileId: string): Promise<ProfilesState> {
  return invoke<ProfilesState>('set_active_profile', { profileId })
}

export async function createProfile(name?: string): Promise<ProfilesState> {
  return invoke<ProfilesState>('create_profile', { name })
}

export async function renameProfile(profileId: string, name: string): Promise<ProfilesState> {
  return invoke<ProfilesState>('rename_profile', { profileId, name })
}

export async function deleteProfile(profileId: string): Promise<ProfilesState> {
  return invoke<ProfilesState>('delete_profile', { profileId })
}

export type SpawnPtyArgs = {
  cols: number
  rows: number
  id?: string
  command?: string
  cwd?: string
  extraArgs?: string[]
  /** Path absoluto pro launcher (override do auto-detect). */
  launcherOverride?: string
  /** Env extra só deste PTY (não vaza pra outros terminais). */
  env?: Record<string, string>
}

export async function spawnPty(args: SpawnPtyArgs): Promise<{ id: string }> {
  return invoke<{ id: string }>('spawn_pty', {
    cols: args.cols,
    rows: args.rows,
    id: args.id,
    command: args.command,
    cwd: args.cwd,
    extraArgs: args.extraArgs,
    launcherOverride: args.launcherOverride,
    env: args.env,
  })
}

export async function ptyExists(id: string): Promise<boolean> {
  return invoke<boolean>('pty_exists', { id })
}

export async function attachPty(id: string, maxBytes = 512 * 1024): Promise<string> {
  return invoke<string>('attach_pty', { id, maxBytes })
}

export async function writePty(id: string, data: string): Promise<void> {
  await invoke('write_pty', { id, data })
}

export async function resizePty(id: string, cols: number, rows: number): Promise<void> {
  await invoke('resize_pty', { id, cols, rows })
}

export async function killPty(id: string): Promise<void> {
  await invoke('kill_pty', { id })
}

export async function setPtyReadState(id: string, active: boolean): Promise<void> {
  await invoke('set_pty_read_state', { id, active })
}

export async function setPtyPriority(id: string, active: boolean): Promise<void> {
  await invoke('set_pty_priority', { id, active })
}

export type MemoryPressureLevel = 'Ok' | 'Low' | 'Medium' | 'High' | 'Critical'

export type ResourceMetrics = {
  memory_pressure: MemoryPressureLevel
  system_available_mb: number
  system_total_mb: number
  app_mb: number
  webview_mb: number
  ptys_mb: number
  process_count: number
  policy_trigger_count: number
}

export async function getResourceMetrics(): Promise<ResourceMetrics> {
  return invoke<ResourceMetrics>('get_resource_metrics')
}

export type PtyTreeInfo = {
  pty_id: string
  root_pid: number | null
  descendants: number[]
  alive: boolean
}

export async function getPtyTreeInfo(ptyId: string): Promise<PtyTreeInfo> {
  return invoke<PtyTreeInfo>('get_pty_tree_info', { ptyId })
}

export async function killPtyTree(ptyId: string): Promise<number[]> {
  return invoke<number[]>('kill_pty_tree_cmd', { ptyId })
}

export async function restartPty(args: SpawnPtyArgs & { id: string }): Promise<{ id: string }> {
  return invoke<{ id: string }>('restart_pty', {
    id: args.id,
    command: args.command,
    cwd: args.cwd,
    extraArgs: args.extraArgs,
    launcherOverride: args.launcherOverride,
    env: args.env,
  })
}

export async function getPtyCwd(id: string): Promise<string | null> {
  return invoke<string | null>('get_pty_cwd', { id })
}

// --- Ghostty native terminal (macOS only) ---

export type GhosttySurfaceResponse = {
  id: string
  attached: boolean
}

/** Retângulo em coordenadas da WebView (CSS px, origem topo-esquerda). */
export type WebRect = { x: number; y: number; width: number; height: number }

export type GhosttySpawnArgs = {
  id: string
  /** Diretório inicial do terminal. undefined = padrão do shell. */
  cwd?: string
  /** Linha de comando a executar (ex.: "claude --flag"). undefined = shell de login. */
  command?: string
}

export async function ghosttySpawn(args: GhosttySpawnArgs): Promise<GhosttySurfaceResponse> {
  return invoke<GhosttySurfaceResponse>('ghostty_spawn', {
    id: args.id,
    cwd: args.cwd,
    command: args.command,
  })
}

export async function ghosttySyncFrame(
  id: string,
  rect: WebRect,
  scale: number,
): Promise<void> {
  await invoke('ghostty_sync_frame', { id, rect, scale })
}

export async function ghosttySetHidden(id: string, hidden: boolean): Promise<void> {
  await invoke('ghostty_set_hidden', { id, hidden })
}

export async function ghosttySetFocus(id: string, focused: boolean): Promise<void> {
  await invoke('ghostty_set_focus', { id, focused })
}

/** true quando o processo do terminal Ghostty já saiu (shell/agente encerrou). */
export async function ghosttySurfaceExited(id: string): Promise<boolean> {
  return invoke<boolean>('ghostty_surface_exited', { id })
}

export async function ghosttyKill(id: string): Promise<void> {
  await invoke('ghostty_kill', { id })
}

/** Mata todas as surfaces nativas vivas — limpeza de órfãs no boot/reload. */
export async function ghosttyKillAll(): Promise<void> {
  await invoke('ghostty_kill_all')
}

export type PtyProcessSnapshot = {
  id: string
  pid: number | null
  command: string | null
  cwd: string | null
  process_name: string | null
  cmdline: string | null
  memory_mb: number
  alive: boolean
}

export async function listPtyProcesses(): Promise<PtyProcessSnapshot[]> {
  return invoke<PtyProcessSnapshot[]>('list_pty_processes')
}

export type DirectoryEntry = {
  name: string
  path: string
  is_dir: boolean
}

export async function listDirectory(path: string): Promise<DirectoryEntry[]> {
  return invoke<DirectoryEntry[]>('list_directory', { path })
}

export type GitFileChange = {
  path: string
  originalPath: string | null
  status: string
}

export type GitRepositoryStatus = {
  repoRoot: string
  branch: string
  detached: boolean
  ahead: number
  behind: number
  staged: GitFileChange[]
  changes: GitFileChange[]
  untracked: GitFileChange[]
  conflicts: GitFileChange[]
}

export async function gitStatus(path: string): Promise<GitRepositoryStatus> {
  return invoke<GitRepositoryStatus>('git_status', { path })
}

export async function gitDiff(repoRoot: string, path: string, staged: boolean): Promise<string> {
  return invoke<string>('git_diff', { repoRoot, path, staged })
}

export async function gitStage(repoRoot: string, paths: string[]): Promise<void> {
  return invoke('git_stage', { repoRoot, paths })
}

export async function gitUnstage(repoRoot: string, paths: string[]): Promise<void> {
  return invoke('git_unstage', { repoRoot, paths })
}

export async function gitDiscard(repoRoot: string, paths: string[], untracked: boolean): Promise<void> {
  return invoke('git_discard', { repoRoot, paths, untracked })
}

export async function gitCommit(repoRoot: string, message: string): Promise<string> {
  return invoke<string>('git_commit', { repoRoot, message })
}

export async function gitPush(repoRoot: string): Promise<string> {
  return invoke<string>('git_push', { repoRoot })
}

export async function gitPull(repoRoot: string): Promise<string> {
  return invoke<string>('git_pull', { repoRoot })
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path })
}

export async function ensureTodoTemplate(directory: string): Promise<string> {
  return invoke<string>('ensure_todo_template', { directory })
}

export async function watchFile(path: string): Promise<void> {
  await invoke('watch_file', { path })
}

export async function unwatchFile(path: string): Promise<void> {
  await invoke('unwatch_file', { path })
}

/** Acorda quando um arquivo observado por `watchFile` muda no disco. */
export function listenFileChanged(handler: (path: string) => void): Promise<UnlistenFn> {
  return listen<{ path: string }>('md://changed', (event) => handler(event.payload.path))
}

export function listenPtyData(
  id: string,
  handler: (chunk: string) => void,
): Promise<UnlistenFn> {
  return listen<string>(`pty://data/${id}`, (event) => handler(event.payload))
}

export function listenPtyExit(
  id: string,
  handler: (payload: PtyExitPayload) => void,
): Promise<UnlistenFn> {
  return listen<PtyExitPayload>(`pty://exit/${id}`, (event) => handler(event.payload))
}

export type PtyExitReason = 'exited' | 'killed' | 'suspended' | 'restarted'

export type PtyExitPayload = {
  code: number | null
  reason: PtyExitReason
}

/** Endpoint HTTP local (listener já usado pelos hooks do Claude Code em
 * agent_events.rs) — reaproveitado pelo plugin do OpenCode pra reportar
 * working/idle real (ver opencode_bridge.rs). */
export async function agentHooksEndpoint(): Promise<string> {
  return invoke('agent_hooks_endpoint')
}

export type OpenCodeBridgeStatus = {
  directory: string
  state: 'working' | 'idle'
}

/** Sinal real de working/idle do OpenCode, reportado pelo plugin global
 * (~/.config/opencode/plugin/alethe-bridge.js) via POST local. */
export function listenOpenCodeBridgeStatus(
  handler: (payload: OpenCodeBridgeStatus) => void,
): Promise<UnlistenFn> {
  return listen<OpenCodeBridgeStatus>('opencode-bridge-status', (event) => handler(event.payload))
}

export type MemoryStats = {
  total_mb: number
  app_mb: number
  webview_mb: number
  ptys_mb: number
  process_count: number
  system_total_mb: number
  system_available_mb: number
}

export async function getMemoryStats(): Promise<MemoryStats> {
  return invoke<MemoryStats>('get_memory_stats')
}

export type ResourcePolicyInput = {
  mode: 'smart-lru' | 'manual'
  memoryBudgetMb: number
  warningThresholdMb: number
  recoveryTargetMb: number
  hiddenAgentIdleMinutes: number
  hiddenShellIdleMinutes: number
  spawnGraceSeconds: number
}

export type PtyRuntimeMeta = {
  id: string
  kind: string
  status: string
  visible: boolean
  focused: boolean
  protected: boolean
  lastIoAtMs: number
  spawnedAtMs: number
  lastUsedAtMs: number
  reportedAtMs: number
}

export type RuntimeProcess = {
  pid: number
  parentPid: number | null
  name: string
  workingSetMb: number
  privateCommitMb: number
  cpuPercent: number
}

export type PtyResourceStats = {
  id: string
  rootPid: number | null
  command: string | null
  cwd: string | null
  processCount: number
  workingSetMb: number
  privateCommitMb: number
  effectiveMemoryMb: number
  processes: RuntimeProcess[]
}

export type ResourcePressureState = {
  level: 'normal' | 'warning' | 'critical'
  spawnBlocked: boolean
  automatic: boolean
  candidateCount: number
  lastSuspendedId: string | null
}

export type RuntimeSnapshot = {
  sampledAtMs: number
  memory: MemoryStats
  privateCommitMb: number
  effectiveTotalMb: number
  ptys: PtyResourceStats[]
  pressure: ResourcePressureState
}

export type ResourcePressurePayload = {
  level: ResourcePressureState['level']
  totalMb: number
  budgetMb: number
  spawnBlocked: boolean
  candidateCount: number
  suspendedId: string | null
}

export type PtySuspendedPayload = {
  id: string
  reason: 'memory-pressure' | string
}

export async function getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>('get_runtime_snapshot')
}

export async function setResourcePolicy(policy: ResourcePolicyInput): Promise<void> {
  await invoke('set_resource_policy', { policy })
}

export async function updatePtyRuntimeMeta(metas: PtyRuntimeMeta[]): Promise<void> {
  await invoke('update_pty_runtime_meta', { metas })
}

export async function suspendPty(id: string): Promise<boolean> {
  return invoke<boolean>('suspend_pty', { id })
}

export function listenResourcePressure(
  handler: (payload: ResourcePressurePayload) => void,
): Promise<UnlistenFn> {
  return listen<ResourcePressurePayload>('resource://pressure', (event) => handler(event.payload))
}

export function listenPtySuspended(
  handler: (payload: PtySuspendedPayload) => void,
): Promise<UnlistenFn> {
  return listen<PtySuspendedPayload>('resource://pty-suspended', (event) =>
    handler(event.payload),
  )
}

/** Estado da sessão anterior, se ela não saiu limpa (provável crash/OOM/kill). */
export type CrashReport = {
  started_at_ms: number
  clean_exit: boolean
  app_version: string
  last_heartbeat_ms: number
  total_mb: number
  ptys_mb: number
  webview_mb: number
  process_count: number
}

/** null se a sessão anterior saiu limpa (ou é o primeiro boot). */
export async function getLastCrashReport(): Promise<CrashReport | null> {
  return invoke<CrashReport | null>('get_last_crash_report')
}

export async function openDataFolder(): Promise<void> {
  await invoke('open_data_folder')
}

export async function openSpawnLog(): Promise<void> {
  await invoke('open_spawn_log')
}

export async function openInFileExplorer(path: string): Promise<void> {
  await invoke('open_in_file_explorer', { path })
}

export async function openInVscode(path: string): Promise<void> {
  await invoke('open_in_vscode', { path })
}

export async function openInBrowser(target: string): Promise<void> {
  await invoke('open_in_browser', { target })
}

export async function openLogsFolder(): Promise<void> {
  await invoke('open_logs_folder')
}

export async function exportLogs(targetPath: string): Promise<void> {
  await invoke('export_logs', { targetPath })
}

/** Persiste um erro do frontend no log de crash. Nunca lança (logging não pode quebrar o caller). */
export async function recordFrontendError(
  message: string,
  stack: string | null,
  kind: string,
): Promise<void> {
  try {
    await invoke('record_frontend_error', { message, stack, kind })
  } catch {
    /* logging best-effort */
  }
}

export async function writeClipboardText(text: string): Promise<void> {
  await invoke('write_clipboard_text', { text })
}

export async function readClipboardText(): Promise<string> {
  return invoke<string>('read_clipboard_text')
}

export async function resetAppData(): Promise<void> {
  await invoke('reset_app_data')
}

export async function setDiscordPresence(
  details: string,
  state: string,
  startedAt: number,
): Promise<void> {
  await invoke('set_discord_presence', { details, state, startedAt })
}

export async function clearDiscordPresence(): Promise<void> {
  await invoke('clear_discord_presence')
}

export async function findCliLauncher(agent: string): Promise<string | null> {
  return invoke<string | null>('find_cli_launcher', { agent })
}

export async function exportBackup(targetPath: string): Promise<void> {
  await invoke('export_backup', { targetPath })
}

export async function importBackup(sourcePath: string): Promise<void> {
  await invoke('import_backup', { sourcePath })
}

export type GithubSyncStatus = {
  connected: boolean
  login: string | null
  gist_id: string | null
  gist_url: string | null
  last_push_ms: number | null
  last_pull_ms: number | null
}

export async function githubSyncStatus(): Promise<GithubSyncStatus> {
  return invoke<GithubSyncStatus>('github_sync_status')
}

export async function githubSyncSetToken(token: string): Promise<GithubSyncStatus> {
  return invoke<GithubSyncStatus>('github_sync_set_token', { token })
}

export async function githubSyncLogout(): Promise<GithubSyncStatus> {
  return invoke<GithubSyncStatus>('github_sync_logout')
}

export async function githubSyncPush(): Promise<GithubSyncStatus> {
  return invoke<GithubSyncStatus>('github_sync_push')
}

export async function githubSyncPull(): Promise<GithubSyncStatus> {
  return invoke<GithubSyncStatus>('github_sync_pull')
}

export type ClaudeUsageWindow = {
  utilization: number
  resets_at: string
}

export type ClaudeUsage = {
  five_hour: ClaudeUsageWindow
  seven_day: ClaudeUsageWindow
  seven_day_opus: ClaudeUsageWindow
}

export async function getClaudeUsage(): Promise<ClaudeUsage> {
  return invoke<ClaudeUsage>('get_claude_usage')
}

export type CodexUsageWindow = {
  used_percent: number
  window_minutes: number
  /** Epoch em milissegundos (0 = desconhecido). */
  resets_at_ms: number
}

export type CodexUsage = {
  primary: CodexUsageWindow
  secondary: CodexUsageWindow
  plan: string
  rate_limited: boolean
  reset_credits: number
}

export async function getCodexUsage(): Promise<CodexUsage> {
  return invoke<CodexUsage>('get_codex_usage')
}

export type AntigravityQuotaBucket = {
  label: string
  models: string[]
  used_percent: number
  remaining_percent: number
  resets_at: string
}

export type AntigravityUsage = {
  status: 'ready' | 'no_cli' | 'no_auth' | 'unavailable'
  cli_path: string
  used_percent: number
  rate_limited: boolean
  buckets: AntigravityQuotaBucket[]
}

export async function getAntigravityUsage(): Promise<AntigravityUsage> {
  return invoke<AntigravityUsage>('get_antigravity_usage')
}

export type AntigravitySessionSnapshot = {
  id: string
  preview: string
  modified_at_ms: number
}

export async function snapshotAntigravitySessions(cwd: string): Promise<AntigravitySessionSnapshot[]> {
  return invoke<AntigravitySessionSnapshot[]>('snapshot_antigravity_sessions', { cwd })
}

/** Custo por modelo dentro de uma sessão (tokens + USD). */
export type ModelCost = {
  model: string
  input: number
  output: number
  cache_read: number
  cache_write_5m: number
  cache_write_1h: number
  /** null se o modelo não está na tabela de preço (ex.: GPT do Codex). */
  cost_usd: number | null
}

/** Custo real de uma sessão, parseado do JSONL (Claude/Codex). */
export type SessionCost = {
  session_id: string
  agent: string
  input: number
  output: number
  cache_read: number
  cache_write_5m: number
  cache_write_1h: number
  total_tokens: number
  cost_usd: number | null
  model: string | null
  by_model: ModelCost[]
}

export async function getSessionCost(
  agent: string,
  cwd: string,
  sessionId: string,
): Promise<SessionCost> {
  return invoke<SessionCost>('get_session_cost', { agent, cwd, sessionId })
}

/** Custo de um transcript JSONL do Claude por path — pros nós do agent canvas. */
export async function getTranscriptCost(path: string): Promise<SessionCost> {
  return invoke<SessionCost>('get_transcript_cost', { path })
}

/** Preço por 1M de tokens por família de modelo (opus/sonnet/haiku). */
export type ModelRate = {
  family: string
  input: number
  output: number
  cache_write_5m: number
  cache_write_1h: number
  cache_read: number
}

/** Tabela de preço (do backend) pra estimar economia por roteamento no front. */
export async function getModelPricing(): Promise<ModelRate[]> {
  return invoke<ModelRate[]>('get_model_pricing')
}

/** Resumo de custo/tokens do OpenCode numa janela de horas — não existe
 * conceito de "% de plano" pro OpenCode (BYOK multi-provider), então o
 * OpenCodeCard mostra isso em vez de uma barra de utilização. */
export type OpenCodeUsageSummary = {
  cost_usd: number
  input_tokens: number
  output_tokens: number
  session_count: number
  by_model: ModelCost[]
}

export async function getOpenCodeUsageSummary(hours: number): Promise<OpenCodeUsageSummary> {
  return invoke<OpenCodeUsageSummary>('get_opencode_usage_summary', { hours })
}

export type ClaudeSessionMeta = {
  id: string
  title: string | null
  first_user_prompt: string | null
  message_count: number
  modified_at_ms: number
  size_bytes: number
}

export type ClaudeSessionSnapshot = {
  id: string
  modified_at_ms: number
  size_bytes: number
}

export type CodexSessionSnapshot = {
  id: string
  cwd: string
  modified_at_ms: number
  size_bytes: number
}

export async function snapshotClaudeSessions(cwd: string): Promise<ClaudeSessionSnapshot[]> {
  return invoke<ClaudeSessionSnapshot[]>('snapshot_claude_sessions', { cwd })
}

export async function snapshotCodexSessions(cwd: string): Promise<CodexSessionSnapshot[]> {
  return invoke<CodexSessionSnapshot[]>('snapshot_codex_sessions', { cwd })
}

export async function listClaudeSessions(cwd: string): Promise<ClaudeSessionMeta[]> {
  return invoke<ClaudeSessionMeta[]>('list_claude_sessions', { cwd })
}

export type ActivityDay = {
  /** Data UTC YYYY-MM-DD */
  date: string
  /** Mensagens (user + assistant) registradas no dia */
  count: number
}

export async function getClaudeActivity(days = 91): Promise<ActivityDay[]> {
  return invoke<ActivityDay[]>('get_claude_activity', { days }).catch(() => [])
}

/** Mesma janela, mas somando Claude + Codex + OpenCode — ver
 * get_multi_agent_activity em claude_sessions.rs pra granularidade por agente. */
export async function getMultiAgentActivity(days: number): Promise<ActivityDay[]> {
  return invoke<ActivityDay[]>('get_multi_agent_activity', { days })
}

export type ActivityAgentSample = {
  agent: Exclude<import('./types').AgentType, 'shell'>
  projectId: string | null
  terminalId: string | null
  state: 'working' | 'waiting'
}

export type ActivitySample = {
  date: string
  durationMs: number
  appFocused: boolean
  userActive: boolean
  activeProjectId: string | null
  activeTerminalId: string | null
  agents: ActivityAgentSample[]
}

export type ActivityTimeTotals = {
  appOpenMs: number
  appFocusedMs: number
  userActiveMs: number
  userIdleMs: number
  agentWallMs: number
  agentSumMs: number
  agentBackgroundMs: number
  parallelMs: number
  peakConcurrent: number
}

export type AgentTimeStats = {
  workingMs: number
  waitingMs: number
  focusedMs: number
  backgroundMs: number
}

export type ProjectTimeStats = {
  focusedMs: number
  activeMs: number
  idleMs: number
  agentWallMs: number
  agentSumMs: number
  agentBackgroundMs: number
  parallelMs: number
}

export type ActivitySummary = {
  totals: ActivityTimeTotals
  agents: Record<string, AgentTimeStats>
  projects: Record<string, ProjectTimeStats>
}

export async function recordActivitySamples(samples: ActivitySample[]): Promise<void> {
  await invoke('record_activity_samples', { samples })
}

export async function getActivitySummary(dates: string[] = []): Promise<ActivitySummary> {
  return invoke<ActivitySummary>('get_activity_summary', { dates })
}

export async function clearActivityStats(): Promise<void> {
  await invoke('clear_activity_stats')
}

// --- RFC-003 — Worktrees ---

export type WorktreeMode = 'gitWorktree' | 'localCopy'

export type WorktreeInfo = {
  agentId: string
  path: string
  branch: string
  mode: WorktreeMode
  createdAt: number
}

export async function worktreeProvision(
  repo: string,
  agentId: string,
  mode: WorktreeMode,
): Promise<WorktreeInfo> {
  return invoke<WorktreeInfo>('worktree_provision', { repo, agentId, mode })
}

export async function worktreeList(repo: string): Promise<WorktreeInfo[]> {
  return invoke<WorktreeInfo[]>('worktree_list', { repo })
}

export async function worktreeRemove(repo: string, agentId: string, force: boolean): Promise<void> {
  await invoke('worktree_remove', { repo, agentId, force })
}

export async function worktreeCleanup(repo: string): Promise<void> {
  await invoke('worktree_cleanup', { repo })
}

/** LocalCopy: traz o branch do clone para o repo principal antes do merge. No-op em gitWorktree. */
export async function worktreeFetchBranch(repo: string, agentId: string): Promise<void> {
  await invoke('worktree_fetch_branch', { repo, agentId })
}

/** Trava administrativamente um worktree (`git worktree lock`) — ver `adminLockReason` em `OrphanWorktree`. */
export async function worktreeLock(repo: string, agentId: string, reason?: string): Promise<void> {
  await invoke('worktree_lock', { repo, agentId, reason })
}

export async function worktreeUnlock(repo: string, agentId: string): Promise<void> {
  await invoke('worktree_unlock', { repo, agentId })
}

// --- RFC-001 — Event Bus & Observabilidade ---

export type EventBusPayload = {
  event_type: string
  timestamp_ms: number
  correlation_id: string
  task_id: string | null
  agent_id: string | null
  data: Record<string, any>
}

export type MetricData = {
  count: number
  last_value: number
  sum: number
}

export async function publishEvent(event: EventBusPayload): Promise<void> {
  await invoke('publish_event', { event })
}

export async function getTelemetryMetrics(): Promise<Record<string, MetricData>> {
  return invoke<Record<string, MetricData>>('get_telemetry_metrics')
}

export async function getTelemetryTraces(correlationId?: string): Promise<EventBusPayload[]> {
  return invoke<EventBusPayload[]>('get_telemetry_traces', { correlationId })
}

export function listenEventBus(handler: (event: EventBusPayload) => void): Promise<UnlistenFn> {
  return listen<EventBusPayload>('event-bus-event', (event) => handler(event.payload))
}

// --- RFC-008 & RFC-005 — Validation & GSD Watcher ---

export type ValidationResult = {
  success: boolean
  stage: string
  output: string
}

export async function runValidation(cwd: string, commands: string[]): Promise<ValidationResult> {
  return invoke<ValidationResult>('run_validation', { cwd, commands })
}

export async function startGsdWatcher(projectId: string, repoPath: string): Promise<void> {
  await invoke('start_gsd_watcher', { projectId, repoPath })
}

export async function stopGsdWatcher(projectId: string, repoPath: string): Promise<void> {
  await invoke('stop_gsd_watcher', { projectId, repoPath })
}

// --- RFC-002 — Scheduler ---

export type SchedulerTask = {
  id: string
  projectId: string
  title: string
  dependencies: string[]
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'blocked'
  assignedAgentId: string | null
  leaseResource: string | null
  priority: number
}

export async function getSchedulerTasks(projectId: string): Promise<SchedulerTask[]> {
  return invoke<SchedulerTask[]>('get_scheduler_tasks', { projectId })
}

export async function triggerSchedulerTick(
  projectId: string,
  repoPath: string,
  worktreeMode?: WorktreeMode,
): Promise<void> {
  await invoke('trigger_scheduler_tick', { projectId, repoPath, worktreeMode })
}

export async function cancelTask(taskId: string): Promise<void> {
  await invoke('cancel_task', { taskId })
}

// --- RFC-006/007/008 — Ciclo de merge seguro ---

export type ConflictClass =
  | 'rust'
  | 'typeScript'
  | 'ui'
  | 'cargo'
  | 'package'
  | 'asset'
  | 'config'
  | 'gsd'
  | 'unknown'

export type ConflictFile = {
  path: string
  class: ConflictClass
}

export type MergeAnalysis = {
  clean: boolean
  source: string
  target: string
  conflicts: ConflictFile[]
  classes: ConflictClass[]
}

export type ConflictEnv = {
  id: string
  path: string
  branch: string
  clean: boolean
  conflicts: ConflictFile[]
  promptPath?: string
}

export type MergeOutcome = {
  merged: boolean
  stage: string
  output: string
}

export async function mergeAnalyze(
  repo: string,
  source: string,
  target: string,
  projectId?: string,
): Promise<MergeAnalysis> {
  return invoke<MergeAnalysis>('merge_analyze', { repo, source, target, projectId })
}

export async function mergePrepare(
  repo: string,
  source: string,
  target: string,
  projectId?: string,
): Promise<ConflictEnv> {
  return invoke<ConflictEnv>('merge_prepare', { repo, source, target, projectId })
}

export async function mergeFinalize(
  repo: string,
  envId: string,
  validationCommands: string[],
): Promise<MergeOutcome> {
  return invoke<MergeOutcome>('merge_finalize', { repo, envId, validationCommands })
}

export async function mergeAbort(repo: string, envId: string): Promise<void> {
  await invoke('merge_abort', { repo, envId })
}

/** Abort preventivo no worktree EFÊMERO antes de um retry — no-op se nada em progresso. */
export async function mergePreflightAbort(repo: string, envId: string): Promise<void> {
  await invoke('merge_preflight_abort', { repo, envId })
}

/** Reconcilia a branch efêmera (já resolvida) com a ponta atual do alvo, quando `stage === 'branch_diverged'`. */
export async function mergeRebaseOntoTarget(repo: string, envId: string): Promise<MergeOutcome> {
  return invoke<MergeOutcome>('merge_rebase_onto_target', { repo, envId })
}

export type MergeForceCleanupResult = {
  deleted: boolean
  pruned: boolean
}

/** Limpeza bruta de um ambiente de merge irrecuperável (fase `terminal_error`). */
export async function mergeForceCleanup(repo: string, envId: string): Promise<MergeForceCleanupResult> {
  return invoke<MergeForceCleanupResult>('merge_force_cleanup', { repo, envId })
}

export async function gitListBranches(repoRoot: string): Promise<string[]> {
  return invoke<string[]>('git_list_branches', { repoRoot })
}

// --- RFC-004 — Graphify ---

export type GraphifyStatus = {
  available: boolean
  command: string
  version?: string
}

export type GraphNode = {
  id: string
  label: string
  kind?: string
  group?: string
}

export type GraphEdge = {
  id: string
  source: string
  target: string
  label?: string
}

export type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeCount: number
  edgeCount: number
  truncated: boolean
}

export type GraphSnapshotInfo = {
  id: string
  path: string
  createdMs: number
  sizeBytes: number
}

export async function graphifyDetect(command?: string): Promise<GraphifyStatus> {
  return invoke<GraphifyStatus>('graphify_detect', { command })
}

/**
 * Bootstrap único do grafo: o primeiro terminal de agente dispara a geração;
 * os demais recebem 'exists'/'generating' e só usam. 'unavailable' = CLI ausente.
 */
export async function graphifyEnsureGraph(
  repo: string,
  command?: string,
): Promise<'exists' | 'generating' | 'started' | 'unavailable'> {
  return invoke<'exists' | 'generating' | 'started' | 'unavailable'>('graphify_ensure_graph', {
    repo,
    command,
  })
}

export async function graphifyMcpConfigPath(repo: string, command?: string): Promise<string> {
  return invoke<string>('graphify_mcp_config_path', { repo, command })
}

/** OpenCode não tem `--mcp-config`: lê MCP de `opencode.json` no root do projeto — escreve/mescla essa entrada antes do spawn. */
export async function graphifyOpenCodeConfigWrite(repo: string, command?: string): Promise<void> {
  await invoke('graphify_opencode_config_write', { repo, command })
}

/** Codex não tem `--mcp-config`: lê MCP de `.codex/config.toml` no root do projeto (só em "trusted projects") — escreve/mescla essa entrada antes do spawn. */
export async function graphifyCodexConfigWrite(repo: string, command?: string): Promise<void> {
  await invoke('graphify_codex_config_write', { repo, command })
}

export async function graphifyReadGraph(repo: string): Promise<GraphData> {
  return invoke<GraphData>('graphify_read_graph', { repo })
}

export async function graphifySnapshot(repo: string, projectId?: string): Promise<GraphSnapshotInfo> {
  return invoke<GraphSnapshotInfo>('graphify_snapshot', { repo, projectId })
}

export async function graphifyListSnapshots(repo: string): Promise<GraphSnapshotInfo[]> {
  return invoke<GraphSnapshotInfo[]>('graphify_list_snapshots', { repo })
}

export async function graphifyDiffSnapshot(
  repo: string,
  baseId: string,
  targetId: string,
): Promise<GraphData> {
  return invoke<GraphData>('graphify_diff_snapshot', { repo, baseId, targetId })
}

export async function graphifyRollback(repo: string, snapshotId: string, projectId?: string): Promise<void> {
  await invoke('graphify_rollback', { repo, snapshotId, projectId })
}

export async function graphifyPruneSnapshots(
  repo: string,
  keepLast: number,
  maxAgeDays?: number,
  projectId?: string,
): Promise<void> {
  await invoke('graphify_prune_snapshots', { repo, keepLast, maxAgeDays, projectId })
}

// --- RFC-012 — Plugin System ---

export type PluginKind = 'agentType' | 'skill' | 'validationPipeline'

export type PluginManifest = {
  name: string
  version: string
  kind: PluginKind
  description: string
  spec: Record<string, unknown>
}

export async function pluginsList(kind?: PluginKind): Promise<PluginManifest[]> {
  return invoke<PluginManifest[]>('plugins_list', { kind })
}

export async function pluginInstall(manifest: PluginManifest): Promise<void> {
  await invoke('plugin_install', { manifest })
}

export async function pluginUninstall(id: string): Promise<void> {
  await invoke('plugin_uninstall', { id })
}

// --- RFC-005 — Auditoria GSD ---

export type PlanningCommit = {
  hash: string
  author: string
  timestampMs: number
  subject: string
  agentId: string | null
}

export async function planningAuditRecord(
  repoPath: string,
  agentId?: string,
  reason?: string,
  projectId?: string,
): Promise<PlanningCommit | null> {
  return invoke<PlanningCommit | null>('planning_audit_record', { repoPath, agentId, reason, projectId })
}

export async function planningAuditHistory(repoPath: string, limit?: number): Promise<PlanningCommit[]> {
  return invoke<PlanningCommit[]>('planning_audit_history', { repoPath, limit })
}

export async function setPlanningAutocommit(enabled: boolean): Promise<void> {
  await invoke('set_planning_autocommit', { enabled })
}

export async function getPlanningAutocommit(): Promise<boolean> {
  return invoke<boolean>('get_planning_autocommit')
}

// --- OpenCode Sessions ---

export type OpenCodeSessionSnapshot = {
  id: string
  modified_at_ms: number
}

export async function snapshotOpenCodeSessions(cwd: string): Promise<OpenCodeSessionSnapshot[]> {
  return invoke<OpenCodeSessionSnapshot[]>('snapshot_opencode_sessions', { cwd })
}
