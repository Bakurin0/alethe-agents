/**
 * Constantes puras do Agent Canvas (POC). Sem dependência de React/DOM — só
 * valores de configuração compartilhados pelo componente, seus sub-componentes
 * e hooks. Mantido em `lib/` pra poder ser importado sem carregar o CSS module.
 */

/** Cores fixas por tipo de agente conhecido (tokens do tema). */
export const AGENT_COLORS: Record<string, string> = {
  explore: 'var(--agent-codex)',
  plan: '#a78bfa',
  'general-purpose': 'var(--agent-claude)',
}

/** Prompt de exemplo pra copiar quando o canvas está vazio. */
export const TEST_PROMPT =
  'Analise esta codebase com 3 subagents Explore em paralelo: um pro código-fonte principal, ' +
  'um pra configs/build e um pra docs/testes. Cada um mapeia os arquivos do seu escopo e devolve um resumo curto.'

/** Quantidade de eventos exibidos no mini-feed de cada card. */
export const MINI_FEED_SIZE = 3

// Agent Teams (experimental) ligado só neste PTY; auto-updater desligado pra o
// claude não se atualizar no meio da sessão (um update interrompido renomeia o
// binário pra claude.exe.old e derruba o control plane — já aconteceu).
export const PTY_ENV = {
  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
  DISABLE_AUTOUPDATER: '1',
}

/** Acima deste % de uso da janela de 5h do Claude, liga o fallback codex. */
export const USAGE_FALLBACK_THRESHOLD = 80
/** De quanto em quanto tempo o canvas relê o usage do Claude. */
export const USAGE_POLL_MS = 60_000
/** De quanto em quanto tempo o canvas relê o custo dos nós + do lead. */
export const COST_POLL_MS = 4_000

/** Limites de zoom do stage (árvore de agentes). */
export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 1.4
export const ZOOM_STEP = 0.1

/**
 * Teto de workers REAIS vivos ao mesmo tempo. Cada worker é um processo pesado
 * (um `claude -p` come ~400 MB; codex é bem mais leve) — sem teto, um lead
 * autônomo spawna dezenas e estoura a RAM até o app cair. Spawns acima disso
 * são recusados; o lead deve preferir subagents in-process.
 */
export const MAX_LIVE_WORKERS = 3

/** Ordem de custo das famílias — pra saber quando um nó foi mais barato que o lead. */
export const FAMILY_RANK: Record<string, number> = { haiku: 1, sonnet: 2, opus: 3 }

/**
 * Time-base que o cérebro precisa na pasta pra orquestrar de verdade: o planner
 * (orchestrator) + os papéis front/back/qa/docs. Auto-instalados ao abrir a
 * sessão (best-effort; nunca sobrescreve agent externo de mesmo nome).
 */
export const CORE_AGENTS = [
  'orchestrator',
  'frontend-dev',
  'backend-dev',
  'qa-reviewer',
  'docs-writer',
]
