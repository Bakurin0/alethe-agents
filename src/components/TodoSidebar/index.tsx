import {
  Check,
  CheckCircle2,
  Circle,
  FolderKanban,
  GripVertical,
  ListTodo,
  PanelRightClose,
  Pencil,
  Plus,
  Settings,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { type GsdSyncSession, useGsdSyncSessions } from '../../hooks/useGsdSyncSessions'
import { useT } from '../../lib/i18n'
import { type PlanningStatus, readPlanningStatus } from '../../lib/tauri'
import { TODO_TITLE_MAX_LENGTH } from '../../lib/todos'
import type { Terminal, TodoItem } from '../../lib/types'
import { selectActiveProject, useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { DotmCircular2 } from '../ui/dotm-circular-2'
import styles from './TodoSidebar.module.css'

function GsdSyncSection() {
  const t = useT()
  const activeProject = useProjectsStore(selectActiveProject)
  const setFullscreenPane = useProjectsStore((state) => state.setFullscreenPane)
  const sessions = useGsdSyncSessions()
  const projectSessions = activeProject
    ? sessions.filter((session) => session.projectId === activeProject.id)
    : []

  if (!activeProject || projectSessions.length === 0) return null

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <span>{t('todo.gsdSectionTitle')}</span>
        <span className={styles.sectionCount}>{projectSessions.length}</span>
      </div>
      <div className={styles.list}>
        {projectSessions.map((session) => {
          const terminal = activeProject.terminals.find((term) => term.id === session.terminalId)
          if (!terminal) return null
          return (
            <GsdSyncRow
              key={session.id}
              terminal={terminal}
              session={session}
              onOpen={() => setFullscreenPane(session.terminalId)}
            />
          )
        })}
      </div>
    </section>
  )
}

function GsdSyncRow({
  terminal,
  session,
  onOpen,
}: {
  terminal: Terminal
  session: GsdSyncSession
  onOpen: () => void
}) {
  const t = useT()
  const [status, setStatus] = useState<PlanningStatus | null>(null)

  useEffect(() => {
    if (!terminal.cwd) return
    let cancelled = false
    readPlanningStatus(terminal.cwd)
      .then((result) => {
        if (!cancelled) setStatus(result)
      })
      .catch(() => {
        if (!cancelled) setStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [terminal.cwd, session.busy])

  const statusLabel = session.hasError ? t('todo.gsdError') : session.busy ? t('todo.gsdBusy') : t('todo.gsdIdle')
  const progressLabel =
    status?.roadmapTotalCount != null && status.roadmapPendingCount != null
      ? t('todo.gsdProgress', {
          done: status.roadmapTotalCount - status.roadmapPendingCount,
          total: status.roadmapTotalCount,
        })
      : null

  return (
    <button type="button" className={styles.gsdRow} onClick={onOpen} title={terminal.name}>
      <span className={styles.gsdRowState}>
        {session.hasError ? (
          <span className={styles.gsdErrorDot} />
        ) : session.busy ? (
          <DotmCircular2 size={13} dotSize={2} cellPadding={1} speed={1.2} bloom ariaLabel={statusLabel} />
        ) : (
          <span className={styles.gsdIdleDot} />
        )}
      </span>
      <span className={styles.gsdRowBody}>
        <span className={styles.gsdRowName}>{terminal.name}</span>
        <span className={styles.gsdRowMeta}>{progressLabel ?? statusLabel}</span>
      </span>
    </button>
  )
}

export function TodoSidebar() {
  const t = useT()
  const todos = useProjectsStore((state) => state.todos)
  const projects = useProjectsStore((state) => state.projects)
  const createTodo = useProjectsStore((state) => state.createTodo)
  const renameTodo = useProjectsStore((state) => state.renameTodo)
  const updateTodoTags = useProjectsStore((state) => state.updateTodoTags)
  const setTodoProject = useProjectsStore((state) => state.setTodoProject)
  const toggleTodo = useProjectsStore((state) => state.toggleTodo)
  const deleteTodo = useProjectsStore((state) => state.deleteTodo)
  const reorderTodo = useProjectsStore((state) => state.reorderTodo)
  const setPreferences = useProjectsStore((state) => state.setPreferences)
  const openModal = useUiStore((state) => state.openModal_)
  const [title, setTitle] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [projectDraft, setProjectDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const active = todos.filter((todo) => !todo.completed)
  const completed = todos.filter((todo) => todo.completed)

  const submit = () => {
    if (!createTodo(title, parseTags(tagDraft), projectDraft || undefined)) return
    setTitle('')
    setTagDraft('')
    setProjectDraft('')
  }

  const startEditing = (todo: TodoItem) => {
    setEditingId(todo.id)
    setEditTitle(todo.title)
  }

  const finishEditing = () => {
    if (!editingId) return
    if (editTitle.trim()) renameTodo(editingId, editTitle)
    setEditingId(null)
    setEditTitle('')
  }

  const editTags = (todo: TodoItem) => {
    const value = window.prompt(t('todo.tagsPrompt'), todo.tags.join(', '))
    if (value === null) return
    updateTodoTags(todo.id, parseTags(value))
  }

  const renderSection = (items: TodoItem[], completedSection: boolean) => (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <span>{completedSection ? t('todo.completed') : t('todo.active')}</span>
        <span className={styles.sectionCount}>{items.length}</span>
      </div>
      {items.length > 0 ? (
        <div className={styles.list}>
          {items.map((todo) => {
            const editing = editingId === todo.id
            return (
              <div
                key={todo.id}
                className={[
                  styles.todoRow,
                  todo.completed ? styles.todoRowCompleted : '',
                  draggedId === todo.id ? styles.todoRowDragging : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={!editing}
                onDragStart={(event) => {
                  setDraggedId(todo.id)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', todo.id)
                }}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={(event) => {
                  if (!draggedId) return
                  const dragged = todos.find((item) => item.id === draggedId)
                  if (dragged?.completed !== todo.completed) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggedId) reorderTodo(draggedId, todo.id)
                  setDraggedId(null)
                }}
              >
                <button
                  type="button"
                  className={styles.dragHandle}
                  title={t('todo.drag')}
                  aria-label={t('todo.drag')}
                  tabIndex={-1}
                >
                  <GripVertical size={13} />
                </button>
                <button
                  type="button"
                  className={styles.checkButton}
                  onClick={() => toggleTodo(todo.id)}
                  title={todo.completed ? t('todo.reopen') : t('todo.complete')}
                  aria-label={todo.completed ? t('todo.reopen') : t('todo.complete')}
                >
                  {todo.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </button>

                {editing ? (
                  <input
                    autoFocus
                    className={styles.editInput}
                    value={editTitle}
                    maxLength={TODO_TITLE_MAX_LENGTH}
                    onChange={(event) => setEditTitle(event.target.value)}
                    onBlur={() => {
                      setEditingId(null)
                      setEditTitle('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') finishEditing()
                      if (event.key === 'Escape') {
                        setEditingId(null)
                        setEditTitle('')
                      }
                    }}
                    aria-label={t('todo.edit')}
                  />
                ) : (
                  <div className={styles.todoTitle}>
                    <button
                      type="button"
                      className={styles.titleButton}
                      onClick={() => startEditing(todo)}
                      title={todo.title}
                    >
                      <span className={styles.todoTitleText}>{todo.title}</span>
                    </button>
                    {todo.tags.length > 0 ? (
                      <span className={styles.tags}>
                        {todo.tags.map((tag) => (
                          <span key={tag} className={styles.tag}>
                            #{tag}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span className={styles.projectLink}>
                      <FolderKanban size={11} aria-hidden="true" />
                      <select
                        value={todo.projectId ?? ''}
                        onChange={(event) => setTodoProject(todo.id, event.target.value || null)}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        title={t('todo.linkProject')}
                        aria-label={t('todo.linkProject')}
                      >
                        <option value="">{t('todo.noProject')}</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                )}

                <div className={styles.rowActions}>
                  {editing ? (
                    <>
                      <button
                        type="button"
                        className={styles.rowAction}
                        onClick={() => editTags(todo)}
                        title={t('todo.editTags')}
                        aria-label={t('todo.editTags')}
                      >
                        <Tag size={12} />
                      </button>
                      <button
                        type="button"
                        className={styles.rowAction}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={finishEditing}
                        title={t('todo.saveEdit')}
                        aria-label={t('todo.saveEdit')}
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        className={styles.rowAction}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setEditingId(null)
                          setEditTitle('')
                        }}
                        title={t('common.cancel')}
                        aria-label={t('common.cancel')}
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.rowAction}
                        onClick={() => startEditing(todo)}
                        title={t('todo.edit')}
                        aria-label={t('todo.edit')}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowAction} ${styles.deleteAction}`}
                        onClick={() => deleteTodo(todo.id)}
                        title={t('todo.delete')}
                        aria-label={t('todo.delete')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : completedSection && todos.length > 0 ? (
        <p className={styles.sectionEmpty}>{t('todo.emptyCompleted')}</p>
      ) : null}
    </section>
  )

  return (
    <aside className={styles.sidebar} aria-label={t('todo.title')}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <ListTodo size={15} />
          <span>{t('todo.title')}</span>
          <span className={styles.pendingCount}>
            {t('todo.pendingCount', { count: active.length })}
          </span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerAction}
            onClick={() => openModal('todoSettings')}
            title={t('todo.openSettings')}
            aria-label={t('todo.openSettings')}
          >
            <Settings size={15} />
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

      <form
        className={styles.addForm}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          className={styles.addInput}
          value={title}
          maxLength={TODO_TITLE_MAX_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('todo.addPlaceholder')}
          aria-label={t('todo.addPlaceholder')}
        />
        <div className={styles.tagInputWrap}>
          <Tag size={13} aria-hidden="true" />
          <input
            className={`${styles.addInput} ${styles.addTagInput}`}
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            placeholder={t('todo.tagsPlaceholder')}
            aria-label={t('todo.tagsPlaceholder')}
          />
        </div>
        <label className={styles.projectInputWrap}>
          <FolderKanban size={13} aria-hidden="true" />
          <select
            value={projectDraft}
            onChange={(event) => setProjectDraft(event.target.value)}
            aria-label={t('todo.linkProject')}
          >
            <option value="">{t('todo.noProject')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className={styles.addButton}
          disabled={!title.trim()}
          title={t('todo.add')}
          aria-label={t('todo.add')}
        >
          <Plus size={15} />
        </button>
      </form>

      <div className={styles.content}>
        <GsdSyncSection />
        {todos.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <ListTodo size={20} />
            </div>
            <strong>{t('todo.emptyTitle')}</strong>
            <span>{t('todo.emptyDescription')}</span>
          </div>
        ) : (
          <>
            {renderSection(active, false)}
            {renderSection(completed, true)}
          </>
        )}
      </div>
    </aside>
  )
}

function parseTags(value: string): string[] {
  return value
    .split(/[,#\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}
