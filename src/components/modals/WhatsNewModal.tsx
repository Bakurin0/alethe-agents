import { Sparkles } from 'lucide-react'

import { useT } from '../../lib/i18n'
import { useUiStore } from '../../stores/uiStore'
import { Modal } from './Modal'
import controls from './controls.module.css'
import styles from './WhatsNewModal.module.css'

const CURRENT_VERSION = '1.3.0'

export function WhatsNewModal() {
  const t = useT()
  const open = useUiStore((s) => s.openModal === 'whatsNew')
  const closeModal = useUiStore((s) => s.closeModal)
  const openModal = useUiStore((s) => s.openModal_)
  const updateInfo = useUiStore((s) => s.updateInfo)
  if (!open) return null

  const version = updateInfo?.version ?? updateInfo?.currentVersion ?? CURRENT_VERSION
  const hasUpdate = Boolean(updateInfo && updateInfo.version !== updateInfo.currentVersion)

  return (
    <Modal open={open} onClose={closeModal} title={t('whatsNew.title', { version })} footer={<>
      <button type="button" className={controls.btn} onClick={closeModal}>{t('whatsNew.close')}</button>
      {hasUpdate ? <button type="button" className={`${controls.btn} ${controls.btnPrimary}`} onClick={() => openModal('updateAvailable')}>
        {t('whatsNew.update')}
      </button> : null}
    </>}>
      <div className={styles.hero}>
        <span className={styles.icon}><Sparkles size={18} /></span>
        <div>
          <strong>{hasUpdate ? t('whatsNew.pendingTitle', { version }) : t('whatsNew.subtitle')}</strong>
          <p>{hasUpdate ? t('whatsNew.pendingBody', { version: updateInfo!.version }) : t('whatsNew.body')}</p>
        </div>
      </div>
      {updateInfo?.notes ? <div className={styles.notes}>{updateInfo.notes}</div> : (
        <ul className={styles.list}>
          {(['note1', 'note2', 'note3', 'note4'] as const).map((key) => <li key={key}>{t(`whatsNew.${key}`)}</li>)}
        </ul>
      )}
    </Modal>
  )
}
