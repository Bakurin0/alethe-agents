import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Grid3x3,
  Home,
  Layout,
  LayoutGrid,
  MoreHorizontal,
  MoveRight,
  PanelTopOpen,
  Pause,
  Pencil,
  Plus,
  Power,
  Search,
  Sidebar as SidebarIcon,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { preparePtyRuntimeLaunch } from '../../lib/agentRuntimeAdapter'
import { useT } from '../../lib/i18n'
import { formatShortcut } from '../../lib/platform'
import { buildAgentLaunch } from '../../lib/sessionLaunch'
import { agentCliCommand, type AgentType, type Group, type LayoutMode, type Project, type Terminal } from '../../lib/types'
import { getPtyCwd, gitStatus, openInFileExplorer, openInVscode, restartPty } from '../../lib/tauri'
import {
  selectActiveContainer,
  selectActiveProject,
  useProjectsStore,
} from '../../stores/projectsStore'
import { useTerminalsStore } from '../../stores/terminalsStore'
import { useUiStore } from '../../stores/uiStore'
import { EmptyState } from '../EmptyState/EmptyState'
import { Favicon } from '../Favicon'
import { DotmCircular2 } from '../ui/dotm-circular-2'
import { FileExplorer } from './FileExplorer'
import { GitControl } from './GitControl'
import { AgentIcon } from '../icons/AgentIcons'
import { SidebarNowPlaying } from '../SidebarNowPlaying'
import { UserProfile } from '../UserProfile'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { SidebarUpdate } from './SidebarUpdate'
import styles from './ProjectSidebar.module.css'

const LAYOUTS: { id: LayoutMode; label: string; Icon: LucideIcon }[] = [
  { id: 'auto', label: 'Auto', Icon: LayoutGrid },
  { id: 'spotlight', label: 'Spotlight', Icon: Layout },
  { id: 'sidebar', label: 'Sidebar', Icon: SidebarIcon },
  { id: 'grid', label: 'Grid', Icon: Grid3x3 },
]

type ContextMenuState = { x: number; y: number; items: MenuItem[] } | null

export function ProjectSidebar() {
  const t = useT()
  // --- data selectors (reactive) ---
  const projects = useProjectsStore((s) => s.projects)
  const groups = useProjectsStore((s) => s.groups)
  const ungroupedOrder = useProjectsStore((s) => s.ungroupedOrder)
  const containers = useProjectsStore((s) => s.workspace.containers)
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const showGitControl = useProjectsStore((s) => s.preferences.enabledFeatures.git)

  // --- action selectors (stable refs, grouped for readability) ---
  const actions = useProjectsStore(useShallow((s) => ({
    setActiveProject: s.setActiveProject,
    openGroupScope: s.openGroupScope,
    openProjectWorkspace: s.openProjectWorkspace,
    addProjectToWorkspace: s.addProjectToWorkspace,
    openGroupWorkspace: s.openGroupWorkspace,
    openTerminalWorkspace: s.openTerminalWorkspace,
    addTerminalToWorkspace: s.addTerminalToWorkspace,
    focusWorkspaceTerminal: s.focusWorkspaceTerminal,
    toggleProjectCollapsed: s.toggleProjectCollapsed,
    toggleGroupCollapsed: s.toggleGroupCollapsed,
    renameProject: s.renameProject,
    deleteProject: s.deleteProject,
    renameGroup: s.renameGroup,
    deleteGroup: s.deleteGroup,
    resumeGroup: s.resumeGroup,
    setProjectDisabled: s.setProjectDisabled,
    renameTerminal: s.renameTerminal,
    killTerminal: s.killTerminal,
    deleteTerminal: s.deleteTerminal,
    setTerminalDisabled: s.setTerminalDisabled,
    moveTerminal: s.moveTerminal,
    moveProjectToGroup: s.moveProjectToGroup,
    moveGroupToParent: s.moveGroupToParent,
    reorderProjectInGroup: s.reorderProjectInGroup,
    reorderUngrouped: s.reorderUngrouped,
    reorderGroups: s.reorderGroups,
    togglePane: s.togglePane,
    setLaneVisible: s.setLaneVisible,
    setSubTabCompletionUnread: s.setSubTabCompletionUnread,
    createFilePane: s.createFilePane,
    createGraphifyPane: s.createGraphifyPane,
  })))

  const requestPaneFocus = useUiStore((s) => s.requestPaneFocus)
  const openModal = useUiStore((s) => s.openModal_)
  const activeView = useUiStore((s) => s.activeView)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const activeTerminalRef = useUiStore((s) => s.activeTerminal)
  const setActiveTerminal = useUiStore((s) => s.setActiveTerminal)
  const setFocusedTerminal = useUiStore((s) => s.setFocusedTerminal)
  const openMarkdownSidebar = useUiStore((s) => s.openMarkdownSidebar)
  const setPreferences = useProjectsStore((s) => s.setPreferences)
  const [menu, setMenu] = useState<ContextMenuState>(null)
  const [sidebarTab, setSidebarTab] = useState<'files' | 'git' | 'projects'>('projects')
  const keepHome = activeView === 'home'

  useEffect(() => {
    if (!showGitControl && sidebarTab === 'git') setSidebarTab('projects')
  }, [showGitControl, sidebarTab])

  // map projectId → Set<paneIds> pra checar se cada terminal está aberto
  const openPaneSets = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const c of containers) map[c.projectId] = new Set(c.paneIds)
    return map
  }, [containers])

  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )
  const activeProject = useMemo(
    () => projectsById.get(activeProjectId ?? '') ?? projects[0] ?? null,
    [activeProjectId, projects, projectsById],
  )
  const selectedTerminal = useMemo(() => {
    if (!activeProject) return null
    if (activeTerminalRef?.projectId === activeProject.id) {
      const selected = activeProject.terminals.find((terminal) => terminal.id === activeTerminalRef.terminalId)
      if (selected) return selected
    }
    const activeContainer = containers.find((container) => container.projectId === activeProject.id)
    const visible = new Set(activeContainer?.paneIds ?? [])
    return [...activeProject.terminals]
      .filter((terminal) => visible.size === 0 || visible.has(terminal.id))
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0] ?? null
  }, [activeProject, activeTerminalRef, containers])
  const selectedSubTab = selectedTerminal?.tabs.find((tab) => tab.id === selectedTerminal.activeTabId)
    ?? selectedTerminal?.tabs[0]

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const dragged = String(active.id)
    const target = String(over.id)
    if (dragged === target) return

    // term:<projectId>:<terminalId>  →  proj:<projectId> = move terminal entre projetos
    if (dragged.startsWith('term:') && target.startsWith('proj:')) {
      const [, fromProject, terminalId] = dragged.split(':')
      const [, toProject] = target.split(':')
      if (fromProject !== toProject) actions.moveTerminal(fromProject, terminalId, toProject)
      return
    }

    // proj:<id>  →  proj:<id>  = REORDENA dentro do mesmo pai (grupo OU Solto).
    // Se o destino tá em outro grupo, move pra esse grupo na posição do alvo.
    if (dragged.startsWith('proj:') && target.startsWith('proj:')) {
      const fromId = dragged.slice('proj:'.length)
      const toId = target.slice('proj:'.length)
      const from = projectsById.get(fromId)
      const to = projectsById.get(toId)
      if (!from || !to) return

      if (from.groupId === to.groupId) {
        // mesmo pai → reorder
        if (from.groupId === null) {
          const ord = useProjectsStore.getState().ungroupedOrder
          const fi = ord.indexOf(fromId)
          const ti = ord.indexOf(toId)
          if (fi !== -1 && ti !== -1) actions.reorderUngrouped(fromId, fi, ti)
        } else {
          const grp = useProjectsStore.getState().groups.find((g) => g.id === from.groupId)
          if (!grp) return
          const fi = grp.projectIds.indexOf(fromId)
          const ti = grp.projectIds.indexOf(toId)
          if (fi !== -1 && ti !== -1) actions.reorderProjectInGroup(fromId, fi, ti)
        }
      } else {
        // pais diferentes → move pra o pai do alvo na posição do alvo
        const targetParent = to.groupId
        let atIdx: number | undefined
        if (targetParent === null) {
          atIdx = useProjectsStore.getState().ungroupedOrder.indexOf(toId)
        } else {
          const grp = useProjectsStore.getState().groups.find((g) => g.id === targetParent)
          atIdx = grp?.projectIds.indexOf(toId)
        }
        actions.moveProjectToGroup(fromId, targetParent, atIdx === -1 ? undefined : atIdx)
      }
      return
    }

    // proj:<projectId>  →  group:<groupId>  (groupId pode ser "ungrouped")
    if (dragged.startsWith('proj:') && target.startsWith('group:')) {
      const [, projectId] = dragged.split(':')
      const [, groupId] = target.split(':')
      actions.moveProjectToGroup(projectId, groupId === 'ungrouped' ? null : groupId)
      return
    }

    // grp:<id>  →  grp:<id>  = REORDENA grupos (mesmo nível raiz)
    if (dragged.startsWith('grp:') && target.startsWith('grp:')) {
      const fromId = dragged.slice('grp:'.length)
      const toId = target.slice('grp:'.length)
      const all = useProjectsStore.getState().groups
      const fi = all.findIndex((g) => g.id === fromId)
      const ti = all.findIndex((g) => g.id === toId)
      if (fi !== -1 && ti !== -1) actions.reorderGroups(fi, ti)
      return
    }

    // grp:<groupId>  →  group:<groupId>|"ungrouped" = nest/unnest grupo
    if (dragged.startsWith('grp:') && target.startsWith('group:')) {
      const [, srcGroupId] = dragged.split(':')
      const [, parentId] = target.split(':')
      actions.moveGroupToParent(srcGroupId, parentId === 'ungrouped' ? null : parentId)
      return
    }
  }

  const projectMenu = (project: Project): MenuItem[] => [
    {
      kind: 'item',
      label: t('ui.workspace.openIndividually'),
      icon: <FolderOpen size={14} />,
      onClick: () => {
        actions.openProjectWorkspace(project.id)
        setActiveView('workspace')
      },
    },
    {
      kind: 'item',
      label: t('ui.workspace.addToCurrent'),
      icon: <Plus size={14} />,
      onClick: () => {
        actions.addProjectToWorkspace(project.id)
        setActiveView('workspace')
      },
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: t('ui.sidebar.editNameColor'),
      icon: <Pencil size={14} />,
      onClick: () => openModal('editProject', { projectId: project.id }),
    },
    {
      kind: 'item',
      label: t('ui.sidebar.quickRename'),
      icon: <Pencil size={14} />,
      onClick: () => {
        const name = window.prompt(t('ui.sidebar.newNamePrompt'), project.name)?.trim()
        if (name) actions.renameProject(project.id, name)
      },
    },
    {
      kind: 'item',
      label: t('ui.sidebar.newTerminalHere'),
      icon: <Plus size={14} />,
      onClick: () => openModal('newTerminal', { projectId: project.id }),
    },
    {
      kind: 'item',
      label: t('ui.sidebar.designLayout'),
      icon: <Layout size={14} />,
      onClick: () => openModal('layoutDesigner', { kind: 'project', id: project.id }),
    },
    {
      kind: 'item',
      label: 'Visualizar Grafo (Graphify)',
      onClick: () => {
        const repoPath = project.terminals[0]?.cwd
        if (repoPath) {
          actions.createGraphifyPane(project.id, repoPath)
          setActiveView('workspace')
        } else {
          alert('Adicione um terminal ao projeto primeiro para obter a raiz do repositório.')
        }
      },
    },
    {
      kind: 'item',
      label: project.groupId ? t('ui.sidebar.removeFromGroup') : t('ui.sidebar.moveToGroup'),
      icon: <MoveRight size={14} />,
      onClick: () => {
        if (project.groupId) {
          actions.moveProjectToGroup(project.id, null)
        } else if (groups.length === 0) {
          window.alert(t('ui.sidebar.createGroupFirst'))
        } else {
          const list = groups.map((g, i) => `${i + 1}. ${g.name}`).join('\n')
          const pick = window.prompt(t('ui.sidebar.moveProjectToWhichGroup', { name: project.name, list }), '1')
          const idx = pick ? Number(pick) - 1 : -1
          if (idx >= 0 && idx < groups.length) {
            actions.moveProjectToGroup(project.id, groups[idx].id)
          }
        }
      },
    },
    {
      kind: 'item',
      label: project.terminals.length > 0 && project.terminals.every((term) => term.disabled)
        ? t('ui.sidebar.reactivateProject')
        : t('ui.sidebar.disableProject'),
      icon: <Power size={14} />,
      onClick: () => {
        const allDisabled = project.terminals.length > 0 && project.terminals.every((term) => term.disabled)
        actions.setProjectDisabled(project.id, !allDisabled)
      },
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: t('ui.sidebar.deleteProject'),
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => {
        if (
          window.confirm(
            t('ui.sidebar.confirmDeleteProject', { name: project.name, count: project.terminals.length }),
          )
        ) {
          actions.deleteProject(project.id)
        }
      },
    },
  ]

  const groupMenu = (group: Group): MenuItem[] => [
    {
      kind: 'item',
      label: t('ui.workspace.openIndividually'),
      onClick: () => {
        actions.openGroupWorkspace(group.id, 'only')
        setActiveView('workspace')
      },
    },
    {
      kind: 'item',
      label: t('ui.workspace.addToCurrent'),
      onClick: () => {
        actions.openGroupWorkspace(group.id, 'append')
        setActiveView('workspace')
      },
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: t('ui.sidebar.editNameColor'),
      onClick: () => openModal('editGroup', { groupId: group.id }),
    },
    {
      kind: 'item',
      label: t('ui.sidebar.quickRename'),
      onClick: () => {
        const name = window.prompt(t('ui.sidebar.newNamePrompt'), group.name)?.trim()
        if (name) actions.renameGroup(group.id, name)
      },
    },
    {
      kind: 'item',
      label: t('ui.sidebar.createSubgroupHere'),
      onClick: () => openModal('newGroup', { parentGroupId: group.id }),
    },
    {
      kind: 'item',
      label: t('ui.sidebar.designLayout'),
      onClick: () => openModal('layoutDesigner', { kind: 'group', id: group.id }),
    },
    {
      kind: 'item',
      label: group.parentGroupId ? t('ui.sidebar.makeRootGroup') : t('ui.sidebar.moveToOtherGroup'),
      onClick: () => {
        if (group.parentGroupId) {
          actions.moveGroupToParent(group.id, null)
        } else {
          // pick parent — exclude self and descendants
          const allGroups = useProjectsStore.getState().groups
          const descendants = collectDescendants(group.id, allGroups)
          const candidates = allGroups.filter(
            (g) => g.id !== group.id && !descendants.has(g.id),
          )
          if (candidates.length === 0) {
            window.alert(t('ui.sidebar.noEligibleParentGroups'))
            return
          }
          const list = candidates.map((g, i) => `${i + 1}. ${g.name}`).join('\n')
          const pick = window.prompt(t('ui.sidebar.moveGroupAsSubgroupOf', { name: group.name, list }), '1')
          const idx = pick ? Number(pick) - 1 : -1
          if (idx >= 0 && idx < candidates.length) {
            actions.moveGroupToParent(group.id, candidates[idx].id)
          }
        }
      },
    },
    {
      kind: 'item',
      label: group.collapsed ? t('ui.sidebar.expand') : t('ui.sidebar.collapse'),
      onClick: () => actions.toggleGroupCollapsed(group.id),
    },
    {
      kind: 'item',
      label: group.suspended ? t('ui.sidebar.reactivateGroup') : t('ui.sidebar.suspendGroup'),
      onClick: () => {
        if (group.suspended) {
          actions.resumeGroup(group.id)
        } else {
          openModal('suspendGroup', { groupId: group.id })
        }
      },
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: t('ui.sidebar.deleteGroupKeepProjects'),
      onClick: () => actions.deleteGroup(group.id, 'unassign'),
    },
    {
      kind: 'item',
      label: t('ui.sidebar.deleteGroupAndProjects'),
      danger: true,
      onClick: () => {
        if (
          window.confirm(
            t('ui.sidebar.confirmDeleteGroupCascade', { name: group.name, count: group.projectIds.length }),
          )
        ) {
          actions.deleteGroup(group.id, 'cascade')
        }
      },
    },
  ]

  const activeTerminalTab = (term: Terminal) =>
    term.tabs.find((tab) => tab.id === term.activeTabId) ?? term.tabs[0]

  const resolveTerminalCwd = async (term: Terminal): Promise<string | null> => {
    const activeTab = activeTerminalTab(term)
    const saved = activeTab?.cwd?.trim() || term.cwd?.trim()
    if (saved) return saved
    if (!activeTab?.ptyId) return null
    return getPtyCwd(activeTab.ptyId).catch(() => null)
  }

  const openTerminalPath = async (
    term: Terminal,
    action: (path: string) => Promise<void>,
    label: string,
  ) => {
    const path = await resolveTerminalCwd(term)
    if (!path) {
      window.alert(t('ui.terminal.noCwdAvailable', { label }))
      return
    }
    try {
      await action(path)
    } catch (err) {
      window.alert(t('ui.terminal.openFailed', { label, error: String(err) }))
    }
  }

  const restartTerminal = async (term: Terminal) => {
    const activeTab = activeTerminalTab(term)
    if (!activeTab?.ptyId || term.disabled) return
    const runtime = preparePtyRuntimeLaunch(
      activeTab.type,
      activeTab.runtimeProfile,
      activeTab.extraArgs ?? [],
    )
    const launch = buildAgentLaunch(activeTab.type, runtime.args, activeTab.sessionId)
    useTerminalsStore.getState().beginRestart(activeTab.ptyId)
    try {
      await restartPty({
        id: activeTab.ptyId,
        cols: 80,
        rows: 24,
        command: agentCliCommand(activeTab.type),
        cwd: activeTab.cwd || undefined,
        extraArgs: launch.args,
        env: runtime.env,
      })
      window.dispatchEvent(
        new CustomEvent('alethe:terminal-resize-request', { detail: { ptyId: activeTab.ptyId } }),
      )
    } catch (err) {
      window.alert(t('ui.terminal.openFailed', { label: t('ui.terminal.restart'), error: String(err) }))
    }
  }

  const confirmAndDeleteTerminal = (projectId: string, term: Terminal) => {
    if (window.confirm(t('ui.sidebar.confirmDeleteTerminal', { name: term.name }))) {
      actions.deleteTerminal(projectId, term.id)
    }
  }

  const terminalMenu = (projectId: string, term: Terminal): MenuItem[] => {
    const inSplit = openPaneSets[projectId]?.has(term.id) ?? false
    const activeTab = activeTerminalTab(term)
    const isTerminalPane = !term.kind || term.kind === 'terminal'
    const effectiveLaneVisible = term.tabs.length > 1 ? true : term.laneVisible === true
    return [
      {
        kind: 'item',
        label: t('terminalInspector.reveal'),
        icon: <PanelTopOpen size={14} />,
        onClick: () => {
          setActiveTerminal(projectId, term.id)
          actions.focusWorkspaceTerminal(projectId, term.id)
          requestPaneFocus(term.id)
          setActiveView('workspace')
        },
      },
      ...(activeTab?.ptyId && isTerminalPane && !term.disabled
        ? [{
            kind: 'item' as const,
            label: t('ui.terminal.restart'),
            icon: <Power size={14} />,
            onClick: () => void restartTerminal(term),
          }]
        : []),
      ...(isTerminalPane
        ? [
            {
              kind: 'item' as const,
              label: t('ui.terminal.openInExplorer'),
              icon: <FolderOpen size={14} />,
              onClick: () => void openTerminalPath(term, openInFileExplorer, 'Explorer'),
            },
            {
              kind: 'item' as const,
              label: t('ui.terminal.openInVscode'),
              icon: <FolderOpen size={14} />,
              onClick: () => void openTerminalPath(term, openInVscode, 'VS Code'),
            },
            {
              kind: 'item' as const,
              label: t('ui.terminal.focusMode'),
              icon: <PanelTopOpen size={14} />,
              onClick: () => {
                setActiveTerminal(projectId, term.id)
                actions.focusWorkspaceTerminal(projectId, term.id)
                setFocusedTerminal(term.id)
                setActiveView('workspace')
              },
            },
          ]
        : []),
      ...(isTerminalPane && activeTab && term.tabs.length <= 1
        ? [
            {
              kind: 'item' as const,
              label: effectiveLaneVisible ? t('ui.terminal.hideTabsLane') : t('ui.terminal.showTabsLane'),
              onClick: () =>
                actions.setLaneVisible(projectId, term.id, effectiveLaneVisible ? false : true),
            },
          ]
        : []),
      { kind: 'separator' },
      {
        kind: 'item',
        label: t('ui.workspace.openIndividually'),
        onClick: () => {
          actions.openTerminalWorkspace(projectId, term.id)
          setActiveView('workspace')
        },
      },
      {
        kind: 'item',
        label: t('ui.workspace.addToCurrent'),
        onClick: () => {
          actions.addTerminalToWorkspace(projectId, term.id)
          setActiveView('workspace')
        },
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: t('ui.sidebar.rename'),
        icon: <Pencil size={14} />,
        onClick: () => {
          const name = window.prompt(t('ui.sidebar.newNamePrompt'), term.name)?.trim()
          if (name) actions.renameTerminal(projectId, term.id, name)
        },
      },
      {
        kind: 'item',
        label: inSplit ? t('ui.sidebar.hideFromSplit') : t('ui.sidebar.showInSplit'),
        icon: <Layout size={14} />,
        onClick: () => actions.togglePane(projectId, term.id),
      },
      ...(term.kind === 'markdown' && term.filePath
        ? [
            {
              kind: 'item' as const,
              label: t('rightSidebar.openMarkdown'),
              icon: <FileText size={14} />,
              onClick: () => {
                openMarkdownSidebar(term.filePath!, term.name)
                setPreferences({ rightSidebarVisible: true })
              },
            },
          ]
        : []),
      {
        kind: 'item',
        label: term.disabled ? t('ui.sidebar.reactivate') : t('ui.sidebar.disable'),
        icon: <Power size={14} />,
        onClick: () => actions.setTerminalDisabled(projectId, term.id, !term.disabled),
      },
      {
        kind: 'item',
        label: t('ui.sidebar.killTerminal'),
        icon: <Power size={14} />,
        onClick: () => actions.killTerminal(projectId, term.id),
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: t('ui.sidebar.deleteTerminal'),
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => confirmAndDeleteTerminal(projectId, term),
      },
    ]
  }

  const activateProject = (project: Project, mode: 'open' | 'focus' = 'focus') => {
    void mode
    actions.openProjectWorkspace(project.id)
    setActiveView('workspace')
  }

  const renderProject = (p: Project) => (
    <ProjectNode
      key={p.id}
      project={p}
      isActive={p.id === activeProjectId}
      openPanes={openPaneSets[p.id]}
      onActivate={() => {
        activateProject(p)
      }}
      onToggleCollapsed={() => actions.toggleProjectCollapsed(p.id)}
      onTerminalClick={(t) => {
        actions.focusWorkspaceTerminal(p.id, t.id)
        setActiveTerminal(p.id, t.id)
        const activeTab = t.tabs.find((tab) => tab.id === t.activeTabId) ?? t.tabs[0]
        if (activeTab?.completionUnread) {
          actions.setSubTabCompletionUnread(p.id, t.id, activeTab.id, false)
        }
        requestPaneFocus(t.id)
        setActiveView('workspace')
      }}
      onTerminalDoubleClick={(t) => {
        actions.openTerminalWorkspace(p.id, t.id)
        setActiveTerminal(p.id, t.id)
        requestPaneFocus(t.id)
        setActiveView('workspace')
      }}
      onProjectMenu={(e) =>
        setMenu({ x: e.clientX, y: e.clientY, items: projectMenu(p) })
      }
      onTerminalMenu={(t, e) =>
        setMenu({ x: e.clientX, y: e.clientY, items: terminalMenu(p.id, t) })
      }
      onAddTerminal={() => openModal('newTerminal', { projectId: p.id })}
      onQuickOpen={() => activateProject(p, 'open')}
      onToggleDisabled={() => {
        const allDisabled = p.terminals.length > 0 && p.terminals.every((term) => term.disabled)
        actions.setProjectDisabled(p.id, !allDisabled)
      }}
    />
  )

  const ungroupedProjects = ungroupedOrder
    .map((id) => projectsById.get(id))
    .filter((p): p is Project => Boolean(p))

  const groupsByParent = useMemo(() => {
    const map = new Map<string | null, Group[]>()
    for (const g of groups) {
      const key = g.parentGroupId
      const arr = map.get(key) ?? []
      arr.push(g)
      map.set(key, arr)
    }
    return map
  }, [groups])

  const onGroupOpenAll = (g: Group, mode: 'append' | 'only' = 'append') => {
    actions.openGroupWorkspace(g.id, mode)
    setActiveView('workspace')
  }

  const renderGroup = (g: Group): React.ReactNode => {
    const projectsInGroup = g.projectIds
      .map((id) => projectsById.get(id))
      .filter((p): p is Project => Boolean(p))
    const childGroups = groupsByParent.get(g.id) ?? []
    return (
      <GroupNode
        key={g.id}
        group={g}
        projects={projectsInGroup}
        childGroups={childGroups}
        renderProject={renderProject}
        renderChildGroup={renderGroup}
        onMenu={(e) => setMenu({ x: e.clientX, y: e.clientY, items: groupMenu(g) })}
        onAddProject={() =>
          openModal('newProject', {
            groupId: g.id,
            createTerminalAfterCreate: projectsInGroup.length === 0 && childGroups.length === 0,
          })
        }
        onToggle={() => actions.toggleGroupCollapsed(g.id)}
        onOpenAll={() => onGroupOpenAll(g)}
        onOpenOnly={() => onGroupOpenAll(g, 'only')}
      />
    )
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarTabs} role="tablist" aria-label={t('ui.sidebar.navigation')}>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'home'}
          className={`${styles.sidebarTab} ${activeView === 'home' ? styles.sidebarTabActive : ''}`}
          onClick={() => {
            if (activeView !== 'home') {
              setActiveView('home')
            }
          }}
          title={t('ui.sidebar.homeTitle', { shortcut: formatShortcut('Ctrl+Shift+H') })}
          aria-label={t('ui.sidebar.home')}
        >
          <Home size={14} />
          <span>{t('ui.sidebar.home')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'projects'}
          aria-label={t('ui.sidebar.projects')}
          title={t('ui.sidebar.projects')}
          className={`${styles.sidebarTab} ${sidebarTab === 'projects' ? styles.sidebarTabActive : ''}`}
          onClick={() => {
            setSidebarTab('projects')
            if (!keepHome) setActiveView('workspace')
          }}
        >
          <Grid3x3 size={14} />
          <span>{t('ui.sidebar.projects')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'files'}
          aria-label={t('ui.sidebar.files')}
          title={t('ui.sidebar.files')}
          className={`${styles.sidebarTab} ${sidebarTab === 'files' ? styles.sidebarTabActive : ''}`}
          onClick={() => {
            setSidebarTab('files')
            if (!keepHome) setActiveView('workspace')
          }}
        >
          <Folder size={14} />
          <span>{t('ui.sidebar.files')}</span>
        </button>
        {showGitControl ? (
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'git'}
            aria-label={t('ui.sidebar.git')}
            title={t('ui.sidebar.git')}
            className={`${styles.sidebarTab} ${sidebarTab === 'git' ? styles.sidebarTabActive : ''}`}
            onClick={() => {
              setSidebarTab('git')
              if (!keepHome) setActiveView('workspace')
            }}
          >
            <GitBranch size={14} />
            <span>{t('ui.sidebar.git')}</span>
          </button>
        ) : null}
      </div>

      <div className={styles.quickNavList}>
        <button
          type="button"
          className={styles.quickNavItem}
          onClick={() => openModal('findJump')}
          title="Search"
        >
          <Search size={15} className={styles.quickNavIcon} />
          <span>Search</span>
        </button>
      </div>

      {sidebarTab === 'projects' ? (
        <header className={styles.header}>
          <span className={styles.title}>{t('ui.sidebar.projects')}</span>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => openModal('newGroup')}
              title={t('ui.sidebar.newGroupTitle', { shortcut: formatShortcut('Ctrl+Shift+G') })}
              aria-label={t('ui.sidebar.newGroup')}
            >
              <FolderPlus size={14} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => openModal('newProject')}
              title={t('ui.sidebar.newProjectTitle', { shortcut: formatShortcut('Ctrl+Shift+P') })}
              aria-label={t('ui.sidebar.newProject')}
            >
              <Plus size={14} />
            </button>
          </div>
        </header>
      ) : null}

      {sidebarTab === 'files' ? (
        <section className={styles.explorerPanel}>
          <div className={styles.explorerHeader}>
            <span className={styles.explorerLabel}>{t('ui.sidebar.explorer')}</span>
            <MoreHorizontal size={14} />
          </div>
          {selectedTerminal && selectedSubTab ? (
            <FileExplorer
              cwd={selectedSubTab.cwd || selectedTerminal.cwd}
              ptyId={selectedSubTab.ptyId}
              terminalName={selectedTerminal.name}
            />
          ) : (
            <div className={styles.explorerEmpty}>
              <EmptyState
                compact
                icon={<FolderPlus size={18} />}
                title={t('ui.sidebar.emptyTitle')}
                description={t('ui.sidebar.emptyDesc')}
                primaryAction={{
                  label: t('ui.sidebar.emptyAction'),
                  onClick: () => openModal('newProject'),
                }}
              />
            </div>
          )}
        </section>
      ) : null}

      {sidebarTab === 'git' ? (
        <section className={styles.explorerPanel}>
          <div className={styles.explorerHeader}>
            <span className={styles.explorerLabel}>{t('ui.sidebar.sourceControl')}</span>
          </div>
          {selectedTerminal && selectedSubTab ? (
            <GitControl
              cwd={selectedSubTab.cwd || selectedTerminal.cwd}
              ptyId={selectedSubTab.ptyId}
              terminalName={selectedTerminal.name}
            />
          ) : (
            <div className={styles.explorerEmpty}>
              <EmptyState
                compact
                icon={<GitBranch size={18} />}
                title={t('git.empty.noTerminal')}
                description={t('git.empty.noTerminalDesc')}
                primaryAction={{ label: t('ui.sidebar.emptyAction'), onClick: () => openModal('newProject') }}
              />
            </div>
          )}
        </section>
      ) : null}

      {sidebarTab === 'projects' ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className={styles.list}>
            {projects.length === 0 && groups.length === 0 ? (
              <div className={styles.emptyWrap}>
                <EmptyState
                  compact
                  icon={<FolderPlus size={18} />}
                  title={t('ui.sidebar.emptyTitle')}
                  description={t('ui.sidebar.emptyDesc')}
                  primaryAction={{
                    label: t('ui.sidebar.emptyAction'),
                    onClick: () => openModal('newProject'),
                  }}
                />
              </div>
            ) : (
              <>
                {(groupsByParent.get(null) ?? []).map(renderGroup)}

                {ungroupedProjects.length > 0 ? (
                  <UngroupedSection projects={ungroupedProjects} renderProject={renderProject} />
                ) : null}
              </>
            )}
          </div>
        </DndContext>
      ) : null}

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      ) : null}
      <WorkspaceLayoutFooter />
      <LayoutFooter />
      <SidebarNowPlaying />
      <SidebarUpdate />
      <UserProfile />
    </aside>
  )
}
function LayoutFooter() {
  const t = useT()
  const project = useProjectsStore(selectActiveProject)
  const container = useProjectsStore(selectActiveContainer)
  const setLayoutMode = useProjectsStore((s) => s.setLayoutMode)
  if (!project || !container || container.paneIds.length < 2) return null
  return (
    <div className={styles.layoutFooter}>
      <span className={styles.layoutLabel}>{t('ui.sidebar.organization')}</span>
      <div className={styles.layoutSwitch}>
        {LAYOUTS.map((opt) => {
          const Icon = opt.Icon
          const active = container.internalLayout === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              className={`${styles.layoutBtn} ${active ? styles.layoutBtnActive : ''}`}
              onClick={() => setLayoutMode(project.id, opt.id)}
              title={opt.label}
              aria-label={opt.label}
            >
              <Icon size={14} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WorkspaceLayoutFooter({ forceVisible = false }: { forceVisible?: boolean }) {
  const t = useT()
  const containerCount = useProjectsStore((s) => s.workspace.containers.length)
  const hasCustom = useProjectsStore((s) => Boolean(s.preferences.workspaceGridLayout))
  const openModal = useUiStore((s) => s.openModal_)
  if (!forceVisible && containerCount < 2) return null
  return (
    <div className={styles.layoutFooter}>
      <span className={styles.layoutLabel}>Workspace</span>
      <button
        type="button"
        className={`${styles.layoutBtn} ${hasCustom ? styles.layoutBtnActive : ''}`}
        onClick={() => openModal('layoutDesigner', { kind: 'workspace' })}
        title={t('ui.sidebar.designWorkspaceLayout')}
        aria-label={t('ui.sidebar.designLayoutShort')}
        style={{ width: 'auto', padding: '0 10px', fontSize: 11, gap: 6 }}
      >
        <Grid3x3 size={12} />
        <span>{hasCustom ? t('ui.sidebar.editGrid') : t('ui.sidebar.drawGrid')}</span>
      </button>
    </div>
  )
}

function UngroupedSection({
  projects,
  renderProject,
}: {
  projects: Project[]
  renderProject: (p: Project) => React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'group:ungrouped' })
  return (
    <div
      ref={setNodeRef}
      className={`${styles.ungroupedSection} ${isOver ? styles.groupDropTarget : ''}`}
    >
      <div className={styles.ungroupedBody}>{projects.map((p) => renderProject(p))}</div>
    </div>
  )
}

/* ------------ Shared ------------ */

function GroupBadge({ name, iconUrl, color }: { name: string; iconUrl?: string; color: string }) {
  return <Monogram name={name} iconUrl={iconUrl} color={color} size={18} />
}

/** Iniciais (1–2 letras) pro monograma do projeto/grupo. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s\-_./\\]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toLowerCase()
  return (parts[0][0] + parts[1][0]).toLowerCase()
}

/** cwd representativo do projeto = primeiro terminal com cwd (aba ativa preferida). */
function projectRepresentativeCwd(project: Project): string | undefined {
  for (const term of project.terminals) {
    const tab = term.tabs.find((x) => x.id === term.activeTabId) ?? term.tabs[0]
    const cwd = tab?.cwd || term.cwd
    if (cwd) return cwd
  }
  return undefined
}

// cache por cwd + dedup de chamadas concorrentes (git_status é caro)
const branchCache = new Map<string, string | null>()
const branchInflight = new Map<string, Promise<void>>()

/** Lê o branch do repo no cwd via gitStatus (já existente). Defensivo: null se não for repo. */
function useProjectBranch(cwd?: string): string | null {
  const [branch, setBranch] = useState<string | null>(() => (cwd ? branchCache.get(cwd) ?? null : null))
  useEffect(() => {
    let alive = true
    if (!cwd) {
      setBranch(null)
      return
    }
    if (branchCache.has(cwd)) {
      setBranch(branchCache.get(cwd) ?? null)
      return
    }
    if (!branchInflight.has(cwd)) {
      const p = gitStatus(cwd)
        .then((st) => {
          branchCache.set(cwd, st.detached ? null : st.branch || null)
        })
        .catch(() => {
          branchCache.set(cwd, null)
        })
        .finally(() => {
          branchInflight.delete(cwd)
        })
      branchInflight.set(cwd, p)
    }
    void branchInflight.get(cwd)?.then(() => {
      if (alive) setBranch(branchCache.get(cwd) ?? null)
    })
    return () => {
      alive = false
    }
  }, [cwd])
  return branch
}

/** Monograma colorido: iniciais sobre a cor do projeto/grupo; iconUrl custom sobrepõe. */
function Monogram({
  name,
  iconUrl,
  color,
  size = 20,
}: {
  name: string
  iconUrl?: string
  color?: string
  size?: number
}) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className={styles.projectIcon} style={{ width: size, height: size }} />
  }
  return (
    <span
      className={styles.monogram}
      style={{ width: size, height: size, background: color || 'var(--panel-hover)', fontSize: Math.round(size * 0.46) }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  )
}
/* ------------ Group ------------ */

type GroupNodeProps = {
  group: Group
  projects: Project[]
  childGroups: Group[]
  renderProject: (p: Project) => React.ReactNode
  renderChildGroup: (g: Group) => React.ReactNode
  onMenu: (e: React.MouseEvent) => void
  onAddProject: () => void
  onToggle: () => void
  onOpenAll: () => void
  onOpenOnly: () => void
}

function GroupNode({
  group,
  projects,
  childGroups,
  renderProject,
  renderChildGroup,
  onMenu,
  onAddProject,
  onToggle,
  onOpenAll,
  onOpenOnly,
}: GroupNodeProps) {
  const t = useT()
  const dropZone = useDroppable({ id: `group:${group.id}` })
  const draggable = useDraggable({ id: `grp:${group.id}` })
  const setRefs = (node: HTMLDivElement | null) => {
    dropZone.setNodeRef(node)
    draggable.setNodeRef(node)
  }
  const isOver = dropZone.isOver

  // Click no nome do grupo (ou bullet) → onOpenAll. Não dispara em chevron/+.
  const onTagClick = (e: React.MouseEvent) => {
    const tgt = e.target as HTMLElement
    if (tgt.closest('button')) return // chevron/+ tratam o próprio click
    onOpenAll()
  }

  if (group.collapsed) {
    return (
      <div
        ref={setRefs}
        {...draggable.attributes}
        {...draggable.listeners}
        className={`${styles.groupCollapsed} ${isOver ? styles.groupDropTarget : ''}`}
        onClick={() => {
          onToggle()
          onOpenAll()
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onOpenOnly()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onMenu(e)
        }}
        title={t('ui.sidebar.openAllGroupProjects')}
      >
        <ChevronRight size={12} className={styles.groupChevron} />
        <GroupBadge name={group.name} iconUrl={group.iconUrl} color={group.color} />
        <span className={styles.groupName}>{group.name}</span>
        {group.suspended && <Pause size={10} className={styles.groupSuspendedIcon} />}
        <span className={styles.groupCount}>
          {group.projectIds.length === 1
            ? t('ui.sidebar.projectCountOne', { count: group.projectIds.length })
            : t('ui.sidebar.projectCountOther', { count: group.projectIds.length })}
        </span>
      </div>
    )
  }

  return (
    <div
      ref={setRefs}
      className={`${styles.groupBox} ${isOver ? styles.groupDropTarget : ''} ${group.suspended ? styles.groupSuspended : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e)
      }}
      style={{ ['--group-color' as string]: group.color }}
    >
      <div
        className={styles.groupTag}
        onClick={onTagClick}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onOpenOnly()
        }}
        title={group.suspended ? t('ui.sidebar.groupSuspendedHint') : t('ui.sidebar.openAllGroupProjects')}
        {...draggable.attributes}
        {...draggable.listeners}
      >
        <button
          type="button"
          className={styles.groupChevronBtn}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-label={t('ui.sidebar.collapse')}
        >
          <ChevronDown size={11} />
        </button>
        <GroupBadge name={group.name} iconUrl={group.iconUrl} color={group.color} />
        <span className={styles.groupTagName}>{group.name}</span>
        {group.suspended && <Pause size={10} className={styles.groupSuspendedIcon} />}
        <button
          type="button"
          className={styles.iconBtn}
          onClick={(e) => {
            e.stopPropagation()
            onAddProject()
          }}
          title={t('ui.sidebar.newProjectInGroup')}
          aria-label={t('ui.sidebar.newProjectInGroup')}
        >
          <Plus size={11} />
        </button>
      </div>
      <div className={styles.groupBody}>
        {childGroups.map((cg) => renderChildGroup(cg))}
        {projects.length === 0 && childGroups.length === 0 ? (
          <div className={styles.groupEmpty}>{t('ui.sidebar.groupEmpty')}</div>
        ) : (
          projects.map((p) => renderProject(p))
        )}
      </div>
    </div>
  )
}

/** Coleta IDs de todos os grupos descendantes de `rootId` (recursivo). */
function collectDescendants(rootId: string, allGroups: Group[]): Set<string> {
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const g of allGroups) {
      if (g.parentGroupId === cur && !result.has(g.id)) {
        result.add(g.id)
        queue.push(g.id)
      }
    }
  }
  return result
}


/* ------------ Project ------------ */

type ProjectNodeProps = {
  project: Project
  isActive: boolean
  openPanes: Set<string> | undefined
  onActivate: () => void
  onToggleCollapsed: () => void
  onTerminalClick: (t: Terminal) => void
  onTerminalDoubleClick: (t: Terminal) => void
  onProjectMenu: (e: React.MouseEvent) => void
  onTerminalMenu: (t: Terminal, e: React.MouseEvent) => void
  onAddTerminal: () => void
  onQuickOpen: () => void
  onToggleDisabled: () => void
}

function ProjectNode({
  project,
  isActive,
  openPanes,
  onActivate,
  onToggleCollapsed,
  onTerminalClick,
  onTerminalDoubleClick,
  onProjectMenu,
  onTerminalMenu,
  onAddTerminal,
  onQuickOpen,
  onToggleDisabled,
}: ProjectNodeProps) {
  const t = useT()
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `proj:${project.id}` })
  const draggable = useDraggable({ id: `proj:${project.id}` })
  const setRefs = (node: HTMLDivElement | null) => {
    dropRef(node)
    draggable.setNodeRef(node)
  }

  const allDisabled = project.terminals.length > 0 && project.terminals.every((term) => term.disabled)
  const branch = useProjectBranch(projectRepresentativeCwd(project))
  const runningCount = useTerminalsStore((state) =>
    project.terminals.reduce(
      (n, term) =>
        n +
        (term.tabs.some((tab) => tab.ptyId && state.byPtyId[tab.ptyId]?.status === 'working') ? 1 : 0),
      0,
    ),
  )
  const totalCount = project.terminals.length
  const focusedTerminalId = useUiStore((s) =>
    s.activeTerminal?.projectId === project.id ? s.activeTerminal?.terminalId : undefined,
  )
  const countLabel = runningCount > 0 ? `${runningCount}/${totalCount}` : String(totalCount)
  const countTitle = t('ui.sidebar.agentsRunningOf', { running: runningCount, total: totalCount })

  if (isActive) {
    return (
      <div
        ref={setRefs}
        className={`${styles.activeCard} ${isOver ? styles.projectDropTarget : ''} ${
          allDisabled ? styles.projectDisabled : ''
        }`}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onProjectMenu(e)
        }}
        {...draggable.attributes}
        {...draggable.listeners}
      >
        <div className={styles.activeCardHeader} onClick={onToggleCollapsed}>
          <Monogram name={project.name} iconUrl={project.iconUrl} color={project.color} size={20} />
          <span className={styles.activeCardTitle} title={project.name}>
            {project.name}
          </span>
          <span className={styles.badgePrimary}>{t('ui.sidebar.primary')}</span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={(e) => {
              e.stopPropagation()
              onQuickOpen()
            }}
            title={t('ui.workspace.openIndividually')}
          >
            <FolderOpen size={12} />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={(e) => {
              e.stopPropagation()
              onAddTerminal()
            }}
            title={t('ui.sidebar.newTerminal')}
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            className={styles.rowMenuBtn}
            onClick={(e) => {
              e.stopPropagation()
              onProjectMenu(e)
            }}
            title={t('ui.sidebar.moreActions')}
            aria-label={t('ui.sidebar.moreActions')}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>

        {!project.collapsed && project.terminals.length > 0 ? (
          <div className={styles.activeCardAgentsList}>
            {project.terminals.map((term) => (
              <TerminalNode
                key={term.id}
                project={project}
                terminal={term}
                selected={openPanes?.has(term.id) ?? false}
                focused={focusedTerminalId === term.id}
                onClick={() => onTerminalClick(term)}
                onDoubleClick={() => onTerminalDoubleClick(term)}
                onMenu={(e) => onTerminalMenu(term, e)}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      ref={setRefs}
      className={`${styles.inactiveProjectNode} ${allDisabled ? styles.projectDisabled : ''} ${
        isOver ? styles.projectDropTarget : ''
      }`}
      onClick={onActivate}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onProjectMenu(e)
      }}
      {...draggable.attributes}
      {...draggable.listeners}
    >
      <span className={styles.stateGutter}>
        {runningCount > 0 ? (
          <DotmCircular2
            size={14}
            dotSize={2}
            cellPadding={1}
            speed={1.2}
            bloom
            ariaLabel={t('ui.terminal.working')}
            className={styles.rosterLoading}
          />
        ) : (
          <span
            className={`${styles.inactiveDot} ${
              project.terminals.some((term) => !term.disabled) ? styles.inactiveDotActive : ''
            }`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleDisabled()
            }}
          />
        )}
      </span>
      <Monogram name={project.name} iconUrl={project.iconUrl} color={project.color} size={18} />
      <div className={styles.inactiveMain}>
        <span className={styles.projectName} title={project.name}>
          {project.name}
        </span>
        {branch ? (
          <span className={styles.inactiveBranch} title={branch}>
            {branch}
          </span>
        ) : null}
      </div>
      {allDisabled && <Pause size={10} className={styles.projectPauseIcon} />}
      <span className={styles.count} title={countTitle}>
        {countLabel}
      </span>
      <button
        type="button"
        className={styles.rowMenuBtn}
        onClick={(e) => {
          e.stopPropagation()
          onProjectMenu(e)
        }}
        title={t('ui.sidebar.moreActions')}
        aria-label={t('ui.sidebar.moreActions')}
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  )
}

/* ------------ Terminal ------------ */

type TerminalNodeProps = {
  project: Project
  terminal: Terminal
  selected: boolean
  focused?: boolean
  onClick: () => void
  onDoubleClick: () => void
  onMenu: (e: React.MouseEvent) => void
}

function TerminalNode({ project, terminal, selected, focused, onClick, onDoubleClick, onMenu }: TerminalNodeProps) {
  const t = useT()
  const terminalTheme = useProjectsStore(
    (s) => s.preferences.terminalTheme ?? s.preferences.uiTheme,
  )
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `term:${project.id}:${terminal.id}`,
  })

  const activeTab = terminal.tabs.find((tab) => tab.id === terminal.activeTabId) ?? terminal.tabs[0]
  const uniqueTypes = Array.from(new Set(terminal.tabs.map((tab) => tab.type))) as AgentType[]
  const orderedTypes =
    activeTab && uniqueTypes.length > 1
      ? [activeTab.type, ...uniqueTypes.filter((type) => type !== activeTab.type)]
      : uniqueTypes
  const hasUnreadCompletion = terminal.tabs.some((tab) => tab.completionUnread)
  const isWorking = useTerminalsStore((state) =>
    terminal.tabs.some((tab) => tab.ptyId && state.byPtyId[tab.ptyId]?.status === 'working'),
  )

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${styles.terminalRow} ${focused ? styles.terminalFocused : ''} ${
        !selected ? styles.terminalHidden : ''
      } ${terminal.disabled ? styles.terminalDisabled : ''} ${isDragging ? styles.dragging : ''}`}
      onClick={() => onClick()}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onDoubleClick()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onMenu(e)
      }}
      title={terminal.url || terminal.filePath || terminal.cwd || terminal.name}
    >
      <span className={styles.terminalState}>
        {isWorking ? (
          <DotmCircular2
            size={14}
            dotSize={2}
            cellPadding={1}
            speed={1.2}
            bloom
            ariaLabel={t('ui.terminal.working')}
            className={styles.terminalLoading}
          />
        ) : hasUnreadCompletion ? (
          <span className={styles.doneBadge} title={t('ui.terminal.responseReady')}>
            !
          </span>
        ) : (
          <span className={styles.terminalIdle} />
        )}
      </span>
      <span className={styles.agentStack}>
        {terminal.kind === 'web' ? (
          <span className={styles.agentIcon}>
            <Favicon url={terminal.url ?? ''} size={14} />
          </span>
        ) : terminal.kind && terminal.kind !== 'terminal' ? (
          <span className={styles.agentIcon}>
            <FileText size={14} />
          </span>
        ) : (
          orderedTypes.map((type, i) => (
            <span
              key={type}
              className={styles.agentIcon}
              style={{ marginLeft: i === 0 ? 0 : 2, zIndex: orderedTypes.length - i }}
            >
              <AgentIcon type={type} size={14} theme={terminalTheme} />
            </span>
          ))
        )}
      </span>
      <span className={styles.terminalName}>{terminal.name}</span>
      {focused ? <span className={styles.focusTag}>{t('ui.sidebar.focus')}</span> : null}
      {terminal.tabs.length > 1 ? (
        <span className={styles.tabCount}>{terminal.tabs.length}</span>
      ) : null}
      <button
        type="button"
        className={styles.terminalMenuBtn}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onMenu(event)
        }}
        title={t('ui.terminal.moreActions')}
        aria-label={t('ui.terminal.moreActions')}
      >
        <MoreHorizontal size={13} />
      </button>
    </div>
  )
}
