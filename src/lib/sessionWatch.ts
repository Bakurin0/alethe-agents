/**
 * Hint de "nova sessão" vindo do watcher do backend (`session://new`). Acelera a
 * detecção pós-spawn no XTermView: em vez de esperar o intervalo fixo do poll, a
 * detecção acorda na hora que um .jsonl novo do agente aparece. É só um
 * acelerador — o polling continua como fallback, então se o hint não vier (dir
 * inexistente, watcher falhou), nada quebra.
 */

import { listen } from '@tauri-apps/api/event'

type WatchAgent = 'claude' | 'codex'

const waiters: Record<WatchAgent, Array<() => void>> = { claude: [], codex: [] }
/** Teto de waiters por agente. Se o watcher nunca emitir (dir inexistente), os
 * resolvers de `Promise.race` que perderam ficariam pendentes pra sempre; ao
 * estourar o teto, resolvemos os mais antigos (no-op pra quem já perdeu o race). */
const MAX_WAITERS = 64
let started = false

function ensureStarted(): void {
  if (started) return
  started = true
  void listen<{ agent?: string }>('session://new', (event) => {
    const agent = event.payload?.agent
    if (agent !== 'claude' && agent !== 'codex') return
    const pending = waiters[agent]
    waiters[agent] = []
    for (const resolve of pending) resolve()
  })
}

/** Resolve quando o próximo hint do agente chegar. Use em `Promise.race` com um sleep. */
export function waitForSessionHint(agent: WatchAgent): Promise<void> {
  ensureStarted()
  const arr = waiters[agent]
  while (arr.length >= MAX_WAITERS) {
    arr.shift()?.()
  }
  return new Promise((resolve) => {
    arr.push(resolve)
  })
}
