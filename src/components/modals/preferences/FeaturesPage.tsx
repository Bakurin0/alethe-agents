import { GitBranch, ListTodo } from 'lucide-react'

import { FEATURES } from '../../../lib/features'
import { useT } from '../../../lib/i18n'
import { useProjectsStore } from '../../../stores/projectsStore'
import styles from '../PreferencesModal.module.css'
import { SettingsSection } from './primitives'

// Ícone por feature opcional. Mantido junto da página que o consome.
const FEATURE_ICONS = {
  todos: ListTodo,
  git: GitBranch,
} as const

export function FeaturesPage() {
  const t = useT()
  const preferences = useProjectsStore((state) => state.preferences)
  const setPreferences = useProjectsStore((state) => state.setPreferences)

  return (
    <SettingsSection
      id="optional-features"
      title={t('prefs.features')}
      description={t('prefs.featuresDesc')}
    >
      <div className={styles.featureList}>
        {FEATURES.map((feature) => {
          const enabled = preferences.enabledFeatures[feature.id]
          const FeatureIcon = FEATURE_ICONS[feature.id]
          return (
            <button
              key={feature.id}
              type="button"
              className={enabled ? styles.featureEnabled : undefined}
              onClick={() =>
                setPreferences({
                  enabledFeatures: {
                    ...preferences.enabledFeatures,
                    [feature.id]: !enabled,
                  },
                  ...(feature.id === 'todos' && !enabled ? { rightSidebarVisible: true } : {}),
                })
              }
              aria-pressed={enabled}
            >
              <span className={styles.featureIcon}>
                <FeatureIcon size={17} />
              </span>
              <span className={styles.featureCopy}>
                <strong>{t(feature.titleKey)}</strong>
                <span>{t(feature.descriptionKey)}</span>
              </span>
              <span className={styles.featureStatus}>
                {enabled ? t('prefs.featureEnabled') : t('prefs.featureDisabled')}
              </span>
              <span className={styles.featureSwitch} aria-hidden>
                <span />
              </span>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}
