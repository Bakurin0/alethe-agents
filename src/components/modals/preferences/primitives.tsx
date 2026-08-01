import type { ReactNode } from 'react'

import styles from '../PreferencesModal.module.css'

// Bloco de seção reutilizado por todas as páginas de preferências. O
// `data-setting-id` é o alvo usado pela busca para rolar/focar a seção.
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className={styles.section} data-setting-id={id} tabIndex={-1}>
      <div className={styles.sectionHeading}>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

// Avatar do perfil: mostra a imagem quando houver URL, senão cai para a
// inicial. Usado tanto na sidebar do modal quanto na página de conta.
export function Avatar({
  url,
  initial,
  large = false,
}: {
  url: string | null
  initial: string
  large?: boolean
}) {
  return url ? (
    <img
      src={url}
      alt=""
      draggable={false}
      className={`${styles.avatar} ${large ? styles.avatarLarge : ''}`}
    />
  ) : (
    <span
      className={`${styles.avatar} ${styles.avatarFallback} ${large ? styles.avatarLarge : ''}`}
    >
      {initial}
    </span>
  )
}
