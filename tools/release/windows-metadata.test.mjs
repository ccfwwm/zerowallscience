import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { removeObsoleteDevelopmentMetadata } from './generate-windows-metadata.mjs'

test('stable metadata refresh retires only the old development alias and can be repeated', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-stable-metadata-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const retained = ['latest.yml', 'releases-latest.json', 'zerowall-science-8.4.18-latest.json', 'installer.exe', 'artifact-manifest.json']
  for (const name of retained) await writeFile(join(root, name), `original ${name}`)
  await writeFile(join(root, 'releases-zerowallsciencedev-latest.json'), 'retired alias')
  await removeObsoleteDevelopmentMetadata(root)
  await removeObsoleteDevelopmentMetadata(root)
  assert.deepEqual((await readdir(root)).sort(), retained.sort())
  for (const name of retained) assert.equal(await readFile(join(root, name), 'utf8'), `original ${name}`)
})
