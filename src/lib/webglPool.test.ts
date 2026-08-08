import { describe, expect, it } from 'vitest'

import { acquireWebglContext, getWebglPoolSnapshot, setWebglContextBudget } from './webglPool'

describe('webglPool', () => {
  it('caps contexts and releases slots idempotently', () => {
    setWebglContextBudget(2)
    const releaseA = acquireWebglContext()
    const releaseB = acquireWebglContext()
    expect(releaseA).toBeTruthy()
    expect(releaseB).toBeTruthy()
    expect(acquireWebglContext()).toBeNull()
    expect(getWebglPoolSnapshot()).toEqual({ active: 2, budget: 2 })

    releaseA?.()
    releaseA?.()
    expect(getWebglPoolSnapshot().active).toBe(1)
    const releaseC = acquireWebglContext()
    expect(releaseC).toBeTruthy()

    releaseB?.()
    releaseC?.()
    setWebglContextBudget(4)
  })
})
