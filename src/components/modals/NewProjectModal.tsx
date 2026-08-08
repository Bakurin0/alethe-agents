import { Folder, Network, Terminal } from 'lucide-react'
import { useState } from 'react'

import { useUiStore } from '../../stores/uiStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { GROUP_COLORS } from '../../lib/types'
import { useT } from '../../lib/i18n'
import { pickDirectory } from '../../lib/dialog'
import { ImageInput } from './ImageInput'
import { Modal } from './Modal'
import controls from './controls.module.css'
import { Dropdown } from '../ui/Dropdown'

export function NewProjectModal() {
  const t = useT()
  const open = useUiStore((s) => s.openModal === 'newProject')
  const context = useUiStore((s) => s.modalContext) as { groupId?: string | null } | null
  const closeModal = useUiStore((s) => s.closeModal)
  const createProject = useProjectsStore((s) => s.createProject)
  const setActiveProject = useProjectsStore((s) => s.setActiveProject)
  const openModal = useUiStore((s) => s.openModal_)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const groups = useProjectsStore((s) => s.groups)

  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(GROUP_COLORS[0])
  const [iconUrl, setIconUrl] = useState('')
  const [defaultCwd, setDefaultCwd] = useState('')
  const [mode, setMode] = useState<'standard' | 'agentSandbox'>('standard')
  const [groupId, setGroupId] = useState<string | null>(context?.groupId ?? null)

  const reset = () => {
    setName('')
    setColor(GROUP_COLORS[0])
    setIconUrl('')
    setDefaultCwd('')
    setMode('standard')
    setGroupId(context?.groupId ?? null)
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (mode === 'agentSandbox' && !defaultCwd.trim()) return
    const project = createProject({
      name: trimmed,
      mode,
      color,
      iconUrl: iconUrl.trim() || undefined,
      groupId,
      defaultCwd: defaultCwd.trim() || undefined,
    })
    reset()
    setActiveProject(project.id)
    if (mode === 'agentSandbox') {
      setActiveView('agentSandbox')
      closeModal()
    } else {
      openModal('newTerminal', { projectId: project.id })
    }
  }

  const browse = async () => {
    const directory = await pickDirectory({ defaultPath: defaultCwd || undefined })
    if (directory) setDefaultCwd(directory)
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        closeModal()
      }}
      title={t('crud.newProjectTitle')}
      footer={
        <>
          <button type="button" className={controls.btn} onClick={closeModal}>
            {t('crud.cancel')}
          </button>
          <button
            type="button"
            className={`${controls.btn} ${controls.btnPrimary}`}
            disabled={!name.trim() || (mode === 'agentSandbox' && !defaultCwd.trim())}
            onClick={submit}
          >
            {mode === 'agentSandbox' ? t('crud.createAgentSandboxProject') : t('crud.createProjectAndOpenTerminal')}
          </button>
        </>
      }
    >
      <div className={controls.field}>
        <label className={controls.label}>{t('crud.nameLabel')}</label>
        <input
          className={controls.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={t('crud.projectNamePlaceholder')}
        />
      </div>

      <div className={controls.field}>
        <label className={controls.label}>{t('crud.projectModeLabel')}</label>
        <div className={controls.modeChoices} role="radiogroup" aria-label={t('crud.projectModeLabel')}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'standard'}
            className={`${controls.modeChoice} ${mode === 'standard' ? controls.modeChoiceActive : ''}`}
            onClick={() => setMode('standard')}
          >
            <Terminal size={16} aria-hidden="true" />
            <span className={controls.modeChoiceBody}>
              <strong>{t('crud.projectModeStandard')}</strong>
              <small>{t('crud.projectModeStandardHint')}</small>
            </span>
            <span className={controls.modeChoiceIndicator} aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'agentSandbox'}
            className={`${controls.modeChoice} ${mode === 'agentSandbox' ? controls.modeChoiceActive : ''}`}
            onClick={() => setMode('agentSandbox')}
          >
            <Network size={16} aria-hidden="true" />
            <span className={controls.modeChoiceBody}>
              <strong>{t('crud.projectModeSandbox')}</strong>
              <small>{t('crud.projectModeSandboxHint')}</small>
            </span>
            <span className={controls.modeChoiceIndicator} aria-hidden="true" />
          </button>
        </div>
        <span className={controls.hint}>
          {t('crud.projectModeSelectionHint')}
        </span>
      </div>

      {groups.length > 0 ? (
        <div className={controls.field}>
          <label className={controls.label}>{t('crud.groupLabel')}</label>
          <Dropdown
            className={controls.input}
            value={groupId ?? ''}
            onChange={(value) => setGroupId(value || null)}
            ariaLabel={t('crud.groupLabel')}
            options={[{ value: '', label: t('crud.noGroup') }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
          />
        </div>
      ) : null}

      <div className={controls.field}>
        <label className={controls.label}>{t('crud.projectPathLabel')}</label>
        <div className={controls.cwdRow}>
          <div className={controls.cwdInputWrap}>
            <Folder size={15} aria-hidden="true" />
            <input
              className={controls.input}
              value={defaultCwd}
              onChange={(event) => setDefaultCwd(event.target.value)}
              placeholder={t('crud.projectPathPlaceholder')}
              title={defaultCwd}
            />
          </div>
          <button type="button" className={controls.btn} onClick={() => void browse()}>
            {t('term.browse')}
          </button>
        </div>
        <span className={controls.hint}>{t('crud.projectPathHint')}</span>
      </div>

      <div className={controls.field}>
        <label className={controls.label}>{t('crud.colorLabel')}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={t('crud.colorSwatch', { color: c })}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: c,
                border: color === c ? '2px solid var(--fg)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>

      <ImageInput
        label={t('crud.iconLabel')}
        value={iconUrl}
        onChange={setIconUrl}
        onEnter={submit}
        hint={t('crud.projectIconHint')}
      />
    </Modal>
  )
}
