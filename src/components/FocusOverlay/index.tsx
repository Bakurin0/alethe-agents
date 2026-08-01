import { useEffect } from 'react'

import { useUiStore } from '../../stores/uiStore'
import styles from './FocusOverlay.module.css'

/**
 * Backdrop do focus mode. O TerminalPane original entra em position: fixed;
 * não renderizamos outro XTermView aqui para não duplicar attach/spawn do PTY.
 */
export function FocusOverlay() {
  const focusedTerminalId = useUiStore((s) => s.focusedTerminalId)
  const setFocusedTerminal = useUiStore((s) => s.setFocusedTerminal)

  useEffect(() => {
    if (!focusedTerminalId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setFocusedTerminal(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [focusedTerminalId, setFocusedTerminal])

  if (!focusedTerminalId) return null

  return <div className={styles.backdrop} onClick={() => setFocusedTerminal(null)} />
}
