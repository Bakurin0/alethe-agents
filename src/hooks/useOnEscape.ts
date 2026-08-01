import { useEffect, useRef } from 'react'

/**
 * Chama `handler` quando a tecla Escape é pressionada. `enabled: false` remove
 * o listener. Centraliza o keydown+cleanup repetido em menus/overlays.
 */
export function useOnEscape(handler: (event: KeyboardEvent) => void, enabled = true): void {
  const savedHandler = useRef(handler)
  savedHandler.current = handler

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') savedHandler.current(event)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
