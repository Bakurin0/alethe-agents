/**
 * Decide o que fazer com um diretório vindo do terminal (`alethe <path>`).
 *
 * Separado do hook de propósito: a regra "já existe projeto nessa pasta?" é o
 * miolo da feature e vale testar sem React nem IPC no meio.
 */

import { basename, sameCwd } from './paths'
import type { Project } from './types'

export type CliOpenPlan =
  /** Já existe projeto apontando pra essa pasta — só trazer pro workspace. */
  | { kind: 'existing'; projectId: string }
  /** Pasta nova — criar projeto com o nome dela. */
  | { kind: 'create'; name: string; cwd: string }

/**
 * `null` quando não há o que fazer (caminho vazio). A comparação usa `sameCwd`,
 * que normaliza separador e caixa só quando o caminho é claramente do Windows —
 * sem isso, `alethe .` duplicaria o projeto a cada chamada.
 */
export function planCliOpen(path: string, projects: Project[]): CliOpenPlan | null {
  const cwd = path.trim()
  if (!cwd) return null

  const existing = projects.find(
    (project) => project.defaultCwd && sameCwd(project.defaultCwd, cwd),
  )
  if (existing) return { kind: 'existing', projectId: existing.id }

  return { kind: 'create', name: basename(cwd) || cwd, cwd }
}
