import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_RUNTIME_ADAPTERS,
  preparePtyRuntimeLaunch,
} from '../src/lib/agentRuntimeAdapter.ts'

test('full runtime profile preserves arguments and environment', () => {
  assert.deepEqual(
    preparePtyRuntimeLaunch('claude', 'full', ['--verbose'], { EXAMPLE: '1' }),
    { args: ['--verbose'], env: { EXAMPLE: '1' } },
  )
})

test('lean Claude profile limits startup fan-out without disabling configured tools', () => {
  const launch = preparePtyRuntimeLaunch('claude', 'lean')
  assert.equal(launch.env?.CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY, '4')
  assert.equal(launch.env?.MCP_SERVER_CONNECTION_BATCH_SIZE, '1')
  assert.equal(launch.args.includes('--safe-mode'), false)
})

test('diagnostic Claude profile uses safe mode once', () => {
  const launch = preparePtyRuntimeLaunch('claude', 'diagnostic', ['--safe-mode'])
  assert.deepEqual(launch.args, ['--safe-mode'])
})

test('native adapters stay explicitly experimental and unavailable', () => {
  const native = AGENT_RUNTIME_ADAPTERS.filter((adapter) => adapter.id !== 'pty')
  assert.ok(native.every((adapter) => adapter.experimental && !adapter.available))
})

