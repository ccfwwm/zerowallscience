import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../src/catalog.js'
import { resolveConfig } from '../src/index.js'
import {
  activateGroups,
  createProgressiveState,
  expireGroups,
  proposeSearch,
  restoreSnapshot,
  snapshotState,
  touchTool,
} from '../src/state.js'
import type { ToolSchemaView } from '../src/types.js'

function schema(name: string, description: string): ToolSchemaView {
  return { name, description, parameters: { type: 'object', properties: {} } }
}

const groups = [
  { id: 'browser', include: ['browser_*'], aliases: ['web'], description: 'Browser tools' },
  { id: 'database', include: ['db_*'], aliases: ['sql'], description: 'Database tools' },
]

function setup() {
  const config = resolveConfig({
    groups,
    maxResults: 5,
    activationGroupLimit: 1,
    maxActiveGroups: 1,
    maxActiveToolTokens: 10_000,
    retentionTurns: 3,
  })
  const catalog = buildCatalog([
    schema('browser_open', 'Open a page'),
    schema('browser_click', 'Click a page'),
    schema('db_query', 'Run SQL'),
  ], groups, config.charactersPerToken)
  return { config, state: createProgressiveState(catalog, 1) }
}

describe('progressive state', () => {
  it('activates the highest-ranked group and reports managed-schema savings', () => {
    const { config, state } = setup()
    const result = proposeSearch(state, 'search', 'browse a web page', 5, config)

    expect(result.activatedGroups).toEqual(['browser'])
    expect(result.activeTools).toEqual(['browser_click', 'browser_open'])
    expect(result.estimatedSavedTokens).toBeGreaterThanOrEqual(0)
    expect(result.protocol).toBe('dsh-progressive-tools/v1')
  })

  it('evicts the least recently used family when the family cap is reached', () => {
    const { config, state } = setup()
    activateGroups(state, ['browser'], 1, config)
    state.currentTurn = 2
    const result = proposeSearch(state, 'search', 'SQL database', 5, config)

    expect(result.activatedGroups).toEqual(['database'])
    expect(result.evictedGroups).toEqual(['browser'])
    expect(result.activeGroups).toEqual(['database'])
  })

  it('refreshes use time and expires inactive families by turn', () => {
    const { config, state } = setup()
    activateGroups(state, ['browser'], 1, config)
    touchTool(state, 'browser_open', 2)

    expect(expireGroups(state, 4, config)).toEqual([])
    expect(expireGroups(state, 5, config)).toEqual(['browser'])
  })

  it('round-trips the durable state projection and supports reset', () => {
    const { config, state } = setup()
    activateGroups(state, ['browser'], 1, config)
    const snapshot = snapshotState(state)
    state.active.clear()
    restoreSnapshot(state, snapshot)

    expect([...state.active.keys()]).toEqual(['browser'])
    const reset = proposeSearch(state, 'reset', '', 5, config)
    expect(reset.activeGroups).toEqual([])
    expect(reset.evictedGroups).toEqual(['browser'])
  })

  it('reports status without mutation and ignores unavailable snapshot groups', () => {
    const { config, state } = setup()
    restoreSnapshot(state, {
      activeGroups: [
        { id: 'missing', activatedAtTurn: 1, lastUsedTurn: 1 },
        { id: 'browser', activatedAtTurn: 1, lastUsedTurn: 1 },
      ],
    })
    const before = snapshotState(state)
    const status = proposeSearch(state, 'status', 'ignored', 5, config)

    expect(status.activeGroups).toEqual(['browser'])
    expect(status.query).toBe('')
    expect(snapshotState(state)).toEqual(before)
  })

  it('supports disabled expiry and safely ignores unknown or inactive tools', () => {
    const { config, state } = setup()
    const noExpiry = { ...config, retentionTurns: 0 }

    expect(activateGroups(state, ['missing'], 1, config).activated).toEqual([])
    activateGroups(state, ['browser'], 1, config)
    touchTool(state, 'missing_tool', 5)
    state.active.clear()
    touchTool(state, 'browser_open', 5)
    activateGroups(state, ['browser'], 1, config)
    expect(expireGroups(state, 100, noExpiry)).toEqual([])
  })
})
