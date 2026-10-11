import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { carrierName } from '../commands/offline-carrier.mjs'
import { reuseOfflineCarrier } from './offline-carrier-cache.mjs'

test('offline carrier cache hit materializes archive and unpacked files as links', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-carrier-cache-')); t.after(() => rm(root, { recursive: true, force: true }))
  const cache = join(root, 'cache'), first = join(root, 'first'), second = join(root, 'second')
  let builds = 0
  const prepare = async () => {
    builds++
    await mkdir(join(first, carrierName + '.unpacked/node_modules/demo'), { recursive: true })
    await writeFile(join(first, carrierName), 'archive')
    await writeFile(join(first, carrierName + '.unpacked/node_modules/demo/index.js'), 'native')
  }
  const initial = await reuseOfflineCarrier({ cache, output: first, key: 'carrier-key', prepare })
  const hit = await reuseOfflineCarrier({ cache, output: second, key: 'carrier-key', prepare })
  assert.equal(builds, 1); assert.equal(initial.cacheHit, false); assert.equal(hit.cacheHit, true)
  assert.equal(hit.materialization.mode, 'hardlink')
  const third = join(root, 'third')
  await reuseOfflineCarrier({ cache, output: third, key: 'carrier-key', prepare })
  assert.deepEqual(initial.files, hit.files)
  assert.equal((await stat(join(third, carrierName))).ino, (await stat(join(second, carrierName))).ino)
  assert.equal((await stat(join(third, carrierName + '.unpacked/node_modules/demo/index.js'))).ino,
    (await stat(join(second, carrierName + '.unpacked/node_modules/demo/index.js'))).ino)
  assert.equal(await readFile(join(second, carrierName), 'utf8'), 'archive')
  assert.equal(await stat(join(second, 'payload.json')).catch(() => undefined), undefined)
  const prior = JSON.parse(await readFile(join(cache, 'carrier-key/payload.json'), 'utf8'))
  assert.deepEqual(prior.files, initial.files)
  await writeFile(join(cache, 'carrier-key', carrierName), 'corrupt')
  const replacement = join(root, 'replacement')
  const rebuilt = await reuseOfflineCarrier({ cache, output: replacement, key: 'carrier-key', prepare: async () => {
    await mkdir(join(replacement, carrierName + '.unpacked'), { recursive: true })
    await writeFile(join(replacement, carrierName), 'archive')
  } })
  assert.equal(rebuilt.cacheHit, false)
})
