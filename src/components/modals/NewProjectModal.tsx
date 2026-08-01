import { useEffect, useState } from 'react'

import { useUiStore } from '../../stores/uiStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { GROUP_COLORS, type AgentType } from '../../lib/types'
import { useT } from '../../lib/i18n'
import { ImageInput } from './ImageInput'
import { Modal } from './Modal'
import controls from './controls.module.css'

export function NewProjectModal() {
  const t = useT()
  const open = useUiStore((s) => s.openModal === 'newProject')
  const context = useUiStore((s) => s.modalContext) as {
    groupId?: string | null
    createTerminalAfterCreate?: boolean
  } | null
  const closeModal = useUiStore((s) => s.closeModal)
  const createProject = useProjectsStore((s) => s.createProject)
  const createTerminal = useProjectsStore((s) => s.createTerminal)
  const openProjectWorkspace = useProjectsStore((s) => s.openProjectWorkspace)
  const openTerminalWorkspace = useProjectsStore((s) => s.openTerminalWorkspace)
  const enabledAgents = useProjectsStore((s) => s.preferences.enabledAgents)
  const groups = useProjectsStore((s) => s.groups)

  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(GROUP_COLORS[0])
  const [iconUrl, setIconUrl] = useState('')
  const [groupId, setGroupId] = useState<string | null>(context?.groupId ?? null)
  const [initialTerminalType, setInitialTerminalType] = useState<AgentType>('claude')
  const withInitialTerminal = context?.createTerminalAfterCreate === true
  const agentOptions: { type: AgentType; label: string }[] = [
    { type: 'claude', label: 'Claude' },
    { type: 'codex', label: 'Codex' },
    { type: 'antigravity', label: 'Antigravity' },
    { type: 'opencode', label: 'OpenCode' },
    { type: 'shell', label: 'Shell' },
    { type: 'mimo', label: 'Mimo' },
    { type: 'freebuff', label: 'Freebuff' },
  ]
  const availableAgents = agentOptions.filter((agent) => enabledAgents[agent.type])

  useEffect(() => {
    if (!withInitialTerminal) return
    const firstAvailable = availableAgents[0]?.type ?? 'shell'
    if (!availableAgents.some((agent) => agent.type === initialTerminalType)) {
      setInitialTerminalType(firstAvailable)
    }
  }, [availableAgents, initialTerminalType, withInitialTerminal])

  const reset = () => {
    setName('')
    setColor(GROUP_COLORS[0])
    setIconUrl('')
    setGroupId(context?.groupId ?? null)
    setInitialTerminalType('claude')
  }

  const submit = (addTerminal = withInitialTerminal) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const project = createProject({ name: trimmed, color, iconUrl: iconUrl.trim() || undefined, groupId })
    if (addTerminal) {
      const agent = agentOptions.find((option) => option.type === initialTerminalType) ?? agentOptions[0]
      const terminal = createTerminal(project.id, {
        name: agent.label,
        cwd: '',
        firstTab: { type: agent.type, cwd: '', runtimeProfile: 'lean' },
      })
      openTerminalWorkspace(project.id, terminal.id)
    } else {
      openProjectWorkspace(project.id)
    }
    reset()
    closeModal()
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
          {withInitialTerminal ? (
            <button
              type="button"
              className={controls.btn}
              disabled={!name.trim()}
              onClick={() => submit(false)}
            >
              {t('crud.createProjectOnly')}
            </button>
          ) : null}
          <button
            type="button"
            className={`${controls.btn} ${controls.btnPrimary}`}
            disabled={!name.trim()}
            onClick={() => submit()}
          >
            {withInitialTerminal ? t('crud.createProjectAndOpenTerminal') : t('crud.create')}
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

      {withInitialTerminal ? (
        <div className={controls.field}>
          <label className={controls.label}>{t('crud.firstTerminalLabel')}</label>
          <select
            className={controls.input}
            value={initialTerminalType}
            onChange={(event) => setInitialTerminalType(event.target.value as AgentType)}
          >
            {availableAgents.map((agent) => (
              <option key={agent.type} value={agent.type}>
                {agent.label}
              </option>
            ))}
          </select>
          <span className={controls.hint}>{t('crud.firstTerminalHint')}</span>
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div className={controls.field}>
          <label className={controls.label}>{t('crud.groupLabel')}</label>
          <select
            className={controls.input}
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value || null)}
          >
            <option value="">{t('crud.noGroup')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

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
