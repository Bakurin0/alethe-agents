import type { AgentType } from './types'

export type AgentLaunch = {
  args: string[]
  sessionId?: string
  createdSession: boolean
}

function stripFlagWithValue(args: string[], flags: ReadonlySet<string>): string[] {
  const clean: string[] = []
  for (let index = 0; index < args.length; index++) {
    if (flags.has(args[index])) {
      index++
      continue
    }
    clean.push(args[index])
  }
  return clean
}

function stripClaudeSessionArgs(args: string[]): string[] {
  return stripFlagWithValue(args, new Set(['--resume', '-r', '--session-id']))
    .filter((arg) => arg !== '--continue' && arg !== '-c')
}

function stripCodexSessionArgs(args: string[]): string[] {
  if (args[0] !== 'resume') return [...args]
  const rest = args.slice(1)
  if (rest[0] === '--last' || (rest[0] && !rest[0].startsWith('-'))) rest.shift()
  return rest
}

function stripOpenCodeSessionArgs(args: string[]): string[] {
  return stripFlagWithValue(args, new Set(['--session', '-s']))
    .filter((arg) => arg !== '--continue' && arg !== '-c' && arg !== '--resume')
}

/**
 * Produz os argumentos de sessão sem depender de "a conversa mais recente".
 * Claude permite escolher o UUID no nascimento; Codex/OpenCode só recebem um
 * argumento de resume quando o pane já possui um ID conhecido.
 */
export function buildAgentLaunch(
  agent: AgentType,
  baseArgs: readonly string[] = [],
  sessionId?: string,
  createUuid: () => string = () => crypto.randomUUID(),
  // RFC-004: quando o Graphify está habilitado para o projeto, o Alethe gera um
  // `.mcp` (ver graphifyMcpConfigPath) e injeta aqui, sem tocar no `.claude/` do
  // repo. Só o Claude Code usa uma flag de spawn (`--mcp-config`) — Codex e
  // OpenCode leem MCP de um arquivo de config AMBIENTE no próprio projeto
  // (`.codex/config.toml` / `opencode.json`), escrito ANTES do spawn por
  // graphifyCodexConfigWrite/graphifyOpenCodeConfigWrite (XTermView) — não por
  // uma flag aqui. Isso é arquitetura correta dos 3 CLIs, não uma lacuna.
  mcpConfigPath?: string,
): AgentLaunch {
  if (agent === 'shell') {
    return { args: [...baseArgs], sessionId: undefined, createdSession: false }
  }

  if (agent === 'claude') {
    const clean = stripClaudeSessionArgs([...baseArgs])
    const mcp = mcpConfigPath ? ['--mcp-config', mcpConfigPath] : []
    if (sessionId) {
      return {
        args: ['--resume', sessionId, ...mcp, ...clean],
        sessionId,
        createdSession: false,
      }
    }
    const createdId = createUuid()
    return {
      args: ['--session-id', createdId, ...mcp, ...clean],
      sessionId: createdId,
      createdSession: true,
    }
  }

  if (agent === 'codex') {
    const clean = stripCodexSessionArgs([...baseArgs])
    return {
      args: sessionId ? ['resume', sessionId, ...clean] : clean,
      sessionId,
      createdSession: false,
    }
  }

  if (agent === 'opencode') {
    const clean = stripOpenCodeSessionArgs([...baseArgs])
    // --session <id> explícito sempre — nunca --continue, que não é por
    // terminal (pega "a última sessão do OpenCode" pro cwd inteiro e colide
    // entre panes). O ID vem de sessionDiscovery.claimMostRecentSession,
    // reivindicado antes do spawn.
    return {
      args: sessionId ? ['--session', sessionId, ...clean] : clean,
      sessionId,
      createdSession: false,
    }
  }

  // freebuff/mimo (e qualquer agente sem sintaxe própria de resume): só executa o
  // binário com os args base. freebuff não documenta flag de resume; o Mimo Code
  // retoma a sessão automaticamente via memória persistente, sem flag.
  return { args: [...baseArgs], sessionId: undefined, createdSession: false }
}
