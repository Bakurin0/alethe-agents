import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acquireSpawnSlot,
  ensureSpawnQueueProgress,
  getSpawnQueueSnapshot,
  releaseSpawnSlot,
  setMaxConcurrentSpawns,
  setSpawnPressureBlocked,
} from '../src/lib/spawnQueue.ts'

test('memory pressure queues new spawns until the supervisor unblocks them', async () => {
  setMaxConcurrentSpawns(1)
  setSpawnPressureBlocked(true, 'memory-pressure')
  let acquired = false
  const pending = acquireSpawnSlot().then(() => {
    acquired = true
  })

  await Promise.resolve()
  assert.equal(acquired, false)
  assert.deepEqual(getSpawnQueueSnapshot(), {
    active: 0,
    queued: 1,
    pressureBlocked: true,
    pressureReason: 'memory-pressure',
  })

  setSpawnPressureBlocked(false)
  await pending
  assert.equal(acquired, true)
  releaseSpawnSlot()
  setMaxConcurrentSpawns(3)
})

test('stalled memory pressure admits one spawn after the bounded wait', async () => {
  setMaxConcurrentSpawns(1)
  setSpawnPressureBlocked(true, 'memory-pressure')
  const startedAt = Date.now()
  const pending = acquireSpawnSlot()

  assert.equal(ensureSpawnQueueProgress(startedAt + 14_999, 15_000), false)
  assert.equal(getSpawnQueueSnapshot().queued, 1)
  assert.equal(ensureSpawnQueueProgress(startedAt + 15_001, 15_000), true)
  assert.equal(await pending, true)
  assert.equal(getSpawnQueueSnapshot().active, 1)

  releaseSpawnSlot()
  setSpawnPressureBlocked(false)
  setMaxConcurrentSpawns(3)
})

test('cancelled waiters leave the queue without consuming a slot', async () => {
  setMaxConcurrentSpawns(1)
  setSpawnPressureBlocked(true, 'memory-pressure')
  const controller = new AbortController()
  const pending = acquireSpawnSlot(controller.signal)

  assert.equal(getSpawnQueueSnapshot().queued, 1)
  controller.abort()
  assert.equal(await pending, false)
  assert.deepEqual(getSpawnQueueSnapshot(), {
    active: 0,
    queued: 0,
    pressureBlocked: true,
    pressureReason: 'memory-pressure',
  })

  setSpawnPressureBlocked(false)
  setMaxConcurrentSpawns(3)
})
