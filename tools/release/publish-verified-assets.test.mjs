import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publishVerifiedAssets } from './publish-verified-assets.mjs'

for (const failure of [undefined, 'upload:zip', 'upload:manifest', 'signature', 'archive-hash']) {
  test(`promotion gate: ${failure ?? 'successful verification'}`, async () => {
    const events = []
    const action = name => async () => { events.push(name); if (failure === name) throw new Error(name) }
    const run = publishVerifiedAssets({
      assets: ['zip', 'manifest'], upload: item => action(`upload:${item}`)(),
      verifyVersion: action('signature'), verifyArchive: action('archive-hash'),
      promote: action('latest-write'), verifyLatest: action('latest-check'),
    })
    if (failure) {
      await assert.rejects(run)
      assert.equal(events.includes('latest-write'), false)
    } else {
      await run
      assert.deepEqual(events, ['upload:zip', 'upload:manifest', 'signature', 'archive-hash', 'latest-write', 'latest-check'])
    }
  })
}
