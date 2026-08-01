/**
 * Slices de groups e projects do projectsStore. Extraídos do create() — corpos
 * verbatim, recebem os mutators via SliceCtx.
 */

import { nanoid } from 'nanoid'

import { clearTerminalPtyIds, collectTerminalPtyIds } from '../lib/terminalFactory'
import { cleanupPtys } from '../lib/terminalLifecycle'
import { GROUP_COLORS } from '../lib/types'
import type { Group, Project } from '../lib/types'
import { sanitizeWorkspaceSnapshot } from '../lib/workspaceNavigation'
import { collectGroupProjectIds } from './projectsStore.migrations'
import type { ProjectsState } from './projectsStore'
import type { SliceCtx } from './projectsStore.slices'

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

type ProjectsSlice = Pick<
  ProjectsState,
  | 'createProject'
  | 'renameProject'
  | 'setProjectColor'
  | 'setProjectIconUrl'
  | 'setWorktreeMode'
  | 'setValidationCommands'
  | 'setGsdWatcherEnabled'
  | 'setConflictAgentProvider'
  | 'setGraphifyEnabled'
  | 'setAutoWorktree'
  | 'addOrphanWorktree'
  | 'removeOrphanWorktree'
  | 'setCleaningOrphans'
  | 'cleanupOrphanWorktrees'
  | 'deleteProject'
>

export function createProjectsSlice({ set, get, update, updateProject }: SliceCtx): ProjectsSlice {
  return {
    createProject: ({ name, color, iconUrl, groupId = null, defaultCwd }) => {
      const project: Project = {
        id: nanoid(),
        name,
        color,
        iconUrl,
        groupId,
        ...(defaultCwd?.trim() ? { defaultCwd: defaultCwd.trim() } : {}),
        terminals: [],
        layoutMode: 'auto',
        collapsed: false,
        createdAt: Date.now(),
      }
      update((state) => {
        const groups =
          groupId === null
            ? state.groups
            : state.groups.map((g) =>
                g.id === groupId ? { ...g, projectIds: [...g.projectIds, project.id] } : g,
              )
        const ungroupedOrder =
          groupId === null ? [...state.ungroupedOrder, project.id] : state.ungroupedOrder
        return {
          projects: [...state.projects, project],
          groups,
          ungroupedOrder,
          activeProjectId: state.activeProjectId ?? project.id,
        }
      })
      return project
    },

    renameProject: (id, name) => updateProject(id, (p) => ({ ...p, name })),

    setProjectColor: (id, color) => updateProject(id, (p) => ({ ...p, color })),

    setProjectIconUrl: (id, iconUrl) => updateProject(id, (p) => ({ ...p, iconUrl })),

    setWorktreeMode: (id, worktreeMode) => updateProject(id, (p) => ({ ...p, worktreeMode })),

    setValidationCommands: (id, validationCommands) =>
      updateProject(id, (p) => ({ ...p, validationCommands })),

    setGsdWatcherEnabled: (id, gsdWatcherEnabled) =>
      updateProject(id, (p) => ({ ...p, gsdWatcherEnabled })),

    setConflictAgentProvider: (id, conflictAgentProvider) =>
      updateProject(id, (p) => ({ ...p, conflictAgentProvider })),

    setGraphifyEnabled: (id, graphifyEnabled) =>
      updateProject(id, (p) => ({ ...p, graphifyEnabled })),

    setAutoWorktree: (id, autoWorktree) => updateProject(id, (p) => ({ ...p, autoWorktree })),

    addOrphanWorktree: (projectId, entry) =>
      updateProject(projectId, (p) => {
        const existing = p.orphanWorktrees ?? []
        const index = existing.findIndex((o) => o.path === entry.path)
        if (index === -1) {
          return { ...p, orphanWorktrees: [...existing, entry] }
        }
        const next = [...existing]
        next[index] = {
          ...existing[index],
          ...entry,
          // Sobrescreve incondicionalmente: se a nova falha não é lock
          // administrativo, `entry.adminLockReason` é undefined e limpa o motivo
          // obsoleto em vez de deixá-lo sobreviver a uma mudança de causa.
          adminLockReason: entry.adminLockReason,
        }
        return { ...p, orphanWorktrees: next }
      }),

    removeOrphanWorktree: (projectId, path) =>
      updateProject(projectId, (p) => ({
        ...p,
        orphanWorktrees: (p.orphanWorktrees ?? []).filter((o) => o.path !== path),
      })),

    setCleaningOrphans: (isCleaningOrphans) => update(() => ({ isCleaningOrphans })),

    cleanupOrphanWorktrees: async (projectId) => {
      const summary = { cleaned: 0, partial: 0, awaitingUnlock: 0, failed: 0 }
      const project = get().projects.find((p) => p.id === projectId)
      const repoPath = project?.terminals[0]?.cwd
      const orphans = project?.orphanWorktrees ?? []
      if (!project || !repoPath || orphans.length === 0) return summary

      const { worktreeCleanup, worktreeRemove } = await import('../lib/tauri')
      set({ isCleaningOrphans: true })

      // Snapshot da lista no início — processa cada item uma vez, mesmo que a
      // limpeza de um item anterior já tenha alterado `orphanWorktrees`.
      for (const orphan of orphans) {
        try {
          if (orphan.pruneOnly) {
            // Pasta já não existe fisicamente — só falta destravar o registro
            // fantasma do git.
            await worktreeCleanup(repoPath)
            get().removeOrphanWorktree(projectId, orphan.path)
            summary.cleaned++
            continue
          }

          // requiresRawDeletion (ou nenhuma flag ainda — primeira tentativa):
          // tenta a remoção completa (o backend já decide internamente entre
          // `git worktree remove` e deleção crua conforme o estado da pasta).
          const agentId = orphan.path.split(/[\\/]/).filter(Boolean).pop() ?? ''
          await worktreeRemove(repoPath, agentId, true)

          // Deleção física OK — confirma que o registro do git também sumiu.
          try {
            await worktreeCleanup(repoPath)
            get().removeOrphanWorktree(projectId, orphan.path)
            summary.cleaned++
          } catch {
            // Progresso real (pasta já foi embora) — reseta cleanAttempts.
            get().addOrphanWorktree(projectId, {
              path: orphan.path,
              mode: orphan.mode,
              pruneOnly: true,
              requiresRawDeletion: undefined,
              cleanAttempts: 0,
              adminLockReason: undefined,
            })
            summary.partial++
          }
        } catch (error) {
          const message = String(error)
          const adminLockMatch = message.match(/admin_locked:(.*)$/)
          if (adminLockMatch) {
            get().addOrphanWorktree(projectId, {
              ...orphan,
              adminLockReason: adminLockMatch[1],
            })
            summary.awaitingUnlock++
          } else {
            get().addOrphanWorktree(projectId, {
              ...orphan,
              adminLockReason: undefined,
              cleanAttempts: (orphan.cleanAttempts ?? 0) + 1,
            })
            summary.failed++
          }
        }
      }

      set({ isCleaningOrphans: false })
      return summary
    },

    deleteProject: (id) =>
      update((state) => {
        const project = state.projects.find((p) => p.id === id)
        if (!project) return
        cleanupPtys(collectTerminalPtyIds(project.terminals))
        const projects = state.projects.filter((p) => p.id !== id)
        const todos = state.todos.map((item) => {
          if (item.projectId !== id) return item
          const next = { ...item }
          delete next.projectId
          return next
        })
        const groups = state.groups.map((g) =>
          g.id === project.groupId
            ? { ...g, projectIds: g.projectIds.filter((pid) => pid !== id) }
            : g,
        )
        const ungroupedOrder = state.ungroupedOrder.filter((pid) => pid !== id)
        const containers = state.workspace.containers.filter((c) => c.projectId !== id)
        const recentProjectIds = (state.workspace.recentProjectIds ?? []).filter(
          (pid) => pid !== id,
        )
        const recentTabs = (state.workspace.recentTabs ?? []).filter(
          (tab) => !(tab.kind === 'project' && tab.id === id),
        )
        const activeProjectId =
          state.activeProjectId === id ? (projects[0]?.id ?? null) : state.activeProjectId
        const tabs = state.workspace.tabs
          .filter(
            (tab) =>
              !(tab.kind === 'project' && tab.sourceId === id) &&
              !(tab.kind === 'terminal' && tab.sourceProjectId === id),
          )
          .map((tab) => ({
            ...tab,
            snapshot: sanitizeWorkspaceSnapshot(tab.snapshot, projects),
          }))
        const tabIds = new Set(tabs.map((tab) => tab.id))
        const activeTabId = tabIds.has(state.workspace.activeTabId ?? '')
          ? state.workspace.activeTabId
          : (tabs[0]?.id ?? null)
        const history = state.workspace.history
          .filter((entry) => tabIds.has(entry.tabId))
          .map((entry) => ({
            ...entry,
            snapshot: sanitizeWorkspaceSnapshot(entry.snapshot, projects),
          }))
        return {
          projects,
          todos,
          groups,
          ungroupedOrder,
          workspace: {
            ...state.workspace,
            containers,
            recentProjectIds,
            recentTabs,
            tabs,
            activeTabId,
            history,
            historyIndex: Math.min(state.workspace.historyIndex, history.length - 1),
          },
          activeProjectId,
        }
      }),
  }
}
