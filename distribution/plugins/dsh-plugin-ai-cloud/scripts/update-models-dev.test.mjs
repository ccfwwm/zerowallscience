import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacities } from './update-models-dev.mjs'

test('prefers direct model listings and retains safe anonymous-provider capacity metadata', () => {
  const rows = capacities({
    gateway: { models: { claude: { limit: { context: 200000, output: 64000 } }, private: { limit: { context: 8192 } }, invalid: { limit: { context: -1 } } } },
    anthropic: { models: { claude: { limit: { context: 1000000, output: 128000 } } } },
    other: { models: { private: { limit: { context: 16384, output: 4096 } } } },
  })
  assert.deepEqual(rows, { claude: { context: 1000000, output: 128000 }, private: { context: 8192, output: 4096 } })
  assert.throws(() => capacities({}), /no model capacities/)
})
