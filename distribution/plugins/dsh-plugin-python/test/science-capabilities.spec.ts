import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readScienceCapability, ScienceCapabilityError } from '../src/host/science-capabilities.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('accepts an unchanged declaration and rejects changed metadata with a stale revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-capability-')); roots.push(root)
  const row = { id: 'skill-science-fixture', pythonVersion: '3.12.14', requirements: ['six==1.17.0'], imports: ['six'] }
  const revision = createHash('sha256').update(JSON.stringify(row, null, 2) + '\n').digest('hex')
  const path = join(root, 'science-capabilities.json')
  const document = { schemaVersion: 1, suiteVersion: '1.0.0', capabilities: [{ ...row, revision }] }
  await writeFile(path, JSON.stringify(document))
  expect(await readScienceCapability(root, row.id)).toEqual({ ...row, revision })
  await writeFile(path, JSON.stringify({ ...document, capabilities: [{ ...row, requirements: ['unsafe-url @ https://example.org/wheel.whl'], revision }] }))
  await expect(readScienceCapability(root, row.id)).rejects.toMatchObject({ code: 'manifest' })
})

it('returns distinct safe states for missing declarations and unknown capability ids', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-capability-')); roots.push(root)
  await expect(readScienceCapability(root, 'skill-science-fixture')).rejects.toBeInstanceOf(ScienceCapabilityError)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'science-capabilities.json'), JSON.stringify({ schemaVersion: 1, suiteVersion: '1.0.0', capabilities: [] }))
  await expect(readScienceCapability(root, 'skill-science-fixture')).rejects.toMatchObject({ code: 'unknown' })
})
