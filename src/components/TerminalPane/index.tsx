import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  GripVertical,
  Minimize2,
  MoreHorizontal,
  RefreshCw,
  X,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { useGridResize } from '../../hooks/useGridResize'
import { preparePtyRuntimeLaunch } from '../../lib/agentRuntimeAdapter'
import { useT } from '../../lib/i18n'
import { buildAgentLaunch } from '../../lib/sessionLaunch'
import { useProjectsStore } from '../../stores/projectsStore'
import { useTerminalsStore } from '../../stores/terminalsStore'
import { useUiStore } from '../../stores/uiStore'
import type { Terminal as TerminalEntry, SubTab, Theme, AgentType } from '../../lib/types'
import { restartPty } from '../../lib/tauri'
import { AgentIcon } from '../icons/AgentIcons'
import { SubTabsLane } from '../SubTabsLane'
import { XTermView } from '../XTermView'
import { GhosttySurface } from '../GhosttySurface'
import { shouldUseNativeBackend } from '../../lib/platform'
import { buildGhosttyCommand } from '../../lib/ghosttyCommand'
import styles from './TerminalPane.module.css'

export type TerminalPaneProps = {
  projectId: string
  terminal: TerminalEntry
  /** Hide the pane drag affordance when the parent group has nothing to reorder. */
  paneDragEnabled?: boolean
  /** True quando renderizado dentro do FocusOverlay (mostra Minimize, esconde Focus). */
  inFocusOverlay?: boolean
  /** True quando renderizado na Home — esconde grip, actions, lane, grid resize. */
  preview?: boolean
}

export const TerminalPane = memo(function TerminalPane({
  projectId,
  terminal,
  paneDragEnabled = true,
  inFocusOverlay = false,
  preview = false,
}: TerminalPaneProps) {
  const t = useT()
  const [resumeNonce, setResumeNonce] = useState(0)
  const focusedTerminalId = useUiStore((s) => s.focusedTerminalId)
  const isFocusMode = inFocusOverlay || focusedTerminalId === terminal.id
  const canDragPane = paneDragEnabled && !isFocusMode && !preview
  // Drag-and-drop pra reordenar entre panes (igual canvas-agents focus mode).
  // Skip dentro do focus overlay — não faz sentido reordenar quando só tem 1.
  const draggable = useDraggable({
    id: `pane:${terminal.id}`,
    disabled: !canDragPane,
  })
  const droppable = useDroppable({
    id: `pane:${terminal.id}`,
    disabled: !canDragPane,
  })
  const paneRef = useRef<HTMLDivElement | null>(null)
  const setRefs = (node: HTMLDivElement | null) => {
    paneRef.current = node
    draggable.setNodeRef(node)
    droppable.setNodeRef(node)
  }

  // Foco vindo da sidebar — scroll into view + foca o textarea do xterm.
  const focusReq = useUiStore((s) => s.focusRequest)
  useEffect(() => {
    if (!focusReq || focusReq.terminalId !== terminal.id) return
    const node = paneRef.current
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    const ta = node.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
    ta?.focus()
  }, [focusReq, terminal.id])

  const setActiveTab = useProjectsStore((s) => s.setActiveTab)
  const closeSubTab = useProjectsStore((s) => s.closeSubTab)
  const setTerminalDisabled = useProjectsStore((s) => s.setTerminalDisabled)
  const markTerminalUsed = useProjectsStore((s) => s.markTerminalUsed)
  const setSubTabPtyId = useProjectsStore((s) => s.setSubTabPtyId)
  const setSubTabSessionId = useProjectsStore((s) => s.setSubTabSessionId)
  const setSubTabCompletionUnread = useProjectsStore((s) => s.setSubTabCompletionUnread)
  const setProjectGridLayout = useProjectsStore((s) => s.setProjectGridLayout)
  const openModal = useUiStore((s) => s.openModal_)
  const setFocusedTerminal = useUiStore((s) => s.setFocusedTerminal)
  const setActiveTerminal = useUiStore((s) => s.setActiveTerminal)
  const setPreferences = useProjectsStore((s) => s.setPreferences)
  const terminalTheme = useProjectsStore(
    (s) => s.preferences.terminalTheme ?? s.preferences.uiTheme,
  )
  // Backend de terminal nativo (Ghostty) — só no macOS e quando opt-in. Em
  // qualquer outro caso, segue no xterm.js (caminho atual, intocado).
  const nativeTerminalMacos = useProjectsStore(
    (s) => s.preferences.nativeTerminalMacos ?? false,
  )
  const useNativeBackend = shouldUseNativeBackend(nativeTerminalMacos)

  // Resize de span no grid do PROJETO (quando project.layoutMode === 'grid').
  const projectGrid = useProjectsStore((s) => {
    const p = s.projects.find((p) => p.id === projectId)
    if (!p || p.layoutMode !== 'grid' || !p.gridLayout) return null
    return p.gridLayout
  })
  const showGridResize = Boolean(projectGrid) && !isFocusMode && !terminal.disabled && !preview
  const startGridResize = useGridResize(terminal.id, projectGrid, (layout) =>
    setProjectGridLayout(projectId, layout),
  )

  const activeTab: SubTab | undefined = useMemo(
    () => terminal.tabs.find((tab) => tab.id === terminal.activeTabId) ?? terminal.tabs[0],
    [terminal.tabs, terminal.activeTabId],
  )

  const effectiveLaneVisible =
    terminal.tabs.length > 1 ? true : terminal.laneVisible === true

  const ptyRuntime = useTerminalsStore((s) =>
    activeTab?.ptyId ? s.byPtyId[activeTab.ptyId] ?? null : null,
  )
  const status = ptyRuntime?.status ?? 'waiting'
  const ptyExited = ptyRuntime !== null && !ptyRuntime.alive
  const ptyParked = ptyRuntime?.parked === true

  const onRestart = async () => {
    if (!activeTab?.ptyId) return
    if (ptyParked) {
      setResumeNonce((value) => value + 1)
      return
    }
    const ptyId = activeTab.ptyId
    const preparedRuntime = preparePtyRuntimeLaunch(
      activeTab.type,
      activeTab.runtimeProfile,
      activeTab.extraArgs ?? [],
    )
    const launch = buildAgentLaunch(
      activeTab.type,
      preparedRuntime.args,
      activeTab.sessionId,
    )
    if (launch.sessionId && launch.sessionId !== activeTab.sessionId) {
      setSubTabSessionId(projectId, terminal.id, activeTab.id, launch.sessionId)
    }
    // Marca início do restart pra ignorar o exit event do PTY antigo (chega async).
    useTerminalsStore.getState().beginRestart(ptyId)
    try {
      await restartPty({
        id: ptyId,
        cols: 80,
        rows: 24,
        command: activeTab.type === 'shell' ? undefined : activeTab.type,
        cwd: activeTab.cwd || undefined,
        extraArgs: launch.args,
        env: preparedRuntime.env,
      })
      window.dispatchEvent(new CustomEvent('alethe:terminal-resize-request', { detail: { ptyId } }))
    } catch (err) {
      console.error('restart pty falhou', err)
    }
  }

  const onDisable = () => setTerminalDisabled(projectId, terminal.id, !terminal.disabled)

  const cwd = activeTab?.cwd?.trim() || terminal.cwd?.trim() || ''

  const dropTarget = canDragPane && droppable.isOver
  const dragging = canDragPane && draggable.isDragging
  const openInspector = () => {
    setActiveTerminal(projectId, terminal.id)
    setPreferences({ rightSidebarVisible: true })
  }

  return (
    <div
      ref={setRefs}
      data-pane-box="1"
      onPointerDown={() => {
        markTerminalUsed(projectId, terminal.id)
        setActiveTerminal(projectId, terminal.id)
      }}
      className={`${styles.pane} ${isFocusMode ? styles.paneFocus : ''} ${terminal.disabled ? styles.disabled : ''} ${dragging ? styles.dragging : ''} ${dropTarget ? styles.dropTarget : ''}`}
    >
      <header className={styles.header}>
        <div className={styles.headLeft}>
          {canDragPane ? (
            <button
              type="button"
              className={`${styles.action} ${styles.gripBtn}`}
              {...draggable.attributes}
              {...draggable.listeners}
              title={t('ui.terminal.dragToReorder')}
              aria-label={t('ui.terminal.dragToReorder')}
            >
              <GripVertical size={12} />
            </button>
          ) : null}
          <span className={styles.iconWrap}>
            {activeTab ? (
              <AgentIcon type={activeTab.type} size={16} theme={terminalTheme} />
            ) : null}
          </span>
          <div className={styles.identity}>
            <span className={styles.name} title={terminal.name}>
              {terminal.name}
            </span>
          </div>
        </div>

        {!preview ? (
        <div className={styles.headRight}>
          <span
            className={`${styles.statusPill} ${styles[`status_${status}`] ?? ''}`}
            title={status}
          />
          <div className={styles.actions}>
            {isFocusMode ? (
              <button
                type="button"
                className={styles.action}
                onClick={() => setFocusedTerminal(null)}
                title={t('ui.terminal.exitFocusModeEsc')}
                aria-label={t('ui.terminal.exitFocusMode')}
              >
                <Minimize2 size={12} />
              </button>
            ) : null}
            <button
              type="button"
              className={styles.action}
              onClick={openInspector}
              title={t('terminalInspector.open')}
              aria-label={t('terminalInspector.open')}
            >
              <MoreHorizontal size={12} />
            </button>
          </div>
        </div>
        ) : null}
      </header>

      <div className={styles.body}>
        {effectiveLaneVisible && !preview ? (
          <SubTabsLane
            tabs={terminal.tabs}
            activeTabId={terminal.activeTabId}
            onActivate={(id) => setActiveTab(projectId, terminal.id, id)}
            onClose={(id) => closeSubTab(projectId, terminal.id, id)}
            onAdd={() => openModal('newSubTab', { projectId, terminalId: terminal.id })}
          />
        ) : null}

        <div className={styles.terminalArea}>
          {terminal.disabled ? (
            <DisabledOverlay
              terminalName={terminal.name}
              cwd={cwd}
              agentType={activeTab?.type ?? 'shell'}
              terminalTheme={terminalTheme}
              onReactivate={onDisable}
            />
          ) : activeTab ? (
            <>
              {useNativeBackend ? (
                <GhosttySurface
                  key={`${activeTab.id}:${resumeNonce}`}
                  surfaceId={activeTab.id}
                  cwd={activeTab.cwd?.trim() || terminal.cwd?.trim() || undefined}
                  command={buildGhosttyCommand(activeTab.type, activeTab.extraArgs)}
                  onSpawned={(id) => {
                    if (activeTab.ptyId !== id) {
                      setSubTabPtyId(projectId, terminal.id, activeTab.id, id)
                    }
                  }}
                />
              ) : (
                <XTermView
                  key={activeTab.id}
                  projectId={projectId}
                  ptyId={activeTab.ptyId ?? activeTab.id}
                  command={activeTab.type === 'shell' ? null : activeTab.type}
                  cwd={activeTab.cwd || null}
                  extraArgs={activeTab.extraArgs}
                  runtimeProfile={activeTab.runtimeProfile}
                  sessionId={activeTab.sessionId}
                  terminalTheme={terminalTheme}
                  onSpawned={(id) => {
                    if (activeTab.ptyId !== id) {
                      setSubTabPtyId(projectId, terminal.id, activeTab.id, id)
                    }
                  }}
                  onSessionId={(sessionId) => {
                    if (activeTab.sessionId !== sessionId) {
                      setSubTabSessionId(projectId, terminal.id, activeTab.id, sessionId)
                    }
                  }}
                  onAgentComplete={() =>
                    setSubTabCompletionUnread(projectId, terminal.id, activeTab.id, true)
                  }
                />
              )}
              {ptyExited && !useNativeBackend ? (
                <div className={styles.exitedOverlay}>
                  <RefreshCw size={24} style={{ opacity: 0.5 }} />
                  <span className={styles.exitedLabel}>
                    {ptyParked ? t('ui.terminal.runtimeParked') : t('ui.terminal.processEnded')}
                  </span>
                  <button
                    type="button"
                    className={styles.restartBtn}
                    onClick={() => void onRestart()}
                  >
                    {ptyParked ? t('ui.terminal.resume') : t('ui.terminal.restart')}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.empty}>
              <X size={20} />
              <span>{t('ui.terminal.noTab')}</span>
            </div>
          )}
        </div>
      </div>

      {showGridResize ? (
        <div
          className={styles.gridResize}
          onPointerDown={startGridResize}
          title={t('ui.terminal.dragToResizeSpan')}
        />
      ) : null}

    </div>
  )
})

function DisabledOverlay({
  terminalName,
  cwd,
  agentType,
  terminalTheme,
  onReactivate,
}: {
  terminalName: string
  cwd: string
  agentType: AgentType
  terminalTheme: Theme
  onReactivate: () => void
}) {
  const t = useT()
  return (
    <div className={styles.disabledOverlay}>
      <div className={styles.disabledIcon}>
        <AgentIcon type={agentType} size={56} theme={terminalTheme} />
      </div>
      <div className={styles.disabledName}>{terminalName}</div>
      {cwd ? <div className={styles.disabledCwd}>{cwd}</div> : null}
      <button type="button" className={styles.reactivateBtn} onClick={onReactivate}>
        {t('ui.sidebar.reactivate')}
      </button>
    </div>
  )
}

