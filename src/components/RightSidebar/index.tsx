import { ArrowLeft, FileText, PanelRightClose, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useT } from '../../lib/i18n'
import { readTextFile } from '../../lib/tauri'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { MarkdownRenderer } from '../MarkdownPane/MarkdownRenderer'
import { TodoSidebar } from '../TodoSidebar'
import styles from './RightSidebar.module.css'

export function RightSidebar() {
  const mode = useUiStore((state) => state.rightSidebarMode)
  if (mode === 'markdown') return <MarkdownSidebarViewer />
  return <TodoSidebar />
}

function MarkdownSidebarViewer() {
  const t = useT()
  const markdown = useUiStore((state) => state.rightSidebarMarkdown)
  const showTodoSidebar = useUiStore((state) => state.showTodoSidebar)
  const setPreferences = useProjectsStore((state) => state.setPreferences)
  const dark = useProjectsStore((state) => state.preferences.uiTheme !== 'light' && state.preferences.uiTheme !== 'min-light')
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!markdown?.path) return
    try {
      setContent(await readTextFile(markdown.path))
      setError(null)
    } catch (err) {
      setError(String(err))
      setContent(null)
    }
  }

  useEffect(() => {
    setContent(null)
    setError(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown?.path])

  if (!markdown) {
    return <TodoSidebar />
  }

  return (
    <aside className={styles.sidebar} aria-label={t('rightSidebar.markdownViewer')}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <FileText size={15} />
          <span title={markdown.title}>{markdown.title}</span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerAction}
            onClick={() => void load()}
            title={t('ui.markdown.refresh')}
            aria-label={t('ui.markdown.refresh')}
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            className={styles.headerAction}
            onClick={showTodoSidebar}
            title={t('rightSidebar.backToTodo')}
            aria-label={t('rightSidebar.backToTodo')}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            type="button"
            className={styles.headerAction}
            onClick={() => setPreferences({ rightSidebarVisible: false })}
            title={t('todo.closeSidebar')}
            aria-label={t('todo.closeSidebar')}
          >
            <PanelRightClose size={15} />
          </button>
        </div>
      </header>
      <div className={styles.path} title={markdown.path}>
        {markdown.path}
      </div>
      <div className={styles.content}>
        {error ? (
          <div className={styles.empty}>
            <FileText size={20} />
            <strong>{t('rightSidebar.markdownError')}</strong>
            <span>{error}</span>
          </div>
        ) : content === null ? (
          <div className={styles.empty}>
            <span>{t('ui.markdown.loading')}</span>
          </div>
        ) : (
          <MarkdownRenderer content={content} dark={dark} />
        )}
      </div>
    </aside>
  )
}
