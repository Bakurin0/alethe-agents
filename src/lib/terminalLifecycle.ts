import { removeSession } from './sessionResume'
import { ghosttyKill, killPty } from './tauri'
import { useTerminalsStore } from '../stores/terminalsStore'

export function cleanupPtys(ptyIds: Array<string | null | undefined>): void {
  const uniqueIds = Array.from(new Set(ptyIds.filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return

  const { unregister } = useTerminalsStore.getState()
  for (const ptyId of uniqueIds) {
    removeSession(ptyId)
    unregister(ptyId)
    void killPty(ptyId).catch(() => {
      // The PTY may already have exited or been killed by another action.
    })
    // Terminal nativo (Ghostty, macOS): a surface é morta APENAS aqui — no
    // fechamento explícito do terminal/sub-tab — e não no unmount do componente
    // (troca de aba/projeto), para o shell/agente sobreviver quando o pane sai
    // de vista. O surfaceId é o id da sub-tab, que também é o ptyId. Em xterm ou
    // fora do macOS, este id não é uma surface e o comando é no-op/erro ignorado.
    void ghosttyKill(ptyId).catch(() => {
      // Não é uma surface Ghostty, ou já foi liberada.
    })
  }
}
