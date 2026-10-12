import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reuseAssembly } from './assembly-cache.mjs'

test('assembly cache reuses verified bytes and rebuilds corrupt or additional files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-assembly-cache-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cache = join(root, 'cache')
  let builds = 0
  async function assemble(name) {
    const output = join(root, name)
    return reuseAssembly({ cache, output, key: 'component-content', prepare: async candidate => {
      builds++
      assert.equal(await stat(output).catch(() => undefined), undefined)
      await mkdir(candidate, { recursive: true })
      await writeFile(join(candidate, 'index.js'), 'verified original bytes')
      return { generation: 'same-across-desktop-versions' }
    } })
  }
  await assemble('first')
  const second = await assemble('second')
  assert.equal(second.generation, 'same-across-desktop-versions')
  assert.equal(second.materialization.sourceKey, 'component-content')
  assert.equal(second.materialization.mode, 'hardlink')
  assert.equal((await stat(join(root, 'first/index.js'))).ino, (await stat(join(root, 'cache/component-content/modules/index.js'))).ino)
  await assemble('other-stage')
  assert.equal((await stat(join(root, 'second/index.js'))).ino, (await stat(join(root, 'other-stage/index.js'))).ino)
  assert.equal(builds, 1)
  assert.equal(await readFile(join(root, 'second/index.js'), 'utf8'), 'verified original bytes')
  await writeFile(join(cache, 'component-content/modules/index.js'), 'corrupt')
  await assemble('third')
  assert.equal(builds, 2)
  await writeFile(join(cache, 'component-content/modules/extra.js'), 'unexpected')
  await assemble('fourth')
  assert.equal(builds, 3)
})

test('assembly copy fallback records verified bytes and a failed candidate preserves the prior cache', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-assembly-fallback-')); t.after(() => rm(root, { recursive: true, force: true }))
  const cache = join(root, 'cache')
  const linkFile = async () => { throw Object.assign(new Error('cross device'), { code: 'EXDEV' }) }
  const prepare = async candidate => { await mkdir(candidate); await writeFile(join(candidate, 'index.js'), 'payload') }
  for (const name of ['first', 'second']) {
    const result = await reuseAssembly({ cache, output: join(root, name), key: 'key', prepare, linkFile })
    assert.equal(result.materialization.mode, 'copy')
    assert.equal(result.materialization.files[0].fallback, 'EXDEV')
    assert.equal(await readFile(join(root, name, 'index.js'), 'utf8'), 'payload')
  }
  await writeFile(join(cache, 'key/modules/index.js'), 'damaged')
  await assert.rejects(reuseAssembly({ cache, output: join(root, 'failed'), key: 'key', prepare: async () => { throw new Error('preparation failed') } }), /preparation failed/u)
  assert.equal(await readFile(join(cache, 'key/modules/index.js'), 'utf8'), 'damaged')
})
