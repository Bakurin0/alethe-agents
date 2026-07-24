export type CloseRequestEventLike = {
  preventDefault: () => void
}

export type CloseFailureStage = 'confirm' | 'destroy' | 'quit'

type CloseCoordinatorDependencies = {
  confirmNative: () => Promise<boolean>
  confirmFallback: () => boolean
  destroyWindow: () => Promise<void>
  quitApp: () => Promise<void>
  onFailure?: (stage: CloseFailureStage, error: unknown) => void
}

/**
 * Serializa pedidos de fechamento vindos do X, Alt+F4 e do sistema.
 * O evento é sempre bloqueado primeiro; só liberamos o encerramento depois
 * da confirmação explícita, evitando que o wrapper do Tauri destrua a janela
 * enquanto o diálogo ainda está aberto.
 */
export function createCloseCoordinator(deps: CloseCoordinatorDependencies): {
  handleCloseRequest: (event: CloseRequestEventLike) => Promise<void>
} {
  let confirming = false
  let closing = false

  const handleCloseRequest = async (event: CloseRequestEventLike): Promise<void> => {
    event.preventDefault()
    if (confirming || closing) return

    confirming = true
    let confirmed = false
    try {
      confirmed = await deps.confirmNative()
    } catch (error) {
      deps.onFailure?.('confirm', error)
      confirmed = deps.confirmFallback()
    } finally {
      confirming = false
    }

    if (!confirmed) return
    closing = true

    try {
      await deps.destroyWindow()
      return
    } catch (error) {
      deps.onFailure?.('destroy', error)
    }

    try {
      await deps.quitApp()
    } catch (error) {
      closing = false
      deps.onFailure?.('quit', error)
    }
  }

  return { handleCloseRequest }
}
