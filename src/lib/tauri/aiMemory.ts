import { invoke } from '@tauri-apps/api/core'

// --- ai-memory (memória de longo prazo compartilhada entre agentes) ---

export type AiMemoryStatus = {
  /** Binário encontrado no PATH (`ai-memory --version` respondeu). */
  installed: boolean
  /** Servidor respondendo no endpoint loopback. */
  running: boolean
  command: string
  endpoint: string
  version?: string
}

export async function aiMemoryDetect(command?: string): Promise<AiMemoryStatus> {
  return invoke<AiMemoryStatus>('ai_memory_detect', { command })
}

export async function aiMemoryMcpConfigPath(repo: string, command?: string): Promise<string> {
  return invoke<string>('ai_memory_mcp_config_path', { repo, command })
}

/** OpenCode não tem `--mcp-config`: lê MCP de `opencode.json` no root do projeto — escreve/mescla essa entrada antes do spawn. */
export async function aiMemoryOpenCodeConfigWrite(repo: string, command?: string): Promise<void> {
  await invoke('ai_memory_opencode_config_write', { repo, command })
}

/** Codex não tem `--mcp-config`: lê MCP de `.codex/config.toml` no root do projeto (só em "trusted projects") — escreve/mescla essa entrada antes do spawn. */
export async function aiMemoryCodexConfigWrite(repo: string, command?: string): Promise<void> {
  await invoke('ai_memory_codex_config_write', { repo, command })
}
