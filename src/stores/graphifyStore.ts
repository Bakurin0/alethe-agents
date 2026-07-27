import { create } from 'zustand'
import {
  graphifyDetect,
  graphifyReadGraph,
  graphifySnapshot,
  graphifyListSnapshots,
  graphifyRollback,
  graphifyPruneSnapshots,
  type GraphData,
  type GraphSnapshotInfo,
  type GraphifyStatus,
} from '../lib/tauri'

/**
 * RFC-004 — estado da visualização do grafo de conhecimento (Graphify).
 * O Alethe só observa/versiona: lê `graphify-out/graph.json`, gerencia snapshots
 * em `.alethe/graph-snapshots/` e aplica a memory policy (prune).
 */
type GraphifyState = {
  repo: string | null
  status: GraphifyStatus | null
  graph: GraphData | null
  snapshots: GraphSnapshotInfo[]
  loading: boolean
  error: string | null

  load: (repo: string) => Promise<void>
  refreshGraph: () => Promise<void>
  snapshot: (projectId?: string) => Promise<void>
  rollback: (snapshotId: string, projectId?: string) => Promise<void>
  prune: (keepLast: number, projectId?: string) => Promise<void>
}

export const useGraphifyStore = create<GraphifyState>((set, get) => ({
  repo: null,
  status: null,
  graph: null,
  snapshots: [],
  loading: false,
  error: null,

  load: async (repo) => {
    set({ repo, loading: true, error: null })
    try {
      const [status, snapshots] = await Promise.all([
        graphifyDetect().catch(() => null),
        graphifyListSnapshots(repo).catch(() => []),
      ])
      let graph: GraphData | null = null
      let error: string | null = null
      try {
        graph = await graphifyReadGraph(repo)
      } catch (err) {
        error = String(err)
      }
      set({ status, snapshots, graph, error })
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set({ loading: false })
    }
  },

  refreshGraph: async () => {
    const { repo } = get()
    if (!repo) return
    try {
      const graph = await graphifyReadGraph(repo)
      set({ graph, error: null })
    } catch (err) {
      set({ graph: null, error: String(err) })
    }
  },

  snapshot: async (projectId) => {
    const { repo } = get()
    if (!repo) return
    try {
      await graphifySnapshot(repo, projectId)
      set({ snapshots: await graphifyListSnapshots(repo) })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  rollback: async (snapshotId, projectId) => {
    const { repo } = get()
    if (!repo) return
    try {
      await graphifyRollback(repo, snapshotId, projectId)
      await get().refreshGraph()
    } catch (err) {
      set({ error: String(err) })
    }
  },

  prune: async (keepLast, projectId) => {
    const { repo } = get()
    if (!repo) return
    try {
      await graphifyPruneSnapshots(repo, keepLast, undefined, projectId)
      set({ snapshots: await graphifyListSnapshots(repo) })
    } catch (err) {
      set({ error: String(err) })
    }
  },
}))
