import { ArchiveRestore, FolderArchive, Trash2 } from 'lucide-react'

import { useT } from '../../../lib/i18n'
import { useProjectsStore } from '../../../stores/projectsStore'
import styles from '../PreferencesModal.module.css'

export function OrganizationPage() {
  const t = useT()
  const groups = useProjectsStore((state) => state.groups.filter((group) => group.archived))
  const unarchiveGroup = useProjectsStore((state) => state.unarchiveGroup)
  const deleteGroup = useProjectsStore((state) => state.deleteGroup)
  const projects = useProjectsStore((state) => state.projects)
  const archivedProjects = projects.filter((project) => project.archived)
  const unarchiveProject = useProjectsStore((state) => state.unarchiveProject)

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <h2>{t('prefs.archivedGroupsTitle')}</h2>
        <p>{t('prefs.archivedGroupsDesc')}</p>
      </div>
      {groups.length === 0 ? (
        <div className={styles.emptyState}>{t('prefs.archivedGroupsEmpty')}</div>
      ) : (
        <div className={styles.optionList}>
          {groups.map((group) => (
            <div key={group.id} className={styles.optionRow}>
              <div className={styles.optionCopy}>
                <strong>{group.name}</strong>
                <span>{t('prefs.archivedGroupProjects', { count: group.projectIds.length })}</span>
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => unarchiveGroup(group.id)}
                >
                  <ArchiveRestore size={14} />
                  {t('prefs.restoreGroup')}
                </button>
                <button
                  type="button"
                  className={styles.iconActionDanger}
                  title={t('prefs.deleteArchivedGroup')}
                  aria-label={t('prefs.deleteArchivedGroup')}
                  onClick={() => {
                    if (window.confirm(t('prefs.deleteArchivedGroupConfirm', { name: group.name }))) {
                      deleteGroup(group.id, 'unassign')
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={styles.sectionHeading}>
        <h2>{t('prefs.archivedProjectsTitle')}</h2>
        <p>{t('prefs.archivedProjectsDesc')}</p>
      </div>
      {archivedProjects.length === 0 ? (
        <div className={styles.emptyState}>{t('prefs.archivedProjectsEmpty')}</div>
      ) : (
        <div className={styles.optionList}>
          {archivedProjects.map((project) => (
            <div key={project.id} className={styles.optionRow}>
              <div className={styles.optionCopy}>
                <strong>{project.name}</strong>
                <span>{t('prefs.archivedProjectTerminals', { count: project.terminals.length })}</span>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => unarchiveProject(project.id)}
              >
                <FolderArchive size={14} />
                {t('prefs.restoreProject')}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
