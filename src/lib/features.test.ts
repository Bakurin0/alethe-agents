import { describe, expect, it } from 'vitest'

import { normalizeEnabledFeatures } from './features'

describe('normalizeEnabledFeatures', () => {
  it('enables the initial modules for a fresh profile', () => {
    expect(normalizeEnabledFeatures(undefined)).toEqual({ todos: true, git: true, browser: true, aiMemory: false })
  })

  it('preserves legacy Git and keeps Todo off for existing profiles', () => {
    expect(normalizeEnabledFeatures({ showGitControl: false })).toEqual({
      todos: false,
      git: false,
      browser: true,
      aiMemory: false,
    })
  })

  it('preserves explicit modular preferences', () => {
    expect(normalizeEnabledFeatures({ enabledFeatures: { todos: false, git: true } })).toEqual({
      todos: false,
      git: true,
      browser: true,
      aiMemory: false,
    })
  })

  it('keeps AI Memory off unless explicitly enabled', () => {
    expect(
      normalizeEnabledFeatures({ enabledFeatures: { todos: true, git: true, aiMemory: true } }),
    ).toEqual({ todos: true, git: true, browser: true, aiMemory: true })
  })
})
