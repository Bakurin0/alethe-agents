import { create } from 'zustand'

/**
 * Fase 2 do agent canvas — estado compartilhado entre canvas e modal.
 *
 * Tudo entra por `ingest(raw)` (payload cru do evento Tauri `agent-hook`).
 * Correlação é 100% por `agent_id`: confirmado na Etapa 0 que SubagentStart/
 * Stop e os PreToolUse DENTRO do subagent trazem o mesmo id, e que os
 * PreToolUse da sessão principal vêm SEM `agent_id` — é isso que impede a
 * sessão principal de virar card.
 *
 * O prompt do subagent não vem no SubagentStart; ele vem no PreToolUse da
 * SESSÃO PRINCIPAL com tool_name "Agent"/"Task" (tool_input.description/
 * .prompt/.subagent_type). Guardamos como pendência por tipo e o próximo
 * SubagentStart do mesmo tipo consome (FIFO) — com 2+ spawns simultâneos do
 * MESMO tipo a ordem pode trocar prompt entre irmãos, mas o id do card em si
 * nunca embaralha.
 */

export type AgentHookPayload = {
  hook_event_name?: string
  session_id?: string
  agent_id?: string
  agent_type?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_use_id?: string
  last_assistant_message?: string
  agent_transcript_path?: string
  /** Eventos de team (Fase 4). */
  task_id?: string
  task_subject?: string
  task_description?: string
  teammate_name?: string
  team_name?: string
}

export type ToolEvent = {
  toolUseId: string
  toolName: string
  summary: string
  ts: number
}

export type AgentNode = {
  id: string
  agentType: string
  /**
   * 'subagent' = worker efêmero das Fases 1–2.
   * 'teammate' = membro de Agent Team (Fase 4). In-process, cada turno do
   * teammate encarna como um subagent com agent_type = NOME do teammate e um
   * agent_id novo — o node é um só, agregando as encarnações.
   */
  kind: 'subagent' | 'teammate'
  /** Nome do time (só teammates). */
  team: string | null
  /** Quantas encarnações (turnos) já rodaram (só teammates). */
  turns: number
  /** description do Agent tool call que (provavelmente) spawnou este node. */
  prompt: string | null
  status: 'running' | 'idle' | 'done'
  startedAt: number
  endedAt: number | null
  result: string | null
  transcriptPath: string | null
  feed: ToolEvent[]
}

export type TeamTask = {
  id: string
  subject: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
  owner: string | null
}

/** Cap por node — feed é observabilidade, não histórico infinito. */
const FEED_CAP = 300

const SPAWNER_TOOLS = new Set(['Agent', 'Task'])

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Resumo de uma linha por tool call, pro feed do card/modal. */
export function summarizeTool(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return ''
  const basename = (p: string) => p.split(/[\\/]/).pop() ?? p
  const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s)

  const filePath = str(input.file_path) ?? str(input.notebook_path)
  if (filePath) return basename(filePath)

  switch (toolName) {
    case 'Bash':
    case 'PowerShell':
      return clip(str(input.command) ?? '')
    case 'Grep':
      return clip(str(input.pattern) ?? '')
    case 'Glob':
      return clip(str(input.pattern) ?? '')
    case 'WebFetch':
      return clip(str(input.url) ?? '')
    case 'WebSearch':
      return clip(str(input.query) ?? '')
    case 'Agent':
    case 'Task':
      return clip(str(input.description) ?? '')
    default: {
      const firstString = Object.values(input).find((v) => typeof v === 'string' && v.length > 0)
      return firstString ? clip(firstString as string) : ''
    }
  }
}

type PendingPrompt = { description: string | null; prompt: string | null }

type AgentCanvasState = {
  nodes: AgentNode[]
  selectedId: string | null
  lastEventAt: number | null
  /** Prompts de Agent tool calls da sessão principal aguardando o Start. */
  pendingPrompts: Record<string, PendingPrompt[]>
  /** Nome do team ativo (PreToolUse TeamCreate do lead). */
  teamName: string | null
  /** Task list compartilhada do time, por task_id. */
  tasks: Record<string, TeamTask>
  /** agent_id de cada encarnação de teammate → id do node teammate. */
  incarnations: Record<string, string>

  ingest: (raw: AgentHookPayload) => void
  select: (id: string | null) => void
  clear: () => void
}

export const useAgentCanvasStore = create<AgentCanvasState>((set, get) => ({
  nodes: [],
  selectedId: null,
  lastEventAt: null,
  pendingPrompts: {},
  teamName: null,
  tasks: {},
  incarnations: {},

  ingest: (raw) => {
    const event = raw.hook_event_name
    set({ lastEventAt: Date.now() })

    if (event === 'SubagentStart') {
      const id = raw.agent_id
      if (!id) {
        console.warn('[agentCanvasStore] SubagentStart sem agent_id, ignorado:', raw)
        return
      }
      set((s) => {
        if (s.nodes.some((n) => n.id === id)) return s
        const agentType = raw.agent_type ?? 'unknown'

        // Teammate in-process: cada turno encarna como subagent com
        // agent_type = nome do teammate. Se já existe node teammate com esse
        // nome, é uma encarnação dele — não cria card novo.
        const teammateIdx = s.nodes.findIndex(
          (n) => n.kind === 'teammate' && n.agentType === agentType,
        )
        if (teammateIdx !== -1) {
          console.log(`[agentCanvasStore] encarnação de teammate ${agentType}: ${id}`)
          const nodes = [...s.nodes]
          nodes[teammateIdx] = {
            ...nodes[teammateIdx],
            status: 'running',
            turns: nodes[teammateIdx].turns + 1,
          }
          return {
            nodes,
            incarnations: { ...s.incarnations, [id]: nodes[teammateIdx].id },
          }
        }

        // Consome o prompt pendente mais antigo desse tipo (FIFO).
        const queue = s.pendingPrompts[agentType] ?? []
        const pending = queue[0] ?? null
        console.log(
          `[agentCanvasStore] node criado id=${id} type=${agentType} prompt=${pending?.description ?? '(sem)'}`,
        )
        return {
          nodes: [
            ...s.nodes,
            {
              id,
              agentType,
              kind: 'subagent',
              team: null,
              turns: 0,
              prompt: pending?.description ?? pending?.prompt ?? null,
              status: 'running',
              startedAt: Date.now(),
              endedAt: null,
              result: null,
              transcriptPath: null,
              feed: [],
            },
          ],
          pendingPrompts: pending
            ? { ...s.pendingPrompts, [agentType]: queue.slice(1) }
            : s.pendingPrompts,
        }
      })
      return
    }

    if (event === 'SubagentStop') {
      const id = raw.agent_id
      if (!id) return
      set((s) => {
        // Encarnação de teammate terminando = teammate fica idle (não done —
        // ele acorda de novo no próximo turno).
        const teammateNodeId = s.incarnations[id]
        const idx = s.nodes.findIndex((n) => n.id === (teammateNodeId ?? id))
        if (idx === -1) {
          console.warn('[agentCanvasStore] SubagentStop órfão:', id)
          return s
        }
        const isTeammate = s.nodes[idx].kind === 'teammate'
        console.log(`[agentCanvasStore] ${isTeammate ? 'teammate idle' : 'node done'} id=${id}`)
        const nodes = [...s.nodes]
        nodes[idx] = {
          ...nodes[idx],
          status: isTeammate ? 'idle' : 'done',
          endedAt: Date.now(),
          result: raw.last_assistant_message ?? nodes[idx].result,
          transcriptPath: raw.agent_transcript_path ?? nodes[idx].transcriptPath,
        }
        // Poda a encarnação que terminou: sem isto, `incarnations` ganharia uma
        // entrada por turno de teammate, pra sempre (a maior fonte de crescimento).
        if (s.incarnations[id] === undefined) return { nodes }
        const incarnations = { ...s.incarnations }
        delete incarnations[id]
        return { nodes, incarnations }
      })
      return
    }

    if (event === 'PreToolUse') {
      const agentId = raw.agent_id
      const input = raw.tool_input ?? {}

      // TaskUpdate (lead OU teammate) → estado da task list.
      if (raw.tool_name === 'TaskUpdate') {
        const taskId = str(input.taskId) ?? str(input.task_id)
        if (taskId) {
          set((s) => {
            const prev = s.tasks[taskId]
            const status =
              (str(input.status) as TeamTask['status'] | null) ?? prev?.status ?? 'pending'
            return {
              tasks: {
                ...s.tasks,
                [taskId]: {
                  id: taskId,
                  subject: prev?.subject ?? str(input.subject) ?? `task ${taskId}`,
                  description: prev?.description ?? '',
                  status,
                  owner: str(input.owner) ?? prev?.owner ?? null,
                },
              },
            }
          })
        }
        // segue — se veio de um teammate, também entra no feed dele abaixo.
      }

      if (!agentId) {
        // Sessão principal (lead).
        if (raw.tool_name === 'TeamCreate') {
          const teamName = str(input.team_name)
          console.log('[agentCanvasStore] TeamCreate:', teamName)
          if (teamName) set({ teamName })
          return
        }
        if (raw.tool_name && SPAWNER_TOOLS.has(raw.tool_name)) {
          const teammateName = str(input.name)
          const teamName = str(input.team_name)
          if (teammateName && teamName) {
            // Spawn de TEAMMATE (tool_input tem name+team_name; subagent comum
            // tem subagent_type). Cria o card grande do teammate.
            const nodeId = `teammate:${teammateName}`
            console.log(`[agentCanvasStore] teammate spawnado: ${teammateName} (${teamName})`)
            set((s) => {
              if (s.nodes.some((n) => n.id === nodeId)) return s
              return {
                teamName: s.teamName ?? teamName,
                nodes: [
                  ...s.nodes,
                  {
                    id: nodeId,
                    agentType: teammateName,
                    kind: 'teammate',
                    team: teamName,
                    turns: 0,
                    prompt: str(input.prompt) ?? str(input.description),
                    status: 'running',
                    startedAt: Date.now(),
                    endedAt: null,
                    result: null,
                    transcriptPath: null,
                    feed: [],
                  },
                ],
              }
            })
            return
          }
          // Spawn de subagent comum: guarda description/prompt pro próximo
          // Start do mesmo tipo casar.
          const subagentType = str(input.subagent_type) ?? 'general-purpose'
          set((s) => ({
            pendingPrompts: {
              ...s.pendingPrompts,
              // Limita a fila: spawns órfãos (sem Start correspondente) não podem
              // acumular pra sempre.
              [subagentType]: [
                ...(s.pendingPrompts[subagentType] ?? []),
                { description: str(input.description), prompt: str(input.prompt) },
              ].slice(-32),
            },
          }))
        }
        return
      }

      const toolEvent: ToolEvent = {
        toolUseId: raw.tool_use_id ?? `${Date.now()}-${Math.random()}`,
        toolName: raw.tool_name ?? '?',
        summary: summarizeTool(raw.tool_name ?? '', raw.tool_input),
        ts: Date.now(),
      }
      set((s) => {
        // agent_id pode ser uma encarnação de teammate — resolve pro node dele.
        const targetId = s.incarnations[agentId] ?? agentId
        const idx = s.nodes.findIndex((n) => n.id === targetId)
        if (idx === -1) {
          // Start se perdeu (listener fora do ar no spawn) — ensureNode: cria
          // o card aqui mesmo. Seguro porque a sessão principal nunca chega
          // neste branch (não tem agent_id).
          console.warn(
            `[agentCanvasStore] PreToolUse sem node, criando via ensureNode id=${agentId}`,
          )
          return {
            nodes: [
              ...s.nodes,
              {
                id: agentId,
                agentType: raw.agent_type ?? 'unknown',
                kind: 'subagent',
                team: null,
                turns: 0,
                prompt: null,
                status: 'running',
                startedAt: Date.now(),
                endedAt: null,
                result: null,
                transcriptPath: null,
                feed: [toolEvent],
              },
            ],
          }
        }
        const nodes = [...s.nodes]
        const feed = [...nodes[idx].feed, toolEvent].slice(-FEED_CAP)
        nodes[idx] = { ...nodes[idx], feed }
        return { nodes }
      })
      return
    }

    if (event === 'TeammateIdle') {
      const name = raw.teammate_name
      if (!name) return
      set((s) => {
        const idx = s.nodes.findIndex((n) => n.kind === 'teammate' && n.agentType === name)
        if (idx === -1) return s
        if (s.nodes[idx].status === 'idle') return s
        console.log(`[agentCanvasStore] TeammateIdle: ${name}`)
        const nodes = [...s.nodes]
        nodes[idx] = { ...nodes[idx], status: 'idle' }
        return { nodes }
      })
      return
    }

    if (event === 'TaskCreated') {
      const id = raw.task_id
      if (!id) return
      console.log(`[agentCanvasStore] TaskCreated #${id}: ${raw.task_subject}`)
      set((s) => ({
        tasks: {
          ...s.tasks,
          [id]: {
            id,
            subject: raw.task_subject ?? `task ${id}`,
            description: raw.task_description ?? '',
            status: s.tasks[id]?.status ?? 'pending',
            owner: s.tasks[id]?.owner ?? null,
          },
        },
      }))
      return
    }

    if (event === 'TaskCompleted') {
      const id = raw.task_id
      if (!id) return
      // Dispara repetido (3x por task no smoke test) — upsert dedupa sozinho.
      set((s) => {
        if (s.tasks[id]?.status === 'completed') return s
        console.log(`[agentCanvasStore] TaskCompleted #${id} por ${raw.teammate_name}`)
        return {
          tasks: {
            ...s.tasks,
            [id]: {
              id,
              subject: raw.task_subject ?? s.tasks[id]?.subject ?? `task ${id}`,
              description: raw.task_description ?? s.tasks[id]?.description ?? '',
              status: 'completed',
              owner: raw.teammate_name ?? s.tasks[id]?.owner ?? null,
            },
          },
        }
      })
      return
    }

    // PostToolUse: por ora só observabilidade no log do Rust — nada no store.
  },

  select: (id) => {
    if (id && !get().nodes.some((n) => n.id === id)) return
    set({ selectedId: id })
  },

  clear: () =>
    set({
      nodes: [],
      selectedId: null,
      lastEventAt: null,
      pendingPrompts: {},
      teamName: null,
      tasks: {},
      incarnations: {},
    }),
}))
