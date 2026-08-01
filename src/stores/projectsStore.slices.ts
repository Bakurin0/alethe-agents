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

import {
  clearTerminalPtyIds,
  collectTerminalPtyIds,
  pickMostRecentTab,
  resolveTerminalCwd,
  touchTerminalUsage,
} from '../lib/terminalFactory'
import { cleanupPtys } from '../lib/terminalLifecycle'
import {
  DEFAULT_TODOS,
  normalizeTodoTags,
  normalizeTodoTitle,
  reorderTodoItems,
} from '../lib/todos'
import { GROUP_COLORS } from '../lib/types'
import type { Group, Project, SubTab, Terminal, TodoItem, WorkspaceContainer } from '../lib/types'
import { sanitizeWorkspaceSnapshot } from '../lib/workspaceNavigation'
import { clampUiZoom } from './projectsStore.constants'
import { collectGroupProjectIds } from './projectsStore.migrations'
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

type GroupsSlice = Pick<
  ProjectsState,
  | 'createGroup'
  | 'moveGroupToParent'
  | 'renameGroup'
  | 'setGroupColor'
  | 'setGroupIconUrl'
  | 'toggleGroupCollapsed'
  | 'suspendGroup'
  | 'resumeGroup'
  | 'deleteGroup'
  | 'reorderGroups'
  | 'moveProjectToGroup'
  | 'reorderProjectInGroup'
  | 'reorderUngrouped'
>

export function createGroupsSlice({ update }: SliceCtx): GroupsSlice {
  return {
    createGroup: (name, color, parentGroupId = null) => {
      const group: Group = {
        id: nanoid(),
        name,
        color: color ?? GROUP_COLORS[0],
        collapsed: false,
        projectIds: [],
        parentGroupId,
        createdAt: Date.now(),
      }
      update((state) => ({ groups: [...state.groups, group] }))
      return group
    },

    moveGroupToParent: (groupId, parentGroupId) =>
      update((state) => {
        if (groupId === parentGroupId) return
        // Bloqueia ciclos: não pode virar filho de um descendente.
        if (parentGroupId !== null) {
          let cur: string | null = parentGroupId
          while (cur !== null) {
            if (cur === groupId) return // ciclo detectado
            const next: Group | undefined = state.groups.find((g) => g.id === cur)
            cur = next?.parentGroupId ?? null
          }
        }
        return {
          groups: state.groups.map((g) => (g.id === groupId ? { ...g, parentGroupId } : g)),
        }
      }),

    renameGroup: (id, name) =>
      update((state) => ({
        groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g)),
      })),

    setGroupColor: (id, color) =>
      update((state) => ({
        groups: state.groups.map((g) => (g.id === id ? { ...g, color } : g)),
      })),

    setGroupIconUrl: (id, iconUrl) =>
      update((state) => ({
        groups: state.groups.map((g) => (g.id === id ? { ...g, iconUrl } : g)),
      })),

    toggleGroupCollapsed: (id) =>
      update((state) => ({
        groups: state.groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)),
      })),

    suspendGroup: (groupId) =>
      update((state) => {
        const group = state.groups.find((g) => g.id === groupId)
        if (!group || group.suspended) return

        const allProjectIds = collectGroupProjectIds(groupId, state.groups)
        cleanupPtys(
          collectTerminalPtyIds(
            state.projects.filter((p) => allProjectIds.has(p.id)).flatMap((p) => p.terminals),
          ),
        )

        // Desabilita todos os terminais dos projetos do grupo
        const projects = state.projects.map((p) => {
          if (!allProjectIds.has(p.id)) return p
          return {
            ...p,
            terminals: p.terminals.map((t) => ({ ...clearTerminalPtyIds(t), disabled: true })),
          }
        })

        // Fecha os containers desses projetos
        const containers = state.workspace.containers.filter((c) => !allProjectIds.has(c.projectId))

        // Marca o grupo (e subgrupos) como suspenso
        const groups = state.groups.map((g) => {
          if (g.id === groupId) return { ...g, suspended: true }
          return g
        })

        return { groups, projects, workspace: { ...state.workspace, containers } }
      }),

    resumeGroup: (groupId) =>
      update((state) => {
        const group = state.groups.find((g) => g.id === groupId)
        if (!group || !group.suspended) return

        const allProjectIds = collectGroupProjectIds(groupId, state.groups)

        // Reabilita todos os terminais
        const projects = state.projects.map((p) => {
          if (!allProjectIds.has(p.id)) return p
          return {
            ...p,
            terminals: p.terminals.map((t) => ({ ...t, disabled: false })),
          }
        })

        const groups = state.groups.map((g) => {
          if (g.id === groupId) return { ...g, suspended: false }
          return g
        })

        return { groups, projects }
      }),

    deleteGroup: (id, mode) =>
      update((state) => {
        const group = state.groups.find((g) => g.id === id)
        if (!group) return
        if (mode === 'cascade') {
          // Coleta TODOS os descendantes (BFS) — subgrupos + seus projetos.
          const groupQueue = [id]
          const groupsToRemove = new Set<string>()
          while (groupQueue.length > 0) {
            const cur = groupQueue.shift()!
            if (groupsToRemove.has(cur)) continue
            groupsToRemove.add(cur)
            for (const g of state.groups) {
              if (g.parentGroupId === cur) groupQueue.push(g.id)
            }
          }
          const projectsToRemove = new Set<string>()
          for (const p of state.projects) {
            if (p.groupId && groupsToRemove.has(p.groupId)) projectsToRemove.add(p.id)
          }
          cleanupPtys(
            collectTerminalPtyIds(
              state.projects.filter((p) => projectsToRemove.has(p.id)).flatMap((p) => p.terminals),
            ),
          )
          const remainingProjects = state.projects.filter((p) => !projectsToRemove.has(p.id))
          const tabs = state.workspace.tabs
            .filter(
              (tab) =>
                !(tab.kind === 'group' && groupsToRemove.has(tab.sourceId ?? tab.id)) &&
                !(tab.kind === 'project' && projectsToRemove.has(tab.sourceId ?? tab.id)) &&
                !(tab.kind === 'terminal' && projectsToRemove.has(tab.sourceProjectId ?? '')),
            )
            .map((tab) => ({
              ...tab,
              snapshot: sanitizeWorkspaceSnapshot(tab.snapshot, remainingProjects),
            }))
          const tabIds = new Set(tabs.map((tab) => tab.id))
          const activeTabId = tabIds.has(state.workspace.activeTabId ?? '')
            ? state.workspace.activeTabId
            : (tabs[0]?.id ?? null)
          const history = state.workspace.history
            .filter((entry) => tabIds.has(entry.tabId))
            .map((entry) => {
              const tab = tabs.find((tab) => tab.id === entry.tabId)
              return {
                ...entry,
                snapshot: tab
                  ? sanitizeWorkspaceSnapshot(entry.snapshot, remainingProjects)
                  : entry.snapshot,
              }
            })
          return {
            groups: state.groups.filter((g) => !groupsToRemove.has(g.id)),
            projects: remainingProjects,
            workspace: {
              ...state.workspace,
              containers: state.workspace.containers.filter(
                (c) => !projectsToRemove.has(c.projectId),
              ),
              recentProjectIds: (state.workspace.recentProjectIds ?? []).filter(
                (pid) => !projectsToRemove.has(pid),
              ),
              recentTabs: (state.workspace.recentTabs ?? []).filter((tab) =>
                tab.kind === 'group' ? !groupsToRemove.has(tab.id) : !projectsToRemove.has(tab.id),
              ),
              tabs,
              activeTabId,
              history,
              historyIndex: Math.min(state.workspace.historyIndex, history.length - 1),
            },
            activeProjectId: projectsToRemove.has(state.activeProjectId ?? '')
              ? (remainingProjects[0]?.id ?? null)
              : state.activeProjectId,
          }
        }
        // unassign:
        // - Projetos do grupo viram Solto
        // - Subgrupos diretos viram root (parentGroupId: null)
        return {
          groups: state.groups
            .filter((g) => g.id !== id)
            .map((g) => (g.parentGroupId === id ? { ...g, parentGroupId: null } : g)),
          projects: state.projects.map((p) => (p.groupId === id ? { ...p, groupId: null } : p)),
          ungroupedOrder: [
            ...state.ungroupedOrder,
            ...group.projectIds.filter((pid) => !state.ungroupedOrder.includes(pid)),
          ],
          workspace: {
            ...state.workspace,
            recentTabs: (state.workspace.recentTabs ?? []).filter(
              (tab) => !(tab.kind === 'group' && tab.id === id),
            ),
          },
        }
      }),

    reorderGroups: (fromIndex, toIndex) =>
      update((state) => {
        const next = [...state.groups]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        return { groups: next }
      }),

    moveProjectToGroup: (projectId, groupId, atIndex) =>
      update((state) => {
        const project = state.projects.find((p) => p.id === projectId)
        if (!project || project.groupId === groupId) return
        const oldGroupId = project.groupId
        // remove do grupo antigo (ou do ungrouped)
        let groups = state.groups.map((g) => {
          if (g.id === oldGroupId) {
            return { ...g, projectIds: g.projectIds.filter((id) => id !== projectId) }
          }
          return g
        })
        let ungroupedOrder = state.ungroupedOrder
        if (oldGroupId === null) {
          ungroupedOrder = ungroupedOrder.filter((id) => id !== projectId)
        }
        // adiciona no destino
        if (groupId === null) {
          const next = [...ungroupedOrder]
          if (atIndex === undefined || atIndex < 0 || atIndex > next.length) {
            next.push(projectId)
          } else {
            next.splice(atIndex, 0, projectId)
          }
          ungroupedOrder = next
        } else {
          groups = groups.map((g) => {
            if (g.id !== groupId) return g
            const next = [...g.projectIds]
            if (atIndex === undefined || atIndex < 0 || atIndex > next.length) {
              next.push(projectId)
            } else {
              next.splice(atIndex, 0, projectId)
            }
            return { ...g, projectIds: next }
          })
        }
        return {
          groups,
          ungroupedOrder,
          projects: state.projects.map((p) => (p.id === projectId ? { ...p, groupId } : p)),
        }
      }),

    reorderProjectInGroup: (projectId, fromIndex, toIndex) =>
      update((state) => {
        const project = state.projects.find((p) => p.id === projectId)
        if (!project || project.groupId === null) return
        return {
          groups: state.groups.map((g) => {
            if (g.id !== project.groupId) return g
            const next = [...g.projectIds]
            const [moved] = next.splice(fromIndex, 1)
            next.splice(toIndex, 0, moved)
            return { ...g, projectIds: next }
          }),
        }
      }),

    reorderUngrouped: (_projectId, fromIndex, toIndex) =>
      update((state) => {
        const next = [...state.ungroupedOrder]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        return { ungroupedOrder: next }
      }),
  }
}
