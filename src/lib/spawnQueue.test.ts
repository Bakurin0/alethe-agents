import { afterEach, describe, expect, it } from 'vitest'

import {
  acquireSpawnSlot,
  getSpawnQueueSnapshot,
  releaseSpawnSlot,
  setMaxConcurrentSpawns,
} from './spawnQueue'

// A fila é estado de módulo. Cada teste devolve os slots que tomou e
// restaura o cap padrão (3) para não vazar estado entre casos.
afterEach(() => {
  let guard = 0
  while (getSpawnQueueSnapshot().active > 0 && guard++ < 100) {
    releaseSpawnSlot()
  }
  setMaxConcurrentSpawns(3)
})

describe('acquireSpawnSlot / releaseSpawnSlot', () => {
  it('concede slots imediatamente até o teto', async () => {
    setMaxConcurrentSpawns(2)
    await acquireSpawnSlot()
    await acquireSpawnSlot()
    expect(getSpawnQueueSnapshot()).toEqual({ active: 2, queued: 0 })
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
    expect(getSpawnQueueSnapshot()).toEqual({ active: 1, queued: 1 })

    releaseSpawnSlot() // libera → acorda o da fila
    await queued
    expect(thirdResolved).toBe(true)
    expect(getSpawnQueueSnapshot()).toEqual({ active: 1, queued: 0 })
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
