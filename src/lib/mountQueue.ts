/**
 * Fila que limita quantos XTermView montam (new Terminal + terminal.open +
 * addon WebGL/Canvas) ao mesmo tempo. Sem isso, abrir um container com N
 * terminais dispara N montagens síncronas no mesmo commit do React — cada
 * uma fazendo trabalho pesado de DOM/GPU sem ceder o thread — e trava o
 * frontend inteiro até todas terminarem. Isso é independente do spawnQueue
 * (que só serializa o `spawn_pty` do backend).
 */

const MAX_CONCURRENT_MOUNTS = 2
/** Rede de segurança: nunca deixa um terminal preso esperando vaga pra
 * sempre (ex.: reativar um terminal suspenso pelo modo economia). Se a fila
 * não andar dentro desse prazo — leak, contenção real, o que for — libera
 * mesmo assim. Prefere estourar o limite momentaneamente a travar o
 * terminal em "Preparando..." pro resto da sessão. */
const ACQUIRE_TIMEOUT_MS = 4000

let activeMounts = 0
const waiters: Array<() => void> = []

/** Resolve com uma função de liberação assim que houver uma vaga. */
export function acquireMountSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    let settled = false
    const grant = () => {
      if (settled) return
      settled = true
      activeMounts++
      let released = false
      resolve(() => {
        if (released) return
        released = true
        activeMounts--
        const next = waiters.shift()
        if (next) next()
      })
    }
    if (activeMounts < MAX_CONCURRENT_MOUNTS) {
      grant()
      return
    }
    waiters.push(grant)
    window.setTimeout(() => {
      if (settled) return
      const idx = waiters.indexOf(grant)
      if (idx !== -1) waiters.splice(idx, 1)
      grant()
    }, ACQUIRE_TIMEOUT_MS)
  })
}
