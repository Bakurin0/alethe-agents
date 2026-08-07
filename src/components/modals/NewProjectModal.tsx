import { Folder, GitBranch, Palette } from 'lucide-react'
import { useState } from 'react'

import { useUiStore } from '../../stores/uiStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { GROUP_COLORS } from '../../lib/types'
import { useT } from '../../lib/i18n'
import { pickDirectory } from '../../lib/dialog'
import { cloneGithubRepo } from '../../lib/tauri'
import { ColorPalettePopover } from './ColorPalettePopover'
import { ImageInput } from './ImageInput'
import { Modal } from './Modal'
import controls from './controls.module.css'

export function NewProjectModal() {
  const t = useT()
  const open = useUiStore((s) => s.openModal === 'newProject')
  const context = useUiStore((s) => s.modalContext) as { groupId?: string | null } | null
  const closeModal = useUiStore((s) => s.closeModal)
  const createProject = useProjectsStore((s) => s.createProject)
  const openModal = useUiStore((s) => s.openModal_)
  const pushToast = useUiStore((s) => s.pushToast)
  const groups = useProjectsStore((s) => s.groups)

  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(GROUP_COLORS[0])
  const [iconUrl, setIconUrl] = useState('')
  const [defaultCwd, setDefaultCwd] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [groupId, setGroupId] = useState<string | null>(context?.groupId ?? null)
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false)

  const reset = () => {
    setName('')
    setColor(GROUP_COLORS[0])
    setIconUrl('')
    setDefaultCwd('')
    setGithubUrl('')
    setGroupId(context?.groupId ?? null)
    setIsColorPopoverOpen(false)
  }

  const browse = async () => {
    const directory = await pickDirectory({ defaultPath: defaultCwd || undefined })
    if (directory) setDefaultCwd(directory)
  }

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const trimmedGithub = githubUrl.trim()
    const project = createProject({
      name: trimmed,
      color,
      iconUrl: iconUrl.trim() || undefined,
      groupId,
      // Clonar dita a pasta do projeto — ignora o path escolhido manualmente.
      defaultCwd: trimmedGithub ? undefined : defaultCwd.trim() || undefined,
      githubUrl: trimmedGithub || undefined,
      firstBootPending: Boolean(trimmedGithub),
    })
    reset()

    if (trimmedGithub) {
      closeModal()
      pushToast({
        title: 'Clonando Repositório',
        body: `Iniciando clone de ${trimmedGithub} e gerando briefing de contexto de IA...`,
        agent: 'claude',
      })
      try {
        const targetDir = `D:\\Projetos\\${trimmed.replace(/[^A-Za-z0-9_-]/g, '_')}`
        await cloneGithubRepo(trimmedGithub, targetDir)
        pushToast({
          title: 'Repositório Clonado',
          body: 'Clone concluído com sucesso. Contexto de IA injetado em AGENTS.md e CLAUDE.md.',
          agent: 'claude',
        })
      } catch (err) {
        console.error('Falha ao clonar repositório GitHub:', err)
        pushToast({
          title: 'Erro no Clone',
          body: String(err),
          agent: 'claude',
        })
      }
      return
    }

    openModal('newTerminal', { projectId: project.id })
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
            disabled={!name.trim()}
            onClick={() => void submit()}
          >
            {t('crud.create')}
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
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder={t('crud.projectNamePlaceholder')}
        />
      </div>

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
        <label className={controls.label}>{t('crud.projectPathLabel')}</label>
        <div className={controls.cwdRow}>
          <Folder size={16} aria-hidden="true" />
          <input
            className={controls.input}
            value={defaultCwd}
            onChange={(event) => setDefaultCwd(event.target.value)}
            placeholder={t('crud.projectPathPlaceholder')}
            title={defaultCwd}
          />
          <button type="button" className={controls.btn} onClick={() => void browse()}>
            {t('term.browse')}
          </button>
        </div>
        <span className={controls.hint}>{t('crud.projectPathHint')}</span>
      </div>

      <div className={controls.field}>
        <label className={controls.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GitBranch size={12} />
          <span>{t('crud.githubUrlLabel')}</span>
        </label>
        <input
          className={controls.input}
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          placeholder="https://github.com/usuario/repositorio"
        />
        <span className={controls.hint}>{t('crud.githubUrlHint')}</span>
      </div>

      <div className={controls.field}>
        <label className={controls.label}>{t('crud.colorLabel')}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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

          {/* Cor customizada ativa (se não estiver nos presets do GROUP_COLORS e não for rainbow) */}
          {color && !GROUP_COLORS.includes(color as any) && color !== 'rgb-rainbow' && (
            <button
              type="button"
              onClick={() => setIsColorPopoverOpen(true)}
              title={color}
              aria-label={t('crud.colorSwatch', { color })}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: color,
                border: '2px solid var(--fg)',
                boxShadow: '0 0 0 1px var(--bg)',
                cursor: 'pointer',
              }}
            />
          )}

          {/* Botão de Paleta Completa / Mais Cores */}
          <button
            type="button"
            onClick={() => setIsColorPopoverOpen(true)}
            title={t('crud.moreColors')}
            aria-label={t('crud.moreColors')}
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'var(--panel-hover)',
              border: '1px solid var(--border-strong)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
            }}
          >
            <Palette size={13} />
          </button>

          {/* Opção Arco-Íris Infinito (Rainbow RGB) */}
          <button
            type="button"
            onClick={() => setColor('rgb-rainbow')}
            title="Arco-Íris Infinito (RGB)"
            className="swatch-rgb-rainbow"
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: color === 'rgb-rainbow' ? '2px solid var(--fg)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          />
        </div>
      </div>

      <ImageInput
        label={t('crud.iconLabel')}
        value={iconUrl}
        onChange={setIconUrl}
        onEnter={submit}
        previewColor={color}
        hint={t('crud.projectIconHint')}
      />

      <ColorPalettePopover
        open={isColorPopoverOpen}
        onClose={() => setIsColorPopoverOpen(false)}
        onSelectColor={(selected) => setColor(selected)}
        selectedColor={color}
      />
    </Modal>
  )
}
