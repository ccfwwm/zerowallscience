import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { adaptDreamSkinHost } from './adapt-dream-skin.mjs'

test('Dream Skin activates with current Connection and fences persistent preferences', async () => {
  const source = await readFile(new URL('../../desktop/node_modules/dsh-dream-skin/lib/index.js', import.meta.url), 'utf8')
  const adapted = adaptDreamSkinHost(source)
  assert.equal(adaptDreamSkinHost(adapted), adapted)
  assert.throws(() => adaptDreamSkinHost('unknown'), /review Connection adapter/u)
  const plugin = await import('data:text/javascript;base64,' + Buffer.from(adapted).toString('base64'))
  assert.deepEqual(plugin.inject, ['webServer', 'connection'])
  const home = await mkdtemp(join(tmpdir(), 'zws-dream-skin-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  let route, checks = 0
  const dispose = () => {}
  try {
    plugin.apply({
      effect: setup => assert.equal(setup(), dispose),
      webServer: { register: value => { route = value; return dispose } },
      connection: { requestRejection: req => { checks++; return req.rejection } },
    })
    assert.equal(route.path, '/dream-skin/api')
    const request = async (payload, rejection) => {
      const req = Object.assign(new EventEmitter(), { method: 'POST', headers: { 'content-type': 'application/json' }, rejection })
      let status, body
      const pending = route.handler(req, { writeHead: value => { status = value }, end: value => { body = JSON.parse(value) } })
      req.emit('data', Buffer.from(JSON.stringify(payload))); req.emit('end')
      await pending
      return { status, body }
    }
    for (const status of [401, 403]) assert.equal((await request({ method: 'set', patch: { skin: 'forbidden' } }, status)).status, status)
    assert.deepEqual((await request({ method: 'get' })).body.value, {})
    assert.equal((await request({ method: 'set', patch: { skin: 'abyss', custom: 'retained' } })).status, 200)
    await request({ method: 'set', patch: { skin: 'light' } })
    assert.deepEqual((await request({ method: 'get' })).body.value, { skin: 'light', custom: 'retained' })
    assert.equal(checks, 6)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
})
