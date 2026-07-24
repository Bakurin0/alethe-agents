import { getCurrentWebview } from '@tauri-apps/api/webview'
import { Bell, X } from 'lucide-react'
import { lazy, Suspense, type CSSProperties, useEffect } from 'react'
import { Group as PanelGroup, Panel, Separator } from 'react-resizable-panels'

import { ghosttyKillAll } from './lib/tauri'

import { AgentIcon } from './components/icons/AgentIcons'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FocusOverlay } from './components/FocusOverlay'
import { LinkViewerOverlay } from './components/LinkViewerOverlay'
import { DictationButton } from './components/DictationButton'
import { MainMenu } from './components/MainMenu'
import { ProjectSidebar } from './components/ProjectSidebar'
import { TitleBar } from './components/TitleBar'
import { RightSidebar } from './components/RightSidebar'
import { TokenHud } from './components/TokenHud'
import { WorkspaceView } from './components/WorkspaceView'
import { FindJumpModal } from './components/modals/FindJumpModal'
import { EditGroupModal } from './components/modals/EditGroupModal'
import { EditProjectModal } from './components/modals/EditProjectModal'
import { NewGroupModal } from './components/modals/NewGroupModal'
import { NewProjectModal } from './components/modals/NewProjectModal'
import { NewSubTabModal } from './components/modals/NewSubTabModal'
import { NewTerminalModal } from './components/modals/NewTerminalModal'
import { AddContentModal } from './components/modals/AddContentModal'
import { AiUsageModal } from './components/modals/AiUsageModal'
import { OnboardingModal } from './components/modals/OnboardingModal'
import { ProfilesModal } from './components/modals/ProfilesModal'
import { PreferencesModal } from './components/modals/PreferencesModal'
import { SyncModal } from './components/modals/SyncModal'
import { SuspendGroupModal } from './components/modals/SuspendGroupModal'
import { ThemePickerModal } from './components/modals/ThemePickerModal'
import { TodoSettingsModal } from './components/modals/TodoSettingsModal'
import { TopbarSettingsModal } from './components/modals/TopbarSettingsModal'
import { UpdateModal } from './components/modals/UpdateModal'
import { WelcomeModal } from './components/modals/WelcomeModal'
import { useKeybindings } from './hooks/useKeybindings'
import { useDiscordPresence } from './hooks/useDiscordPresence'
import { useCloseConfirmation } from './hooks/useCloseConfirmation'
import { useResourceSupervisor } from './hooks/useResourceSupervisor'
import { startActivityTracker } from './lib/activityTracker'
import { intlLocale, translate } from './lib/i18n'
import { setMaxConcurrentSpawns } from './lib/spawnQueue'
import { getLastCrashReport } from './lib/tauri'
import { checkForUpdate } from './lib/updater'
import { useProjectsStore } from './stores/projectsStore'
import { type InAppToast, useUiStore } from './stores/uiStore'
import styles from './App.module.css'
import logoLoading from './assets/logo-loading.png'

const AgentCanvasPOC = lazy(() =>
  import('./components/AgentCanvasPOC').then((module) => ({ default: module.AgentCanvasPOC })),
)
const HomeView = lazy(() =>
  import('./components/HomeView').then((module) => ({ default: module.HomeView })),
)
const LayoutDesignerModal = lazy(() =>
  import('./components/modals/LayoutDesignerModal').then((module) => ({
    default: module.LayoutDesignerModal,
  })),
)
const MemoryAnalyticsModal = lazy(() =>
  import('./components/modals/MemoryAnalyticsModal').then((module) => ({
    default: module.MemoryAnalyticsModal,
  })),
)

function LoadingScreen() {
  return (
    <div className={styles.loadingScreen}>
      <img className={styles.loadingMark} src={logoLoading} alt="Alethe" />
    </div>
  )
}

function ToastItem({ toast }: { toast: InAppToast }) {
  const dismissToast = useUiStore((s) => s.dismissToast)
  const uiTheme = useProjectsStore((s) => s.preferences.uiTheme)

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), 6500)
    return () => window.clearTimeout(timer)
  }, [dismissToast, toast.id])

  const accentStyle = {
    '--toast-accent': toast.agent ? `var(--agent-${toast.agent})` : 'var(--accent)',
  } as CSSProperties

  return (
    <div className={styles.toast} role="status" style={accentStyle}>
      <div className={styles.toastIcon} aria-hidden>
        {toast.agent ? (
          <AgentIcon type={toast.agent} size={16} theme={uiTheme} />
        ) : (
          <Bell size={14} />
        )}
      </div>
      <div className={styles.toastText}>
        <strong>{toast.title}</strong>
        <span>{toast.body}</span>
      </div>
      <button
        type="button"
        className={styles.toastClose}
        onClick={() => dismissToast(toast.id)}
        aria-label="Fechar notificação"
        title="Fechar"
      >
        <X size={14} />
      </button>
    </div>
  )
}

function InAppNotifications() {
  const toasts = useUiStore((s) => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div className={styles.toastStack} aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

export default function App() {
  const hydrate = useProjectsStore((s) => s.hydrate)
  const hydrated = useProjectsStore((s) => s.hydrated)
  const uiTheme = useProjectsStore((s) => s.preferences.uiTheme)
  const uiZoom = useProjectsStore((s) => s.preferences.uiZoom)
  const language = useProjectsStore((s) => s.preferences.language)
  const spawnConcurrency = useProjectsStore((s) => s.preferences.spawnConcurrency)
  const activeView = useUiStore((s) => s.activeView)
  const openModal = useUiStore((s) => s.openModal)
  const leftSidebarVisible = useProjectsStore((s) => s.preferences.leftSidebarVisible)
  const rightSidebarVisible = useProjectsStore((s) => s.preferences.rightSidebarVisible)
  const leftSidebarWidth = useProjectsStore((s) => s.preferences.leftSidebarWidth)
  const rightSidebarWidth = useProjectsStore((s) => s.preferences.rightSidebarWidth)
  const todoEnabled = useProjectsStore((s) => s.preferences.enabledFeatures.todos)
  const setPreferences = useProjectsStore((s) => s.setPreferences)

  useKeybindings()
  useDiscordPresence()
  useCloseConfirmation()
  useResourceSupervisor(hydrated)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // No boot/reload da WebView, mata surfaces nativas órfãs do Ghostty: o JS é
  // recriado mas as NSViews/o app Ghostty persistem no backend. Sem isto, a cada
  // reload sobra uma surface antiga empilhada que rouba o foco do teclado — e
  // você digita sem nada aparecer. Roda UMA vez, antes de qualquer GhosttySurface.
  useEffect(() => {
    void ghosttyKillAll().catch(() => {
      /* não-macOS ou sem libghostty: no-op */
    })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme
  }, [uiTheme])

  useEffect(() => {
    document.documentElement.lang = language === 'pt-BR' ? 'pt-BR' : 'en'
  }, [language])

  useEffect(() => {
    setMaxConcurrentSpawns(spawnConcurrency)
  }, [spawnConcurrency])

  useEffect(() => {
    if (!hydrated) return
    document.documentElement.dataset.zoom = String(uiZoom)
    void getCurrentWebview()
      .setZoom(uiZoom)
      .catch(() => {
        /* setZoom exige permissão Tauri em runtime; em testes/browser puro pode falhar. */
      })
      .finally(() => {
        window.dispatchEvent(new CustomEvent('alethe:zoom-changed', { detail: { zoom: uiZoom } }))
      })
  }, [hydrated, uiZoom])

  useEffect(() => {
    if (!hydrated) return
    const { preferences, setPreferences } = useProjectsStore.getState()
    if (preferences.firstLaunchAt === null) {
      setPreferences({ firstLaunchAt: Date.now() })
    }
    if (preferences.accountCreated && preferences.onboardingDone) {
      useUiStore.getState().openModal_('welcome')
    }
    useUiStore.getState().setActiveView(preferences.alwaysStartOnHome ? 'home' : 'workspace')
  }, [hydrated])

  useEffect(() => {
    if (!hydrated) return
    return startActivityTracker()
  }, [hydrated])

  // Checa atualização em silêncio no boot. Se houver, o chip discreto na sidebar
  // aparece (SidebarUpdate); nada de popup. Erros (dev sem assinatura, offline,
  // endpoint fora) são engolidos — updater indisponível = "sem update".
  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    void checkForUpdate()
      .then((info) => {
        if (!cancelled) useUiStore.getState().setUpdateInfo(info)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hydrated])

  // Se a sessão anterior não saiu limpa (crash/OOM/kill), avisa com o estado de
  // memória de quando caiu — diagnóstico de "o que matou o app".
  useEffect(() => {
    if (!hydrated) return
    void getLastCrashReport()
      .then((report) => {
        if (!report) return
        const lang = useProjectsStore.getState().preferences.language
        const when = new Date(report.last_heartbeat_ms || report.started_at_ms)
        useUiStore.getState().pushToast({
          title: translate(lang, 'crash.uncleanTitle'),
          body: translate(lang, 'crash.uncleanBody', {
            total: Math.round(report.total_mb),
            procs: report.process_count,
            time: when.toLocaleTimeString(intlLocale(lang)),
          }),
        })
      })
      .catch(() => {})
  }, [hydrated])

  if (!hydrated) {
    return <LoadingScreen />
  }

  return (
    <>
      <div className={styles.appShell}>
        <TitleBar />
        <PanelGroup orientation="horizontal" className={styles.shellBody}>
          {leftSidebarVisible ? (
            <>
              <Panel
                id="alethe-left-sidebar"
                defaultSize={`${leftSidebarWidth}px`}
                minSize="220px"
                maxSize="380px"
                groupResizeBehavior="preserve-pixel-size"
                onResize={(size, _id, previous) => {
                  if (previous && Math.abs(size.inPixels - previous.inPixels) >= 1) {
                    setPreferences({ leftSidebarWidth: Math.round(size.inPixels) })
                  }
                }}
              >
                <ProjectSidebar />
              </Panel>
              <Separator className={styles.shellSeparator} />
            </>
          ) : null}

          <Panel id="alethe-main" minSize="360px">
            <main className={styles.mainView}>
              <ErrorBoundary label="view">
                <Suspense fallback={<LoadingScreen />}>
                  {activeView === 'home' ? (
                    <HomeView />
                  ) : activeView === 'agentCanvas' ? (
                    <AgentCanvasPOC />
                  ) : (
                    <WorkspaceView />
                  )}
                </Suspense>
              </ErrorBoundary>
            </main>
          </Panel>

          {todoEnabled && rightSidebarVisible ? (
            <>
              <Separator className={styles.shellSeparator} />
              <Panel
                id="alethe-todo-sidebar"
                defaultSize={`${rightSidebarWidth}px`}
                minSize="260px"
                maxSize="420px"
                groupResizeBehavior="preserve-pixel-size"
                onResize={(size, _id, previous) => {
                  if (previous && Math.abs(size.inPixels - previous.inPixels) >= 1) {
                    setPreferences({ rightSidebarWidth: Math.round(size.inPixels) })
                  }
                }}
              >
                <RightSidebar />
              </Panel>
            </>
          ) : null}
        </PanelGroup>
      </div>
      <FocusOverlay />
      <LinkViewerOverlay />
      <DictationButton />
      <MainMenu />
      <ErrorBoundary label="modals">
      <NewProjectModal />
      <NewGroupModal />
      <EditGroupModal />
      <EditProjectModal />
      <NewTerminalModal />
      <AddContentModal />
      <NewSubTabModal />
      <PreferencesModal />
      <ProfilesModal />
      <SyncModal />
      <FindJumpModal />
      <OnboardingModal />
      <WelcomeModal />
      {openModal === 'layoutDesigner' ? (
        <Suspense fallback={null}>
          <LayoutDesignerModal />
        </Suspense>
      ) : null}
      <SuspendGroupModal />
      {openModal === 'memoryAnalytics' ? (
        <Suspense fallback={null}>
          <MemoryAnalyticsModal />
        </Suspense>
      ) : null}
      <ThemePickerModal />
      <TodoSettingsModal />
      <TopbarSettingsModal />
      <AiUsageModal />
      <UpdateModal />
      </ErrorBoundary>
      <InAppNotifications />
      {activeView === 'agentCanvas' ? <TokenHud /> : null}
    </>
  )
}
