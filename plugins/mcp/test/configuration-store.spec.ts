import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/host/configuration-store.js'

describe('MCP configuration store', () => {
  const roots: string[] = []
  afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

  it('keeps server records in the existing store without exposing project APIs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zws-mcp-config-store-'))
    roots.push(root)
    const prior = process.env.ZEROWALL_RESEARCH_DB
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'research.sqlite')
    const providers = new Map<string, unknown>()
    let dispose: (() => void) | undefined
    const ctx = {
      provide: (name: string, value: unknown) => providers.set(name, value),
      effect: (run: () => unknown) => { const value = run(); if (typeof value === 'function') dispose = value as () => void },
    } as unknown as Context

    try {
      apply(ctx)
      const service = providers.get('zerowallMcpConfigurationStore') as {
        listMcpServers(): unknown[]
        createMcpServer(input: { name: string; serverName: string; transport: 'stdio'; command: string; args: string[]; envRefs: Record<string, string> }): { id: string }
        updateMcpServer(id: string, input: { enabled: boolean }): unknown
        getMcpServer(id: string): { enabled: boolean } | undefined
      }
      expect(service).toBeDefined()
      const record = service.createMcpServer({ name: 'Literature', serverName: 'literature', transport: 'stdio', command: 'node', args: ['server.mjs'], envRefs: { TOKEN: 'LITERATURE_TOKEN' } })
      expect(service.listMcpServers()).toEqual([record])
      expect(providers.has('zerowallProjects')).toBe(false)
      service.updateMcpServer(record.id, { enabled: false })
      expect(service.getMcpServer(record.id)?.enabled).toBe(false)
    } finally {
      dispose?.()
      if (prior === undefined) delete process.env.ZEROWALL_RESEARCH_DB
      else process.env.ZEROWALL_RESEARCH_DB = prior
    }
  })
})
