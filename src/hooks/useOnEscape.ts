import { useEffect, useRef } from 'react'

/**
 * Chama `handler` quando a tecla Escape é pressionada. `enabled: false` remove
 * o listener. `capture: true` escuta na fase de captura — pra overlays que
 * precisam interceptar o Escape ANTES de handlers mais internos (ex.: o
 * terminal). Centraliza o keydown+cleanup repetido em menus/overlays.
 */
export function useOnEscape(
  handler: (event: KeyboardEvent) => void,
  enabled = true,
  options: { capture?: boolean } = {},
): void {
  const { capture = false } = options
  const savedHandler = useRef(handler)
  savedHandler.current = handler

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') savedHandler.current(event)
    }
    document.addEventListener('keydown', onKeyDown, capture)
    return () => document.removeEventListener('keydown', onKeyDown, capture)
  }, [enabled, capture])
}
