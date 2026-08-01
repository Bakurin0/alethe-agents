import { invoke } from '@tauri-apps/api/core'

export type AntigravitySessionSnapshot = {
  id: string
  preview: string
  modified_at_ms: number
}

export async function snapshotAntigravitySessions(
  cwd: string,
): Promise<AntigravitySessionSnapshot[]> {
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

// --- OpenCode Sessions ---

export type OpenCodeSessionSnapshot = {
  id: string
  modified_at_ms: number
}

export async function snapshotOpenCodeSessions(cwd: string): Promise<OpenCodeSessionSnapshot[]> {
  return invoke<OpenCodeSessionSnapshot[]>('snapshot_opencode_sessions', { cwd })
}
