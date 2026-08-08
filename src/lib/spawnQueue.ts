/**
 * Fila global pra serializar spawns de PTY. Sem isso, abrir um grupo com N
 * projetos × M terminais dispara N*M `spawn_pty` em paralelo, sobrecarregando
 * o ConPTY do Windows e causando freeze do app no nível do SO.
 *
 * Uso:
 *   await acquireSpawnSlot()
 *   try { await spawnPty(...) } finally { releaseSpawnSlot() }
 */

let maxConcurrentSpawns = 3

let active = 0
let pressureBlocked = false
let pressureReason: string | null = null
const PRESSURE_MAX_QUEUE_WAIT_MS = 1_500

type SpawnWaiter = {
  enqueuedAt: number
  signal?: AbortSignal
  onAbort?: () => void
  progressTimer?: ReturnType<typeof setTimeout>
  resolve: (acquired: boolean) => void
}

const waiters: SpawnWaiter[] = []

function pressureConcurrentLimit(): number {
  return Math.min(2, maxConcurrentSpawns)
}

function resumeWaiter(waiter: SpawnWaiter): void {
  if (waiter.progressTimer) clearTimeout(waiter.progressTimer)
  if (waiter.signal && waiter.onAbort) {
    waiter.signal.removeEventListener('abort', waiter.onAbort)
  }
  active++
  waiter.resolve(true)
}

function schedulePressureProgress(waiter: SpawnWaiter): void {
  if (waiter.progressTimer) return
  const elapsed = Date.now() - waiter.enqueuedAt
  waiter.progressTimer = setTimeout(
    () => {
      waiter.progressTimer = undefined
      ensureSpawnQueueProgress()
    },
    Math.max(0, PRESSURE_MAX_QUEUE_WAIT_MS - elapsed),
  )
}

function drain(limit = maxConcurrentSpawns): void {
  while (active < limit && waiters.length > 0) {
    const waiter = waiters.shift()
    if (waiter) resumeWaiter(waiter)
  }
}

/**
 * Ajusta o limite de spawns simultâneos (preferência do usuário). Ao aumentar,
 * libera waiters presos até o novo teto; ao diminuir, só vale pros próximos.
 */
export function setMaxConcurrentSpawns(n: number): void {
  const next = Math.max(1, Math.round(n))
  if (next === maxConcurrentSpawns) return
  maxConcurrentSpawns = next
  drain()
  notify()
}

export type SpawnQueueSnapshot = {
  active: number
  queued: number
  pressureBlocked: boolean
  pressureReason: string | null
}

type Listener = (snapshot: SpawnQueueSnapshot) => void
const listeners = new Set<Listener>()

function notify(): void {
  const snapshot = {
    active,
    queued: waiters.length,
    pressureBlocked,
    pressureReason,
  }
  for (const l of listeners) l(snapshot)
}

export function subscribeSpawnQueue(l: Listener): () => void {
  listeners.add(l)
  l(getSpawnQueueSnapshot())
  return () => listeners.delete(l)
}

export function getSpawnQueueSnapshot(): SpawnQueueSnapshot {
  return {
    active,
    queued: waiters.length,
    pressureBlocked,
    pressureReason,
  }
}

/** Pausa novos processos sem cancelar spawns que já começaram. */
export function setSpawnPressureBlocked(blocked: boolean, reason: string | null = null): void {
  pressureBlocked = blocked
  pressureReason = blocked ? reason : null
  if (blocked) {
    drain(pressureConcurrentLimit())
    for (const waiter of waiters) schedulePressureProgress(waiter)
  } else {
    drain()
  }
  notify()
}

/**
 * Evita starvation quando a pressão nunca alcança o recovery target. Libera no
 * máximo um waiter por chamada, preservando o teto normal de concorrência.
 */
export function ensureSpawnQueueProgress(
  now = Date.now(),
  maxQueueWaitMs = PRESSURE_MAX_QUEUE_WAIT_MS,
): boolean {
  // Sob pressão, admite só um spawn por vez mesmo se o limite normal for maior.
  if (!pressureBlocked || active >= pressureConcurrentLimit()) return false
  const waiter = waiters[0]
  if (!waiter || now - waiter.enqueuedAt < maxQueueWaitMs) return false
  waiters.shift()
  resumeWaiter(waiter)
  notify()
  return true
}

/**
 * Retorna false quando o componente que aguardava foi desmontado/cancelado.
 * Assim waiters órfãos não permanecem ocupando a frente da fila.
 */
export function acquireSpawnSlot(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  // Under pressure, brand-new requests always queue — pressureConcurrentLimit only
  // governs how many *already-waiting* callers get drained through (see drain() calls
  // in setSpawnPressureBlocked/releaseSpawnSlot/ensureSpawnQueueProgress).
  if (!pressureBlocked && active < maxConcurrentSpawns) {
    active++
    notify()
    return Promise.resolve(true)
  }

  return new Promise<boolean>((resolve) => {
    const waiter: SpawnWaiter = {
      enqueuedAt: Date.now(),
      signal,
      resolve,
    }
    if (signal) {
      waiter.onAbort = () => {
        const index = waiters.indexOf(waiter)
        if (index === -1) return
        waiters.splice(index, 1)
        if (waiter.progressTimer) clearTimeout(waiter.progressTimer)
        resolve(false)
        notify()
      }
      signal.addEventListener('abort', waiter.onAbort, { once: true })
    }
    waiters.push(waiter)
    if (pressureBlocked) schedulePressureProgress(waiter)
    if (signal?.aborted) {
      waiter.onAbort?.()
    } else {
      notify()
    }
  })
}

export function releaseSpawnSlot(): void {
  active = Math.max(0, active - 1)
  // Só admite o próximo se ainda houver folga (o cap pode ter sido reduzido).
  if (pressureBlocked) drain(pressureConcurrentLimit())
  else drain()
  notify()
}
