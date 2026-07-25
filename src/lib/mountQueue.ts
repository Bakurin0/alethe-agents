/**
 * Fila que limita quantos XTermView montam (new Terminal + terminal.open +
 * addon WebGL/Canvas) ao mesmo tempo. Sem isso, abrir um container com N
 * terminais dispara N montagens síncronas no mesmo commit do React — cada
 * uma fazendo trabalho pesado de DOM/GPU sem ceder o thread — e trava o
 * frontend inteiro até todas terminarem. Isso é independente do spawnQueue
 * (que só serializa o `spawn_pty` do backend).
 */

const MAX_CONCURRENT_MOUNTS = 2

let activeMounts = 0
const waiters: Array<() => void> = []

/** Resolve com uma função de liberação assim que houver uma vaga. */
export function acquireMountSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
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
    if (activeMounts < MAX_CONCURRENT_MOUNTS) grant()
    else waiters.push(grant)
  })
}
