import { CanvasAddon } from '@xterm/addon-canvas'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Terminal } from '@xterm/xterm'
import type { ILink } from '@xterm/xterm'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { AppWindow, Copy, ExternalLink, FolderOpen, LayoutGrid, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import '@xterm/xterm/css/xterm.css'

import { pickFile } from '../../lib/dialog'
import { AgentCompletionMonitor } from '../../lib/agentCompletionMonitor'
import { preparePtyRuntimeLaunch } from '../../lib/agentRuntimeAdapter'
import { recordAgentActivityInput } from '../../lib/activityTracker'
import { buildAgentLaunch } from '../../lib/sessionLaunch'
import { claimDiscoveredSession, registerSessionClaim } from '../../lib/sessionDiscovery'
import { consumeSession, removeSession, saveSession } from '../../lib/sessionResume'
import { waitForSessionHint } from '../../lib/sessionWatch'
import { acquireSpawnSlot, releaseSpawnSlot } from '../../lib/spawnQueue'
import { readScopedStorage, writeScopedStorage } from '../../lib/storageNamespace'
import { acquireWebglContext } from '../../lib/webglPool'
import {
  attachPty,
  findCliLauncher,
  killPty,
  listenPtyData,
  listenPtyExit,
  openInBrowser,
  openInFileExplorer,
  ptyExists,
  readClipboardText,
  resizePty,
  spawnPty,
  graphifyEnsureGraph,
  graphifyMcpConfigPath,
  graphifyOpenCodeConfigWrite,
  graphifyCodexConfigWrite,
  snapshotClaudeSessions,
  snapshotCodexSessions,
  snapshotOpenCodeSessions,
  writeClipboardText,
  writePty,
  setPtyReadState,
  setPtyPriority,
} from '../../lib/tauri'
import { getLocale, translate, useT } from '../../lib/i18n'
import type { AgentRuntimeProfile, AgentType, Theme } from '../../lib/types'
import { useProjectsStore } from '../../stores/projectsStore'
import { useTerminalsStore } from '../../stores/terminalsStore'
import { useUiStore } from '../../stores/uiStore'
import {
  formatDroppedPaths,
  getTerminalScrollbackRows,
  getWheelScrollLines,
  normalizePastedText,
  shouldScrollHostScrollback,
} from './terminalInput'
import {
  detectTerminalLinks,
  getLogicalTerminalLine,
  terminalLinkRange,
  type DetectedTerminalLink,
  type FileLinkKind,
} from './terminalLinks'
import styles from './XTermView.module.css'

type LinkActionState = {
  text: string
  kind: 'url' | 'path'
  fileKind?: FileLinkKind
  x: number
  y: number
}

const DARK_THEME = {
  background: '#101114',
  foreground: '#f3f4f6',
  cursor: '#f3f4f6',
  selectionBackground: '#3b82f666',
} as const
const LIGHT_THEME = {
  background: '#fafafa',
  foreground: '#18181b',
  cursor: '#18181b',
  selectionBackground: '#3b82f655',
} as const
const DRACULA_THEME = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  selectionBackground: '#44475a',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
} as const
const NORD_THEME = {
  background: '#2e3440',
  foreground: '#eceff4',
  cursor: '#eceff4',
  selectionBackground: '#4c566a',
} as const
const GRUVBOX_THEME = {
  background: '#282828',
  foreground: '#fbf1c7',
  cursor: '#fbf1c7',
  selectionBackground: '#665c54',
} as const
const SOLARIZED_THEME = {
  background: '#002b36',
  foreground: '#fdf6e3',
  cursor: '#fdf6e3',
  selectionBackground: '#073642',
} as const
const TOKYO_NIGHT_THEME = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  selectionBackground: '#414868',
} as const
const VSCODE_THEME = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#cccccc',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
} as const
const MIN_DARK_THEME = {
  background: '#1f1f1f',
  foreground: '#fafafa',
  cursor: '#fafafa',
  selectionBackground: '#383838',
  black: '#1a1a1a',
  red: '#f97583',
  green: '#fafafa',
  yellow: '#ff9800',
  blue: '#d0d0d0',
  magenta: '#bdbdbd',
  cyan: '#9db1c5',
  white: '#bbbbbb',
  brightBlack: '#6b737c',
  brightRed: '#ff7a84',
  brightGreen: '#ffffff',
  brightYellow: '#ffab70',
  brightBlue: '#e0e0e0',
  brightMagenta: '#d0d0d0',
  brightCyan: '#9db1c5',
  brightWhite: '#fafafa',
} as const
const DARK_LEMON_THEME = {
  background: '#141414',
  foreground: '#ffffff',
  cursor: '#ffff50',
  selectionBackground: '#ffff5028',
  black: '#1a1a1a',
  red: '#ff5370',
  green: '#c3e88d',
  yellow: '#ffcb6b',
  blue: '#82aaff',
  magenta: '#c792ea',
  cyan: '#89ddff',
  white: '#cfcfcf',
  brightBlack: '#5a5a5a',
  brightRed: '#ff5370',
  brightGreen: '#c3e88d',
  brightYellow: '#ffff50',
  brightBlue: '#82aaff',
  brightMagenta: '#c792ea',
  brightCyan: '#89ddff',
  brightWhite: '#ffffff',
} as const
const MIN_LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#212121',
  cursor: '#212121',
  selectionBackground: '#eeeeee',
  black: '#212121',
  red: '#d32f2f',
  green: '#22863a',
  yellow: '#ff9800',
  blue: '#1976d2',
  magenta: '#6f42c1',
  cyan: '#2b5581',
  white: '#e0e0e0',
  brightBlack: '#757575',
  brightRed: '#d32f2f',
  brightGreen: '#22863a',
  brightYellow: '#ff9800',
  brightBlue: '#1976d2',
  brightMagenta: '#6f42c1',
  brightCyan: '#2b5581',
  brightWhite: '#ffffff',
} as const

function getXtermTheme(theme: Theme) {
  if (theme === 'light') return LIGHT_THEME
  if (theme === 'dracula') return DRACULA_THEME
  if (theme === 'nord') return NORD_THEME
  if (theme === 'gruvbox') return GRUVBOX_THEME
  if (theme === 'solarized') return SOLARIZED_THEME
  if (theme === 'tokyo-night') return TOKYO_NIGHT_THEME
  if (theme === 'vscode') return VSCODE_THEME
  if (theme === 'min-dark') return MIN_DARK_THEME
  if (theme === 'min-light') return MIN_LIGHT_THEME
  if (theme === 'dark-lemon') return DARK_LEMON_THEME
  return DARK_THEME
}

function makeXtermLink(
  logicalLineStart: number,
  columns: number,
  link: DetectedTerminalLink,
  handlers: {
    openMenu: (event: MouseEvent, link: DetectedTerminalLink) => void
  },
): ILink {
  return {
    text: link.text,
    range: terminalLinkRange(logicalLineStart, columns, link),
    decorations: { pointerCursor: true, underline: true },
    activate: (event: MouseEvent) => handlers.openMenu(event, link),
  }
}

export type XTermViewProps = {
  ptyId: string
  /** Projeto dono deste terminal — usado pra "abrir .md no grid" via hover. */
  projectId?: string
  /** Tipo do agent (claude/codex/opencode) ou null pra shell. */
  command?: AgentType | null
  cwd?: string | null
  extraArgs?: string[]
  /** Identidade persistida da conversa deste pane. */
  sessionId?: string
  /** Env extra só deste PTY. */
  env?: Record<string, string>
  runtimeProfile?: AgentRuntimeProfile
  /**
   * RFC-004 — raiz do repo quando o projeto tem Graphify habilitado. Presente:
   * o spawn injeta `--mcp-config` (Claude) e garante o bootstrap do grafo.
   */
  graphifyRepo?: string | null
  terminalTheme?: Theme
  onSpawned?: (id: string) => void
  onSessionId?: (id: string) => void
  onExit?: (code: number | null) => void
  onAgentComplete?: () => void
}

const PROMPT_HISTORY_KEY = (id: string) => `prompt-history:${id}`
const PASTE_CHUNK_SIZE = 1024
const PASTE_CHUNK_DELAY_MS = 8
const LINK_MENU_WIDTH = 272
const LINK_MENU_MAX_HEIGHT = 276
const LINK_MENU_MARGIN = 10
const LINK_MENU_OFFSET = 6

function loadPromptHistory(ptyId: string): string[] {
  const raw = readScopedStorage(PROMPT_HISTORY_KEY(ptyId), true)
  if (!raw) return []
  const history = JSON.parse(raw) as string[]
  return history
}

async function writePtyChunked(
  id: string,
  text: string,
  bracketed: boolean,
): Promise<void> {
  // Bracketed paste (DECSET 2004): quando a app liga, envolvemos a colagem
  // inteira nos marcadores 200~/201~ pra ela tratar como um bloco único. Sem
  // isso, cada \r interno vira Enter e TUIs como o Claude submetem só a
  // primeira linha — a colagem grande chegava cortada. Os marcadores ficam
  // FORA do chunking pra nunca serem partidos no meio.
  const open = bracketed ? '\x1b[200~' : ''
  const close = bracketed ? '\x1b[201~' : ''

  if (text.length <= PASTE_CHUNK_SIZE) {
    await writePty(id, `${open}${text}${close}`)
    return
  }

  if (open) await writePty(id, open)
  for (let index = 0; index < text.length; index += PASTE_CHUNK_SIZE) {
    await writePty(id, text.slice(index, index + PASTE_CHUNK_SIZE))
    await new Promise((resolve) => window.setTimeout(resolve, PASTE_CHUNK_DELAY_MS))
  }
  if (close) await writePty(id, close)
}

function getPoolLimit(memoryAvailableMb?: number): number {
  // Reactive: subscribe caller passes memoryStats, so this re-evaluates on change.
  const memMb = memoryAvailableMb ?? useUiStore.getState().memoryStats?.system_available_mb ?? 16384
  if (memMb <= 8 * 1024) return 2
  if (memMb <= 16 * 1024) return 4
  return 8
}

function canHibernate(ptyId: string): boolean {
  const runtime = useTerminalsStore.getState().byPtyId[ptyId]
  if (!runtime) return true

  // Agente está produzindo output ativamente → não hibernar
  if (runtime.status === 'working') return false

  // Terminal está focado → não hibernar
  if (useUiStore.getState().focusedTerminalId === ptyId) return false

  // Grace period de 30s desde o último foco
  if (runtime.lastFocusedAt && Date.now() - runtime.lastFocusedAt < 30_000) return false

  return true
}

export function XTermView({
  ptyId,
  projectId,
  command,
  cwd,
  extraArgs,
  sessionId,
  env,
  runtimeProfile = 'full',
  graphifyRepo,
  terminalTheme = 'dark',
  onSpawned,
  onSessionId,
  onExit,
  onAgentComplete,
}: XTermViewProps) {
  const t = useT()

  const memoryStats = useUiStore((s) => s.memoryStats)
  const isActiveInPool = useTerminalsStore((s) => {
    const alivePtys = Object.values(s.byPtyId)
      .filter((p) => p.alive)
      .sort((a, b) => (b.lastFocusedAt ?? 0) - (a.lastFocusedAt ?? 0))
    const index = alivePtys.findIndex((p) => p.ptyId === ptyId)
    if (index === -1) return true
    return index < getPoolLimit(memoryStats?.system_available_mb)
  })

  const poolState = useTerminalsStore((s) => s.byPtyId[ptyId]?.poolState ?? 'ACTIVE')
  // Só HIBERNATED/FAILED devem desmontar/remontar o terminal. Usar `poolState`
  // cru nas deps do efeito principal recriava o xterm a CADA transição
  // (HIBERNATING, RESTORING, ACTIVE…), causando dispose/recreate em cascata,
  // re-spawn de PTY vivo e terminal zumbi sem teclado.
  const isDormant = poolState === 'HIBERNATED' || poolState === 'FAILED'

  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const lastCtrlCRef = useRef(0)
  const linkMenuRef = useRef<HTMLDivElement | null>(null)
  const linkActionsRef = useRef<LinkActionState | null>(null)

  const cliPathOverride = useProjectsStore((s) =>
    command && command !== 'shell' ? s.cliPaths[command] ?? null : null,
  )
  const setCliPath = useProjectsStore((s) => s.setCliPath)

  const onSpawnedRef = useRef(onSpawned)
  const onSessionIdRef = useRef(onSessionId)
  const onExitRef = useRef(onExit)
  const onAgentCompleteRef = useRef(onAgentComplete)
  useEffect(() => {
    onSpawnedRef.current = onSpawned
    onSessionIdRef.current = onSessionId
    onExitRef.current = onExit
    onAgentCompleteRef.current = onAgentComplete
  })

  // Pool State & Hibernation Coordinator
  useEffect(() => {
    // Terminal com foco DOM real NUNCA hiberna (ADR: terminal em uso é
    // intocável). O check por id (`canHibernate`) compara focusedTerminalId
    // (id do PANE) com ptyId e nunca bate — este é o guard confiável, feito
    // aqui porque o coordinator roda dentro do componente e tem o container.
    const hasDomFocus = containerRef.current?.contains(document.activeElement) ?? false
    if (!isActiveInPool && !hasDomFocus && canHibernate(ptyId)) {
      if (poolState === 'ACTIVE') {
        useTerminalsStore.getState().setPoolState(ptyId, 'HIBERNATING')
        const term = terminalRef.current
        if (term) {
          try {
            const serializeAddon = new SerializeAddon()
            term.loadAddon(serializeAddon)
            const ansiBuffer = serializeAddon.serialize()
            const snapshot = {
              ansiBuffer,
              scrollTop: term.buffer.active.viewportY,
              options: {
                cursorBlink: term.options.cursorBlink,
                fontSize: term.options.fontSize,
                fontFamily: term.options.fontFamily,
              },
              cursor: { col: term.buffer.active.cursorX, row: term.buffer.active.cursorY },
              selection: term.hasSelection() ? term.getSelection() : undefined,
            }
            useTerminalsStore.getState().setSnapshot(ptyId, snapshot)
          } catch (e) {
            console.error('[XTermView] Erro ao criar snapshot do terminal:', e)
          }
        }
        void setPtyPriority(ptyId, false).catch((err) =>
          console.error('[XTermView] Falha ao rebaixar prioridade:', err)
        )
        useTerminalsStore.getState().setPoolState(ptyId, 'HIBERNATED')
      }
    } else {
      if (poolState === 'HIBERNATED' || poolState === 'FAILED') {
        useTerminalsStore.getState().setPoolState(ptyId, 'RESTORING')
      }
    }
  }, [isActiveInPool, poolState, ptyId])

  const promptHistoryRef = useRef<string[]>([])
  const historyCursorRef = useRef(-1)
  const currentLineRef = useRef('')

  const [commandNotFound, setCommandNotFound] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [bootPhase, setBootPhase] = useState<
    'preparing' | 'queued' | 'spawning' | 'attaching' | 'ready'
  >('preparing')
  const [linkActions, setLinkActions] = useState<LinkActionState | null>(null)
  const [dropActive, setDropActive] = useState(false)

  const hideLinkActions = useCallback(() => {
    setLinkActions(null)
  }, [])

  // Clique no link abre um menu compacto junto ao cursor. A posição usa uma
  // estimativa conservadora do tamanho para nunca cortar o menu na viewport.
  const showLinkActionsMenu = useCallback(
    (event: MouseEvent, link: DetectedTerminalLink) => {
      event.preventDefault()
      event.stopPropagation()
      // O xterm inicia seleção no pointerdown antes de chamar `activate` no
      // clique. Limpa esse gesto residual para o menu não parecer estar
      // "segurando" e selecionando o conteúdo que ficou atrás dele.
      terminalRef.current?.clearSelection()
      window.getSelection()?.removeAllRanges()

      const maxLeft = window.innerWidth - LINK_MENU_WIDTH - LINK_MENU_MARGIN
      const x = Math.max(
        LINK_MENU_MARGIN,
        Math.min(event.clientX + LINK_MENU_OFFSET, maxLeft),
      )
      const below = event.clientY + LINK_MENU_OFFSET
      const y =
        below + LINK_MENU_MAX_HEIGHT <= window.innerHeight - LINK_MENU_MARGIN
          ? below
          : Math.max(
              LINK_MENU_MARGIN,
              event.clientY - LINK_MENU_MAX_HEIGHT - LINK_MENU_OFFSET,
            )

      setLinkActions({
        text: link.text,
        kind: link.kind,
        fileKind: link.fileKind,
        x,
        y,
      })
    },
    [],
  )

  // Espelha o estado num ref pro listener do xterm, criado uma vez por PTY.
  useEffect(() => {
    linkActionsRef.current = linkActions
  }, [linkActions])

  useEffect(() => {
    if (!linkActions) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!linkMenuRef.current?.contains(event.target as Node)) hideLinkActions()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideLinkActions()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer, true)
    window.addEventListener('keydown', closeOnEscape, true)
    window.addEventListener('blur', hideLinkActions)
    window.addEventListener('resize', hideLinkActions)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      window.removeEventListener('keydown', closeOnEscape, true)
      window.removeEventListener('blur', hideLinkActions)
      window.removeEventListener('resize', hideLinkActions)
    }
  }, [hideLinkActions, linkActions])

  const openFileInGrid = useCallback(
    (target: string) => {
      if (!projectId) return
      useProjectsStore.getState().createFilePane(projectId, { filePath: target })
    },
    [projectId],
  )

  const openLinkInAppViewer = useCallback((target: string) => {
    useUiStore.getState().openLinkViewer(target)
  }, [])

  const openLinkInBrowser = useCallback(async (target: string) => {
    try {
      await openInBrowser(target)
    } catch (err) {
      useUiStore.getState().pushToast({
        title: translate(getLocale(), 'xterm.toastOpenBrowserFail'),
        body: String(err),
      })
    }
  }, [])

  const openLinkInFolder = useCallback(async (target: string) => {
    try {
      await openInFileExplorer(target)
    } catch (err) {
      useUiStore.getState().pushToast({
        title: translate(getLocale(), 'xterm.toastOpenFolderFail'),
        body: String(err),
      })
    }
  }, [])

  const copyLinkText = useCallback(async (target: string) => {
    try {
      await writeClipboardText(target)
      useUiStore.getState().pushToast({
        title: translate(getLocale(), 'xterm.toastCopied'),
        body: target,
      })
    } catch (err) {
      useUiStore.getState().pushToast({
        title: translate(getLocale(), 'xterm.toastCopyFail'),
        body: String(err),
      })
    }
  }, [])

  useEffect(() => {
    try {
      promptHistoryRef.current = loadPromptHistory(ptyId)
    } catch {
      promptHistoryRef.current = []
    }
    historyCursorRef.current = -1
    currentLineRef.current = ''
  }, [ptyId])

  const recordPromptInput = (data: string) => {
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        const line = currentLineRef.current.trim()
        currentLineRef.current = ''
        historyCursorRef.current = -1
        if (line.length < 2) continue
        const history = promptHistoryRef.current
        if (history[history.length - 1] === line) continue
        history.push(line)
        if (history.length > 50) history.shift()
        try {
          writeScopedStorage(PROMPT_HISTORY_KEY(ptyId), JSON.stringify(history))
        } catch {
          /* localStorage cheio — ignora */
        }
      } else if (ch === '\b' || ch === '\x7f') {
        currentLineRef.current = currentLineRef.current.slice(0, -1)
      } else if (ch >= ' ') {
        currentLineRef.current += ch
      }
    }
  }

  const navigateHistory = (direction: 'up' | 'down') => {
    const history = promptHistoryRef.current
    const id = ptyIdRef.current
    if (history.length === 0 || !id) return
    let cursor = historyCursorRef.current
    if (cursor === -1) cursor = direction === 'up' ? history.length - 1 : history.length
    else cursor = direction === 'up' ? cursor - 1 : cursor + 1
    cursor = Math.max(0, Math.min(history.length, cursor))
    historyCursorRef.current = cursor
    const entry = history[cursor] ?? ''
    void writePty(id, `\x15${entry}`)
    currentLineRef.current = entry
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container || isDormant) return

    let disposed = false
    const spawnQueueAbort = new AbortController()
    let unlistenData: (() => void) | null = null
    let unlistenExit: (() => void) | null = null
    let unlistenDragDrop: (() => void) | null = null
    let resizeTimer: number | null = null
    let writeFrame: number | null = null
    let pendingWrite = ''

    let pendingWriteBytes = 0
    let backpressurePaused = false
    const HIGH_WATERMARK = 128 * 1024
    const LOW_WATERMARK = 16 * 1024
    let flushTimer: number | null = null
    let isFlushing = false
    let lastFrameRenderTimeMs = 16
    let lastCols = 0
    let lastRows = 0
    let forceNextResize = false
    let completionMonitor: AgentCompletionMonitor | null = null
    let linkProviderDisposable: { dispose: () => void } | null = null
    let linkScrollDisposable: { dispose: () => void } | null = null
    let releaseWebglContext: (() => void) | null = null

    const resourcePolicy = useProjectsStore.getState().preferences.resourcePolicy
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      allowProposedApi: true,
      scrollback: getTerminalScrollbackRows({
        agent: command != null && command !== 'shell',
        memoryBudgetMb: resourcePolicy.memoryBudgetMb,
      }),
      windowsPty: { backend: 'conpty', buildNumber: 22000 },
      fontFamily: 'Cascadia Mono, Consolas, "Courier New", monospace',
      fontSize: 14,
      theme: getXtermTheme(terminalTheme),
    })
    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(searchAddon)
    // Unicode 11: sem ele o xterm usa tabelas do Unicode 6 e trata emoji como
    // largura 1 — os glifos saem cortados/sobrepostos. Requer allowProposedApi.
    terminal.loadAddon(new Unicode11Addon())
    try {
      terminal.unicode.activeVersion = '11'
    } catch (e) {
      console.warn('[XTermView] Não foi possível ativar Unicode 11:', e)
    }
    terminal.open(container)
    terminalRef.current = terminal
    const clampHorizontalScroll = () => {
      container.scrollLeft = 0
      const xterm = container.querySelector<HTMLElement>('.xterm')
      const viewport = container.querySelector<HTMLElement>('.xterm-viewport')
      const screen = container.querySelector<HTMLElement>('.xterm-screen')
      if (xterm) xterm.scrollLeft = 0
      if (viewport) viewport.scrollLeft = 0
      if (screen) screen.style.maxWidth = '100%'
    }
    linkProviderDisposable = terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const logicalLine = getLogicalTerminalLine(terminal.buffer.active, bufferLineNumber)
        if (!logicalLine?.text) {
          callback(undefined)
          return
        }
        const links = detectTerminalLinks(logicalLine.text).map((link) =>
          makeXtermLink(logicalLine.startLine, terminal.cols, link, {
            openMenu: showLinkActionsMenu,
          }),
        )
        callback(links.length > 0 ? links : undefined)
      },
    })

    // Se a tela rola (stream do agente), o menu — ancorado no ponto do clique —
    // apontaria pro vazio; fecha junto pra não virar fantasma.
    linkScrollDisposable = terminal.onScroll(() => {
      if (linkActionsRef.current) setLinkActions(null)
    })

    // Renderer WebGL (GPU) — o renderer DOM padrão trava a digitação,
    // principalmente com zoom da WebView ≠ 100%. Fallback: DOM renderer.
    // Skip para OpenCode — WebGL corrompe o atlas ao scrollar por muitas linhas.
    if (command === 'opencode') {
      try {
        terminal.loadAddon(new CanvasAddon())
      } catch (canvasErr) {
        console.error('[XTermView] Canvas addon falhou para opencode:', canvasErr)
      }
    } else {
      let webglAddon: WebglAddon | null = null
      releaseWebglContext = acquireWebglContext()
      if (releaseWebglContext) {
      try {
        webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          // Perda de contexto GL (ex.: muitos terminais estouram o limite de
          // contextos da WebView, ou soluço do processo de GPU). Descarta o addon
          // (o xterm volta pro renderer DOM) e NÃO recria — evita thrash.
          webglAddon?.dispose()
          webglAddon = null
          releaseWebglContext?.()
          releaseWebglContext = null
          // Canvas como fallback — o renderer DOM trava a digitação (ver acima).
          try {
            terminal.loadAddon(new CanvasAddon())
          } catch (canvasErr) {
            console.error('[XTermView] Canvas fallback falhou:', canvasErr)
          }
          // Um syncScrollArea assíncrono já agendado pode ler `dimensions` de um
          // renderer morto e lançar ("Cannot read properties of undefined
          // (reading 'dimensions')"), o que cascateia e derruba a render. Força um
          // re-fit/refresh no próximo frame pra reestabelecer as dimensões — só se
          // o container tiver tamanho válido, e sempre dentro de try/catch.
          window.requestAnimationFrame(() => {
            try {
              const rect = container.getBoundingClientRect()
              if (rect.width < 50 || rect.height < 30) return
              fitAddon.fit()
              terminal.refresh(0, Math.max(0, terminal.rows - 1))
            } catch {
              /* container invisível / em teardown — ignora */
            }
          })
        })
        terminal.loadAddon(webglAddon)
      } catch (e) {
        console.warn('[XTermView] WebGL não suportado:', e)
        webglAddon?.dispose()
        webglAddon = null
        releaseWebglContext()
        releaseWebglContext = null
        // Canvas como fallback — o renderer DOM trava a digitação (ver acima).
        try {
          terminal.loadAddon(new CanvasAddon())
        } catch (canvasErr) {
          console.error('[XTermView] Canvas fallback falhou:', canvasErr)
        }
      }
      }
    }

    useTerminalsStore.getState().focusPty(ptyId)
    const onContainerFocusIn = () => {
      useTerminalsStore.getState().focusPty(ptyId)
    }
    container.addEventListener('focusin', onContainerFocusIn)
    terminal.focus()

    const scheduleFlush = () => {
      if (isFlushing || writeFrame !== null || flushTimer !== null || disposed) return

      let delayMs = 16
      if (lastFrameRenderTimeMs >= 25) {
        delayMs = 32
      } else if (lastFrameRenderTimeMs < 4) {
        delayMs = 8
      }

      flushTimer = window.setTimeout(flushPendingWrite, delayMs)
    }

    const flushPendingWrite = () => {
      flushTimer = null
      if (!pendingWrite || isFlushing || disposed) return

      isFlushing = true
      const chunk = pendingWrite
      const chunkSize = chunk.length
      pendingWrite = ''

      const startTime = performance.now()
      terminal.write(chunk, () => {
        isFlushing = false
        // Dispose no meio do write: não agenda mais nada nem mexe em PTY.
        if (disposed) return
        lastFrameRenderTimeMs = performance.now() - startTime
        clampHorizontalScroll()

        pendingWriteBytes = Math.max(0, pendingWriteBytes - chunkSize)

        if (backpressurePaused && pendingWriteBytes <= LOW_WATERMARK) {
          backpressurePaused = false
          const currentId = ptyIdRef.current
          if (currentId) {
            void setPtyReadState(currentId, true).catch((e) =>
              console.error('[XTermView] Erro ao reatar leitura PTY:', e)
            )
          }
        }

        if (pendingWrite) {
          scheduleFlush()
        }
      })
    }

    const queueTerminalWrite = (chunk: string) => {
      if (!chunk || disposed) return
      pendingWrite += chunk
      pendingWriteBytes += chunk.length

      if (!backpressurePaused && pendingWriteBytes >= HIGH_WATERMARK) {
        backpressurePaused = true
        const currentId = ptyIdRef.current
        if (currentId) {
          void setPtyReadState(currentId, false).catch((e) =>
            console.error('[XTermView] Erro ao pausar leitura PTY:', e)
          )
        }
      }

      scheduleFlush()
    }

    const getTerminalLineHeight = () => {
      const row = container.querySelector<HTMLElement>('.xterm-rows > div')
      return row?.getBoundingClientRect().height || terminal.options.fontSize || 18
    }

    const onWheel = (event: WheelEvent) => {
      // TUIs (claude/codex) entram no buffer `alternate` e ligam mouse tracking.
      // Lá não há scrollback do host, então scrollLines() é no-op: se a gente
      // interceptasse o wheel (preventDefault), o evento sumia e nem o host nem
      // a app rolavam. Deixamos seguir pro xterm, que repassa o wheel pra app.
      // Shift força o scrollback do host (convenção iTerm2 / Windows Terminal).
      if (!shouldScrollHostScrollback(terminal.buffer.active.type, event.shiftKey)) return
      const lines = getWheelScrollLines(event, getTerminalLineHeight())
      if (lines === 0) return
      event.preventDefault()
      event.stopPropagation()
      terminal.scrollLines(lines)
    }
    container.addEventListener('wheel', onWheel, { passive: false, capture: true })

    const pasteText = (raw: string) => {
      if (!raw) return
      const id = ptyIdRef.current
      if (!id) return
      const text = normalizePastedText(raw)
      useTerminalsStore.getState().recordIo(id)
      recordPromptInput(text)
      void writePtyChunked(id, text, terminal.modes.bracketedPasteMode)
    }

    // Arrastar arquivo do SO pro terminal: o onDragDropEvent do Tauri é global,
    // então todo pane recebe o evento — cada um filtra pelo hit-test da posição
    // (física → CSS via devicePixelRatio) e só reage quando o cursor está sobre
    // o seu próprio container. Reaproveita pasteText (bracketed-paste).
    const isOverThisPane = (pos: { x: number; y: number }) => {
      const dpr = window.devicePixelRatio || 1
      const el = document.elementFromPoint(pos.x / dpr, pos.y / dpr)
      return !!el && container.contains(el)
    }
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload
        if (p.type === 'enter' || p.type === 'over') {
          setDropActive(isOverThisPane(p.position))
        } else if (p.type === 'leave') {
          setDropActive(false)
        } else if (p.type === 'drop') {
          setDropActive(false)
          if (isOverThisPane(p.position) && p.paths.length > 0) {
            pasteText(formatDroppedPaths(p.paths))
            terminal.focus()
          }
        }
      })
      .then((un) => {
        if (disposed) un()
        else unlistenDragDrop = un
      })
      .catch(() => {
        /* onDragDropEvent exige runtime Tauri; em browser puro/testes falha. */
      })

    // Digitar/enviar input mantém `lastFocusedAt` fresco (throttle 5s) — sem
    // isso o grace period de 30s do pool expira COM o usuário usando o terminal
    // (focusin só dispara ao re-focar, não a cada tecla) e ele hibernava em uso.
    let lastFocusPing = 0
    const pingFocus = () => {
      const now = Date.now()
      if (now - lastFocusPing < 5000) return
      lastFocusPing = now
      useTerminalsStore.getState().focusPty(ptyId)
    }
    terminal.onData(pingFocus)

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      pingFocus()
      const ctrl = event.ctrlKey || event.metaKey
      if (!ctrl || event.altKey) return true

      const key = event.key.toLowerCase()

      if (
        key === '+' ||
        key === '=' ||
        key === '-' ||
        key === '_' ||
        key === '0' ||
        event.code === 'NumpadAdd' ||
        event.code === 'NumpadSubtract' ||
        event.code === 'Numpad0'
      ) {
        return false
      }

      // Ctrl+C: copia se tem seleção, senão envia SIGINT pro PTY
      if (key === 'c' && terminal.hasSelection()) {
        const selection = terminal.getSelection()
        if (selection) {
          void writeClipboardText(selection).catch(() => navigator.clipboard?.writeText(selection))
          terminal.clearSelection()
          return false
        }
      }
      if (key === 'c') {
        const now = Date.now()
        const id = ptyIdRef.current
        if (id && now - lastCtrlCRef.current < 1500) {
          lastCtrlCRef.current = 0
          terminal.write('\r\n\x1b[33m[force kill — PTY terminated]\x1b[0m\r\n')
          void killPty(id)
          return false
        }
        lastCtrlCRef.current = now
      }

      if (key === 'v') {
        // OpenCode: não bloquear — deixa o xterm.js repassar pro PTY
        // (OpenCode tem suporte nativo a colar imagens).
        if (command === 'opencode') {
          return true
        }
        event.preventDefault()
        void readClipboardText()
          .catch(() => navigator.clipboard?.readText() ?? '')
          .then(pasteText)
          .catch(() => {
            terminal.focus()
          })
        return false
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        navigateHistory(event.key === 'ArrowUp' ? 'up' : 'down')
        return false
      }
      return true
    })

    const focusTerminal = () => terminal.focus()
    container.addEventListener('click', focusTerminal)

    const onPaste = (event: ClipboardEvent) => {
      // OpenCode: se há imagem no clipboard, não bloquear — o xterm.js repassa
      // pro PTY e o OpenCode processa a imagem colada nativamente.
      if (command === 'opencode') {
        const items = event.clipboardData?.items
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) return
          }
        }
      }
      const raw = event.clipboardData?.getData('text/plain') ?? ''
      event.preventDefault()
      event.stopPropagation()
      void readClipboardText()
        .catch(() => raw)
        .then(pasteText)
        .catch(() => {
          terminal.focus()
        })
    }
    container.addEventListener('paste', onPaste)

    const runResize = () => {
      resizeTimer = null
      const id = ptyIdRef.current
      if (!id) return
      // Só faz fit se o container tiver dimensões válidas (evita 0x0)
      const rect = container.getBoundingClientRect()
      if (rect.width < 50 || rect.height < 30) return
      try {
        fitAddon.fit()
      } catch {
        // fit() pode falhar se o container não estiver visível
        return
      }
      try {
        terminal.refresh(0, Math.max(0, terminal.rows - 1))
      } catch {
        /* refresh pode falhar durante teardown/layout invisível */
      }
      clampHorizontalScroll()
      const force = forceNextResize
      forceNextResize = false
      if (!force && terminal.cols === lastCols && terminal.rows === lastRows) return
      lastCols = terminal.cols
      lastRows = terminal.rows
      void resizePty(id, terminal.cols, terminal.rows)
    }
    const scheduleResize = (force = false) => {
      // Guard de unmount: neutraliza os setTimeout(120/320ms) de onResizeRequest
      // e evita re-armar o resizeTimer que o cleanup já limpou.
      if (disposed) return
      forceNextResize ||= force
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      // OpenCode redesenha a TUI inteira a cada resize — debounce maior evita
      // rajada de reflows enquanto o usuário arrasta o splitter.
      const debounceMs = command === 'opencode' ? 250 : 80
      resizeTimer = window.setTimeout(runResize, debounceMs)
    }
    const scheduleObservedResize = () => scheduleResize()
    const onResizeRequest = (event: Event) => {
      const targetPtyId = (event as CustomEvent<{ ptyId?: string }>).detail?.ptyId
      if (targetPtyId && targetPtyId !== ptyIdRef.current) return
      scheduleResize(true)
      window.setTimeout(() => scheduleResize(true), 120)
      window.setTimeout(() => scheduleResize(true), 320)
    }
    const ro = new ResizeObserver(scheduleObservedResize)
    ro.observe(container)
    window.addEventListener('alethe:zoom-changed', scheduleObservedResize)
    window.addEventListener('alethe:terminal-resize-request', onResizeRequest)

    // Fit adicional com delay pra garantir que o layout estabilizou
    const initialFitTimer = window.setTimeout(() => {
      scheduleResize()
    }, 150)

    const attachExistingPty = async (existingId: string) => {
      setBootPhase('attaching')
      ptyIdRef.current = existingId
      useTerminalsStore.getState().registerPty(existingId)
      onSpawnedRef.current?.(existingId)

      if (command === 'claude' || command === 'codex' || command === 'opencode') {
        completionMonitor = new AgentCompletionMonitor({
          ptyId: existingId,
          agent: command,
          label: command,
          cwd,
          onStatusChange: (status) =>
            useTerminalsStore.getState().setStatus(existingId, status),
          onComplete: () => onAgentCompleteRef.current?.(),
        })
      }

      const replay = await attachPty(existingId)
      if (disposed) return
      if (replay) queueTerminalWrite(replay)

      const dataUnlisten = await listenPtyData(existingId, (chunk) => {
        useTerminalsStore.getState().recordIo(existingId)
        queueTerminalWrite(chunk)
        completionMonitor?.handleOutput(chunk)
      })
      if (disposed) {
        dataUnlisten()
        return
      }
      unlistenData = dataUnlisten

      const exitUnlisten = await listenPtyExit(existingId, (payload) => {
        if (payload.reason === 'restarted') {
          useTerminalsStore.getState().markExited(existingId)
          return
        }
        if (payload.reason === 'suspended') {
          useTerminalsStore.getState().markSuspended(existingId)
          completionMonitor?.dispose()
          completionMonitor = null
          return
        }
        useTerminalsStore.getState().markExited(existingId)
        completionMonitor?.dispose()
        completionMonitor = null
        removeSession(ptyId)
        onExitRef.current?.(payload.code)
      })
      if (disposed) {
        exitUnlisten()
        return
      }
      unlistenExit = exitUnlisten

      scheduleResize()
      if (!disposed) setBootPhase('ready')
    }

    terminal.onData((data) => {
      const id = ptyIdRef.current
      if (!id) return
      useTerminalsStore.getState().recordIo(id)
      recordPromptInput(data)
      completionMonitor?.handleInput(data)
      const trackedPtyId = ptyIdRef.current
      if (trackedPtyId) recordAgentActivityInput(trackedPtyId, data)
      if (container.scrollWidth > container.clientWidth + 2) scheduleResize(true)
      clampHorizontalScroll()
      void writePty(id, data)
    })

    const RESUMABLE_AGENTS = ['claude', 'codex', 'opencode']

    async function start() {
      try {
        // Fit inicial só com dimensões válidas.
        try {
          const rect = container?.getBoundingClientRect()
          if (rect && rect.width >= 50 && rect.height >= 30) fitAddon.fit()
        } catch {
          /* sem layout ainda — o resize agendado cobre */
        }
        setCommandNotFound(null)
        setBootPhase('preparing')

        const existingRuntime = useTerminalsStore.getState().byPtyId[ptyId]
        if (existingRuntime?.alive && !existingRuntime.parked) {
          await attachExistingPty(ptyId)
          return
        }
        const backendHasPty = await ptyExists(ptyId).catch(() => false)
        if (backendHasPty) {
          await attachExistingPty(ptyId)
          return
        }

        // Fast-path: RESTORING com PTY VIVO — o processo já existe no Rust (só
        // hibernado pelo pool). Re-registra listeners sem spawn de novo. Com
        // snapshot, reidrata dele; SEM snapshot, reanexa via attachPty (replay
        // do scrollback) — nunca spawnPty com id de PTY vivo (mataria/duplicaria
        // a sessão do CLI).
        const restoringRuntime = useTerminalsStore.getState().byPtyId[ptyId]
        const currentSnapshot = restoringRuntime?.snapshot
        if (restoringRuntime?.poolState === 'RESTORING' && restoringRuntime.alive) {
          ptyIdRef.current = ptyId
          useTerminalsStore.getState().registerPty(ptyId)
          setBootPhase('attaching')
          void setPtyPriority(ptyId, true).catch(() => {})
          void setPtyReadState(ptyId, true).catch(() => {})
          if (currentSnapshot) {
            // Escreve snapshot ANSI e restaura scroll
            terminal.write(currentSnapshot.ansiBuffer, () => {
              try { terminal.scrollToLine(currentSnapshot.scrollTop) } catch { /* ignore */ }
              if (!disposed) {
                useTerminalsStore.getState().setSnapshot(ptyId, null)
                useTerminalsStore.getState().setPoolState(ptyId, 'ACTIVE')
              }
            })
          } else {
            const replayBuffer = await attachPty(ptyId)
            if (disposed) return
            if (replayBuffer) queueTerminalWrite(replayBuffer)
            useTerminalsStore.getState().setPoolState(ptyId, 'ACTIVE')
          }
          // Re-registra listener de dados
          const dataUnlisten = await listenPtyData(ptyId, (chunk) => {
            queueTerminalWrite(chunk)
            completionMonitor?.handleOutput(chunk)
          })
          if (disposed) { dataUnlisten(); return }
          unlistenData = dataUnlisten
          // Re-registra listener de exit
          const exitUnlisten = await listenPtyExit(ptyId, (payload) => {
            if (payload.reason === 'restarted') {
              useTerminalsStore.getState().markExited(ptyId)
              return
            }
            if (payload.reason === 'suspended') {
              useTerminalsStore.getState().markSuspended(ptyId)
              completionMonitor?.dispose()
              completionMonitor = null
              return
            }
            useTerminalsStore.getState().markExited(ptyId)
            completionMonitor?.dispose()
            completionMonitor = null
            removeSession(ptyId)
            onExitRef.current?.(payload.code)
          })
          if (disposed) { exitUnlisten(); return }
          unlistenExit = exitUnlisten
          scheduleResize()
          if (!disposed) setBootPhase('ready')
          return
        }

        // Pré-resolve CLI: se for agent, precisa achar override OU launcher
        // auto-detectado antes de spawnar. Sem isso, o pwsh executa `& 'claude'`
        // e mostra erro CommandNotFound dentro do terminal — UX feia.
        let launcherOverride: string | undefined
        if (command && command !== 'shell') {
          if (cliPathOverride) {
            launcherOverride = cliPathOverride
          } else {
            const auto = await findCliLauncher(command)
            if (!auto) {
              setCommandNotFound(command)
              useTerminalsStore.getState().setStatus(ptyId, 'offline')
              return
            }
          }
        }

        // projects.json é a fonte principal. O marcador de crash no localStorage
        // serve apenas de fallback para arquivos antigos que ainda não tinham ID.
        const savedSession = command && RESUMABLE_AGENTS.includes(command) ? consumeSession(ptyId) : null
        const savedConversationId = command === 'claude'
          ? savedSession?.claudeSessionId
          : command === 'codex'
            ? savedSession?.codexSessionId
            : command === 'opencode'
              ? savedSession?.opencodeSessionId
              : undefined
        let resumeId = sessionId ?? savedConversationId
        // OpenCode: quando temos savedSession mas não temos o ID da sessão,
        // usar --continue pra retomar a última sessão (OpenCode não gera UUID
        // no spawn como o Claude).
        if (command === 'opencode' && savedSession && !resumeId) {
          resumeId = '__continue__'
        }
        // Claude: valida que a conversa ainda existe no cwd antes de passar
        // --resume. Se o id ficou órfão (conversa apagada, cwd diferente de onde
        // nasceu, ou o --session-id forçado nunca virou transcript), o CLI aborta
        // com "No conversation found" — mesmo havendo conversas reais ali (que o
        // /resume interativo mostraria). Em vez de quebrar ou começar em branco,
        // RECUPERAMOS a sessão mais recente daquele cwd (snapshot vem ordenado
        // recent-first). O id recuperado é persistido logo abaixo, então se
        // auto-cura pras próximas aberturas. Só agimos quando o snapshot SUCEDE;
        // erro/timeout mantém o resume original (evita falso negativo).
        // Ressalva: com 2+ panes Claude no MESMO cwd, ambos podem cair na mesma
        // conversa mais recente — aceitável pro caso comum (1 Claude por pasta).
        if (command === 'claude' && resumeId && cwd) {
          try {
            const existing = await snapshotClaudeSessions(cwd)
            if (!existing.some((s) => s.id === resumeId)) {
              resumeId = existing[0]?.id
            }
          } catch {
            /* mantém o resume — não arrisca falso negativo */
          }
          if (disposed) return
        }
        const preparedRuntime = command
          ? preparePtyRuntimeLaunch(command, runtimeProfile, extraArgs ?? [], env)
          : { args: extraArgs ?? [], env }

        // RFC-004 — Graphify por projeto: garante o bootstrap do grafo (só o
        // primeiro agente gera; demais usam) e injeta o MCP no launch. Tudo
        // best-effort: falha do Graphify NUNCA bloqueia o spawn. Universal
        // pros 3 providers — cada um tem seu próprio mecanismo de MCP (ver
        // comentário em graphify.rs `graphify_opencode_config_write`/
        // `graphify_codex_config_write`): Claude recebe `--mcp-config` no
        // spawn; Codex/OpenCode leem de um arquivo de config no próprio
        // projeto, escrito/mesclado ANTES do spawn (sem flag extra).
        let graphifyMcpPath: string | undefined
        if (graphifyRepo && (command === 'claude' || command === 'codex' || command === 'opencode')) {
          void graphifyEnsureGraph(graphifyRepo)
            .then((status) => {
              if (status === 'started') {
                useUiStore.getState().pushToast({
                  title: translate(getLocale(), 'graphify.title'),
                  body: translate(getLocale(), 'graphify.bootstrapStarted'),
                })
              }
            })
            .catch(() => {})
          if (command === 'claude') {
            graphifyMcpPath = await graphifyMcpConfigPath(graphifyRepo).catch(() => undefined)
          } else if (command === 'opencode') {
            await graphifyOpenCodeConfigWrite(graphifyRepo).catch(() => {})
          } else if (command === 'codex') {
            await graphifyCodexConfigWrite(graphifyRepo).catch(() => {})
          }
          if (disposed) return
        }
        const launch = command
          ? buildAgentLaunch(command, preparedRuntime.args, resumeId, undefined, graphifyMcpPath)
          : { args: preparedRuntime.args, sessionId: undefined, createdSession: false }
        const spawnArgs = launch.args.length > 0 ? launch.args : undefined
        if (launch.sessionId && launch.sessionId !== sessionId) {
          onSessionIdRef.current?.(launch.sessionId)
        }
        if (command && cwd) registerSessionClaim(command, cwd, launch.sessionId, ptyId)

        // Snapshot leve das sessões Codex existentes antes do spawn para
        // identificar e persistir o ID novo sem usar `resume --last`.
        const codexSessionsBeforePromise = (command === 'codex' && cwd && !launch.sessionId)
          ? snapshotCodexSessions(cwd).catch(() => [])
          : null

        // Snapshot leve das sessões OpenCode existentes antes do spawn para
        // identificar e persistir o ID novo.
        const opencodeSessionsBeforePromise = (command === 'opencode' && cwd && !launch.sessionId)
          ? snapshotOpenCodeSessions(cwd).catch(() => [])
          : null

        // Serializa spawns globalmente — sem isso, abrir grupo com N×M terminais
        // dispara muitos spawn_pty em paralelo e trava o app.
        setBootPhase('queued')
        const acquiredSpawnSlot = await acquireSpawnSlot(spawnQueueAbort.signal)
        if (!acquiredSpawnSlot) return
        if (disposed) {
          releaseSpawnSlot()
          return
        }
        setBootPhase('spawning')

        // Node Heap Profile: injeta NODE_OPTIONS (--max-old-space-size) e
        // UV_THREADPOOL_SIZE no ambiente de agentes Node (claude/codex/opencode).
        const heapProfile = useProjectsStore.getState().preferences.nodeHeapProfile
        const nodeHeap: Record<string, string> = {}
        if (command && ['claude', 'codex', 'opencode'].includes(command) && heapProfile) {
          const heapMb = heapProfile === 'conservative' ? 96 : heapProfile === 'balanced' ? 128 : 256
          const existing = env?.['NODE_OPTIONS'] ?? ''
          nodeHeap.NODE_OPTIONS = existing
            ? `${existing} --max-old-space-size=${heapMb}`
            : `--max-old-space-size=${heapMb}`
          nodeHeap.UV_THREADPOOL_SIZE = '4'
        }
        const spawnEnv = { ...preparedRuntime.env, ...nodeHeap }

        let response: { id: string }
        try {
          response = await spawnPty({
            cols: terminal.cols,
            rows: terminal.rows,
            id: ptyId,
            command: command ?? undefined,
            cwd: cwd ?? undefined,
            extraArgs: spawnArgs,
            launcherOverride,
            env: Object.keys(spawnEnv).length > 0 ? spawnEnv : undefined,
          })
        } finally {
          releaseSpawnSlot()
        }
        if (disposed) return
        setBootPhase('attaching')
        ptyIdRef.current = response.id
        useTerminalsStore.getState().registerPty(response.id)
        onSpawnedRef.current?.(response.id)

        if (command === 'claude' || command === 'codex' || command === 'opencode') {
          completionMonitor = new AgentCompletionMonitor({
            ptyId: response.id,
            agent: command,
            label: command,
            cwd,
            onStatusChange: (status) =>
              useTerminalsStore.getState().setStatus(response.id, status),
            onComplete: () => onAgentCompleteRef.current?.(),
          })
        }

        // Marca sessão como ativa — se o app fechar abruptamente, o próximo
        // spawn vai consumir essa entrada e injetar o resume adequado da CLI.
        if (command && RESUMABLE_AGENTS.includes(command)) {
          saveSession(ptyId, {
            sessionId: response.id,
            claudeSessionId: command === 'claude' ? launch.sessionId : undefined,
            codexSessionId: command === 'codex' ? launch.sessionId : undefined,
            opencodeSessionId: command === 'opencode' ? launch.sessionId : undefined,
            cwd: cwd ?? '',
            agent: command,
            timestamp: Date.now(),
          })

          // Codex precisa do ID especifico; `resume --last` junta terminais
          // diferentes na mesma conversa quando existem 2+ Codex abertos.
          if (command === 'codex' && cwd && codexSessionsBeforePromise) {
            const detectCodexSession = async () => {
              const before = new Set((await codexSessionsBeforePromise).map((s) => s.id))
              // Janela ~30s (10×3s): o Codex às vezes leva a escrever o arquivo de
              // sessão (init do app-server, cwd frio), e sem detectar o id o boot
              // seguinte começa do zero. Para assim que acha; sem custo se detectar rápido.
              for (let attempt = 0; attempt < 10; attempt++) {
                // Acorda no hint do watcher (session://new) ou no teto de 3s.
                await Promise.race([
                  new Promise((r) => setTimeout(r, 3000)),
                  waitForSessionHint('codex'),
                ])
                if (disposed) return
                const sessions = await snapshotCodexSessions(cwd).catch(() => [])
                const newSession = claimDiscoveredSession('codex', cwd, before, sessions, ptyId)
                if (newSession) {
                  saveSession(ptyId, {
                    sessionId: response.id,
                    codexSessionId: newSession.id,
                    cwd: cwd ?? '',
                    agent: command,
                    timestamp: Date.now(),
                  })
                  onSessionIdRef.current?.(newSession.id)
                  return
                }
              }
            }
            void detectCodexSession()
          }

          // OpenCode: detecta o ID da sessão nova pós-spawn (similar ao Codex).
          // Quando usamos --continue, a sessão já existe — pegamos a mais recente.
          if (command === 'opencode' && cwd && opencodeSessionsBeforePromise) {
            const detectOpenCodeSession = async () => {
              const before = new Set((await opencodeSessionsBeforePromise).map((s) => s.id))
              for (let attempt = 0; attempt < 4; attempt++) {
                await Promise.race([
                  new Promise((r) => setTimeout(r, 3000)),
                  waitForSessionHint('opencode'),
                ])
                if (disposed) return
                const sessions = await snapshotOpenCodeSessions(cwd).catch(() => [])
                // Primeiro tenta achar sessão NOVA (não estava no before).
                const newSession = claimDiscoveredSession('opencode', cwd, before, sessions)
                if (newSession) {
                  saveSession(ptyId, {
                    sessionId: response.id,
                    opencodeSessionId: newSession.id,
                    cwd: cwd ?? '',
                    agent: command,
                    timestamp: Date.now(),
                  })
                  onSessionIdRef.current?.(newSession.id)
                  return
                }
                // Se usamos --continue e não achou nova, pega a mais recente.
                if (resumeId === '__continue__' && sessions.length > 0) {
                  const mostRecent = sessions[0]
                  saveSession(ptyId, {
                    sessionId: response.id,
                    opencodeSessionId: mostRecent.id,
                    cwd: cwd ?? '',
                    agent: command,
                    timestamp: Date.now(),
                  })
                  onSessionIdRef.current?.(mostRecent.id)
                  return
                }
              }
            }
            void detectOpenCodeSession()
          }
        }

        let replay: string | null = null
        const snapshot = useTerminalsStore.getState().byPtyId[ptyId]?.snapshot

        if (snapshot) {
          terminal.write(snapshot.ansiBuffer, () => {
            try {
              terminal.scrollToLine(snapshot.scrollTop)
            } catch { /* ignore */ }
            if (!disposed) {
              useTerminalsStore.getState().setPoolState(ptyId, 'ACTIVE')
            }
          })
          void setPtyPriority(response.id, true).catch(() => {})
          void setPtyReadState(response.id, true).catch(() => {})
        } else {
          replay = await attachPty(response.id)
          if (disposed) return
          if (replay) queueTerminalWrite(replay)
        }

        // Race fix: se o componente desmontar entre o await e a atribuição,
        // a cleanup function já rodou com unlistenData/unlistenExit ainda
        // undefined — chamamos manualmente pra evitar listener órfão.
        const dataUnlisten = await listenPtyData(response.id, (chunk) => {
          useTerminalsStore.getState().recordIo(response.id)
          queueTerminalWrite(chunk)
          completionMonitor?.handleOutput(chunk)
        })
        if (disposed) {
          dataUnlisten()
          return
        }
        unlistenData = dataUnlisten

        const exitUnlisten = await listenPtyExit(response.id, (payload) => {
          if (payload.reason === 'restarted') {
            useTerminalsStore.getState().markExited(response.id)
            return
          }
          if (payload.reason === 'suspended') {
            useTerminalsStore.getState().markSuspended(response.id)
            completionMonitor?.dispose()
            completionMonitor = null
            return
          }
          useTerminalsStore.getState().markExited(response.id)
          completionMonitor?.dispose()
          completionMonitor = null
          // Clean exit → não resume na próxima vez
          removeSession(ptyId)
          onExitRef.current?.(payload.code)
        })
        if (disposed) {
          exitUnlisten()
          return
        }
        unlistenExit = exitUnlisten

        scheduleResize()
        if (!disposed) setBootPhase('ready')
      } catch (err) {
        terminal.writeln(`Failed to start PTY: ${String(err)}`)
        if (!disposed) setBootPhase('ready')
      }
    }
    void start()

    return () => {
      disposed = true
      spawnQueueAbort.abort()
      container.removeEventListener('wheel', onWheel, true)
      container.removeEventListener('click', focusTerminal)
      container.removeEventListener('paste', onPaste)
      container.removeEventListener('focusin', onContainerFocusIn)
      window.removeEventListener('alethe:zoom-changed', scheduleObservedResize)
      window.removeEventListener('alethe:terminal-resize-request', onResizeRequest)
      ro.disconnect()
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      if (writeFrame !== null) window.cancelAnimationFrame(writeFrame)
      if (flushTimer !== null) window.clearTimeout(flushTimer)
      pendingWrite = ''
      // Se desmontou com o PTY pausado, retoma a leitura — sem isso o PTY fica bloqueado.
      if (backpressurePaused) {
        const pausedId = ptyIdRef.current
        if (pausedId) void setPtyReadState(pausedId, true).catch(() => {})
        backpressurePaused = false
      }
      window.clearTimeout(initialFitTimer)
      unlistenData?.()
      unlistenExit?.()
      unlistenDragDrop?.()
      linkProviderDisposable?.dispose()
      linkScrollDisposable?.dispose()
      completionMonitor?.dispose()
      completionMonitor = null
      setLinkActions(null)
      if (terminalRef.current === terminal) terminalRef.current = null
      ptyIdRef.current = null
      terminal.dispose()
      releaseWebglContext?.()
      releaseWebglContext = null
    }
    // ptyId/retryKey/isDormant são as chaves de identidade. `isDormant` (e NÃO
    // `poolState` cru): hibernar desmonta 1×, acordar remonta 1×, e transições
    // intermediárias (HIBERNATING/RESTORING→ACTIVE) não recriam nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId, retryKey, isDormant])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    terminal.options.theme = getXtermTheme(terminalTheme)
  }, [terminalTheme])

  const configurePath = useCallback(
    async (agent: AgentType) => {
      const picked = await pickFile({
        title: `Selecione o executável do ${agent}`,
        filters: [
          { name: 'Executável', extensions: ['cmd', 'exe', 'bat', 'ps1'] },
          { name: 'Todos', extensions: ['*'] },
        ],
      })
      if (!picked) return
      setCliPath(agent, picked)
      setCommandNotFound(null)
      setRetryKey((v) => v + 1)
    },
    [setCliPath],
  )

  const bootLabel =
    bootPhase === 'preparing'
      ? t('term.bootPreparing')
      : bootPhase === 'queued'
        ? t('term.bootQueued')
      : bootPhase === 'spawning'
        ? t('term.bootSpawning')
        : bootPhase === 'attaching'
          ? t('term.bootAttaching')
          : null

  return (
    <>
      {poolState === 'FAILED' ? (
        <div className={styles.overlay}>
          <div className={styles.overlayText} style={{ color: 'var(--status-stopped)' }}>
            <strong>Falha ao reidratar o terminal.</strong>
          </div>
          <button
            type="button"
            className={styles.overlayBtn}
            onClick={() => useTerminalsStore.getState().setPoolState(ptyId, 'ACTIVE')}
          >
            Tentar Novamente
          </button>
        </div>
      ) : poolState === 'HIBERNATED' ? (
        <div className={styles.overlay}>
          <div className={styles.overlayText} style={{ color: 'var(--fg-muted)', fontFamily: 'monospace' }}>
            [Terminal Suspenso — RAM Liberada]
          </div>
          <button
            type="button"
            className={styles.overlayBtn}
            onClick={() => useTerminalsStore.getState().setPoolState(ptyId, 'ACTIVE')}
          >
            Reativar
          </button>
        </div>
      ) : (
        <div
          ref={containerRef}
          className={`${styles.host} ${dropActive ? styles.dropActive : ''}`}
          style={{ background: getXtermTheme(terminalTheme).background }}
        />
      )}
      {bootLabel && !commandNotFound ? (
        <div className={styles.bootOverlay}>
          <div className={styles.bootSpinner} aria-hidden />
          <div className={styles.bootLabel}>{bootLabel}</div>
        </div>
      ) : null}
      {commandNotFound ? (
        <div className={styles.overlay}>
          <div className={styles.overlayText}>
            <strong>{commandNotFound}</strong> não encontrado nesta máquina.
          </div>
          <button
            type="button"
            className={styles.overlayBtn}
            onClick={() => void configurePath(commandNotFound as AgentType)}
          >
            Configure path…
          </button>
        </div>
      ) : null}
      {linkActions ? (
        <div
          ref={linkMenuRef}
          className={styles.linkMenu}
          style={{ left: linkActions.x, top: linkActions.y }}
          role="menu"
          aria-label={t('xterm.linkMenu')}
          onPointerDown={(event) => {
            event.stopPropagation()
            if (event.target === event.currentTarget) event.preventDefault()
          }}
        >
          <div className={styles.linkMenuHeader}>
            <span className={styles.linkMenuText} title={linkActions.text}>
              {linkActions.text}
            </span>
            <button
              type="button"
              className={styles.linkMenuClose}
              onClick={hideLinkActions}
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              <X size={14} />
            </button>
          </div>
          <div className={styles.linkMenuItems}>
            {(linkActions.fileKind === 'markdown' || linkActions.fileKind === 'text') &&
            projectId ? (
              <button
                type="button"
                className={styles.linkMenuItem}
                role="menuitem"
                onClick={() => {
                  openFileInGrid(linkActions.text)
                  hideLinkActions()
                }}
              >
                <LayoutGrid size={15} />
                <span>{t('xterm.openInGrid')}</span>
              </button>
            ) : null}
            {linkActions.kind === 'url' ? (
              <button
                type="button"
                className={styles.linkMenuItem}
                role="menuitem"
                onClick={() => {
                  openLinkInAppViewer(linkActions.text)
                  hideLinkActions()
                }}
              >
                <AppWindow size={15} />
                <span>{t('xterm.openInApp')}</span>
              </button>
            ) : null}
            <button
              type="button"
              className={styles.linkMenuItem}
              role="menuitem"
              onClick={() => {
                void openLinkInBrowser(linkActions.text)
                hideLinkActions()
              }}
            >
              <ExternalLink size={15} />
              <span>
                {t(
                  linkActions.kind === 'url'
                    ? 'xterm.openInBrowser'
                    : 'xterm.openInDefaultApp',
                )}
              </span>
            </button>
            {linkActions.kind === 'path' ? (
              <button
                type="button"
                className={styles.linkMenuItem}
                role="menuitem"
                onClick={() => {
                  void openLinkInFolder(linkActions.text)
                  hideLinkActions()
                }}
              >
                <FolderOpen size={15} />
                <span>{t('xterm.openInFolder')}</span>
              </button>
            ) : null}
            <button
              type="button"
              className={styles.linkMenuItem}
              role="menuitem"
              onClick={() => {
                void copyLinkText(linkActions.text)
                hideLinkActions()
              }}
            >
              <Copy size={15} />
              <span>{t('xterm.copy')}</span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
