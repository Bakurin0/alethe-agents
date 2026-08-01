import { useOnEscape } from '../../hooks/useOnEscape'
import { useUiStore } from '../../stores/uiStore'
import styles from './FocusOverlay.module.css'

/**
 * Backdrop do focus mode. O TerminalPane original entra em position: fixed;
 * não renderizamos outro XTermView aqui para não duplicar attach/spawn do PTY.
 */
export function FocusOverlay() {
  const focusedTerminalId = useUiStore((s) => s.focusedTerminalId)
  const setFocusedTerminal = useUiStore((s) => s.setFocusedTerminal)

  useOnEscape(
    (e) => {
      e.preventDefault()
      setFocusedTerminal(null)
    },
    Boolean(focusedTerminalId),
    { capture: true },
  )

  if (!focusedTerminalId) return null

  return <div className={styles.backdrop} onClick={() => setFocusedTerminal(null)} />
}
