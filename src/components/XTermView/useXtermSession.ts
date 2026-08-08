import { getCurrentWebview } from '@tauri-apps/api/webview'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useEffect } from 'react'

import { recordAgentActivityInput } from '../../lib/activityTracker'
import { AgentCompletionMonitor } from '../../lib/agentCompletionMonitor'
import { preparePtyRuntimeLaunch } from '../../lib/agentRuntimeAdapter'
import { getLocale, translate } from '../../lib/i18n'
import {
  claimDiscoveredSession,
  claimMostRecentSession,
  isSessionClaimed,
  registerSessionClaim,
} from '../../lib/sessionDiscovery'
import { buildAgentLaunch } from '../../lib/sessionLaunch'
import {
  consumeSession,
  removeSession,
  savedConversationIdFor,
  saveSession,
} from '../../lib/sessionResume'
import { waitForSessionHint } from '../../lib/sessionWatch'
import { acquireSpawnSlot, releaseSpawnSlot } from '../../lib/spawnQueue'
import {
  aiMemoryCodexConfigWrite,
  aiMemoryDetect,
  aiMemoryMcpConfigPath,
  aiMemoryOpenCodeConfigWrite,
  attachPty,
  findCliLauncher,
  graphifyCodexConfigWrite,
  graphifyEnsureGraph,
  graphifyMcpConfigPath,
  graphifyOpenCodeConfigWrite,
  killPty,
  listenPtyData,
  listenPtyExit,
  ptyExists,
  readClipboardPayload,
  resizePty,
  snapshotAntigravitySessions,
  snapshotClaudeSessions,
  snapshotCodexSessions,
  snapshotOpenCodeSessions,
  spawnPty,
  writeClipboardText,
  writePty,
} from '../../lib/tauri'
import {
  agentCliCommand,
  type AgentRuntimeProfile,
  type AgentType,
  type Theme,
} from '../../lib/types'
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
  type DetectedTerminalLink,
  detectTerminalLinks,
  getLogicalTerminalLine,
  makeXtermLink,
} from './terminalLinks'
import { TERMINAL_WRITE_FRAME_BUDGET, writePtyChunked } from './terminalWrite'
import { getXtermTheme, type LinkActionState } from './xtermThemes'

// Early exits trigger a single fresh-session retry.
const EARLY_EXIT_MS = 4000

// Avisa uma única vez por sessão do app quando a feature "AI Memory" está ligada
// mas o binário ai-memory não foi encontrado — não bloqueia o spawn do agente.
let aiMemoryMissingWarned = false

type BootPhase = 'preparing' | 'queued' | 'spawning' | 'attaching' | 'ready'

/**
 * Sessão do terminal xterm + PTY. É o coração do XTermView: cria o terminal,
 * conecta o streaming de dados/exit, resize, buffer de escrita, links e
 * drag-drop. Extraído VERBATIM do XTermView (mesmo corpo, mesma ordem de
 * setup/teardown, mesmas deps `[sessionPersistenceKey, retryKey]`) para reduzir
 * o index.tsx sem reescrever a lógica sensível — os valores do componente
 * (refs, setters de estado e helpers) são passados como argumentos.
 */
export function useXtermSession(params: {
  ptyId: string
  command?: AgentType | null
  cwd?: string | null
  extraArgs?: string[]
  initialInput?: string
  sessionId?: string
  env?: Record<string, string>
  graphifyRepo?: string | null
  runtimeProfile: AgentRuntimeProfile
  terminalTheme: Theme
  cliPathOverride: string | null
  sessionPersistenceKey: string
  retryKey: number
  containerRef: MutableRefObject<HTMLDivElement | null>
  terminalRef: MutableRefObject<Terminal | null>
  ptyIdRef: MutableRefObject<string | null>
  lastCtrlCRef: MutableRefObject<number>
  linkActionsRef: MutableRefObject<LinkActionState | null>
  spawnedAtRef: MutableRefObject<number>
  usedResumeRef: MutableRefObject<boolean>
  earlyExitRetriedRef: MutableRefObject<boolean>
  forceFreshRef: MutableRefObject<boolean>
  onSpawnedRef: MutableRefObject<((id: string) => void) | undefined>
  onSessionIdRef: MutableRefObject<((id: string | undefined) => void) | undefined>
  onInitialInputSentRef: MutableRefObject<(() => void) | undefined>
  onExitRef: MutableRefObject<((code: number | null) => void) | undefined>
  onAgentCompleteRef: MutableRefObject<(() => void) | undefined>
  setBootPhase: Dispatch<SetStateAction<BootPhase>>
  setCommandNotFound: Dispatch<SetStateAction<string | null>>
  setLinkActions: Dispatch<SetStateAction<LinkActionState | null>>
  setRetryKey: Dispatch<SetStateAction<number>>
  setDropActive: Dispatch<SetStateAction<boolean>>
  showLinkActionsMenu: (event: MouseEvent, link: DetectedTerminalLink) => void
  recordPromptInput: (data: string) => void
  navigateHistory: (direction: 'up' | 'down') => void
}) {
  const {
    ptyId,
    command,
    cwd,
    extraArgs,
    initialInput,
    sessionId,
    env,
    graphifyRepo,
    runtimeProfile,
    terminalTheme,
    cliPathOverride,
    sessionPersistenceKey,
    retryKey,
    containerRef,
    terminalRef,
    ptyIdRef,
    lastCtrlCRef,
    linkActionsRef,
    spawnedAtRef,
    usedResumeRef,
    earlyExitRetriedRef,
    forceFreshRef,
    onSpawnedRef,
    onSessionIdRef,
    onInitialInputSentRef,
    onExitRef,
    onAgentCompleteRef,
    setBootPhase,
    setCommandNotFound,
    setLinkActions,
    setRetryKey,
    setDropActive,
    showLinkActionsMenu,
    recordPromptInput,
    navigateHistory,
  } = params

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (import.meta.env.DEV) {
      console.debug('[Alethe][xterm] mount', {
        sessionPersistenceKey,
        retryKey,
        ptyId: ptyIdRef.current,
      })
    }

    let disposed = false
    const spawnQueueAbort = new AbortController()
    let unlistenData: (() => void) | null = null
    let unlistenExit: (() => void) | null = null
    let unlistenDragDrop: (() => void) | null = null
    let resizeTimer: number | null = null
    let writeFrame: number | null = null
    let pendingWrites: string[] = []
    let pendingWriteLength = 0
    let resumeErrorBuffer = ''
    let lastCols = 0
    let lastRows = 0
    let forceNextResize = false
    let completionMonitor: AgentCompletionMonitor | null = null
    let linkProviderDisposable: { dispose: () => void } | null = null
    let linkScrollDisposable: { dispose: () => void } | null = null
    let writeRecoveryPending = false
    let queuedInput = ''
    let inputFlushScheduled = false
    let inputWriteChain = Promise.resolve()

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
    // Sem isso, o xterm.js usa as tabelas de largura Unicode 6 (default) pra
    // decidir quantas colunas cada caractere ocupa — emojis e símbolos largos
    // (usados no TUI do OpenCode, ex. status bar) ficam com largura diferente
    // da que o próprio CLI assume, desalinhando toda linha que os contém de
    // forma permanente (não é um problema de redraw — nenhuma tecla conserta).
    terminal.loadAddon(new Unicode11Addon())
    terminal.unicode.activeVersion = '11'
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
    let webglAddon: WebglAddon | null = null
    // O renderer WebGL pode perder o contexto durante o teardown do WebView e
    // deixar o xterm com `renderer.dimensions` indefinido em um callback
    // assÃ­ncrono. No Windows/WebView, manter o renderer DOM evita esse crash.
    let releaseWebglContext: (() => void) | null = null
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
              terminal.focus()
            } catch {
              /* container invisível / em teardown — ignora */
            }
          })
        })
        terminal.loadAddon(webglAddon)
      } catch {
        webglAddon?.dispose()
        webglAddon = null
      }
    }

    terminal.focus()

    const flushPendingWrite = () => {
      writeFrame = null
      if (pendingWriteLength === 0) return

      let budget = TERMINAL_WRITE_FRAME_BUDGET
      let output = ''
      while (budget > 0 && pendingWrites.length > 0) {
        const head = pendingWrites[0]
        const take = Math.min(budget, head.length)
        output += head.slice(0, take)
        budget -= take
        pendingWriteLength -= take
        if (take === head.length) pendingWrites.shift()
        else pendingWrites[0] = head.slice(take)
      }

      if (output) {
        terminal.write(output)
        clampHorizontalScroll()
      }
      if (pendingWriteLength > 0) {
        writeFrame = window.requestAnimationFrame(flushPendingWrite)
      }
    }

    const queueTerminalWrite = (chunk: string) => {
      if (!chunk) return
      pendingWrites.push(chunk)
      pendingWriteLength += chunk.length
      if (writeFrame !== null) return
      writeFrame = window.requestAnimationFrame(flushPendingWrite)
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
      // Colar NUNCA pode quebrar o pane: qualquer erro (normalização, PTY morto,
      // invoke falhando) é engolido e só logado. Sem terminal vivo, ignora.
      try {
        if (!raw) return
        const id = ptyIdRef.current
        if (!id) return
        const text = normalizePastedText(raw)
        useTerminalsStore.getState().recordIo(id)
        recordPromptInput(text)
        void writePtyChunked(id, text, terminal.modes.bracketedPasteMode).catch((err) => {
          console.warn('[pty-paste] falha ao escrever colagem no PTY (ignorado):', err)
        })
      } catch (err) {
        console.warn('[pty-paste] colagem ignorada (erro):', err)
      }
    }

    // Resolve o clipboard do SO pra uma string colável no PTY: texto vira
    // texto puro; arquivos do Explorer (CF_HDROP) e imagens cruas (CF_DIB /
    // formato "PNG" registrado, já salvas como PNG temporário pelo backend)
    // reaproveitam formatDroppedPaths — o mesmo formato usado no drag-and-drop.
    const resolveClipboardPaste = async (): Promise<string> => {
      const payload = await readClipboardPayload()
      switch (payload.kind) {
        case 'text':
          return payload.text
        case 'paths':
          return formatDroppedPaths(payload.paths)
        case 'image':
          return formatDroppedPaths([payload.path])
        case 'empty':
          return ''
      }
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

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
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
        event.preventDefault()
        void resolveClipboardPaste()
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
    const restoreHoveredFocus = () => {
      if (document.visibilityState === 'hidden' || !container.matches(':hover')) return
      terminal.focus()
    }
    container.addEventListener('pointerdown', focusTerminal, true)
    container.addEventListener('click', focusTerminal)
    window.addEventListener('focus', restoreHoveredFocus)
    document.addEventListener('visibilitychange', restoreHoveredFocus)

    const onPaste = (event: ClipboardEvent) => {
      const raw = event.clipboardData?.getData('text/plain') ?? ''
      event.preventDefault()
      event.stopPropagation()
      void resolveClipboardPaste()
        .catch(() => raw)
        .then(pasteText)
        .catch(() => {
          terminal.focus()
        })
    }
    container.addEventListener('paste', onPaste)

    const flushInput = () => {
      inputFlushScheduled = false
      if (disposed || !queuedInput) return
      const id = ptyIdRef.current
      if (!id) return
      const chunk = queuedInput
      queuedInput = ''
      inputWriteChain = inputWriteChain
        .then(() => writePty(id, chunk))
        .catch((error) => {
          console.warn(`[pty-input] falha ao escrever em ${id}; solicitando recuperaÃ§Ã£o`, error)
          if (disposed || writeRecoveryPending) return
          writeRecoveryPending = true
          window.dispatchEvent(
            new CustomEvent('alethe:terminal-restart-request', { detail: { ptyId: id } }),
          )
          window.setTimeout(() => {
            writeRecoveryPending = false
          }, 5_000)
        })
    }
    const queueInput = (id: string, data: string) => {
      if (id !== ptyIdRef.current || !data) return
      queuedInput += data
      if (inputFlushScheduled) return
      inputFlushScheduled = true
      queueMicrotask(flushInput)
    }

    const runResize = () => {
      resizeTimer = null
      const id = ptyIdRef.current
      if (!id) return
      // Só faz fit se o container tiver dimensões válidas (evita 0x0)
      const rect = container.getBoundingClientRect()
      if (rect.width < 50 || rect.height < 30) return
      try {
        fitAddon.fit()
      } catch (error) {
        if (import.meta.env.DEV) console.error('[Alethe][xterm] fit failed', error)
        // fit() pode falhar se o container não estiver visível
        return
      }
      try {
        terminal.refresh(0, Math.max(0, terminal.rows - 1))
      } catch (error) {
        if (import.meta.env.DEV) console.error('[Alethe][xterm] refresh failed', error)
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
      resizeTimer = window.setTimeout(runResize, 80)
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
          onStatusChange: (status) => useTerminalsStore.getState().setStatus(existingId, status),
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
        console.info(
          `[pty-launch] ${command ?? 'shell'} EXIT (attach) id=${existingId} code=${payload.code ?? '—'} reason=${payload.reason ?? '—'}`,
        )
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
        removeSession(sessionPersistenceKey)
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
      queueInput(id, data)
    })

    const RESUMABLE_AGENTS = ['claude', 'codex', 'opencode', 'antigravity']

    async function start() {
      try {
        // Skip zero-sized panes; the observer retries after layout settles.
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

        // Pré-resolve CLI: se for agent, precisa achar override OU launcher
        // auto-detectado antes de spawnar. Sem isso, o pwsh executa `& 'claude'`
        // e mostra erro CommandNotFound dentro do terminal — UX feia.
        let launcherOverride: string | undefined
        if (command && command !== 'shell') {
          if (cliPathOverride) {
            launcherOverride = cliPathOverride
            console.info(`[pty-launch] ${command} usando override: ${cliPathOverride}`)
          } else {
            const auto = await findCliLauncher(agentCliCommand(command) ?? command)
            console.info(
              `[pty-launch] ${command} findCliLauncher → ${auto ?? 'null (NÃO ENCONTRADO)'}`,
            )
            if (!auto) {
              console.warn(
                `[pty-launch] ${command} não resolvido — mostrando overlay "not found" e ficando offline`,
              )
              setCommandNotFound(command)
              useTerminalsStore.getState().setStatus(ptyId, 'offline')
              return
            }
          }
        }

        // projects.json é a fonte principal. O marcador de crash no localStorage
        // serve apenas de fallback para arquivos antigos que ainda não tinham ID.
        const savedSession =
          command && RESUMABLE_AGENTS.includes(command)
            ? consumeSession(sessionPersistenceKey)
            : null
        const savedConversationId = savedConversationIdFor(savedSession, command, cwd)
        let resumeId = sessionId ?? savedConversationId
        // Fallback: se a tentativa anterior morreu no nascimento usando resume,
        // reabre ignorando o id órfão para nascer uma sessão limpa.
        if (forceFreshRef.current) {
          console.warn(`[pty-launch] ${command} reabrindo SEM resume (fallback de early-exit)`)
          resumeId = undefined
        }
        if (resumeId && cwd && command && isSessionClaimed(command, cwd, resumeId, sessionPersistenceKey)) {
          console.warn(`[pty-launch] ${command} session ${resumeId} is already claimed; starting a fresh writer`)
          resumeId = undefined
          removeSession(sessionPersistenceKey)
          onSessionIdRef.current?.(undefined)
        }
        // Reserve the resume ID before creating the PTY. Without this early
        // claim, two panes can pass the check above at the same time and both
        // launch `codex resume`, which makes Codex reject one writer.
        if (resumeId && cwd && command) {
          registerSessionClaim(command, cwd, resumeId, sessionPersistenceKey)
        }
        // Valida a conversa antes de passar o argumento de resume. IDs persistidos
        // podem ficar órfãos após limpeza de histórico ou sincronização entre PCs;
        // nesse caso removemos o vínculo e iniciamos uma conversa limpa.
        if (
          (command === 'claude' ||
            command === 'codex' ||
            command === 'antigravity' ||
            command === 'opencode') &&
          resumeId &&
          cwd
        ) {
          try {
            const existing =
              command === 'claude'
                ? await snapshotClaudeSessions(cwd)
                : command === 'codex'
                  ? await snapshotCodexSessions(cwd)
                  : command === 'antigravity'
                    ? await snapshotAntigravitySessions(cwd)
                    : await snapshotOpenCodeSessions(cwd)
            if (!existing.some((session) => session.id === resumeId)) {
              console.warn(`[pty-launch] ${command} ignorando sessão órfã ${resumeId}`)
              resumeId = undefined
              removeSession(sessionPersistenceKey)
              onSessionIdRef.current?.(undefined)
            }
          } catch {
            /* mantém o resume — não arrisca falso negativo */
          }
          if (disposed) return
        }
        // OpenCode não permite escolher o ID no nascimento (ao contrário do
        // Claude) — sem um ID salvo válido, reivindicamos aqui a conversa mais
        // recente ainda não pega por outro pane (ex.: reabrir o app depois de
        // fechado). `!forceFreshRef.current` é essencial: no fallback de
        // early-exit (abaixo) o resumeId acabou de ser zerado de propósito
        // porque a sessão órfã matou o agente no nascimento — reivindicar de
        // novo aqui recriaria o mesmo loop.
        if (command === 'opencode' && !resumeId && cwd && !forceFreshRef.current) {
          try {
            const sessions = await snapshotOpenCodeSessions(cwd)
            const claimed = claimMostRecentSession('opencode', cwd, sessions)
            if (claimed) resumeId = claimed.id
          } catch {
            /* sem sessão prévia — segue pro nível 3 (CLI cria uma nova) */
          }
          if (disposed) return
        }
        const preparedRuntime = command
          ? preparePtyRuntimeLaunch(command, runtimeProfile, extraArgs ?? [], env)
          : { args: extraArgs ?? [], env }
        // RFC-004 — Graphify por projeto: garante o bootstrap do grafo e injeta o
        // MCP nos 3 CLIs. Best-effort — falha do Graphify NUNCA bloqueia o spawn.
        // Claude recebe `--mcp-config`; Codex/OpenCode recebem por merge no config
        // do projeto (não têm flag), escrito antes do spawn.
        // Servidores MCP gerenciados pelo Alethe. Claude aceita `--mcp-config`
        // repetido, então acumulamos os paths numa lista (Graphify + ai-memory
        // coexistem sem um sobrescrever o outro). Codex/OpenCode recebem por merge
        // no config do projeto (não têm flag). Tudo best-effort — nunca bloqueia
        // o spawn.
        const mcpConfigPaths: string[] = []
        // RFC-004 — Graphify por projeto (flag em `project.graphifyEnabled`).
        if (
          graphifyRepo &&
          (command === 'claude' || command === 'codex' || command === 'opencode')
        ) {
          void graphifyEnsureGraph(graphifyRepo).catch(() => undefined)
          if (command === 'claude') {
            const p = await graphifyMcpConfigPath(graphifyRepo).catch(() => undefined)
            if (p) mcpConfigPaths.push(p)
          } else if (command === 'opencode') {
            await graphifyOpenCodeConfigWrite(graphifyRepo).catch(() => {})
          } else if (command === 'codex') {
            await graphifyCodexConfigWrite(graphifyRepo).catch(() => {})
          }
          if (disposed) return
        }
        // ai-memory — feature GLOBAL (preference `enabledFeatures.aiMemory`), não
        // por-projeto. O servidor roteia o projeto pela cwd do agente. Só injeta
        // se o binário estiver instalado; senão avisa uma vez e segue sem memória.
        const aiMemoryEnabled = useProjectsStore.getState().preferences.enabledFeatures.aiMemory
        if (
          aiMemoryEnabled &&
          cwd &&
          (command === 'claude' || command === 'codex' || command === 'opencode')
        ) {
          const status = await aiMemoryDetect().catch(() => undefined)
          if (status?.installed) {
            if (command === 'claude') {
              const p = await aiMemoryMcpConfigPath(cwd).catch(() => undefined)
              if (p) mcpConfigPaths.push(p)
            } else if (command === 'opencode') {
              await aiMemoryOpenCodeConfigWrite(cwd).catch(() => {})
            } else if (command === 'codex') {
              await aiMemoryCodexConfigWrite(cwd).catch(() => {})
            }
          } else if (!aiMemoryMissingWarned) {
            aiMemoryMissingWarned = true
            useUiStore.getState().pushToast({
              title: translate(getLocale(), 'aiMemory.notInstalledTitle'),
              body: translate(getLocale(), 'aiMemory.notInstalledBody'),
            })
          }
          if (disposed) return
        }
        const launch = command
          ? buildAgentLaunch(command, preparedRuntime.args, resumeId, undefined, mcpConfigPaths)
          : { args: preparedRuntime.args, sessionId: undefined, createdSession: false }
        const spawnArgs = launch.args.length > 0 ? launch.args : undefined
        if (command && command !== 'shell') {
          console.info(
            `[pty-launch] ${command} args=${JSON.stringify(spawnArgs ?? [])} resumeId=${resumeId ?? '—'} launcherOverride=${launcherOverride ?? '(auto/PATH)'}`,
          )
        }
        if (launch.sessionId && launch.sessionId !== sessionId) {
          onSessionIdRef.current?.(launch.sessionId)
        }
        if (command && cwd) registerSessionClaim(command, cwd, launch.sessionId)

        // Snapshot leve antes do spawn para identificar e persistir o ID novo
        // de agentes que não permitem escolher o ID no nascimento.
        const discoveredSessionsBeforePromise =
          cwd && !launch.sessionId
            ? command === 'codex'
              ? snapshotCodexSessions(cwd).catch(() => [])
              : command === 'antigravity'
                ? snapshotAntigravitySessions(cwd).catch(() => [])
                : command === 'opencode'
                  ? snapshotOpenCodeSessions(cwd).catch(() => [])
                  : null
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
        let response: { id: string }
        try {
          response = await spawnPty({
            cols: terminal.cols,
            rows: terminal.rows,
            id: ptyId,
            command: command ? agentCliCommand(command) : undefined,
            cwd: cwd ?? undefined,
            extraArgs: spawnArgs,
            launcherOverride,
            env: preparedRuntime.env,
          })
        } finally {
          releaseSpawnSlot()
        }
        console.info(`[pty-launch] ${command ?? 'shell'} spawn OK id=${response.id}`)
        spawnedAtRef.current = Date.now()
        usedResumeRef.current = Boolean(resumeId)
        if (disposed) return
        setBootPhase('attaching')
        ptyIdRef.current = response.id
        useTerminalsStore.getState().registerPty(response.id)
        onSpawnedRef.current?.(response.id)
        if (command && cwd && launch.sessionId) {
          registerSessionClaim(command, cwd, launch.sessionId, response.id)
        }

        if (command === 'claude' || command === 'codex' || command === 'opencode') {
          completionMonitor = new AgentCompletionMonitor({
            ptyId: response.id,
            agent: command,
            label: command,
            cwd,
            onStatusChange: (status) => useTerminalsStore.getState().setStatus(response.id, status),
            onComplete: () => onAgentCompleteRef.current?.(),
          })
        }

        // Marca sessão como ativa — se o app fechar abruptamente, o próximo
        // spawn vai consumir essa entrada e injetar o resume adequado da CLI.
        if (command && RESUMABLE_AGENTS.includes(command)) {
          saveSession(sessionPersistenceKey, {
            sessionId: response.id,
            claudeSessionId: command === 'claude' ? launch.sessionId : undefined,
            codexSessionId: command === 'codex' ? launch.sessionId : undefined,
            opencodeSessionId: command === 'opencode' ? launch.sessionId : undefined,
            antigravitySessionId: command === 'antigravity' ? launch.sessionId : undefined,
            cwd: cwd ?? '',
            agent: command,
            timestamp: Date.now(),
          })

          // Codex, Antigravity e OpenCode não permitem escolher o ID no
          // nascimento — precisam do ID específico descoberto depois do spawn
          // pra não misturar conversas de panes diferentes no próximo boot.
          if (
            (command === 'codex' || command === 'antigravity' || command === 'opencode') &&
            cwd &&
            discoveredSessionsBeforePromise
          ) {
            const detectCreatedSession = async () => {
              const before = new Set((await discoveredSessionsBeforePromise).map((s) => s.id))
              // Janela ~30s (10×3s): o Codex às vezes leva a escrever o arquivo de
              // sessão (init do app-server, cwd frio), e sem detectar o id o boot
              // seguinte começa do zero. Para assim que acha; sem custo se detectar rápido.
              for (let attempt = 0; attempt < 10; attempt++) {
                if (command === 'codex') {
                  await Promise.race([
                    new Promise((resolve) => setTimeout(resolve, 3000)),
                    waitForSessionHint('codex'),
                  ])
                } else {
                  await new Promise((resolve) => setTimeout(resolve, 3000))
                }
                if (disposed) return
                const sessions =
                  command === 'codex'
                    ? await snapshotCodexSessions(cwd).catch(() => [])
                    : command === 'antigravity'
                      ? await snapshotAntigravitySessions(cwd).catch(() => [])
                      : await snapshotOpenCodeSessions(cwd).catch(() => [])
                const newSession = claimDiscoveredSession(
                  command,
                  cwd,
                  before,
                  sessions,
                  response.id,
                )
                if (newSession) {
                  saveSession(sessionPersistenceKey, {
                    sessionId: response.id,
                    codexSessionId: command === 'codex' ? newSession.id : undefined,
                    antigravitySessionId: command === 'antigravity' ? newSession.id : undefined,
                    opencodeSessionId: command === 'opencode' ? newSession.id : undefined,
                    cwd: cwd ?? '',
                    agent: command,
                    timestamp: Date.now(),
                  })
                  onSessionIdRef.current?.(newSession.id)
                  return
                }
              }
            }
            void detectCreatedSession()
          }
        }

        const replay = await attachPty(response.id)
        if (disposed) return
        let resumeConflictHandled = false
        if (
          replay &&
          command === 'codex' &&
          usedResumeRef.current &&
          /already has an active writer|thread\/resume failed/i.test(replay)
        ) {
          resumeConflictHandled = true
          earlyExitRetriedRef.current = true
          forceFreshRef.current = true
          removeSession(sessionPersistenceKey)
          onSessionIdRef.current?.(undefined)
          terminal.write('\r\n\x1b[33m[alethe] Codex session is busy — opening a fresh session…\x1b[0m\r\n')
          void killPty(response.id).catch(() => {})
          setRetryKey((value) => value + 1)
          return
        }
        if (replay) queueTerminalWrite(replay)

        // Race fix: se o componente desmontar entre o await e a atribuição,
        // a cleanup function já rodou com unlistenData/unlistenExit ainda
        // undefined — chamamos manualmente pra evitar listener órfão.
        const dataUnlisten = await listenPtyData(response.id, (chunk) => {
          useTerminalsStore.getState().recordIo(response.id)
          queueTerminalWrite(chunk)
          completionMonitor?.handleOutput(chunk)
          if (command === 'codex' && usedResumeRef.current && !resumeConflictHandled) {
            // PTY events can split the bootstrap error between chunks, so keep
            // a bounded rolling buffer instead of matching each chunk alone.
            resumeErrorBuffer = `${resumeErrorBuffer}${chunk}`.slice(-8192)
          }
          if (
            command === 'codex' &&
            usedResumeRef.current &&
            !resumeConflictHandled &&
            /already has an active writer|thread\/resume failed/i.test(resumeErrorBuffer)
          ) {
            resumeConflictHandled = true
            earlyExitRetriedRef.current = true
            forceFreshRef.current = true
            removeSession(sessionPersistenceKey)
            onSessionIdRef.current?.(undefined)
            terminal.write('\r\n\x1b[33m[alethe] Codex session is busy — opening a fresh session…\x1b[0m\r\n')
            void killPty(response.id).catch(() => {})
            setRetryKey((value) => value + 1)
          }
        })
        if (disposed) {
          dataUnlisten()
          return
        }
        unlistenData = dataUnlisten

        const exitUnlisten = await listenPtyExit(response.id, (payload) => {
          console.info(
            `[pty-launch] ${command ?? 'shell'} EXIT id=${response.id} code=${payload.code ?? '—'} reason=${payload.reason ?? '—'}`,
          )
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
          const isAgent =
            command === 'claude' ||
            command === 'codex' ||
            command === 'opencode' ||
            command === 'antigravity'
          const elapsed = Date.now() - spawnedAtRef.current
          // Fallback 1: agent morreu no nascimento COM resume → sessão órfã.
          // Limpa e reabre uma vez com sessão nova, em vez de deixar o pane cinza.
          if (
            isAgent &&
            elapsed < EARLY_EXIT_MS &&
            usedResumeRef.current &&
            !earlyExitRetriedRef.current
          ) {
            earlyExitRetriedRef.current = true
            forceFreshRef.current = true
            console.warn(
              `[pty-launch] ${command} saiu em ${elapsed}ms com resume — reabrindo sessão nova (fallback)`,
            )
            useTerminalsStore.getState().markExited(response.id)
            completionMonitor?.dispose()
            completionMonitor = null
            removeSession(sessionPersistenceKey)
            onSessionIdRef.current?.(undefined)
            terminal.write(
              '\r\n\x1b[33m[alethe] sessão anterior indisponível — reabrindo sessão nova…\x1b[0m\r\n',
            )
            setRetryKey((v) => v + 1)
            return
          }
          // Fallback 2: agent morreu no nascimento SEM resume (binário/instalação
          // quebrada). Não relança em loop; deixa um aviso visível em vez de cinza.
          if (isAgent && elapsed < EARLY_EXIT_MS) {
            console.warn(
              `[pty-launch] ${command} saiu em ${elapsed}ms (code ${payload.code ?? '—'}) — sem retry`,
            )
            terminal.write(
              `\r\n\x1b[31m[alethe] ${command} encerrou imediatamente (code ${payload.code ?? '—'}).\x1b[0m\r\n` +
                '\x1b[90mVerifique a instalação do CLI ou configure o caminho nas preferências.\x1b[0m\r\n',
            )
          }
          useTerminalsStore.getState().markExited(response.id)
          completionMonitor?.dispose()
          completionMonitor = null
          // Clean exit → não resume na próxima vez
          removeSession(sessionPersistenceKey)
          onExitRef.current?.(payload.code)
        })
        if (disposed) {
          exitUnlisten()
          return
        }
        unlistenExit = exitUnlisten

        const prompt = initialInput?.trim()
        if (prompt) {
          const sendInitialInput = async () => {
            const earliestSendAt = Date.now() + 1_500
            const timedSendAt = Date.now() + 4_000
            const deadline = Date.now() + 10_000
            while (!disposed && Date.now() < deadline) {
              await new Promise((resolve) => window.setTimeout(resolve, 250))
              const runtime = useTerminalsStore.getState().byPtyId[response.id]
              const quietFor = runtime ? Date.now() - runtime.lastIoAt : 0
              if (
                Date.now() >= earliestSendAt &&
                runtime?.alive &&
                (quietFor >= 700 || Date.now() >= timedSendAt)
              ) break
            }
            if (disposed) return
            try {
              await writePtyChunked(response.id, prompt, true)
              await new Promise((resolve) => window.setTimeout(resolve, 150))
              await writePty(response.id, '\r')
              window.setTimeout(() => void writePty(response.id, '\r').catch(() => {}), 1_200)
              onInitialInputSentRef.current?.()
            } catch (error) {
              console.warn('[pty-launch] não foi possível enviar o prompt inicial:', error)
            }
          }
          void sendInitialInput()
        }

        scheduleResize()
        if (!disposed) setBootPhase('ready')
      } catch (err) {
        console.error(`[pty-launch] ${command ?? 'shell'} FALHOU ao iniciar PTY:`, err)
        terminal.writeln(`Failed to start PTY: ${String(err)}`)
        if (!disposed) setBootPhase('ready')
      }
    }
    void start()

    return () => {
      if (import.meta.env.DEV) {
        console.debug('[Alethe][xterm] unmount', {
          sessionPersistenceKey,
          retryKey,
          ptyId: ptyIdRef.current,
        })
      }
      disposed = true
      spawnQueueAbort.abort()
      container.removeEventListener('wheel', onWheel, true)
      container.removeEventListener('pointerdown', focusTerminal, true)
      container.removeEventListener('click', focusTerminal)
      container.removeEventListener('paste', onPaste)
      window.removeEventListener('focus', restoreHoveredFocus)
      document.removeEventListener('visibilitychange', restoreHoveredFocus)
      window.removeEventListener('alethe:zoom-changed', scheduleObservedResize)
      window.removeEventListener('alethe:terminal-resize-request', onResizeRequest)
      ro.disconnect()
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      if (writeFrame !== null) window.cancelAnimationFrame(writeFrame)
      pendingWrites = []
      pendingWriteLength = 0
      queuedInput = ''
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
    // A identidade estável da sub-tab evita remontar assim que o spawn troca o
    // ptyId temporário pelo ID real; isso também deixa a descoberta assíncrona
    // da conversa terminar e persistir o ID antes de um reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPersistenceKey, retryKey])
}
