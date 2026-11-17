import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { SkillCatalog } from '../src/skill-catalog.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'market-skills-'))
  let bytes = Buffer.from('verified archive')
  let failRead = false
  const content = Buffer.from(bytes)
  const names: string[] = []
  const importer = { installed: async () => names, install: vi.fn(async (path: string, expected: readonly string[]) => {
    expect(await readFile(path)).toEqual(content)
    names.push(...expected)
  }) }
  const row = { id: 'example', version: '1.0.0', title: { en: 'Example', zh: '示例' }, description: { en: 'Description' },
    url: 'https://catalog.test/example.zip', bytes: content.length, sha256: createHash('sha256').update(content).digest('hex'), names: ['example'] }
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (failRead) throw new Error('Offline')
    return (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).endsWith('.zip') ? new Response(bytes) : Response.json({ schemaVersion: 1, skills: [row] })
  })
  const catalog = new SkillCatalog({ url: 'https://catalog.test/skills.json', root, timeoutMs: 5000, maxCatalogBytes: 10000, maxSkillBytes: 10000 }, fetcher)
  onTestFinished(async () => { await catalog.dispose(); await rm(root, { recursive: true, force: true }) })
  return { root, catalog, importer, row, names, tamper: () => { bytes = Buffer.from('tampered') }, offline: () => { failRead = true } }
}

it('uses the existing importer, records successful versions, and retains installed rows offline', async () => {
  const f = await fixture()
  const remove = f.catalog.register(f.importer)
  expect((await f.catalog.read(true)).entries[0]?.status).toBe('available')
  expect((await f.catalog.install('example', '1.0.0')).entries[0]?.status).toBe('installed')
  expect(JSON.parse(await readFile(join(f.root, 'skills.json'), 'utf8'))).toEqual({ example: '1.0.0' })
  f.row.version = '1.1.0'
  expect((await f.catalog.read(true)).entries[0]?.status).toBe('update')
  f.offline()
  const failed = await f.catalog.read(true)
  expect(failed.error?.code).toBe('catalog')
  expect(failed.entries[0]?.installedVersion).toBe('1.0.0')
  await remove()
  expect((await f.catalog.read(false)).available).toBe(false)
})

it('rejects changed selections and altered bytes before calling the importer', async () => {
  const f = await fixture()
  f.catalog.register(f.importer)
  expect((await f.catalog.install('example', '9.0.0')).error?.code).toBe('changed')
  f.tamper()
  expect((await f.catalog.install('example', '1.0.0')).error?.code).toBe('integrity')
  expect(f.importer.install).not.toHaveBeenCalled()
  await expect(readFile(join(f.root, 'skills.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('retains prior receipts and reports a partially imported skill for inspection', async () => {
  const f = await fixture()
  f.catalog.register({ ...f.importer, install: async () => { throw new Error('Enablement failed') } })
  const result = await f.catalog.install('example', '1.0.0')
  expect(result.error).toMatchObject({ code: 'partial', diagnostic: 'Enablement failed' })
  await expect(readFile(join(f.root, 'skills.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('waits for an in-flight importer before releasing its registration', async () => {
  const f = await fixture()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  onTestFinished(() => { release.resolve(undefined) })
  const remove = f.catalog.register({ ...f.importer, install: async () => { entered.resolve(undefined); await release.promise } })
  const operation = f.catalog.install('example', '1.0.0')
  await entered.promise
  let removed = false
  const removal = remove().then(() => { removed = true })
  await Promise.resolve()
  expect(removed).toBe(false)
  release.resolve(undefined)
  await operation
  await removal
  expect((await f.catalog.read(false)).available).toBe(false)
})

it('reuses previous catalog receipts and stops on invalid receipt data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'market-receipts-'))
  await writeFile(join(root, 'skills.json'), '{broken')
  const catalog = new SkillCatalog({ url: 'https://catalog.test/skills.json', root, timeoutMs: 5000, maxCatalogBytes: 10000, maxSkillBytes: 10000 })
  onTestFinished(async () => { await catalog.dispose(); await rm(root, { recursive: true, force: true }) })
  catalog.register({ installed: async () => [], install: vi.fn() })
  expect((await catalog.read(true)).error?.code).toBe('catalog')
  expect((await catalog.install('example', '1.0.0')).error?.code).toBe('catalog')
  expect(await readFile(join(root, 'skills.json'), 'utf8')).toBe('{broken')
})
