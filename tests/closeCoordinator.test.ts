import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCloseCoordinator,
  type CloseFailureStage,
  type CloseRequestEventLike,
} from '../src/lib/closeCoordinator.ts'

function closeEvent(): CloseRequestEventLike & { prevented: number } {
  return {
    prevented: 0,
    preventDefault() {
      this.prevented += 1
    },
  }
}

test('cancel keeps the app open and always prevents the original close event', async () => {
  let destroyed = 0
  let quit = 0
  const coordinator = createCloseCoordinator({
    confirmNative: async () => false,
    confirmFallback: () => false,
    destroyWindow: async () => {
      destroyed += 1
    },
    quitApp: async () => {
      quit += 1
    },
  })
  const event = closeEvent()

  await coordinator.handleCloseRequest(event)

  assert.equal(event.prevented, 1)
  assert.equal(destroyed, 0)
  assert.equal(quit, 0)
})

test('native dialog failure uses the browser confirmation fallback', async () => {
  const failures: CloseFailureStage[] = []
  let destroyed = 0
  const coordinator = createCloseCoordinator({
    confirmNative: async () => {
      throw new Error('dialog unavailable')
    },
    confirmFallback: () => true,
    destroyWindow: async () => {
      destroyed += 1
    },
    quitApp: async () => {},
    onFailure: (stage) => failures.push(stage),
  })

  await coordinator.handleCloseRequest(closeEvent())

  assert.equal(destroyed, 1)
  assert.deepEqual(failures, ['confirm'])
})

test('destroy failure falls back to the Rust quit command', async () => {
  const failures: CloseFailureStage[] = []
  let quit = 0
  const coordinator = createCloseCoordinator({
    confirmNative: async () => true,
    confirmFallback: () => false,
    destroyWindow: async () => {
      throw new Error('destroy denied')
    },
    quitApp: async () => {
      quit += 1
    },
    onFailure: (stage) => failures.push(stage),
  })

  await coordinator.handleCloseRequest(closeEvent())

  assert.equal(quit, 1)
  assert.deepEqual(failures, ['destroy'])
})

test('concurrent close requests open only one confirmation dialog', async () => {
  let confirmCalls = 0
  let resolveConfirm: ((value: boolean) => void) | null = null
  const coordinator = createCloseCoordinator({
    confirmNative: () => {
      confirmCalls += 1
      return new Promise<boolean>((resolve) => {
        resolveConfirm = resolve
      })
    },
    confirmFallback: () => false,
    destroyWindow: async () => {},
    quitApp: async () => {},
  })
  const firstEvent = closeEvent()
  const secondEvent = closeEvent()

  const first = coordinator.handleCloseRequest(firstEvent)
  const second = coordinator.handleCloseRequest(secondEvent)
  assert.equal(confirmCalls, 1)
  assert.equal(firstEvent.prevented, 1)
  assert.equal(secondEvent.prevented, 1)

  resolveConfirm?.(false)
  await Promise.all([first, second])
})

test('a total close failure resets the guard so the user can retry', async () => {
  let confirmCalls = 0
  const failures: CloseFailureStage[] = []
  const coordinator = createCloseCoordinator({
    confirmNative: async () => {
      confirmCalls += 1
      return true
    },
    confirmFallback: () => false,
    destroyWindow: async () => {
      throw new Error('destroy failed')
    },
    quitApp: async () => {
      throw new Error('quit failed')
    },
    onFailure: (stage) => failures.push(stage),
  })

  await coordinator.handleCloseRequest(closeEvent())
  await coordinator.handleCloseRequest(closeEvent())

  assert.equal(confirmCalls, 2)
  assert.deepEqual(failures, ['destroy', 'quit', 'destroy', 'quit'])
})
