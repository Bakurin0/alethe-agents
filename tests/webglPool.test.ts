import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acquireWebglContext,
  getWebglPoolSnapshot,
  setWebglContextBudget,
} from '../src/lib/webglPool.ts'

test('WebGL pool caps contexts and releases slots idempotently', () => {
  setWebglContextBudget(2)
  const releaseA = acquireWebglContext()
  const releaseB = acquireWebglContext()
  assert.ok(releaseA)
  assert.ok(releaseB)
  assert.equal(acquireWebglContext(), null)
  assert.deepEqual(getWebglPoolSnapshot(), { active: 2, budget: 2 })

  releaseA?.()
  releaseA?.()
  assert.equal(getWebglPoolSnapshot().active, 1)
  const releaseC = acquireWebglContext()
  assert.ok(releaseC)

  releaseB?.()
  releaseC?.()
  setWebglContextBudget(4)
})
