import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
    return reuseAssembly({ cache, output, key: 'component-content', prepare: async () => {
      builds++
      await mkdir(output, { recursive: true })
      await writeFile(join(output, 'index.js'), 'verified original bytes')
      return { generation: 'same-across-desktop-versions' }
    } })
  }
  await assemble('first')
  assert.deepEqual(await assemble('second'), { generation: 'same-across-desktop-versions' })
  assert.equal(builds, 1)
  assert.equal(await readFile(join(root, 'second/index.js'), 'utf8'), 'verified original bytes')
  await writeFile(join(cache, 'component-content/modules/index.js'), 'corrupt')
  await assemble('third')
  assert.equal(builds, 2)
  await writeFile(join(cache, 'component-content/modules/extra.js'), 'unexpected')
  await assemble('fourth')
  assert.equal(builds, 3)
})
