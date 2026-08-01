import { useEffect, useRef } from 'react'

/**
 * Executa `callback` imediatamente e depois a cada `intervalMs`, com cleanup
 * automático. O callback é guardado em ref, então mudar a função entre renders
 * NÃO reinicia o timer (evita o padrão de re-subscribe a cada render). Passe
 * `enabled: false` pra pausar sem desmontar o componente.
 *
 * Centraliza o loop setInterval+clearInterval antes copiado em vários
 * componentes/hooks de polling (uso, now-playing, presence, HUD…).
 */
export function usePolling(callback: () => void, intervalMs: number, enabled = true): void {
  const savedCallback = useRef(callback)
  savedCallback.current = callback

  useEffect(() => {
    if (!enabled) return
    const tick = () => savedCallback.current()
    tick()
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])
}
