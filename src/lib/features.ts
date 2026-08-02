import type { MessageKey } from './i18n'
import type { FeatureId } from './types'

export type FeatureDefinition = {
  id: FeatureId
  titleKey: MessageKey
  descriptionKey: MessageKey
}

/** Fonte única dos módulos expostos no onboarding e nas Preferências. */
export const FEATURES: readonly FeatureDefinition[] = [
  {
    id: 'todos',
    titleKey: 'features.todos.title',
    descriptionKey: 'features.todos.description',
  },
  {
    id: 'git',
    titleKey: 'features.git.title',
    descriptionKey: 'features.git.description',
  },
  // 'aiMemory' é intencionalmente OMITIDO daqui: a feature existe no código
  // (FeatureId, default false, backend e injeção MCP em useXtermSession), mas
  // fica "escondida" — não aparece no onboarding nem em Preferências → Features.
  // Só é ativável editando `projects.json` (enabledFeatures.aiMemory) ou quando
  // uma UI dedicada for wired no futuro.
]

type StoredFeaturePreferences = {
  enabledFeatures?: Partial<Record<FeatureId, boolean>>
  showGitControl?: boolean
}

/** Defaults novos e compatibilidade com perfis criados antes do sistema modular. */
export function normalizeEnabledFeatures(
  raw: StoredFeaturePreferences | undefined,
): Record<FeatureId, boolean> {
  if (raw?.enabledFeatures) {
    return {
      todos: raw.enabledFeatures.todos ?? true,
      git: raw.enabledFeatures.git ?? true,
      // Opt-in explícito: nunca liga sem consentimento, mesmo em perfis já modulares.
      aiMemory: raw.enabledFeatures.aiMemory ?? false,
    }
  }
  return {
    todos: raw === undefined,
    git: raw?.showGitControl ?? true,
    aiMemory: false,
  }
}
