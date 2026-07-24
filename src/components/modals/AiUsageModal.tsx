import { UsageStrip } from '../HomeView/UsageStrip'
import { useT } from '../../lib/i18n'
import { useUiStore } from '../../stores/uiStore'
import { Modal } from './Modal'
import styles from './AiUsageModal.module.css'

export function AiUsageModal() {
  const t = useT()
  const open = useUiStore((state) => state.openModal === 'aiUsage')
  const closeModal = useUiStore((state) => state.closeModal)

  return (
    <Modal open={open} onClose={closeModal} title={t('usageModal.title')} width={780}>
      <p className={styles.description}>{t('usageModal.description')}</p>
      <UsageStrip showActivity={false} />
    </Modal>
  )
}
