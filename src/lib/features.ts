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
  {
    id: 'browser',
    titleKey: 'features.browser.title',
    descriptionKey: 'features.browser.description',
  },
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
      browser: raw.enabledFeatures.browser ?? true,
      // Opt-in explícito: nunca liga sem consentimento, mesmo em perfis já modulares.
      aiMemory: raw.enabledFeatures.aiMemory ?? false,
    }
  }
  return {
    todos: raw === undefined,
    git: raw?.showGitControl ?? true,
    browser: true,
    aiMemory: false,
  }
}
