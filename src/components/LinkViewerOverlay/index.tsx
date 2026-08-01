import { ExternalLink, X } from 'lucide-react'

import { useOnEscape } from '../../hooks/useOnEscape'
import { useT } from '../../lib/i18n'
import { openInBrowser } from '../../lib/tauri'
import { useUiStore } from '../../stores/uiStore'
import styles from './LinkViewerOverlay.module.css'

/**
 * Visualizador in-app de links (overlay com iframe), no mesmo espírito do
 * FocusOverlay dos terminais — abre dentro do app em vez de jogar o usuário pro
 * browser externo. Frontend puro (sem Rust): alguns sites bloqueiam embed
 * (`X-Frame-Options`), por isso o header sempre oferece "abrir no browser".
 */
export function LinkViewerOverlay() {
  const t = useT()
  const url = useUiStore((s) => s.linkViewerUrl)
  const close = useUiStore((s) => s.closeLinkViewer)

  useOnEscape(
    (e) => {
      e.preventDefault()
      close()
    },
    Boolean(url),
    { capture: true },
  )

  if (!url) return null

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.url} title={url}>
            {url}
          </span>
          <button
            type="button"
            className={styles.headBtn}
            onClick={() => void openInBrowser(url)}
            title={t('xterm.openInBrowser')}
            aria-label={t('xterm.openInBrowser')}
          >
            <ExternalLink size={15} />
          </button>
          <button
            type="button"
            className={styles.headBtn}
            onClick={close}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={15} />
          </button>
        </div>
        <div className={styles.body}>
          <iframe
            key={url}
            src={url}
            className={styles.frame}
            title={url}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className={styles.hint}>{t('linkViewer.embedHint')}</div>
      </div>
    </div>
  )
}
