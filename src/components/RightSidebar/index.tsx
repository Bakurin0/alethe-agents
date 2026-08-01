import { ArrowLeft, ClipboardCopy, FileText, PanelRightClose, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useT } from '../../lib/i18n'
import { readTextFile, writeClipboardText } from '../../lib/tauri'
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
  const pushToast = useUiStore((state) => state.pushToast)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const projects = useProjectsStore((state) => state.projects)
  const setPreferences = useProjectsStore((state) => state.setPreferences)
  const dark = useProjectsStore(
    (state) => state.preferences.uiTheme !== 'light' && state.preferences.uiTheme !== 'min-light',
  )
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedPath, setSelectedPath] = useState(markdown?.path ?? '')

  const readmeTabs = useMemo(() => {
    const project = projects.find((item) => item.id === activeProjectId)
    return (project?.terminals ?? [])
      .filter((terminal) => terminal.kind === 'markdown' && terminal.filePath)
      .map((terminal) => ({ path: terminal.filePath!, title: terminal.name }))
  }, [activeProjectId, projects])
  const selected =
    readmeTabs.find((tab) => tab.path === selectedPath) ??
    (markdown ? { path: markdown.path, title: markdown.title } : null)

  const load = async () => {
    if (!selected?.path) return
    try {
      setContent(await readTextFile(selected.path))
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
  }, [markdown?.path, selectedPath])

  useEffect(() => {
    if (markdown?.path) setSelectedPath(markdown.path)
  }, [markdown?.path])

  const copyMarkdown = async () => {
    if (content === null) return
    try {
      await writeClipboardText(content)
      setCopied(true)
      pushToast({ title: t('ui.markdown.copied'), body: '' })
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  if (!markdown) {
    return <TodoSidebar />
  }

  return (
    <aside className={styles.sidebar} aria-label={t('rightSidebar.markdownViewer')}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <FileText size={15} />
          <span title={selected?.title ?? markdown.title}>{selected?.title ?? markdown.title}</span>
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
            onClick={() => void copyMarkdown()}
            disabled={content === null}
            title={copied ? t('ui.markdown.copied') : t('ui.markdown.copySource')}
            aria-label={copied ? t('ui.markdown.copied') : t('ui.markdown.copySource')}
          >
            <ClipboardCopy size={15} />
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
      {readmeTabs.length > 1 ? (
        <div
          className={styles.readmeTabs}
          role="tablist"
          aria-label={t('rightSidebar.markdownTabs')}
        >
          {readmeTabs.map((tab) => (
            <button
              key={tab.path}
              type="button"
              role="tab"
              aria-selected={selected?.path === tab.path}
              className={`${styles.readmeTab} ${selected?.path === tab.path ? styles.readmeTabActive : ''}`}
              onClick={() => setSelectedPath(tab.path)}
              title={tab.path}
            >
              <FileText size={11} />
              <span>{tab.title}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.path} title={selected?.path ?? markdown.path}>
        {selected?.path ?? markdown.path}
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
