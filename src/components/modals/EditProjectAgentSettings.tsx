import { useT } from '../../lib/i18n'
import type { AgentType } from '../../lib/types'
import controls from './controls.module.css'
import styles from './EditProjectModal.module.css'

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
      <div className={styles.sectionIntro}>
        <h3>{t('crud.editProjectAgentSettings')}</h3>
        <p>{t('crud.editProjectAgentSettingsDesc')}</p>
      </div>

      <div className={controls.field}>
        <label className={controls.label}>{t('crud.editProjectWorktreeMode')}</label>
        <div className={styles.choiceRow}>
          <label className={styles.choice}>
            <input
              type="radio"
              name="worktreeMode"
              value="gitWorktree"
              checked={worktreeMode === 'gitWorktree'}
              onChange={() => onWorktreeModeChange('gitWorktree')}
            />
            {t('crud.editProjectGitWorktree')}
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name="worktreeMode"
              value="localCopy"
              checked={worktreeMode === 'localCopy'}
              onChange={() => onWorktreeModeChange('localCopy')}
            />
            {t('crud.editProjectLocalCopy')}
          </label>
        </div>
      </div>

      <div className={controls.field}>
        <label className={controls.label}>{t('crud.editProjectValidationCommands')}</label>
        <textarea
          className={`${controls.input} ${styles.commandInput}`}
          placeholder={t('crud.editProjectValidationPlaceholder')}
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
        >
          <option value="claude">Claude Code</option>
          <option value="codex">Codex</option>
          <option value="opencode">OpenCode</option>
        </select>
      </div>

      <div
        className={`${controls.field} ${styles.toggleRow}`}
      >
        <input
          type="checkbox"
          id="autoWorktree"
          checked={autoWorktree}
          onChange={(e) => onAutoWorktreeChange(e.target.checked)}
        />
        <label
          htmlFor="autoWorktree"
          className={styles.toggleLabel}
        >
          {t('multiAgent.autoWorktree')}
        </label>
      </div>

      <div
        className={`${controls.field} ${styles.toggleRow}`}
      >
        <input
          type="checkbox"
          id="graphifyEnabled"
          checked={graphifyEnabled}
          onChange={(e) => onGraphifyEnabledChange(e.target.checked)}
        />
        <label
          htmlFor="graphifyEnabled"
          className={styles.toggleLabel}
        >
          {t('project.graphifyEnabled')}
        </label>
      </div>

      <div
        className={`${controls.field} ${styles.toggleRow}`}
      >
        <input
          type="checkbox"
          id="gsdWatcher"
          checked={gsdWatcherEnabled}
          onChange={(e) => onGsdWatcherEnabledChange(e.target.checked)}
        />
        <label
          htmlFor="gsdWatcher"
          className={styles.toggleLabel}
        >
          {t('crud.editProjectGsdWatcher')}
        </label>
      </div>
    </>
  )
}
