import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { downloadResource } from '../../tools/release/resource-catalog.mjs'

const reset = () => new TypeError('terminated', { cause: Object.assign(new Error('socket closed'), { code: 'ECONNRESET' }) })
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'zws-retry-download-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const payload = Buffer.from('complete signed package content')
  const entry = { size: payload.length, sha256: createHash('sha256').update(payload).digest('hex'), downloadUrl: 'https://example.test/package.tgz' }
  return { directory, payload, entry }
}

for (const phase of ['headers', 'body']) test(`retries a transient ${phase} failure with a fresh complete package`, async t => {
  const f = await fixture(t)
  let calls = 0
  const fetcher = async () => {
    calls++
    if (calls === 1) {
      if (phase === 'headers') throw reset()
      return { ok: true, body: Readable.from((async function* () { yield f.payload.subarray(0, 8); throw reset() })()) }
    }
    return new Response(f.payload)
  }
  const path = await downloadResource(f.entry, f.directory, { fetcher })
  assert.equal(calls, 2)
  assert.deepEqual(await readFile(path), f.payload)
  assert.deepEqual(await readdir(f.directory), [f.entry.sha256 + '.package'])
})

test('repeated connection resets stop after three attempts and leave no partial package', async t => {
  const f = await fixture(t)
  let calls = 0
  await assert.rejects(downloadResource(f.entry, f.directory, { fetcher: async () => { calls++; throw reset() } }), /terminated/u)
  assert.equal(calls, 3)
  assert.deepEqual(await readdir(f.directory), [])
})

for (const failure of ['digest', 'oversize', 'http', 'unclassified']) test(`${failure} failures are not retried`, async t => {
  const f = await fixture(t)
  let calls = 0
  const fetcher = async () => {
    calls++
    if (failure === 'unclassified') throw new Error('not a transient transport error')
    if (failure === 'http') return new Response('unavailable', { status: 503 })
    return new Response(failure === 'digest' ? Buffer.alloc(f.payload.length) : Buffer.concat([f.payload, Buffer.from('extra')]))
  }
  await assert.rejects(downloadResource(f.entry, f.directory, { fetcher }))
  assert.equal(calls, 1)
  assert.deepEqual(await readdir(f.directory), [])
})

test('caller cancellation wins over a socket failure without retrying', async t => {
  const f = await fixture(t)
  const controller = new AbortController()
  const reason = new Error('caller cancelled')
  let calls = 0
  const fetcher = async () => { calls++; controller.abort(reason); throw reset() }
  await assert.rejects(downloadResource(f.entry, f.directory, { fetcher, signal: controller.signal }), error => error === reason)
  assert.equal(calls, 1)
  assert.deepEqual(await readdir(f.directory), [])
})

test('the overall deadline also cancels retry backoff without starting another request', async t => {
  const f = await fixture(t)
  let calls = 0
  await assert.rejects(downloadResource(f.entry, f.directory, { timeoutMs: 50, fetcher: async () => { calls++; throw reset() } }), { name: 'TimeoutError' })
  assert.equal(calls, 1)
  assert.deepEqual(await readdir(f.directory), [])
})

function pendingTransfers(payload) {
  const transfers = []
  let ready
  const bothStarted = new Promise(resolve => { ready = resolve })
  const fetcher = (_url, { signal }) => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    transfers.push(() => { signal.removeEventListener('abort', abort); resolve(new Response(payload)) })
    if (transfers.length === 2) ready()
  })
  return { fetcher, transfers, bothStarted }
}

for (const cancelled of [0, 1]) test(`same-digest caller ${cancelled + 1} cancellation leaves the other transfer independent`, async t => {
  const f = await fixture(t), pending = pendingTransfers(f.payload)
  const controllers = [new AbortController(), new AbortController()]
  const operations = controllers.map(controller => downloadResource(f.entry, f.directory, { fetcher: pending.fetcher, signal: controller.signal }))
  const settled = Promise.allSettled(operations)
  await pending.bothStarted
  const reason = new Error('only this caller cancelled')
  controllers[cancelled].abort(reason)
  pending.transfers.forEach(complete => complete())
  const results = await settled
  assert.equal(results[cancelled].status, 'rejected')
  assert.equal(results[cancelled].reason, reason)
  assert.equal(results[1 - cancelled].status, 'fulfilled')
  assert.deepEqual(await readFile(results[1 - cancelled].value), f.payload)
  assert.deepEqual(await readdir(f.directory), [f.entry.sha256 + '.package'])
})

test('same-digest callers preserve different deadlines', async t => {
  const f = await fixture(t), pending = pendingTransfers(f.payload)
  const keepAlive = setTimeout(() => {}, 5000)
  t.after(() => clearTimeout(keepAlive))
  const short = downloadResource(f.entry, f.directory, { fetcher: pending.fetcher, timeoutMs: 300 })
  const long = downloadResource(f.entry, f.directory, { fetcher: pending.fetcher, timeoutMs: 5000 })
  const shortResult = Promise.allSettled([short])
  const longResult = Promise.allSettled([long])
  await pending.bothStarted
  const [expired] = await shortResult
  assert.equal(expired.status, 'rejected')
  assert.equal(expired.reason.name, 'TimeoutError')
  pending.transfers.forEach(complete => complete())
  const [completed] = await longResult
  assert.equal(completed.status, 'fulfilled')
  assert.deepEqual(await readFile(completed.value), f.payload)
  assert.deepEqual(await readdir(f.directory), [f.entry.sha256 + '.package'])
})

test('independent same-digest transfers safely commit the same destination on this platform', async t => {
  const f = await fixture(t), pending = pendingTransfers(f.payload)
  const operations = [new AbortController(), new AbortController()].map(controller => downloadResource(f.entry, f.directory, { fetcher: pending.fetcher, signal: controller.signal }))
  const completion = Promise.all(operations)
  await pending.bothStarted
  pending.transfers.forEach(complete => complete())
  const paths = await completion
  assert.equal(paths[0], paths[1])
  assert.deepEqual(await readFile(paths[0]), f.payload)
  assert.deepEqual(await readdir(f.directory), [f.entry.sha256 + '.package'])
})

test('same digest with conflicting signed size still verifies each transfer', async t => {
  const f = await fixture(t), pending = pendingTransfers(f.payload)
  const completion = Promise.allSettled([
    downloadResource(f.entry, f.directory, { fetcher: pending.fetcher }),
    downloadResource({ ...f.entry, size: f.entry.size + 1 }, f.directory, { fetcher: pending.fetcher }),
  ])
  await pending.bothStarted
  pending.transfers.forEach(complete => complete())
  const results = await completion
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.match(results[1].reason.message, /SHA-256 or size mismatch/u)
  assert.deepEqual(await readFile(results[0].value), f.payload)
})

test('same digest with another HTTPS source verifies that source independently', async t => {
  const f = await fixture(t)
  let calls = 0
  const fetcher = async url => { calls++; await new Promise(resolve => setTimeout(resolve, 15)); return new Response(url.hostname === 'example.test' ? f.payload : Buffer.alloc(f.payload.length)) }
  const results = await Promise.allSettled([
    downloadResource(f.entry, f.directory, { fetcher }),
    downloadResource({ ...f.entry, downloadUrl: 'https://other.test/package.tgz' }, f.directory, { fetcher }),
  ])
  assert.equal(calls, 2)
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.match(results[1].reason.message, /SHA-256 or size mismatch/u)
})

test('same digest cannot bypass HTTPS policy through an in-flight or cached transfer', async t => {
  const f = await fixture(t)
  const fetcher = async () => { await new Promise(resolve => setTimeout(resolve, 15)); return new Response(f.payload) }
  const forbidden = { ...f.entry, downloadUrl: 'http://example.test/package.tgz' }
  const results = await Promise.allSettled([
    downloadResource(f.entry, f.directory, { fetcher }),
    downloadResource(forbidden, f.directory, { fetcher }),
  ])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.match(results[1].reason.message, /must use HTTPS/u)
  await assert.rejects(downloadResource(forbidden, f.directory, { fetcher }), /must use HTTPS/u)
})

test('same digest with another fetcher keeps its own integrity failure', async t => {
  const f = await fixture(t)
  const results = await Promise.allSettled([
    downloadResource(f.entry, f.directory, { fetcher: async () => { await new Promise(resolve => setTimeout(resolve, 15)); return new Response(f.payload) } }),
    downloadResource(f.entry, f.directory, { fetcher: async () => new Response(Buffer.alloc(f.payload.length)) }),
  ])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.match(results[1].reason.message, /SHA-256 or size mismatch/u)
})

test('a local caller cannot grant file access to another caller', async t => {
  const f = await fixture(t), source = join(f.directory, 'source.bin')
  await writeFile(source, f.payload)
  const entry = { ...f.entry, downloadUrl: pathToFileURL(source).href }
  const results = await Promise.allSettled([
    downloadResource(entry, f.directory, { local: true }),
    downloadResource(entry, f.directory, { local: false }),
  ])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.match(results[1].reason.message, /must use HTTPS/u)
  assert.deepEqual(await readFile(results[0].value), f.payload)
})
