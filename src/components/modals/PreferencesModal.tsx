import * as Dialog from '@radix-ui/react-dialog'
import {
  Check,
  Blocks,
  ChevronRight,
  GitBranch,
  ListTodo,
  Minus,
  Palette,
  Plug,
  Plus,
  RotateCcw,
  Search,
  TerminalSquare,
  UserRound,
  X,
  Activity,
  Info,
  DownloadCloud,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { checkForUpdate, installPendingUpdate } from '../../lib/updater'

import { AgentIcon } from '../icons/AgentIcons'
import { FEATURES } from '../../lib/features'
import { LOCALES, useT } from '../../lib/i18n'
import { isMacOS } from '../../lib/platform'
import { getProfileImageUrl, getProfileInitial } from '../../lib/profile'
import { THEME_OPTIONS, themeDescription, themeLabel } from '../../lib/themes'
import {
  SPAWN_CONCURRENCY_LIMITS,
  UI_ZOOM_LIMITS,
  useProjectsStore,
} from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { countLiveResumablePanes, resetLastSession } from '../../lib/resetLastSession'
import type { AgentType } from '../../lib/types'
import { ImageInput } from './ImageInput'
import { useSchedulerStore } from '../../stores/schedulerStore'
import {
  getTelemetryMetrics,
  getTelemetryTraces,
  pluginsList,
  pluginInstall,
  pluginUninstall,
  getPlanningAutocommit,
  setPlanningAutocommit,
  planningAuditHistory,
} from '../../lib/tauri'
import type { EventBusPayload, MetricData, PluginManifest, PlanningCommit } from '../../lib/tauri'
import controls from './controls.module.css'
import styles from './PreferencesModal.module.css'

type CategoryId =
  'account' | 'appearance' | 'features' | 'terminal' | 'integrations' | 'multiagent' | 'about'

type Category = {
  id: CategoryId
  label: string
  description: string
  Icon: LucideIcon
}

type SearchItem = {
  category: CategoryId
  target: string
  label: string
  description: string
  keywords: string
}

const AGENTS: { id: AgentType; label: string }[] = [
  { id: 'shell', label: 'Shell' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'freebuff', label: 'Freebuff' },
  { id: 'mimo', label: 'Mimo Code' },
]

const FEATURE_ICONS = {
  todos: ListTodo,
  git: GitBranch,
} as const

export function PreferencesModal() {
  const t = useT()
  const open = useUiStore((state) => state.openModal === 'preferences')
  const closeModal = useUiStore((state) => state.closeModal)
  const openModal = useUiStore((state) => state.openModal_)
  const modalContext = useUiStore((state) => state.modalContext)
  const preferences = useProjectsStore((state) => state.preferences)
  const [category, setCategory] = useState<CategoryId>('account')
  const [query, setQuery] = useState('')
  const [resultCursor, setResultCursor] = useState(0)
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const categories = useMemo<Category[]>(
    () => [
      {
        id: 'account',
        label: t('prefs.categoryAccount'),
        description: t('prefs.categoryAccountDesc'),
        Icon: UserRound,
      },
      {
        id: 'appearance',
        label: t('prefs.categoryAppearance'),
        description: t('prefs.categoryAppearanceDesc'),
        Icon: Palette,
      },
      {
        id: 'features',
        label: t('prefs.features'),
        description: t('prefs.featuresDesc'),
        Icon: Blocks,
      },
      {
        id: 'terminal',
        label: t('prefs.categoryTerminal'),
        description: t('prefs.categoryTerminalDesc'),
        Icon: TerminalSquare,
      },
      {
        id: 'integrations',
        label: t('prefs.categoryIntegrations'),
        description: t('prefs.categoryIntegrationsDesc'),
        Icon: Plug,
      },
      {
        id: 'multiagent',
        label: 'Multi-Agent & Telemetry',
        description: 'Real-time metrics, event traces, and structured logs.',
        Icon: Activity,
      },
      {
        id: 'about',
        label: t('prefs.categoryAbout'),
        description: t('prefs.categoryAboutDesc'),
        Icon: Info,
      },
    ],
    [t],
  )

  const searchItems = useMemo<SearchItem[]>(
    () => [
      {
        category: 'account',
        target: 'profile',
        label: t('prefs.profile'),
        description: t('prefs.profileDesc'),
        keywords: 'avatar photo name nome perfil account conta',
      },
      {
        category: 'account',
        target: 'language',
        label: t('prefs.language'),
        description: t('prefs.languageDesc'),
        keywords: 'language idioma português english',
      },
      {
        category: 'account',
        target: 'local-accounts',
        label: t('prefs.localAccounts'),
        description: t('prefs.localAccountsDesc'),
        keywords: 'account profile conta perfil local switch trocar',
      },
      {
        category: 'appearance',
        target: 'ui-theme',
        label: t('prefs.uiTheme'),
        description: t('prefs.uiThemeDesc'),
        keywords: 'theme tema colors cores light dark claro escuro',
      },
      {
        category: 'appearance',
        target: 'ui-zoom',
        label: t('prefs.uiZoom'),
        description: t('prefs.uiZoomDesc'),
        keywords: 'zoom scale escala tamanho interface',
      },
      {
        category: 'appearance',
        target: 'window-opacity',
        label: t('prefs.windowOpacity'),
        description: t('prefs.windowOpacityDesc'),
        keywords: 'opacity opacidade transparency transparência desktop window janela',
      },
      {
        category: 'features',
        target: 'optional-features',
        label: t('prefs.features'),
        description: t('prefs.featuresDesc'),
        keywords: 'features recursos modules módulos todo task tarefa git source control sidebar',
      },
      {
        category: 'terminal',
        target: 'terminal-theme',
        label: t('prefs.terminalTheme'),
        description: t('prefs.terminalThemeDesc'),
        keywords: 'terminal theme tema colors cores',
      },
      {
        category: 'terminal',
        target: 'resource-policy',
        label: t('prefs.resourcePolicy'),
        description: t('prefs.resourcePolicyDesc'),
        keywords: 'memory ram performance budget limit lru suspend memória desempenho limite',
      },
      {
        category: 'terminal',
        target: 'spawn-concurrency',
        label: t('prefs.spawnConcurrency'),
        description: t('prefs.spawnConcurrencyDesc'),
        keywords: 'spawn concurrency parallel paralelo fila queue performance pty',
      },
      {
        category: 'terminal',
        target: 'agents',
        label: t('prefs.agentsTitle'),
        description: t('prefs.agentsDesc'),
        keywords: 'agents agentes claude codex opencode shell',
      },
      {
        category: 'terminal',
        target: 'reset-session',
        label: t('prefs.resetSession'),
        description: t('prefs.resetSessionDesc'),
        keywords:
          'reset session resume retomar resetar sessão última last recover recuperar resume crash boot',
      },
      {
        category: 'integrations',
        target: 'spotify',
        label: t('prefs.spotify'),
        description: t('prefs.spotifyDesc'),
        keywords: 'spotify music música client id secret',
      },
      {
        category: 'integrations',
        target: 'discord',
        label: t('prefs.discordPresence'),
        description: t('prefs.discordPresenceHint'),
        keywords: 'discord rich presence status integração',
      },
      {
        category: 'integrations',
        target: 'dictation',
        label: t('prefs.dictation'),
        description: t('prefs.dictationDesc'),
        keywords: 'dictation voice mic microphone ditado voz microfone handy speech',
      },
      {
        category: 'about',
        target: 'app-version',
        label: t('prefs.aboutVersionTitle'),
        description: t('prefs.aboutVersionDesc'),
        keywords: 'version versão about sobre build info app',
      },
      {
        category: 'about',
        target: 'app-updates',
        label: t('prefs.aboutUpdatesTitle'),
        description: t('prefs.aboutUpdatesDesc'),
        keywords: 'update atualização atualizar upgrade nova versão release check',
      },
    ],
    [t],
  )

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(preferences.language)
    if (!normalized) return []
    return searchItems.filter((item) =>
      `${item.label} ${item.description} ${item.keywords}`
        .toLocaleLowerCase(preferences.language)
        .includes(normalized),
    )
  }, [preferences.language, query, searchItems])

  const activeCategory = categories.find((item) => item.id === category) ?? categories[0]
  const avatarUrl = getProfileImageUrl(preferences)
  const displayName = preferences.displayName || t('profile.fallbackName')
  const initial = getProfileInitial(displayName)
  const enabledCount = Object.values(preferences.enabledAgents).filter(Boolean).length

  useEffect(() => {
    if (!open) return
    const initial = (modalContext?.category as CategoryId) ?? 'account'
    setCategory(initial)
    setQuery('')
    setResultCursor(0)
    setPendingTarget(null)
  }, [open, modalContext])

  useEffect(() => {
    setResultCursor(0)
  }, [query])

  useEffect(() => {
    if (!pendingTarget) return
    const frame = window.requestAnimationFrame(() => {
      const target = contentRef.current?.querySelector<HTMLElement>(
        `[data-setting-id="${pendingTarget}"]`,
      )
      target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      target?.focus({ preventScroll: true })
      setPendingTarget(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [category, pendingTarget])

  const openSearchResult = (item: SearchItem) => {
    setCategory(item.category)
    setPendingTarget(item.target)
    setQuery('')
  }

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault()
      setResultCursor((cursor) => (cursor + 1) % results.length)
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault()
      setResultCursor((cursor) => (cursor - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && results[resultCursor]) {
      event.preventDefault()
      openSearchResult(results[resultCursor])
    } else if (event.key === 'Escape' && query) {
      event.preventDefault()
      event.stopPropagation()
      setQuery('')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && closeModal()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          ref={dialogRef}
          className={styles.dialog}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const input =
              dialogRef.current?.querySelector<HTMLInputElement>('[data-settings-search]')
            input?.focus()
          }}
        >
          <Dialog.Title className={styles.srOnly}>{t('prefs.title')}</Dialog.Title>

          <aside className={styles.sidebar}>
            <button
              type="button"
              className={styles.profileButton}
              onClick={() => setCategory('account')}
            >
              <Avatar url={avatarUrl} initial={initial} />
              <span className={styles.profileCopy}>
                <strong>{displayName}</strong>
                <span>{t('prefs.editProfile')}</span>
              </span>
              <ChevronRight size={14} />
            </button>

            <div className={styles.searchWrap}>
              <Search size={15} aria-hidden />
              <input
                data-settings-search
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={t('prefs.searchPlaceholder')}
                aria-label={t('prefs.searchPlaceholder')}
                aria-expanded={Boolean(query)}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('prefs.clearSearch')}
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>

            {query ? (
              <div className={styles.searchResults} role="listbox">
                {results.length > 0 ? (
                  results.map((item, index) => (
                    <button
                      key={`${item.category}:${item.target}`}
                      type="button"
                      role="option"
                      aria-selected={index === resultCursor}
                      className={index === resultCursor ? styles.searchResultActive : undefined}
                      onMouseEnter={() => setResultCursor(index)}
                      onClick={() => openSearchResult(item)}
                    >
                      <strong>{item.label}</strong>
                      <span>{categories.find((entry) => entry.id === item.category)?.label}</span>
                    </button>
                  ))
                ) : (
                  <div className={styles.searchEmpty}>{t('prefs.noSearchResults')}</div>
                )}
              </div>
            ) : (
              <nav className={styles.nav} aria-label={t('prefs.title')}>
                <span className={styles.navLabel}>{t('prefs.settingsLabel')}</span>
                {categories.map(({ id, label, description, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={category === id ? styles.navActive : undefined}
                    aria-current={category === id ? 'page' : undefined}
                    onClick={() => {
                      setCategory(id)
                      contentRef.current?.scrollTo({ top: 0 })
                    }}
                  >
                    <Icon size={16} />
                    <span className={styles.navCopy}>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </button>
                ))}
              </nav>
            )}
          </aside>

          <main className={styles.main}>
            <header className={styles.header}>
              <div>
                <h1>{activeCategory.label}</h1>
                <p>{activeCategory.description}</p>
              </div>
              <Dialog.Close asChild>
                <button type="button" className={styles.close} aria-label={t('common.close')}>
                  <X size={18} />
                </button>
              </Dialog.Close>
            </header>

            <div ref={contentRef} className={styles.content}>
              <div className={styles.contentInner}>
                {category === 'account' ? (
                  <AccountPage
                    avatarUrl={avatarUrl}
                    initial={initial}
                    onManageAccounts={() => openModal('profiles')}
                  />
                ) : null}
                {category === 'appearance' ? <AppearancePage /> : null}
                {category === 'features' ? <FeaturesPage /> : null}
                {category === 'terminal' ? <TerminalPage enabledCount={enabledCount} /> : null}
                {category === 'integrations' ? <IntegrationsPage /> : null}
                {category === 'multiagent' ? <MultiagentPage /> : null}
                {category === 'about' ? <AboutPage /> : null}
              </div>
            </div>
          </main>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AccountPage({
  avatarUrl,
  initial,
  onManageAccounts,
}: {
  avatarUrl: string | null
  initial: string
  onManageAccounts: () => void
}) {
  const t = useT()
  const preferences = useProjectsStore((state) => state.preferences)
  const setLanguage = useProjectsStore((state) => state.setLanguage)
  const setPreferences = useProjectsStore((state) => state.setPreferences)

  return (
    <>
      <SettingsSection id="profile" title={t('prefs.profile')} description={t('prefs.profileDesc')}>
        <div className={styles.profileEditor}>
          <Avatar url={avatarUrl} initial={initial} large />
          <div className={styles.profileFields}>
            <label>
              <span>{t('prefs.displayName')}</span>
              <input
                className={controls.input}
                value={preferences.displayName}
                onChange={(event) => setPreferences({ displayName: event.target.value })}
                placeholder={t('prefs.namePlaceholder')}
                maxLength={60}
              />
            </label>
            <ImageInput
              label={t('prefs.profilePhoto')}
              value={preferences.profileImageUrl}
              onChange={(profileImageUrl) => setPreferences({ profileImageUrl })}
              placeholder={t('prefs.photoPlaceholder')}
              hint={t('image.urlOrUpload')}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="language"
        title={t('prefs.language')}
        description={t('prefs.languageDesc')}
      >
        <div className={styles.choiceGrid}>
          {LOCALES.map((locale) => (
            <button
              key={locale.id}
              type="button"
              className={preferences.language === locale.id ? styles.choiceActive : undefined}
              onClick={() => setLanguage(locale.id)}
            >
              <span>{locale.nativeName}</span>
              {preferences.language === locale.id ? <Check size={16} /> : null}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        id="local-accounts"
        title={t('prefs.localAccounts')}
        description={t('prefs.localAccountsDesc')}
      >
        <button type="button" className={styles.secondaryButton} onClick={onManageAccounts}>
          <UserRound size={15} />
          {t('profile.manageAccounts')}
          <ChevronRight size={15} />
        </button>
      </SettingsSection>
    </>
  )
}

function AppearancePage() {
  const t = useT()
  const preferences = useProjectsStore((state) => state.preferences)
  const setUiTheme = useProjectsStore((state) => state.setUiTheme)
  const setUiZoom = useProjectsStore((state) => state.setUiZoom)
  const setPreferences = useProjectsStore((state) => state.setPreferences)
  return (
    <>
      <SettingsSection
        id="ui-theme"
        title={t('prefs.uiTheme')}
        description={t('prefs.uiThemeDesc')}
      >
        <div className={styles.themeGrid}>
          {THEME_OPTIONS.map((theme) => {
            const active = preferences.uiTheme === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                className={active ? styles.themeActive : undefined}
                onClick={() => setUiTheme(theme.id)}
              >
                <span className={styles.swatches} aria-hidden>
                  {theme.colors.map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </span>
                <span className={styles.themeName}>
                  <strong>{themeLabel(t, theme.id)}</strong>
                  {active ? <Check size={15} /> : null}
                </span>
                <span>{themeDescription(t, theme.id)}</span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection id="ui-zoom" title={t('prefs.uiZoom')} description={t('prefs.uiZoomDesc')}>
        <div className={styles.zoomControl}>
          <button
            type="button"
            onClick={() => setUiZoom(preferences.uiZoom - UI_ZOOM_LIMITS.step)}
            disabled={preferences.uiZoom <= UI_ZOOM_LIMITS.min}
            aria-label={t('prefs.zoomDecrease')}
          >
            <Minus size={15} />
          </button>
          <strong>{Math.round(preferences.uiZoom * 100)}%</strong>
          <button
            type="button"
            onClick={() => setUiZoom(preferences.uiZoom + UI_ZOOM_LIMITS.step)}
            disabled={preferences.uiZoom >= UI_ZOOM_LIMITS.max}
            aria-label={t('prefs.zoomIncrease')}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => setUiZoom(1)}
            disabled={preferences.uiZoom === 1}
            aria-label={t('prefs.zoomReset')}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        id="window-opacity"
        title={t('prefs.windowOpacity')}
        description={t('prefs.windowOpacityDesc')}
      >
        <div className={styles.opacityControl}>
          <input
            type="range"
            min="60"
            max="100"
            step="5"
            value={Math.round(preferences.windowOpacity * 100)}
            onChange={(event) =>
              setPreferences({ windowOpacity: Number(event.target.value) / 100 })
            }
            aria-label={t('prefs.windowOpacity')}
          />
          <strong>{Math.round(preferences.windowOpacity * 100)}%</strong>
          <button
            type="button"
            onClick={() => setPreferences({ windowOpacity: 1 })}
            disabled={preferences.windowOpacity === 1}
            aria-label={t('prefs.opacityReset')}
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <p className={styles.experimentalHint}>{t('prefs.windowOpacityHint')}</p>
      </SettingsSection>
    </>
  )
}

function FeaturesPage() {
  const t = useT()
  const preferences = useProjectsStore((state) => state.preferences)
  const setPreferences = useProjectsStore((state) => state.setPreferences)

  return (
    <SettingsSection
      id="optional-features"
      title={t('prefs.features')}
      description={t('prefs.featuresDesc')}
    >
      <div className={styles.featureList}>
        {FEATURES.map((feature) => {
          const enabled = preferences.enabledFeatures[feature.id]
          const FeatureIcon = FEATURE_ICONS[feature.id]
          return (
            <button
              key={feature.id}
              type="button"
              className={enabled ? styles.featureEnabled : undefined}
              onClick={() =>
                setPreferences({
                  enabledFeatures: {
                    ...preferences.enabledFeatures,
                    [feature.id]: !enabled,
                  },
                  ...(feature.id === 'todos' && !enabled ? { rightSidebarVisible: true } : {}),
                })
              }
              aria-pressed={enabled}
            >
              <span className={styles.featureIcon}>
                <FeatureIcon size={17} />
              </span>
              <span className={styles.featureCopy}>
                <strong>{t(feature.titleKey)}</strong>
                <span>{t(feature.descriptionKey)}</span>
              </span>
              <span className={styles.featureStatus}>
                {enabled ? t('prefs.featureEnabled') : t('prefs.featureDisabled')}
              </span>
              <span className={styles.featureSwitch} aria-hidden>
                <span />
              </span>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}

function TerminalPage({ enabledCount }: { enabledCount: number }) {
  const t = useT()
  const preferences = useProjectsStore((state) => state.preferences)
  const setTerminalTheme = useProjectsStore((state) => state.setTerminalTheme)
  const setAgentEnabled = useProjectsStore((state) => state.setAgentEnabled)
  const setPreferences = useProjectsStore((state) => state.setPreferences)
  const pushToast = useUiStore((state) => state.pushToast)
  const [resetting, setResetting] = useState(false)
  const concurrency = preferences.spawnConcurrency
  const resourcePolicy = preferences.resourcePolicy
  const effectiveResourceMode =
    resourcePolicy.automaticParkingOptIn === true && resourcePolicy.mode === 'smart-lru'
      ? 'smart-lru'
      : 'manual'
  const setResourcePolicy = (patch: Partial<typeof resourcePolicy>) => {
    const next = { ...resourcePolicy, ...patch }
    next.memoryBudgetMb = Math.min(8192, Math.max(768, Math.round(next.memoryBudgetMb)))
    next.warningThresholdMb = Math.min(
      next.memoryBudgetMb - 64,
      Math.max(512, Math.round(next.warningThresholdMb)),
    )
    next.recoveryTargetMb = Math.min(
      next.warningThresholdMb - 64,
      Math.max(384, Math.round(next.recoveryTargetMb)),
    )
    next.hiddenAgentIdleMinutes = Math.min(
      240,
      Math.max(5, Math.round(next.hiddenAgentIdleMinutes)),
    )
    next.hiddenShellIdleMinutes = Math.min(
      480,
      Math.max(5, Math.round(next.hiddenShellIdleMinutes)),
    )
    setPreferences({ resourcePolicy: next })
  }
  const setConcurrency = (n: number) =>
    setPreferences({
      spawnConcurrency: Math.min(
        SPAWN_CONCURRENCY_LIMITS.max,
        Math.max(SPAWN_CONCURRENCY_LIMITS.min, n),
      ),
    })

  const onResetLastSession = async () => {
    if (resetting) return
    const count = countLiveResumablePanes()
    if (count === 0) {
      pushToast({ title: t('prefs.resetSessionEmpty'), body: t('prefs.resetSessionEmptyBody') })
      return
    }
    // Abrange TODOS os projetos/grupos com agente vivo em background, não só
    // o visível — com vários acumulados isso reinicia muitos processos de
    // uma vez, então confirma explicitamente mostrando a contagem real.
    if (count > 1 && !window.confirm(t('prefs.resetSessionConfirm', { count }))) return
    setResetting(true)
    try {
      const { resumed, total } = await resetLastSession()
      if (total === 0) {
        pushToast({ title: t('prefs.resetSessionEmpty'), body: t('prefs.resetSessionEmptyBody') })
      } else {
        pushToast({
          title: t('prefs.resetSessionDone'),
          body: t('prefs.resetSessionDoneBody', { count: resumed }),
        })
      }
    } catch (err) {
      pushToast({ title: t('prefs.resetSessionFailed'), body: String(err) })
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <SettingsSection
        id="resource-policy"
        title={t('prefs.resourcePolicy')}
        description={t('prefs.resourcePolicyDesc')}
      >
        <div className={styles.resourceControls}>
          <div className={styles.segmented}>
            <button
              type="button"
              className={effectiveResourceMode === 'smart-lru' ? styles.segmentActive : undefined}
              onClick={() => setResourcePolicy({ mode: 'smart-lru', automaticParkingOptIn: true })}
            >
              {t('prefs.resourcePolicySmart')}
            </button>
            <button
              type="button"
              className={effectiveResourceMode === 'manual' ? styles.segmentActive : undefined}
              onClick={() => setResourcePolicy({ mode: 'manual', automaticParkingOptIn: false })}
            >
              {t('prefs.resourcePolicyManual')}
            </button>
          </div>
          <div className={styles.resourceGrid}>
            <label>
              <span>{t('prefs.resourceBudget')}</span>
              <input
                type="number"
                min={768}
                max={8192}
                step={128}
                value={resourcePolicy.memoryBudgetMb}
                onChange={(event) =>
                  setResourcePolicy({ memoryBudgetMb: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>{t('prefs.resourceWarning')}</span>
              <input
                type="number"
                min={512}
                max={resourcePolicy.memoryBudgetMb - 64}
                step={64}
                value={resourcePolicy.warningThresholdMb}
                onChange={(event) =>
                  setResourcePolicy({ warningThresholdMb: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>{t('prefs.resourceRecovery')}</span>
              <input
                type="number"
                min={384}
                max={resourcePolicy.warningThresholdMb - 64}
                step={64}
                value={resourcePolicy.recoveryTargetMb}
                onChange={(event) =>
                  setResourcePolicy({ recoveryTargetMb: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>{t('prefs.resourceAgentIdle')}</span>
              <input
                type="number"
                min={5}
                max={240}
                step={5}
                value={resourcePolicy.hiddenAgentIdleMinutes}
                onChange={(event) =>
                  setResourcePolicy({ hiddenAgentIdleMinutes: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>{t('prefs.resourceShellIdle')}</span>
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={resourcePolicy.hiddenShellIdleMinutes}
                onChange={(event) =>
                  setResourcePolicy({ hiddenShellIdleMinutes: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <p className={styles.resourceHint}>
            {effectiveResourceMode === 'smart-lru'
              ? t('prefs.resourcePolicySmartHint')
              : t('prefs.resourcePolicyManualHint')}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        id="spawn-concurrency"
        title={t('prefs.spawnConcurrency')}
        description={t('prefs.spawnConcurrencyDesc')}
      >
        <div className={styles.zoomControl}>
          <button
            type="button"
            onClick={() => setConcurrency(concurrency - SPAWN_CONCURRENCY_LIMITS.step)}
            disabled={concurrency <= SPAWN_CONCURRENCY_LIMITS.min}
            aria-label={t('prefs.spawnConcurrencyDecrease')}
          >
            <Minus size={15} />
          </button>
          <strong>{concurrency}</strong>
          <button
            type="button"
            onClick={() => setConcurrency(concurrency + SPAWN_CONCURRENCY_LIMITS.step)}
            disabled={concurrency >= SPAWN_CONCURRENCY_LIMITS.max}
            aria-label={t('prefs.spawnConcurrencyIncrease')}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => setConcurrency(3)}
            disabled={concurrency === 3}
            aria-label={t('prefs.spawnConcurrencyReset')}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        id="terminal-theme"
        title={t('prefs.terminalTheme')}
        description={t('prefs.terminalThemeDesc')}
      >
        <select
          className={styles.select}
          value={preferences.terminalTheme ?? ''}
          onChange={(event) =>
            setTerminalTheme(
              event.target.value ? (event.target.value as typeof preferences.uiTheme) : null,
            )
          }
        >
          <option value="">{t('common.followUi')}</option>
          {THEME_OPTIONS.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {themeLabel(t, theme.id)}
            </option>
          ))}
        </select>
      </SettingsSection>

      <SettingsSection
        id="agents"
        title={t('prefs.enabledAgents', { count: enabledCount })}
        description={t('prefs.agentsDesc')}
      >
        <div className={styles.agentList}>
          {AGENTS.map((agent) => {
            const checked = preferences.enabledAgents[agent.id]
            const disabled = checked && enabledCount === 1
            return (
              <label key={agent.id} className={disabled ? styles.agentDisabled : undefined}>
                <span className={styles.agentIcon}>
                  <AgentIcon
                    type={agent.id}
                    size={20}
                    theme={preferences.terminalTheme ?? preferences.uiTheme}
                  />
                </span>
                <span className={styles.agentCopy}>
                  <strong>{agent.label}</strong>
                  <span>{t(`agent.${agent.id}.desc`)}</span>
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => setAgentEnabled(agent.id, event.target.checked)}
                />
              </label>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        id="limit-reset-notify"
        title={t('prefs.limitResetNotify')}
        description={t('prefs.limitResetNotifyDesc')}
      >
        <div className={styles.segmented}>
          <button
            type="button"
            className={preferences.notifyOnLimitReset ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ notifyOnLimitReset: true })}
          >
            {t('prefs.limitResetNotifyOn')}
          </button>
          <button
            type="button"
            className={!preferences.notifyOnLimitReset ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ notifyOnLimitReset: false })}
          >
            {t('prefs.limitResetNotifyOff')}
          </button>
        </div>
      </SettingsSection>

      {isMacOS() ? (
        <SettingsSection
          id="native-terminal-macos"
          title="Terminal nativo (Ghostty)"
          description="Use the embedded Ghostty engine (GPU rendering) instead of the internal terminal. Experimental. Reopen terminals after changing this."
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--bg-sunken)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={preferences.nativeTerminalMacos ?? false}
              onChange={(e) => setPreferences({ nativeTerminalMacos: e.target.checked })}
            />
            <span style={{ flex: 1, fontSize: 13 }}>Habilitar terminal nativo (macOS)</span>
          </label>
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="reset-session"
        title={t('prefs.resetSession')}
        description={t('prefs.resetSessionDesc')}
      >
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void onResetLastSession()}
          disabled={resetting}
        >
          <RotateCcw size={15} />
          {resetting ? t('prefs.resetSessionBusy') : t('prefs.resetSessionButton')}
        </button>
      </SettingsSection>
    </>
  )
}

function IntegrationsPage() {
  const t = useT()
  const preferences = useProjectsStore((state) => state.preferences)
  const setPreferences = useProjectsStore((state) => state.setPreferences)
  return (
    <>
      <SettingsSection id="spotify" title={t('prefs.spotify')} description={t('prefs.spotifyDesc')}>
        <div className={styles.integrationFields}>
          <label>
            <span>Client ID</span>
            <input
              className={controls.input}
              value={preferences.spotifyClientId}
              onChange={(event) => setPreferences({ spotifyClientId: event.target.value })}
              spellCheck={false}
            />
          </label>
          <label>
            <span>Client Secret</span>
            <input
              className={controls.input}
              type="password"
              value={preferences.spotifyClientSecret}
              onChange={(event) => setPreferences({ spotifyClientSecret: event.target.value })}
              spellCheck={false}
            />
          </label>
          <p>
            {t('prefs.spotifyHint', {
              redirect: 'http://127.0.0.1:8888/callback',
              idEnv: 'SPOTIFY_CLIENT_ID',
              secretEnv: 'SPOTIFY_CLIENT_SECRET',
            })}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        id="discord"
        title={t('prefs.discordPresence')}
        description={t('prefs.discordPresenceHint')}
      >
        <div className={styles.segmented}>
          <button
            type="button"
            className={preferences.discordRichPresenceEnabled ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ discordRichPresenceEnabled: true })}
          >
            {t('prefs.discordPresenceEnabled')}
          </button>
          <button
            type="button"
            className={!preferences.discordRichPresenceEnabled ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ discordRichPresenceEnabled: false })}
          >
            {t('prefs.discordPresenceDisabled')}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        id="dictation"
        title={t('prefs.dictation')}
        description={t('prefs.dictationDesc')}
      >
        <div className={styles.segmented}>
          <button
            type="button"
            className={preferences.dictationEnabled ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ dictationEnabled: true })}
          >
            {t('prefs.dictationOn')}
          </button>
          <button
            type="button"
            className={!preferences.dictationEnabled ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ dictationEnabled: false })}
          >
            {t('prefs.dictationOff')}
          </button>
        </div>
        <p>{t('prefs.dictationHandyHint')}</p>
      </SettingsSection>
    </>
  )
}

function MultiagentPage() {
  const projects = useProjectsStore((state) => state.projects)
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id ?? '')
  const schedulerStore = useSchedulerStore()

  const [metrics, setMetrics] = useState<Record<string, MetricData>>({})
  const [traces, setTraces] = useState<EventBusPayload[]>([])
  const [loadingTelemetry, setLoadingTelemetry] = useState(true)

  const [plugins, setPlugins] = useState<PluginManifest[]>([])
  const [loadingPlugins, setLoadingPlugins] = useState(true)

  const [autocommit, setAutocommit] = useState(false)
  const [auditLogs, setAuditLogs] = useState<PlanningCommit[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  const loadTelemetry = useCallback(async () => {
    try {
      const [m, tr] = await Promise.all([getTelemetryMetrics(), getTelemetryTraces()])
      setMetrics(m)
      setTraces(tr.slice(-15).reverse())
    } catch (err) {
      console.error('Falha ao carregar telemetria:', err)
    } finally {
      setLoadingTelemetry(false)
    }
  }, [])

  const loadPlugins = useCallback(async () => {
    try {
      const list = await pluginsList()
      setPlugins(list)
    } catch (err) {
      console.error('Falha ao listar plugins:', err)
    } finally {
      setLoadingPlugins(false)
    }
  }, [])

  const loadAutocommitState = useCallback(async () => {
    try {
      const enabled = await getPlanningAutocommit()
      setAutocommit(enabled)
    } catch (err) {
      console.error('Falha ao obter estado de autocommit:', err)
    }
  }, [])

  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const repoPath = selectedProject?.terminals[0]?.cwd

  const loadAuditHistory = useCallback(async (path: string) => {
    setLoadingAudit(true)
    try {
      const history = await planningAuditHistory(path, 15)
      setAuditLogs(history)
    } catch (err) {
      console.error('Failed to load GSD audit history:', err)
      setAuditLogs([])
    } finally {
      setLoadingAudit(false)
    }
  }, [])

  useEffect(() => {
    void loadTelemetry()
    const interval = setInterval(loadTelemetry, 3000)
    return () => clearInterval(interval)
  }, [loadTelemetry])

  useEffect(() => {
    void loadPlugins()
    void loadAutocommitState()
  }, [loadPlugins, loadAutocommitState])

  // Inicializa o ouvinte do barramento no schedulerStore
  useEffect(() => {
    return schedulerStore.initListener()
  }, [])

  // Carrega as tarefas sempre que mudar o projeto selecionado
  useEffect(() => {
    if (selectedProjectId) {
      void schedulerStore.loadTasks(selectedProjectId)
      if (repoPath) {
        void loadAuditHistory(repoPath)
      }
    } else {
      setAuditLogs([])
    }
  }, [selectedProjectId, repoPath, loadAuditHistory])

  const handleTick = () => {
    if (selectedProjectId && repoPath) {
      void schedulerStore.tick(selectedProjectId, repoPath)
    }
  }

  const handleInstallPlugin = async () => {
    const raw = prompt('Cole o JSON do Manifest do plugin:')?.trim()
    if (!raw) return
    try {
      const manifest = JSON.parse(raw) as PluginManifest
      if (!manifest.name || !manifest.version || !manifest.kind) {
        alert('Invalid manifest. Fill in name, version, and kind.')
        return
      }
      await pluginInstall(manifest)
      alert('Plugin instalado com sucesso!')
      void loadPlugins()
    } catch (err) {
      alert('Erro ao instalar plugin: ' + err)
    }
  }

  const handleUninstallPlugin = async (id: string) => {
    if (confirm(`Tem certeza que deseja desinstalar o plugin "${id}"?`)) {
      try {
        await pluginUninstall(id)
        alert('Plugin desinstalado!')
        void loadPlugins()
      } catch (err) {
        alert('Erro ao desinstalar plugin: ' + err)
      }
    }
  }

  const handleToggleAutocommit = async (enabled: boolean) => {
    try {
      await setPlanningAutocommit(enabled)
      setAutocommit(enabled)
    } catch (err) {
      alert('Erro ao alterar autocommit: ' + err)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'var(--fg-muted)'
      case 'ready':
        return 'var(--status-ready-fg, #38bdf8)'
      case 'running':
        return 'var(--status-running-fg, #f59e0b)'
      case 'completed':
        return 'var(--status-completed-fg, #10b981)'
      case 'failed':
        return 'var(--status-failed-fg, #ef4444)'
      case 'blocked':
        return '#6b7280'
      default:
        return 'var(--fg)'
    }
  }

  return (
    <>
      <SettingsSection
        id="multiagent-scheduler"
        title="Scheduler & task queue"
        description="Manage execution waves (Task DAG) per project."
      >
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <select
            className={controls.input}
            style={{ width: '60%', height: 32, fontSize: 12 }}
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            <option value="">-- Select a project --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {selectedProjectId && repoPath && (
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ height: 32, padding: '0 12px', fontSize: 11 }}
              onClick={handleTick}
            >
              Run tick (force queue)
            </button>
          )}
        </div>

        {selectedProjectId ? (
          schedulerStore.loading ? (
            <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
              Carregando fila do projeto...
            </div>
          ) : schedulerStore.tasks.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
              Nenhuma tarefa de planejamento (GSD) encontrada em `.planning/`.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {schedulerStore.tasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-active)',
                    border: '1px solid var(--border)',
                    fontSize: 11,
                  }}
                >
                  <div style={{ overflow: 'hidden', marginRight: 12 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>
                        #{task.id}: {task.title}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'var(--border)',
                          color: getStatusColor(task.status),
                          fontWeight: 700,
                        }}
                      >
                        {task.status.toUpperCase()}
                      </span>
                    </div>
                    {task.dependencies.length > 0 && (
                      <div style={{ fontSize: 9, color: 'var(--fg-muted)', marginTop: 2 }}>
                        Depende de:{' '}
                        <span style={{ fontFamily: 'monospace' }}>
                          {task.dependencies.join(', ')}
                        </span>
                      </div>
                    )}
                    {task.assignedAgentId && (
                      <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 2 }}>
                        Alocado para: Agente {task.assignedAgentId}
                      </div>
                    )}
                  </div>
                  {task.status === 'running' && (
                    <button
                      type="button"
                      onClick={() => schedulerStore.cancel(task.id)}
                      style={{
                        padding: '4px 8px',
                        fontSize: 10,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--status-failed-bg, #4c1d1d)',
                        color: '#ff8888',
                        border: 'none',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
            Select a project to inspect and orchestrate its tasks.
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="multiagent-metrics"
        title="Execution metrics (phases 1/2)"
        description="Accumulated global counters from the internal event bus."
      >
        {loadingTelemetry ? (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Loading metrics...</div>
        ) : Object.keys(metrics).length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
            No accumulated event metrics.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 8,
            }}
          >
            {Object.entries(metrics).map(([key, data]) => {
              const name = key.replace('alethe_event_', '').toUpperCase()
              return (
                <div
                  key={key}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-active)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontWeight: 600 }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{data.count}</div>
                  {data.last_value > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 2 }}>
                      Last: {data.last_value.toFixed(2)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="multiagent-traces"
        title="Recent event history"
        description="Real-time tracking of structured Event Bus logs."
      >
        {loadingTelemetry ? (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Loading traces...</div>
        ) : traces.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
            No recent events recorded.
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 180,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 8,
              background: 'var(--bg-active)',
            }}
          >
            {traces.map((trace, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  paddingBottom: 4,
                  borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
                }}
              >
                <div style={{ overflow: 'hidden', marginRight: 12 }}>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                    {trace.event_type}
                  </span>
                  {trace.task_id && (
                    <span style={{ color: 'var(--fg-muted)', marginLeft: 6 }}>
                      Task: {trace.task_id}
                    </span>
                  )}
                  <div
                    style={{
                      color: 'var(--fg-muted)',
                      fontSize: 9,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    CorrId: {trace.correlation_id}
                  </div>
                </div>
                <div style={{ textAlign: 'right', color: 'var(--fg-muted)', flexShrink: 0 }}>
                  {new Date(trace.timestamp_ms).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="multiagent-plugins"
        title="Plugin manager"
        description="View and install orchestrator plugins and custom tools."
      >
        <button
          type="button"
          className={styles.secondaryButton}
          style={{ marginBottom: 12, fontSize: 11 }}
          onClick={handleInstallPlugin}
        >
          Install new plugin (JSON)
        </button>

        {loadingPlugins ? (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Carregando plugins...</div>
        ) : plugins.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
            Nenhum plugin instalado no momento.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plugins.map((plug) => (
              <div
                key={plug.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-active)',
                  border: '1px solid var(--border)',
                  fontSize: 11,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {plug.name} (v{plug.version})
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--fg-muted)' }}>Tipo: {plug.kind}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>
                    {plug.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUninstallPlugin(plug.name)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 10,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--status-failed-bg, #4c1d1d)',
                    color: '#ff8888',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Desinstalar
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="multiagent-gsd-audit"
        title="GSD audit & autocommit"
        description="Monitor task changes in `.planning/` and configure automatic audit commits."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            id="planningAutocommit"
            checked={autocommit}
            onChange={(e) => handleToggleAutocommit(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <label
            htmlFor="planningAutocommit"
            style={{ fontSize: 11, cursor: 'pointer', userSelect: 'none' }}
          >
            Ativar Auto-commit de Auditoria (Opt-in)
          </label>
        </div>

        {selectedProjectId ? (
          loadingAudit ? (
            <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
              Carregando logs de auditoria...
            </div>
          ) : auditLogs.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
              No changes recorded in `.planning/` through Git.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 180,
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: 8,
                background: 'var(--bg-active)',
              }}
            >
              {auditLogs.map((log) => (
                <div
                  key={log.hash}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    paddingBottom: 4,
                    borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: 'var(--accent)',
                        marginRight: 6,
                      }}
                    >
                      {log.hash.slice(0, 7)}
                    </span>
                    <span>{log.subject}</span>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 9 }}>
                      Autor: {log.author} {log.agentId ? `· Agente: ${log.agentId}` : ''}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      color: 'var(--fg-muted)',
                      fontSize: 9,
                      flexShrink: 0,
                    }}
                  >
                    {new Date(log.timestampMs).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
            Select a project above to view the GSD audit history.
          </div>
        )}
      </SettingsSection>
    </>
  )
}

function AboutPage() {
  const t = useT()
  const updateInfo = useUiStore((state) => state.updateInfo)
  const setUpdateInfo = useUiStore((state) => state.setUpdateInfo)
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkedUpToDate, setCheckedUpToDate] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'installing' | 'error'>('idle')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(''))
  }, [])

  const onCheck = async () => {
    if (checking) return
    setChecking(true)
    setCheckedUpToDate(false)
    setError('')
    try {
      const info = await checkForUpdate()
      setUpdateInfo(info)
      if (!info) setCheckedUpToDate(true)
    } catch (err) {
      setError(String(err))
    } finally {
      setChecking(false)
    }
  }

  const onInstall = async () => {
    setPhase('installing')
    setError('')
    try {
      await installPendingUpdate(({ downloaded, total }) => {
        setPercent(total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0)
      })
    } catch (err) {
      setPhase('error')
      setError(String(err))
    }
  }

  const installing = phase === 'installing'

  return (
    <>
      <SettingsSection
        id="app-version"
        title={t('prefs.aboutVersionTitle')}
        description={t('prefs.aboutVersionDesc')}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-sunken)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <strong style={{ fontSize: 14 }}>Alethe</strong>
            <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>com.kc1t.alethe</span>
          </div>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--fg)',
            }}
          >
            {version ? `v${version}` : '—'}
          </span>
        </div>
      </SettingsSection>

      <SettingsSection
        id="app-updates"
        title={t('prefs.aboutUpdatesTitle')}
        description={t('prefs.aboutUpdatesDesc')}
      >
        {updateInfo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <DownloadCloud size={16} style={{ color: 'var(--status-working)', flexShrink: 0 }} />
              <span>
                {t('prefs.aboutUpdateAvailable', {
                  version: updateInfo.version,
                  current: updateInfo.currentVersion,
                })}
              </span>
            </div>
            {updateInfo.notes ? (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--fg-muted)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 160,
                  overflowY: 'auto',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-active)',
                }}
              >
                {updateInfo.notes}
              </div>
            ) : null}
            {installing ? (
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--bg-active)',
                  overflow: 'hidden',
                }}
                aria-hidden
              >
                <div
                  style={{
                    height: '100%',
                    width: `${percent}%`,
                    background: 'var(--accent)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            ) : null}
            <button
              type="button"
              className={`${controls.btn} ${controls.btnPrimary}`}
              onClick={() => void onInstall()}
              disabled={installing}
              style={{ alignSelf: 'flex-start' }}
            >
              {installing ? t('update.installing', { percent }) : t('update.installNow')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void onCheck()}
              disabled={checking}
              style={{ alignSelf: 'flex-start' }}
            >
              <RotateCcw size={15} />
              {checking ? t('prefs.aboutChecking') : t('prefs.aboutCheckUpdates')}
            </button>
            {checkedUpToDate ? (
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                {t('prefs.aboutUpToDate', { version })}
              </span>
            ) : null}
          </div>
        )}
        {error ? (
          <p
            style={{
              fontSize: 12,
              color: 'var(--status-failed-fg, #ef4444)',
              marginTop: 8,
              wordBreak: 'break-word',
            }}
          >
            {t('update.error', { error })}
          </p>
        ) : null}
      </SettingsSection>
    </>
  )
}

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.section} data-setting-id={id} tabIndex={-1}>
      <div className={styles.sectionHeading}>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

function Avatar({
  url,
  initial,
  large = false,
}: {
  url: string | null
  initial: string
  large?: boolean
}) {
  return url ? (
    <img
      src={url}
      alt=""
      draggable={false}
      className={`${styles.avatar} ${large ? styles.avatarLarge : ''}`}
    />
  ) : (
    <span
      className={`${styles.avatar} ${styles.avatarFallback} ${large ? styles.avatarLarge : ''}`}
    >
      {initial}
    </span>
  )
}
