import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dedupeRuntime } from './dedupe-runtime.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-dedupe-')), output = join(root, 'node_modules'), records = []
  t.after(() => rm(root, { recursive: true, force: true }))
  async function pkg(path, name, version, sourceKey, dependencies = {}, peerDependencies = {}) {
    await mkdir(path, { recursive: true })
    const manifest = { name, version, main: 'index.js', dependencies, peerDependencies }
    await writeFile(join(path, 'package.json'), JSON.stringify(manifest))
    await writeFile(join(path, 'index.js'), `module.exports = ${JSON.stringify(sourceKey)}\n`)
    records.push({ path, manifest, sourceKey })
    return path
  }
  return { root, output, records, pkg }
}

test('identical secondary version shares a valid scope ancestor while top-level version stays intact', async t => {
  const f = await fixture(t)
  await f.pkg(join(f.output, 'tslib'), 'tslib', '2.0.0', 'tslib-2')
  const consumers = []
  for (const id of ['a', 'b', 'c']) {
    const path = await f.pkg(join(f.output, '@scope', id), '@scope/' + id, '1.0.0', id, { tslib: '1.0.0' })
    await f.pkg(join(path, 'node_modules/tslib'), 'tslib', '1.0.0', 'tslib-1')
    consumers.push(path)
  }
  const before = consumers.map(path => createRequire(join(path, 'index.js')).resolve('tslib'))
  const result = await dedupeRuntime(f.output, f.records)
  assert.equal(result.removed, 2)
  // Node memoizes resolutions within a process. Runtime starts in a fresh
  // process after generation assembly, so probe that actual lifecycle.
  const after = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', `import { createRequire } from 'node:module'; console.log(JSON.stringify(${JSON.stringify(consumers.map(path => join(path, 'index.js')))}.map(path => createRequire(path).resolve('tslib'))))`], { encoding: 'utf8' }))
  assert.equal(new Set(after).size, 1)
  for (const file of after) assert.match(await readFile(file, 'utf8'), /tslib-1/)
  assert.equal(new Set(before).size, 3)
  assert.match(await readFile(join(f.output, 'tslib/index.js'), 'utf8'), /tslib-2/)
})

test('equal package bytes with different peer resolution contexts are retained', async t => {
  const f = await fixture(t)
  const consumers = []
  for (const [id, peer] of [['a', '1.0.0'], ['b', '2.0.0']]) {
    const path = await f.pkg(join(f.output, '@scope', id), '@scope/' + id, '1.0.0', id, { shared: '1.0.0', peer })
    await f.pkg(join(path, 'node_modules/shared'), 'shared', '1.0.0', 'same-bytes', {}, { peer: '*' })
    await f.pkg(join(path, 'node_modules/peer'), 'peer', peer, 'peer-' + peer)
    consumers.push(path)
  }
  const result = await dedupeRuntime(f.output, f.records)
  assert.equal(result.removed, 0)
  for (const path of consumers) assert.match(createRequire(join(path, 'index.js')).resolve('shared'), /shared/)
})
