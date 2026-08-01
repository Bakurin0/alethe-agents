import { useT } from '../../lib/i18n'
import type { AgentType } from '../../lib/types'
import controls from './controls.module.css'

/**
 * Seção "Multi-agent settings" do EditProjectModal (RFC-009): modo de worktree,
 * comandos de validação, provider de conflito e toggles (auto-worktree, graphify,
 * GSD watcher). Componente controlado — todo o estado vive no modal pai.
 */
export function EditProjectAgentSettings({
  worktreeMode,
  onWorktreeModeChange,
  validationCommandsStr,
  onValidationCommandsChange,
  conflictProvider,
  onConflictProviderChange,
  autoWorktree,
  onAutoWorktreeChange,
  graphifyEnabled,
  onGraphifyEnabledChange,
  gsdWatcherEnabled,
  onGsdWatcherEnabledChange,
}: {
  worktreeMode: 'gitWorktree' | 'localCopy'
  onWorktreeModeChange: (mode: 'gitWorktree' | 'localCopy') => void
  validationCommandsStr: string
  onValidationCommandsChange: (value: string) => void
  conflictProvider: AgentType
  onConflictProviderChange: (provider: AgentType) => void
  autoWorktree: boolean
  onAutoWorktreeChange: (enabled: boolean) => void
  graphifyEnabled: boolean
  onGraphifyEnabledChange: (enabled: boolean) => void
  gsdWatcherEnabled: boolean
  onGsdWatcherEnabledChange: (enabled: boolean) => void
}) {
  const t = useT()

  return (
    <>
      <hr style={{ margin: '20px 0 16px', border: 'none', borderTop: '1px solid var(--border)' }} />
      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Multi-agent settings</h3>

      <div className={controls.field}>
        <label className={controls.label}>Default worktree mode</label>
        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="worktreeMode"
              value="gitWorktree"
              checked={worktreeMode === 'gitWorktree'}
              onChange={() => onWorktreeModeChange('gitWorktree')}
            />
            Git worktree (fast)
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="worktreeMode"
              value="localCopy"
              checked={worktreeMode === 'localCopy'}
              onChange={() => onWorktreeModeChange('localCopy')}
            />
            Local copy (slow)
          </label>
        </div>
      </div>

      <div className={controls.field}>
        <label className={controls.label}>Validation commands (one per line)</label>
        <textarea
          className={controls.input}
          style={{
            height: 60,
            fontFamily: 'monospace',
            fontSize: 11,
            padding: '6px 8px',
            resize: 'vertical',
          }}
          placeholder="Ex: npm run build&#10;npm test"
          value={validationCommandsStr}
          onChange={(e) => onValidationCommandsChange(e.target.value)}
        />
      </div>

      <div className={controls.field}>
        <label className={controls.label}>{t('merge.providerLabel')}</label>
        <select
          className={controls.input}
          value={conflictProvider}
          onChange={(e) => onConflictProviderChange(e.target.value as AgentType)}
          style={{ cursor: 'pointer' }}
        >
          <option value="claude">Claude Code</option>
          <option value="codex">Codex</option>
          <option value="opencode">OpenCode</option>
        </select>
      </div>

      <div
        className={controls.field}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}
      >
        <input
          type="checkbox"
          id="autoWorktree"
          checked={autoWorktree}
          onChange={(e) => onAutoWorktreeChange(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <label
          htmlFor="autoWorktree"
          className={controls.label}
          style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}
        >
          {t('multiAgent.autoWorktree')}
        </label>
      </div>

      <div
        className={controls.field}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}
      >
        <input
          type="checkbox"
          id="graphifyEnabled"
          checked={graphifyEnabled}
          onChange={(e) => onGraphifyEnabledChange(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <label
          htmlFor="graphifyEnabled"
          className={controls.label}
          style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}
        >
          {t('project.graphifyEnabled')}
        </label>
      </div>

      <div
        className={controls.field}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}
      >
        <input
          type="checkbox"
          id="gsdWatcher"
          checked={gsdWatcherEnabled}
          onChange={(e) => onGsdWatcherEnabledChange(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <label
          htmlFor="gsdWatcher"
          className={controls.label}
          style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}
        >
          Ativar Monitoramento do Planejamento GSD (Watch `.planning/`)
        </label>
      </div>
    </>
  )
}
