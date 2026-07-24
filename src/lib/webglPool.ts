const DEFAULT_WEBGL_BUDGET = 4

let budget = DEFAULT_WEBGL_BUDGET
const owners = new Set<symbol>()

export function setWebglContextBudget(next: number): void {
  budget = Math.max(0, Math.floor(next))
}

/**
 * Reserva um contexto WebGL para um terminal. O release é idempotente para que
 * context-loss e unmount possam competir sem corromper o contador.
 */
export function acquireWebglContext(): (() => void) | null {
  if (owners.size >= budget) return null
  const owner = Symbol('xterm-webgl')
  owners.add(owner)
  let released = false
  return () => {
    if (released) return
    released = true
    owners.delete(owner)
  }
}

export function getWebglPoolSnapshot(): { active: number; budget: number } {
  return { active: owners.size, budget }
}
