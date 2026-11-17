import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const resources = join(import.meta.dirname, '..', 'resources')

describe('curated source snapshots', () => {
  it('binds each catalog entry to its shipped instruction bytes', async () => {
    const catalog = JSON.parse(await readFile(join(resources, 'catalog.json'), 'utf8')) as { name: string; path: string; sha256: string }[]
    for (const row of catalog) {
      const content = await readFile(join(resources, row.path))
      expect(createHash('sha256').update(content).digest('hex'), row.name).toBe(row.sha256)
    }
  })

  it('contains all Nature and BioNeMo skills with source hashes and explicit runtime metadata', async () => {
    const catalog = JSON.parse(await readFile(join(resources, 'catalog.json'), 'utf8')) as { name: string; source?: string; sha256?: string; runtime?: Record<string, boolean> }[]
    expect(catalog.filter(row => row.source === 'nature')).toHaveLength(23)
    expect(catalog.filter(row => row.source === 'bionemo')).toHaveLength(47)
    expect(catalog.find(row => row.name === 'research-integrity')).toBeDefined()
    expect(catalog.filter(row => row.source === 'bionemo').every(row => row.sha256 && row.runtime)).toBe(true)
    expect(JSON.parse(await readFile(join(resources, 'sources.json'), 'utf8'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'nature', sha256: expect.any(String) }),
      expect.objectContaining({ id: 'bionemo', sha256: expect.any(String) }),
    ]))
    expect((await readFile(join(resources, 'THIRD-PARTY-LICENSES'), 'utf8')).length).toBeGreaterThan(1000)
  })
})
