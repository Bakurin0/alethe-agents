import { afterEach, describe, expect, it } from 'vitest'

import {
  acquireSpawnSlot,
  ensureSpawnQueueProgress,
  getSpawnQueueSnapshot,
  releaseSpawnSlot,
  setMaxConcurrentSpawns,
  setSpawnPressureBlocked,
} from './spawnQueue'

// A fila é estado de módulo. Cada teste devolve os slots que tomou e
// restaura o cap padrão (3) e o estado de pressão para não vazar entre casos.
afterEach(() => {
  let guard = 0
  while (getSpawnQueueSnapshot().active > 0 && guard++ < 100) {
    releaseSpawnSlot()
  }
  setSpawnPressureBlocked(false)
  setMaxConcurrentSpawns(3)
})

describe('acquireSpawnSlot / releaseSpawnSlot', () => {
  it('concede slots imediatamente até o teto', async () => {
    setMaxConcurrentSpawns(2)
    await acquireSpawnSlot()
    await acquireSpawnSlot()
    expect(getSpawnQueueSnapshot()).toMatchObject({ active: 2, queued: 0 })
  })

  it('enfileira além do teto e acorda ao liberar', async () => {
    setMaxConcurrentSpawns(1)
    await acquireSpawnSlot() // toma o único slot

    let thirdResolved = false
    const queued = acquireSpawnSlot().then(() => {
      thirdResolved = true
    })

    // ainda preso na fila
    await Promise.resolve()
    expect(thirdResolved).toBe(false)
    expect(getSpawnQueueSnapshot()).toMatchObject({ active: 1, queued: 1 })

    releaseSpawnSlot() // libera → acorda o da fila
    await queued
    expect(thirdResolved).toBe(true)
    expect(getSpawnQueueSnapshot()).toMatchObject({ active: 1, queued: 0 })
  })

  it('aumentar o cap libera waiters presos', async () => {
    setMaxConcurrentSpawns(1)
    await acquireSpawnSlot()

    let resolved = false
    const queued = acquireSpawnSlot().then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)

    setMaxConcurrentSpawns(2) // agora cabe mais um
    await queued
    expect(resolved).toBe(true)
  })

  it('reduzir o cap não avança waiters além do novo teto', async () => {
    setMaxConcurrentSpawns(2)
    await acquireSpawnSlot()
    await acquireSpawnSlot() // active = 2

    let resolved = false
    void acquireSpawnSlot().then(() => {
      resolved = true
    })
    await Promise.resolve()

    // cap cai para 1; liberar um slot deixa active=1, ainda no teto → não acorda
    setMaxConcurrentSpawns(1)
    releaseSpawnSlot()
    await Promise.resolve()
    expect(resolved).toBe(false)
    expect(getSpawnQueueSnapshot().active).toBe(1)
  })

  it('não deixa active ficar negativo', () => {
    releaseSpawnSlot()
    releaseSpawnSlot()
    expect(getSpawnQueueSnapshot().active).toBe(0)
  })
})

describe('memory pressure', () => {
  it('queues new spawns until the supervisor unblocks them', async () => {
    setMaxConcurrentSpawns(1)
    setSpawnPressureBlocked(true, 'memory-pressure')
    let acquired = false
    const pending = acquireSpawnSlot().then(() => {
      acquired = true
    })

    await Promise.resolve()
    expect(acquired).toBe(false)
    expect(getSpawnQueueSnapshot()).toEqual({
      active: 0,
      queued: 1,
      pressureBlocked: true,
      pressureReason: 'memory-pressure',
    })

    setSpawnPressureBlocked(false)
    await pending
    expect(acquired).toBe(true)
  })

  it('admits one spawn after the bounded wait when pressure stalls', async () => {
    setMaxConcurrentSpawns(1)
    setSpawnPressureBlocked(true, 'memory-pressure')
    const startedAt = Date.now()
    const pending = acquireSpawnSlot()

    expect(ensureSpawnQueueProgress(startedAt + 14_999, 15_000)).toBe(false)
    expect(getSpawnQueueSnapshot().queued).toBe(1)
    expect(ensureSpawnQueueProgress(startedAt + 15_001, 15_000)).toBe(true)
    expect(await pending).toBe(true)
    expect(getSpawnQueueSnapshot().active).toBe(1)
  })

  it('leaves cancelled waiters out of the queue without consuming a slot', async () => {
    setMaxConcurrentSpawns(1)
    setSpawnPressureBlocked(true, 'memory-pressure')
    const controller = new AbortController()
    const pending = acquireSpawnSlot(controller.signal)

    expect(getSpawnQueueSnapshot().queued).toBe(1)
    controller.abort()
    expect(await pending).toBe(false)
    expect(getSpawnQueueSnapshot()).toEqual({
      active: 0,
      queued: 0,
      pressureBlocked: true,
      pressureReason: 'memory-pressure',
    })
  })
})
