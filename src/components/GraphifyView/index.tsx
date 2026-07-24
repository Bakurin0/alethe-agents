import { useEffect, useMemo, useRef } from 'react'
import cytoscape from 'cytoscape'
import { RefreshCw, Camera, Scissors, RotateCcw } from 'lucide-react'
import { useGraphifyStore } from '../../stores/graphifyStore'
import { useT } from '../../lib/i18n'
import styles from './GraphifyView.module.css'

/** Quantos snapshots manter ao compactar (memory policy). */
const KEEP_LAST = 10

/** Lê um token de tema do :root para o Cytoscape honrar o design system. */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

type GraphifyViewProps = {
  /** Caminho do repositório do projeto ativo (raiz git). */
  repo: string
  /** Id do projeto, para correlacionar eventos no Event Bus. */
  projectId?: string
}

/**
 * RFC-004 — visualização interativa do grafo de conhecimento (Graphify),
 * reusando o Cytoscape. Estados: sem repo, sem grafo, erro, e o grafo em si com
 * snapshots + memory policy.
 */
export function GraphifyView({ repo, projectId }: GraphifyViewProps) {
  const t = useT()
  const { graph, snapshots, error, loading, load, refreshGraph, snapshot, rollback, prune } =
    useGraphifyStore()
  const canvasRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)

  useEffect(() => {
    void load(repo)
  }, [repo, load])

  const elements = useMemo(() => {
    if (!graph) return []
    return [
      ...graph.nodes.map((n) => ({ data: { id: n.id, label: n.label, kind: n.kind ?? '' } })),
      ...graph.edges.map((e) => ({
        data: { id: e.id, source: e.source, target: e.target, label: e.label ?? '' },
      })),
    ]
  }, [graph])

  useEffect(() => {
    const container = canvasRef.current
    if (!container || !graph) return

    const cy = cytoscape({
      container,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': token('--accent', '#6ea8fe'),
            label: 'data(label)',
            color: token('--fg', '#e6e6e6'),
            'font-size': '9px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            width: 14,
            height: 14,
            'text-max-width': '80px',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': token('--border', '#3a3a3a'),
            'target-arrow-color': token('--border', '#3a3a3a'),
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.7,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': token('--accent-strong', token('--accent', '#6ea8fe')),
            'border-width': 2,
            'border-color': token('--accent-ring', token('--accent', '#6ea8fe')),
          },
        },
      ],
      layout: { name: 'cose', animate: false, nodeDimensionsIncludeLabels: true },
      wheelSensitivity: 0.2,
    })
    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [elements, graph])

  const hasGraph = !!graph && graph.nodes.length > 0

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.title}>{t('graphify.title')}</span>
        {hasGraph && (
          <span className={styles.stats}>
            {t('graphify.stats', { nodes: graph.nodeCount, edges: graph.edgeCount })}
            {graph.truncated ? ` · ${t('graphify.truncated', { max: graph.nodes.length })}` : ''}
          </span>
        )}
        <span className={styles.spacer} />
        <button className={styles.button} onClick={() => void refreshGraph()} disabled={loading}>
          <RefreshCw size={13} /> {t('graphify.reload')}
        </button>
        <button className={styles.button} onClick={() => void snapshot(projectId)} disabled={!hasGraph}>
          <Camera size={13} /> {t('graphify.snapshot')}
        </button>
        <button
          className={styles.button}
          onClick={() => void prune(KEEP_LAST, projectId)}
          disabled={snapshots.length === 0}
          title={t('graphify.pruneHint', { keep: KEEP_LAST })}
        >
          <Scissors size={13} /> {t('graphify.prune')}
        </button>
      </div>

      <div className={styles.body}>
        {hasGraph ? (
          <div ref={canvasRef} className={styles.canvas} />
        ) : (
          <div className={`${styles.empty} ${error ? styles.error : ''}`}>
            {error ? error : t('graphify.empty')}
          </div>
        )}

        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>{t('graphify.snapshotsTitle')}</div>
          {snapshots.length === 0 ? (
            <div className={styles.muted}>{t('graphify.noSnapshots')}</div>
          ) : (
            snapshots.map((s) => (
              <div key={s.id} className={styles.snapshot}>
                <div className={styles.snapshotMeta}>
                  <span className={styles.snapshotDate}>
                    {new Date(s.createdMs).toLocaleString()}
                  </span>
                  <span className={styles.snapshotSize}>{Math.round(s.sizeBytes / 1024)} KB</span>
                </div>
                <button
                  className={styles.rollback}
                  onClick={() => void rollback(s.id, projectId)}
                  title={t('graphify.rollback')}
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
