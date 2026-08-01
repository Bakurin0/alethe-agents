import { useEffect, useRef } from 'react'

import {
  ghosttySetFocus,
  ghosttySetHidden,
  ghosttySpawn,
  ghosttySurfaceExited,
  ghosttySyncFrame,
  type WebRect,
} from '../../lib/tauri'
import { webRectsEqual } from '../../lib/webRect'

export type GhosttySurfaceProps = {
  /** ID estável da surface — usamos o id da sub-tab (mesmo papel do ptyId). */
  surfaceId: string
  /** Diretório inicial. undefined = padrão do shell. */
  cwd?: string
  /** Linha de comando a executar (agente). undefined = shell de login. */
  command?: string
  /**
   * True quando esta é a sub-tab ativa do pane. Quando false, a surface
   * continua VIVA (shell/agente rodando) mas escondida — é assim que trocar de
   * tab preserva o estado (espelha o PTY persistente do xterm). Só a surface
   * ativa é montada+visível; matar de verdade é no unmount (fechar o pane).
   */
  active?: boolean
  onSpawned?: (id: string) => void
  /** Chamado quando o processo do terminal (shell/agente) sai — o pane fecha. */
  onExit?: () => void
}

/**
 * Renderiza um placeholder no DOM e mantém uma NSView nativa do Ghostty alinhada
 * a ele. A NSView vive FORA da WebView (irmã dela, por cima), então toda a
 * posição/tamanho é empurrada pro backend via `ghostty_sync_frame`.
 *
 * macOS-only: o componente só é montado quando `platform === 'macos'` e a flag
 * `nativeTerminalMacos` está ligada (decisão no TerminalPane). Em outras
 * plataformas os comandos retornariam erro, então nem chegamos aqui.
 *
 * O `command`/`cwd` são lidos na criação da surface (o backend Ghostty spawna o
 * processo no nascimento da surface). Trocar de sub-tab NÃO remonta: todas as
 * surfaces do pane ficam montadas e só a `active` fica visível+focada (as
 * outras seguem vivas mas escondidas). É o que preserva o estado ao voltar —
 * espelha o PTY persistente do xterm. A surface só é morta no unmount real
 * (fechar o pane / fechar a sub-tab).
 */
export function GhosttySurface({
  surfaceId,
  cwd,
  command,
  active = true,
  onSpawned,
  onExit,
}: GhosttySurfaceProps) {
  const placeholderRef = useRef<HTMLDivElement | null>(null)
  const lastRectRef = useRef<WebRect | null>(null)
  const rafRef = useRef<number | null>(null)
  const spawnedRef = useRef(false)

  // cwd/command capturados na 1ª montagem (a surface spawna o processo uma vez).
  const spawnArgsRef = useRef({ cwd, command })

  // onSpawned é recriado a cada render do pai; guardamos num ref para o efeito
  // de ciclo de vida NÃO depender dele — senão a cada re-render do TerminalPane
  // a surface seria morta e recriada (e o terminal piscaria/reiniciaria).
  const onSpawnedRef = useRef(onSpawned)
  const onExitRef = useRef(onExit)
  useEffect(() => {
    onSpawnedRef.current = onSpawned
    onExitRef.current = onExit
  })

  // Valor de `active` lido dentro dos efeitos (que não dependem dele p/ não
  // recriar observers). O efeito dedicado abaixo dispara a reavaliação.
  const activeRef = useRef(active)
  // Reavaliação de hidden registrada pelo efeito de visibilidade; chamada
  // quando `active` muda para aplicar hidden/foco/re-sync sem recriar observers.
  const reevaluateVisibilityRef = useRef<(() => void) | null>(null)
  // scheduleFrame vive no efeito de ciclo de vida; exposto p/ o efeito de
  // visibilidade forçar um re-sync do frame ao reativar a tab.
  const scheduleFrameRef = useRef<(() => void) | null>(null)
  // Posicionamento SÍNCRONO (sem rAF) — usado quando o rAF pode não disparar
  // (WebView oculta atrás de modal no boot). Garante o 1º sync_frame.
  const pushFrameNowRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const node = placeholderRef.current
    if (!node) return

    let disposed = false

    // Empurra o rect atual do placeholder pro backend, coalescido em rAF pra
    // não disparar um IPC por pixel durante um drag de separador.
    const pushFrame = () => {
      rafRef.current = null
      if (disposed) return
      const r = node.getBoundingClientRect()
      // Placeholder sem tamanho (layout ainda não assentou) → rect degenerado.
      // Não empurramos: o ResizeObserver reagenda quando ganhar tamanho real.
      if (r.width < 1 || r.height < 1) return
      const rect: WebRect = { x: r.left, y: r.top, width: r.width, height: r.height }
      if (webRectsEqual(lastRectRef.current, rect)) return
      lastRectRef.current = rect
      void ghosttySyncFrame(surfaceId, rect, window.devicePixelRatio || 1)
    }

    const scheduleFrame = () => {
      if (rafRef.current !== null) return
      rafRef.current = window.requestAnimationFrame(pushFrame)
    }
    scheduleFrameRef.current = scheduleFrame

    // Posiciona AGORA, sem esperar rAF. Enquanto um modal cobre a tela no boot, a
    // WebView pode não pintar, e um requestAnimationFrame pendente nunca dispara —
    // deixando rafRef travado e a surface no frame de nascimento (janela inteira,
    // cobrindo a UI). O caminho direto garante o 1º posicionamento independente
    // do pintor. Usado pós-spawn e ao reexibir a tab.
    const pushFrameNow = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      pushFrame()
    }
    pushFrameNowRef.current = pushFrameNow

    const start = async () => {
      try {
        const { cwd, command } = spawnArgsRef.current
        const res = await ghosttySpawn({ id: surfaceId, cwd, command })
        if (disposed) return
        spawnedRef.current = true
        onSpawnedRef.current?.(res.id)
        // Posiciona já (síncrono) + um reforço no próximo tick, caso o layout do
        // placeholder ainda não tenha assentado no exato instante do spawn.
        pushFrameNow()
        window.setTimeout(() => pushFrameNow(), 50)
      } catch (err) {
        console.error('ghostty_spawn falhou', err)
      }
    }
    void start()

    // Reposiciona a surface em qualquer mudança de layout: resize do
    // placeholder (separadores, troca de layout) e resize da janela.
    const ro = new ResizeObserver(scheduleFrame)
    ro.observe(node)
    window.addEventListener('resize', scheduleFrame)
    // Scroll de qualquer ancestral também move o rect na tela.
    window.addEventListener('scroll', scheduleFrame, true)

    return () => {
      disposed = true
      ro.disconnect()
      window.removeEventListener('resize', scheduleFrame)
      window.removeEventListener('scroll', scheduleFrame, true)
      scheduleFrameRef.current = null
      pushFrameNowRef.current = null
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      // NÃO matamos a surface no unmount. O componente desmonta ao trocar de aba
      // /projeto (o pane sai de vista), e matar aqui reiniciaria o shell/agente —
      // exatamente o bug "o terminal reseta ao voltar". A surface segue viva no
      // backend; só é morta por ação explícita de fechar (cleanupPtys →
      // ghosttyKill) ou pela limpeza de órfãs no boot (ghosttyKillAll). Enquanto
      // some da tela, escondemos a NSView para não vazar sobre a aba nova.
      void ghosttySetHidden(surfaceId, true)
    }
  }, [surfaceId])

  // Esconde a NSView nativa quando ela não deveria estar visível. A NSView vive
  // ACIMA do HTML, então nenhum z-index CSS a cobre — precisamos ocultá-la
  // explicitamente em dois casos:
  //   1. o placeholder saiu do viewport (scroll / troca de aba) — IntersectionObserver;
  //   2. há um modal aberto por cima — um overlay HTML NÃO muda a interseção do
  //      placeholder, então a surface "vazaria" por cima do diálogo. Detectamos
  //      qualquer Radix Dialog aberto ([role="dialog"][data-state="open"]), o que
  //      cobre todos os modais do app, inclusive o onboarding ("Criar perfil").
  useEffect(() => {
    const node = placeholderRef.current
    if (!node) return

    let intersecting = true
    let lastHidden: boolean | null = null
    let lastFocused: boolean | null = null

    const anyModalOpen = () => document.querySelector('[role="dialog"][data-state="open"]') !== null

    const applyHidden = () => {
      // Tab inativa também esconde: a surface segue viva, só sai da tela.
      const hidden = !activeRef.current || !intersecting || anyModalOpen()
      // O IPC vai à main thread do macOS; só dispara quando o estado muda.
      if (hidden !== lastHidden) {
        // Ao reaparecer, garante um re-sync do frame (o layout pode ter mudado
        // enquanto a tab estava oculta — ex.: resize da janela). O placeholder
        // fica sempre com tamanho real (position:absolute), então o rect é válido.
        // Síncrono: se um modal estava por cima, o rAF pode não ter disparado.
        if (!hidden) pushFrameNowRef.current?.()
        lastHidden = hidden
        void ghosttySetHidden(surfaceId, hidden)
      }
      // Foco de teclado acompanha o estado visível: só a surface ativa e à
      // vista recebe foco; escondida perde (senão roubaria o teclado da ativa).
      const focused = !hidden
      if (focused !== lastFocused) {
        lastFocused = focused
        void ghosttySetFocus(surfaceId, focused)
      }
    }
    reevaluateVisibilityRef.current = applyHidden

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) intersecting = entry.isIntersecting
        applyHidden()
      },
      { threshold: 0 },
    )
    io.observe(node)

    // Reavalia sempre que modais entram/saem do DOM (abrir/fechar diálogo).
    const mo = new MutationObserver(applyHidden)
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    })

    return () => {
      io.disconnect()
      mo.disconnect()
      reevaluateVisibilityRef.current = null
    }
  }, [surfaceId])

  // Troca de sub-tab ativa/inativa: atualiza o ref e reavalia hidden/foco.
  // NÃO recria os observers (deps [surfaceId]) — só empurra o novo estado.
  useEffect(() => {
    activeRef.current = active
    reevaluateVisibilityRef.current?.()
  }, [active])

  // Detecção de saída do processo: o Ghostty (backend EXEC) não emite evento de
  // exit pro app — só mostra "Press any key to close" na própria surface. Fazemos
  // polling leve do estado do processo e, ao sair, disparamos onExit (o pane
  // fecha e o layout reajusta). Espelha o listenPtyExit do xterm.
  useEffect(() => {
    let stopped = false
    const iv = window.setInterval(async () => {
      if (stopped) return
      // Só depois do spawn confirmado: antes disso a surface não está no mapa do
      // backend e o comando reportaria "saiu" (ausente), fechando o pane novo.
      if (!spawnedRef.current) return
      try {
        const exited = await ghosttySurfaceExited(surfaceId)
        if (exited && !stopped) {
          stopped = true
          window.clearInterval(iv)
          onExitRef.current?.()
        }
      } catch {
        /* erro transitório — tenta de novo */
      }
    }, 700)
    return () => {
      stopped = true
      window.clearInterval(iv)
    }
  }, [surfaceId])

  // Cada surface do pane é posicionada ABSOLUTA (inset:0) para EMPILHAR todas na
  // mesma área do terminalArea (que é flex) — se fossem filhos flex normais, N
  // tabs dividiriam o espaço em vez de sobrepor. A tab inativa continua ocupando
  // a área (rect real, não 0×0 — o que manteria o sync funcionando), apenas
  // invisível via `visibility:hidden` + a NSView escondida por ghosttySetHidden.
  // Assim o placeholder SEMPRE tem tamanho, e o pushFrame sempre posiciona certo.
  return (
    <div
      ref={placeholderRef}
      style={{
        position: 'absolute',
        inset: 0,
        visibility: active ? 'visible' : 'hidden',
        pointerEvents: active ? 'auto' : 'none',
      }}
      data-ghostty-surface={surfaceId}
    />
  )
}
