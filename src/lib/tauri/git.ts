import { invoke } from '@tauri-apps/api/core'

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

export async function gitStage(repoRoot: string, paths: string[]): Promise<void> {
  return invoke('git_stage', { repoRoot, paths })
}

export async function gitUnstage(repoRoot: string, paths: string[]): Promise<void> {
  return invoke('git_unstage', { repoRoot, paths })
}

export async function gitDiscard(
  repoRoot: string,
  paths: string[],
  untracked: boolean,
): Promise<void> {
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

export async function gitListBranches(repoRoot: string): Promise<string[]> {
  return invoke<string[]>('git_list_branches', { repoRoot })
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

// --- RFC-006/007/008 — Ciclo de merge seguro ---

export type ConflictClass =
  'rust' | 'typeScript' | 'ui' | 'cargo' | 'package' | 'asset' | 'config' | 'gsd' | 'unknown'

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
export async function mergeForceCleanup(
  repo: string,
  envId: string,
): Promise<MergeForceCleanupResult> {
  return invoke<MergeForceCleanupResult>('merge_force_cleanup', { repo, envId })
}
