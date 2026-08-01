import { useEffect, useRef } from 'react'

/**
 * Chama `handler` quando um pointerdown acontece fora do elemento referenciado.
 * Usado pra fechar menus/popovers ao clicar fora. `enabled: false` remove o
 * listener (ex.: só escuta quando o menu está aberto).
 *
 * Centraliza o boilerplate de addEventListener('pointerdown') + hit-test +
 * cleanup antes repetido em vários componentes.
 */
export function useOnClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  handler: (event: PointerEvent) => void,
  enabled = true,
): void {
  const savedHandler = useRef(handler)
  savedHandler.current = handler

  useEffect(() => {
    if (!enabled) return
    const onPointerDown = (event: PointerEvent) => {
      const el = ref.current
      if (!el || el.contains(event.target as Node)) return
      savedHandler.current(event)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [ref, enabled])
}
