/**
 * Slices do projectsStore — grupos de ações extraídos do create() pra manter o
 * arquivo principal menor. Cada slice recebe o `SliceCtx` (mutators do closure)
 * e devolve um pedaço tipado do estado. Comportamento idêntico ao original: os
 * corpos das ações são os mesmos, só passaram a receber os mutators via ctx.
 *
 * Domínios sem acoplamento com o mutator de navegação (`suppressNavigationSync`)
 * nem com os helpers de container vivem aqui. Groups/projects/terminals/workspace
 * seguem no create() por ora (acoplamento maior — split com verificação runtime).
 */

import { nanoid } from 'nanoid'

import { pickMostRecentTab, resolveTerminalCwd, touchTerminalUsage } from '../lib/terminalFactory'
import { cleanupPtys } from '../lib/terminalLifecycle'
import {
  DEFAULT_TODOS,
  normalizeTodoTags,
  normalizeTodoTitle,
  reorderTodoItems,
} from '../lib/todos'
import type { Project, SubTab, Terminal, TodoItem, WorkspaceContainer } from '../lib/types'
import { clampUiZoom } from './projectsStore.constants'
import type { ProjectsState } from './projectsStore'

/** Mutators do closure do store, injetados nas slices. */
export type SliceCtx = {
  update: (mutator: (state: ProjectsState) => Partial<ProjectsState> | void) => void
  updateProject: (projectId: string, fn: (p: Project) => Project) => void
  updateTerminal: (projectId: string, terminalId: string, fn: (t: Terminal) => Terminal) => void
  updateSubTab: (
    projectId: string,
    terminalId: string,
    tabId: string,
    fn: (s: SubTab) => SubTab,
  ) => void
  updateContainer: (projectId: string, fn: (c: WorkspaceContainer) => WorkspaceContainer) => void
}

type TodosSlice = Pick<
  ProjectsState,
  | 'createTodo'
  | 'renameTodo'
  | 'updateTodoTags'
  | 'setTodoProject'
  | 'resetTodosToDefault'
  | 'toggleTodo'
  | 'deleteTodo'
  | 'reorderTodo'
>

export function createTodosSlice({ update }: SliceCtx): TodosSlice {
  return {
    createTodo: (rawTitle, rawTags = [], projectId) => {
      const title = normalizeTodoTitle(rawTitle)
      if (!title) return null
      const todo: TodoItem = {
        id: nanoid(),
        title,
        completed: false,
        tags: normalizeTodoTags(rawTags),
        ...(projectId ? { projectId } : {}),
      }
      update((state) => {
        const completedIndex = state.todos.findIndex((item) => item.completed)
        const insertAt = completedIndex === -1 ? state.todos.length : completedIndex
        return {
          todos: [...state.todos.slice(0, insertAt), todo, ...state.todos.slice(insertAt)],
        }
      })
      return todo
    },

    renameTodo: (id, rawTitle) => {
      const title = normalizeTodoTitle(rawTitle)
      if (!title) return
      update((state) => ({
        todos: state.todos.map((item) => (item.id === id ? { ...item, title } : item)),
      }))
    },

    updateTodoTags: (id, tags) =>
      update((state) => ({
        todos: state.todos.map((item) =>
          item.id === id ? { ...item, tags: normalizeTodoTags(tags) } : item,
        ),
      })),

    setTodoProject: (id, projectId) =>
      update((state) => ({
        todos: state.todos.map((item) => {
          if (item.id !== id) return item
          const next = { ...item }
          if (projectId) next.projectId = projectId
          else delete next.projectId
          return next
        }),
      })),

    resetTodosToDefault: () =>
      update(() => ({
        todos: DEFAULT_TODOS.map((item) => ({ ...item, id: nanoid() })),
      })),

    toggleTodo: (id) =>
      update((state) => {
        const current = state.todos.find((item) => item.id === id)
        if (!current) return
        const changed = { ...current, completed: !current.completed }
        const remaining = state.todos.filter((item) => item.id !== id)
        if (changed.completed) return { todos: [...remaining, changed] }
        const firstCompleted = remaining.findIndex((item) => item.completed)
        const insertAt = firstCompleted === -1 ? remaining.length : firstCompleted
        return {
          todos: [...remaining.slice(0, insertAt), changed, ...remaining.slice(insertAt)],
        }
      }),

    deleteTodo: (id) =>
      update((state) => ({ todos: state.todos.filter((item) => item.id !== id) })),

    reorderTodo: (draggedId, targetId) =>
      update((state) => ({ todos: reorderTodoItems(state.todos, draggedId, targetId) })),
  }
}

type SubTabsSlice = Pick<
  ProjectsState,
  | 'createSubTab'
  | 'closeSubTab'
  | 'setActiveTab'
  | 'setSubTabPtyId'
  | 'setSubTabCwd'
  | 'setSubTabCompletionUnread'
  | 'setSubTabSessionId'
  | 'setSubTabInitialInput'
>

export function createSubTabsSlice({ updateTerminal, updateSubTab }: SliceCtx): SubTabsSlice {
  return {
    createSubTab: (projectId, terminalId, args) => {
      const now = Date.now()
      let tab: SubTab = {
        id: nanoid(),
        type: args.type,
        name: args.name ?? args.type,
        cwd: args.cwd,
        lastUsedAt: now,
        ptyId: null,
        extraArgs: args.extraArgs,
        runtimeProfile: args.runtimeProfile,
      }
      updateTerminal(projectId, terminalId, (t) => ({
        ...t,
        lastUsedAt: now,
        tabs: [
          ...t.tabs,
          (tab = {
            ...tab,
            cwd: args.cwd.trim() || resolveTerminalCwd(t),
          }),
        ],
        activeTabId: tab.id,
      }))
      return tab
    },

    closeSubTab: (projectId, terminalId, tabId) =>
      updateTerminal(projectId, terminalId, (t) => {
        const closingTab = t.tabs.find((s) => s.id === tabId)
        if (closingTab?.ptyId) cleanupPtys([closingTab.ptyId])
        const remaining = t.tabs.filter((s) => s.id !== tabId)
        if (remaining.length === 0) return t
        const activeTabId =
          t.activeTabId === tabId
            ? (pickMostRecentTab(t, tabId)?.id ?? remaining[0].id)
            : t.activeTabId
        const next = { ...t, tabs: remaining, activeTabId }
        return activeTabId ? touchTerminalUsage(next, activeTabId) : next
      }),

    setActiveTab: (projectId, terminalId, tabId) =>
      updateTerminal(projectId, terminalId, (t) => {
        if (!t.tabs.some((tab) => tab.id === tabId)) return t
        const now = Date.now()
        return {
          ...t,
          lastUsedAt: now,
          activeTabId: tabId,
          tabs: t.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, completionUnread: false, lastUsedAt: now } : tab,
          ),
        }
      }),

    setSubTabPtyId: (projectId, terminalId, tabId, ptyId) =>
      updateSubTab(projectId, terminalId, tabId, (s) => ({ ...s, ptyId })),

    setSubTabCwd: (projectId, terminalId, tabId, cwd) =>
      updateSubTab(projectId, terminalId, tabId, (s) => ({ ...s, cwd })),

    setSubTabCompletionUnread: (projectId, terminalId, tabId, unread) =>
      updateSubTab(projectId, terminalId, tabId, (s) => ({
        ...s,
        completionUnread: unread,
      })),

    setSubTabSessionId: (projectId, terminalId, tabId, sessionId) =>
      updateSubTab(projectId, terminalId, tabId, (s) => ({ ...s, sessionId })),

    setSubTabInitialInput: (projectId, terminalId, tabId, initialInput) =>
      updateSubTab(projectId, terminalId, tabId, (s) => ({ ...s, initialInput })),
  }
}

type PreferencesSlice = Pick<
  ProjectsState,
  | 'setLanguage'
  | 'setUiTheme'
  | 'setUiZoom'
  | 'setTerminalTheme'
  | 'setAgentEnabled'
  | 'setOnboardingDone'
  | 'setPreferences'
  | 'setCliPath'
>

export function createPreferencesSlice({ update }: SliceCtx): PreferencesSlice {
  return {
    setLanguage: (language) =>
      update((state) => ({ preferences: { ...state.preferences, language } })),

    setUiTheme: (theme) =>
      update((state) => ({ preferences: { ...state.preferences, uiTheme: theme } })),

    setUiZoom: (zoom) =>
      update((state) => {
        const uiZoom = clampUiZoom(zoom)
        if (state.preferences.uiZoom === uiZoom) return
        return { preferences: { ...state.preferences, uiZoom } }
      }),

    setTerminalTheme: (theme) =>
      update((state) => ({ preferences: { ...state.preferences, terminalTheme: theme } })),

    setAgentEnabled: (agent, enabled) =>
      update((state) => ({
        preferences: {
          ...state.preferences,
          enabledAgents: { ...state.preferences.enabledAgents, [agent]: enabled },
        },
      })),

    setOnboardingDone: (done) =>
      update((state) => ({ preferences: { ...state.preferences, onboardingDone: done } })),

    setPreferences: (patch) =>
      update((state) => ({ preferences: { ...state.preferences, ...patch } })),

    setCliPath: (agent, path) =>
      update((state) => {
        const cliPaths = { ...state.cliPaths }
        if (path === null) delete cliPaths[agent]
        else cliPaths[agent] = path
        return { cliPaths }
      }),
  }
}
