import type { Config, CapabilityClass } from './policy.ts'

export const ON_DEMAND_SERVERS = ['rmcp', 'zerowall_managed_bio_tools'] as const

export function defaultTier(name: string, kind: 'tool' | 'skill'): CapabilityClass {
  if (kind === 'skill') return name === 'genui' ? 'resident' : 'on-demand'
  return ON_DEMAND_SERVERS.some(server => name.startsWith(`mcp__${server}__`)) ? 'on-demand' : 'resident'
}

export function isManagedBulkRule(rule: string): boolean {
  return ON_DEMAND_SERVERS.some(server => [`server:${server}`, `server:${server}:*`, `mcp__${server}__*`].includes(rule))
}

/** Return the shipped ZeroWall default classification while preserving user single-tool disables. */
export function defaultConfig(config: Config = {}): Config {
  return {
    ...config,
    tools: {
      resident: ['*'],
      'on-demand': ON_DEMAND_SERVERS.map(server => `server:${server}`),
      disabled: config.tools?.disabled?.filter(rule => !isManagedBulkRule(rule)) ?? [],
    },
    skills: { resident: ['genui'], 'on-demand': ['*'], disabled: config.skills?.disabled ?? [] },
  }
}
