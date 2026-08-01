import { useT } from '../../../lib/i18n'
import { useProjectsStore } from '../../../stores/projectsStore'
import controls from '../controls.module.css'
import styles from '../PreferencesModal.module.css'
import { SettingsSection } from './primitives'

export function IntegrationsPage() {
  const t = useT()
  const preferences = useProjectsStore((state) => state.preferences)
  const setPreferences = useProjectsStore((state) => state.setPreferences)
  return (
    <>
      <SettingsSection id="spotify" title={t('prefs.spotify')} description={t('prefs.spotifyDesc')}>
        <div className={styles.integrationFields}>
          <label>
            <span>Client ID</span>
            <input
              className={controls.input}
              value={preferences.spotifyClientId}
              onChange={(event) => setPreferences({ spotifyClientId: event.target.value })}
              spellCheck={false}
            />
          </label>
          <label>
            <span>Client Secret</span>
            <input
              className={controls.input}
              type="password"
              value={preferences.spotifyClientSecret}
              onChange={(event) => setPreferences({ spotifyClientSecret: event.target.value })}
              spellCheck={false}
            />
          </label>
          <p>
            {t('prefs.spotifyHint', {
              redirect: 'http://127.0.0.1:8888/callback',
              idEnv: 'SPOTIFY_CLIENT_ID',
              secretEnv: 'SPOTIFY_CLIENT_SECRET',
            })}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        id="discord"
        title={t('prefs.discordPresence')}
        description={t('prefs.discordPresenceHint')}
      >
        <div className={styles.segmented}>
          <button
            type="button"
            className={preferences.discordRichPresenceEnabled ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ discordRichPresenceEnabled: true })}
          >
            {t('prefs.discordPresenceEnabled')}
          </button>
          <button
            type="button"
            className={!preferences.discordRichPresenceEnabled ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ discordRichPresenceEnabled: false })}
          >
            {t('prefs.discordPresenceDisabled')}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        id="dictation"
        title={t('prefs.dictation')}
        description={t('prefs.dictationDesc')}
      >
        <div className={styles.segmented}>
          <button
            type="button"
            className={preferences.dictationEnabled ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ dictationEnabled: true })}
          >
            {t('prefs.dictationOn')}
          </button>
          <button
            type="button"
            className={!preferences.dictationEnabled ? styles.segmentActive : undefined}
            onClick={() => setPreferences({ dictationEnabled: false })}
          >
            {t('prefs.dictationOff')}
          </button>
        </div>
        <p>{t('prefs.dictationHandyHint')}</p>
      </SettingsSection>
    </>
  )
}
