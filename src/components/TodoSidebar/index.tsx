import {
  Check,
  CheckCircle2,
  Circle,
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
import { useState } from 'react'

import { useT } from '../../lib/i18n'
import { TODO_TITLE_MAX_LENGTH } from '../../lib/todos'
import type { TodoItem } from '../../lib/types'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import styles from './TodoSidebar.module.css'

export function TodoSidebar() {
  const t = useT()
  const todos = useProjectsStore((state) => state.todos)
  const createTodo = useProjectsStore((state) => state.createTodo)
  const renameTodo = useProjectsStore((state) => state.renameTodo)
  const updateTodoTags = useProjectsStore((state) => state.updateTodoTags)
  const toggleTodo = useProjectsStore((state) => state.toggleTodo)
  const deleteTodo = useProjectsStore((state) => state.deleteTodo)
  const reorderTodo = useProjectsStore((state) => state.reorderTodo)
  const setPreferences = useProjectsStore((state) => state.setPreferences)
  const openModal = useUiStore((state) => state.openModal_)
  const [title, setTitle] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const active = todos.filter((todo) => !todo.completed)
  const completed = todos.filter((todo) => todo.completed)

  const submit = () => {
    if (!createTodo(title, parseTags(tagDraft))) return
    setTitle('')
    setTagDraft('')
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
                ].filter(Boolean).join(' ')}
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
                  <button
                    type="button"
                    className={styles.todoTitle}
                    onClick={() => startEditing(todo)}
                    title={todo.title}
                  >
                    <span className={styles.todoTitleText}>{todo.title}</span>
                    {todo.tags.length > 0 ? (
                      <span className={styles.tags}>
                        {todo.tags.map((tag) => (
                          <span key={tag} className={styles.tag}>#{tag}</span>
                        ))}
                      </span>
                    ) : null}
                  </button>
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
          <span className={styles.pendingCount}>{t('todo.pendingCount', { count: active.length })}</span>
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
        {todos.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><ListTodo size={20} /></div>
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
  return value.split(/[,#\s]+/).map((tag) => tag.trim()).filter(Boolean)
}
