import {
  ArrowLeft,
  ClipboardCopy,
  FileText,
  GitBranch,
  ListTodo,
  MessageSquare,
  PanelRightClose,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useT } from '../../lib/i18n'
import type { MarkdownComment, Project, SubTab, Terminal } from '../../lib/types'
import { readTextFile, writeClipboardText } from '../../lib/tauri'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { MarkdownRenderer } from '../MarkdownPane/MarkdownRenderer'
import { EmptyState } from '../EmptyState/EmptyState'
import { GitControl } from '../ProjectSidebar/GitControl'
import { TodoSidebar } from '../TodoSidebar'
import styles from './RightSidebar.module.css'

const markdownScrollPositions = new Map<string, number>()

export function RightSidebar() {
  const t = useT()
  const mode = useUiStore((state) => state.rightSidebarMode)
  const setMode = useUiStore((state) => state.showTodoSidebar)
  const openMarkdown = useUiStore((state) => state.showMarkdownSidebar)
  const showGit = useUiStore((state) => state.showGitSidebar)
  const preferences = useProjectsStore((state) => state.preferences)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const projects = useProjectsStore((state) => state.projects)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const sidebarTerminal = activeProject
    ? [...activeProject.terminals]
        .filter((terminal) => !terminal.kind)
        .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0]
    : null
  const sidebarSubTab = sidebarTerminal?.tabs.find((tab) => tab.id === sidebarTerminal.activeTabId)
    ?? sidebarTerminal?.tabs[0]

  return (
    <aside className={styles.sidebar} aria-label={t('rightSidebar.navigation')}>
      <div className={styles.sidebarTabs} role="tablist" aria-label={t('rightSidebar.navigation')}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'todo'}
          className={`${styles.sidebarTab} ${mode === 'todo' ? styles.sidebarTabActive : ''}`}
          onClick={setMode}
          title={t('todo.title')}
        >
          <ListTodo size={14} />
          <span>{t('rightSidebar.todoTab')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'markdown'}
          className={`${styles.sidebarTab} ${mode === 'markdown' ? styles.sidebarTabActive : ''}`}
          onClick={openMarkdown}
          title={t('rightSidebar.markdownTab')}
        >
          <FileText size={14} />
          <span>{t('rightSidebar.markdownTab')}</span>
        </button>
        {preferences.enabledFeatures.git && preferences.gitControlPlacement === 'right' ? (
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'git'}
            className={`${styles.sidebarTab} ${mode === 'git' ? styles.sidebarTabActive : ''}`}
            onClick={showGit}
            title={t('ui.sidebar.git')}
          >
            <GitBranch size={14} />
            <span>{t('ui.sidebar.git')}</span>
          </button>
        ) : null}
      </div>
      <div className={styles.tabContent}>
        {mode === 'markdown' ? <MarkdownSidebarViewer /> : null}
        {mode === 'todo' ? <TodoSidebar /> : null}
        {mode === 'git' ? (
          <GitSidebarContent
            activeProject={activeProject}
            sidebarTerminal={sidebarTerminal}
            sidebarSubTab={sidebarSubTab}
          />
        ) : null}
      </div>
    </aside>
  )
}

function GitSidebarContent({
  activeProject,
  sidebarTerminal,
  sidebarSubTab,
}: {
  activeProject: Project | undefined
  sidebarTerminal: Terminal | null
  sidebarSubTab: SubTab | undefined
}) {
  const t = useT()
  return (
    <section className={styles.gitPanel}>
      <header className={styles.panelHeader}>
        <GitBranch size={15} />
        <span>{t('ui.sidebar.sourceControl')}</span>
      </header>
      {activeProject && sidebarTerminal && sidebarSubTab ? (
        <GitControl
          projectId={activeProject.id}
          cwd={sidebarSubTab.cwd || sidebarTerminal.cwd}
          ptyId={sidebarSubTab.ptyId}
          terminalName={sidebarTerminal.name}
        />
      ) : (
        <div className={styles.gitEmpty}>
          <EmptyState
            compact
            icon={<GitBranch size={18} />}
            title={t('git.empty.noTerminal')}
            description={t('git.empty.noTerminalDesc')}
          />
        </div>
      )}
    </section>
  )
}

function MarkdownSidebarViewer() {
  const t = useT()
  const markdown = useUiStore((state) => state.rightSidebarMarkdown)
  const showTodoSidebar = useUiStore((state) => state.showTodoSidebar)
  const pushToast = useUiStore((state) => state.pushToast)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const projects = useProjectsStore((state) => state.projects)
  const setPreferences = useProjectsStore((state) => state.setPreferences)
  const addMarkdownComment = useProjectsStore((state) => state.addMarkdownComment)
  const removeMarkdownComment = useProjectsStore((state) => state.removeMarkdownComment)
  const dark = useProjectsStore(
    (state) => state.preferences.uiTheme !== 'light' && state.preferences.uiTheme !== 'min-light',
  )
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedPath, setSelectedPath] = useState(markdown?.path ?? '')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [selection, setSelection] = useState<{ quote: string; start: number; end: number; x: number; y: number } | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const markdownRef = useRef<HTMLDivElement | null>(null)

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
    if (!selected?.path || content === null) return
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = markdownScrollPositions.get(selected.path) ?? 0
    })
    return () => window.cancelAnimationFrame(frame)
  }, [content, selected?.path])

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

  const comments = useMemo(
    () =>
      (projects.find((project) => project.id === activeProjectId)?.markdownComments ?? [])
        .filter((comment) => comment.path === selected?.path)
        .sort((a, b) => a.start - b.start),
    [activeProjectId, projects, selected?.path],
  )

  const captureSelection = () => {
    if (!content || !markdownRef.current) return
    const current = window.getSelection()
    const quote = current?.toString().replace(/\s+/g, ' ').trim() ?? ''
    if (!current || !quote || !current.rangeCount || !markdownRef.current.contains(current.anchorNode)) return
    const start = content.indexOf(quote)
    if (start < 0) return
    const rect = current.getRangeAt(0).getBoundingClientRect()
    setSelection({ quote, start, end: start + quote.length, x: rect.left, y: rect.bottom + 8 })
    setCommentDraft('')
  }

  const saveComment = () => {
    if (!selection || !commentDraft.trim() || !activeProjectId || !selected?.path) return
    addMarkdownComment(activeProjectId, {
      path: selected.path,
      quote: selection.quote,
      note: commentDraft.trim(),
      start: selection.start,
      end: selection.end,
    })
    setSelection(null)
    setCommentDraft('')
    setCommentsOpen(true)
    window.getSelection()?.removeAllRanges()
  }

  const scrollToComment = (comment: MarkdownComment) => {
    const root = markdownRef.current
    if (!root) return
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null = walker.nextNode()
    while (node) {
      const index = node.textContent?.indexOf(comment.quote) ?? -1
      if (index >= 0) {
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + comment.quote.length)
        range.getBoundingClientRect()
        range.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        break
      }
      node = walker.nextNode()
    }
  }

  if (!markdown) {
    return (
      <section className={styles.emptyMarkdown}>
        <FileText size={20} />
        <strong>{t('rightSidebar.markdownEmptyTitle')}</strong>
        <span>{t('rightSidebar.markdownEmptyDesc')}</span>
      </section>
    )
  }

  return (
    <section className={styles.markdownPanel} aria-label={t('rightSidebar.markdownViewer')}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <FileText size={15} />
          <span title={selected?.title ?? markdown.title}>{selected?.title ?? markdown.title}</span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerAction}
            onClick={() => setCommentsOpen((open) => !open)}
            title={t('rightSidebar.commentsToggle')}
            aria-label={t('rightSidebar.commentsToggle')}
            aria-pressed={commentsOpen}
          >
            <MessageSquare size={15} />
            {comments.length > 0 ? <span className={styles.commentCount}>{comments.length}</span> : null}
          </button>
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
      <div className={styles.contentLayout}>
        <div
          ref={scrollRef}
          className={styles.content}
          onScroll={(event) => {
            if (selected?.path) markdownScrollPositions.set(selected.path, event.currentTarget.scrollTop)
          }}
          onMouseUp={captureSelection}
        >
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
          <div ref={markdownRef} className={styles.commentableMarkdown}>
            <MarkdownRenderer content={content} dark={dark} />
          </div>
        )}
        </div>
        {commentsOpen ? (
          <aside className={styles.commentsPanel} aria-label={t('rightSidebar.commentsTitle')}>
            <div className={styles.commentsHeader}>
              <span>{t('rightSidebar.commentsTitle')}</span>
              <span>{comments.length}</span>
            </div>
            {comments.length === 0 ? (
              <p className={styles.commentsEmpty}>{t('rightSidebar.commentsEmpty')}</p>
            ) : (
              <div className={styles.commentsList}>
                {comments.map((comment) => (
                  <article key={comment.id} className={styles.commentCard}>
                    <button type="button" className={styles.commentQuote} onClick={() => scrollToComment(comment)}>
                      “{comment.quote}”
                    </button>
                    <p>{comment.note}</p>
                    <div className={styles.commentMeta}>
                      <time>{new Date(comment.createdAt).toLocaleString()}</time>
                      <button
                        type="button"
                        onClick={() => activeProjectId && removeMarkdownComment(activeProjectId, comment.id)}
                        title={t('rightSidebar.commentDelete')}
                        aria-label={t('rightSidebar.commentDelete')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </aside>
        ) : null}
      </div>
      {selection ? (
        <div className={styles.commentPopover} style={{ left: selection.x, top: selection.y }}>
          <div className={styles.commentPopoverQuote}>“{selection.quote}”</div>
          <textarea
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder={t('rightSidebar.commentPlaceholder')}
            autoFocus
            rows={3}
          />
          <div className={styles.commentPopoverActions}>
            <button type="button" onClick={() => setSelection(null)}>{t('common.cancel')}</button>
            <button type="button" disabled={!commentDraft.trim()} onClick={saveComment}>{t('rightSidebar.commentSave')}</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
