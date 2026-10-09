import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { verifyCatalog, verifySignedDocument } from './resource-catalog.mjs'

const root = resolve(import.meta.dirname, '../..')

test('plugin catalog refresh needs no stage and preserves other feeds and original archive bytes', async () => {
  const artifacts = await mkdtemp(join(tmpdir(), 'zws-plugin-feed-'))
  try {
    const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
    const release = join(artifacts, 'release', version)
    const catalogs = join(release, 'catalogs')
    await mkdir(catalogs, { recursive: true })
    const preserved = ['skill-catalog.json', 'skill-latest.json', 'mcp-catalog.json', 'mcp-latest.json', 'python-catalog.json', 'python-latest.json']
    for (const name of preserved) await writeFile(join(catalogs, name), 'existing signed feed: ' + name)
    await writeFile(join(release, 'immutable-resource-receipt.json'), 'existing immutable receipt')
    await writeFile(join(release, 'latest.yml'), 'existing desktop pointer')
    const archive = join(release, 'example.tgz')
    const original = Buffer.from('unchanged plugin tarball fixture')
    await writeFile(archive, original)
    await writeFile(join(release, 'plugin-packages.json'), JSON.stringify([
      { id: '@zerowallscience/plugin-example', version: '1.2.3', path: archive, kind: 'plugin' },
    ]))
    const child = spawnSync(process.execPath, [join(root, 'tools/release/generate-resource-catalogs.mjs'), '--kind', 'plugin'], {
      cwd: root, encoding: 'utf8', env: {
        ...process.env, ZEROWALL_ARTIFACT_ROOT: artifacts, ZEROWALL_BUILD_ID: 'plugin-feed-test',
        ZEROWALL_RESOURCE_PRIVATE_KEY_FILE: '', ZEROWALL_RESOURCE_KEY_ID: '', ZEROWALL_RESOURCE_BASE_URL: '',
      },
    })
    assert.equal(child.status, 0, child.stderr + child.stdout)
    const keys = JSON.parse(await readFile(join(catalogs, 'verification-keys.json'), 'utf8'))
    const catalog = verifyCatalog(JSON.parse(await readFile(join(catalogs, 'plugin-catalog.json'), 'utf8')), keys, { local: true })
    const pointer = verifySignedDocument(JSON.parse(await readFile(join(catalogs, 'plugin-latest.json'), 'utf8')), keys)
    assert.equal(catalog.resources.length, 1)
    assert.equal(catalog.resources[0].sha256, createHash('sha256').update(original).digest('hex'))
    assert.equal(pointer.catalog.sha256, createHash('sha256').update(await readFile(join(catalogs, 'plugin-catalog.json'))).digest('hex'))
    assert.deepEqual(await readFile(archive), original)
    for (const name of preserved) assert.equal(await readFile(join(catalogs, name), 'utf8'), 'existing signed feed: ' + name)
    assert.equal(await readFile(join(release, 'immutable-resource-receipt.json'), 'utf8'), 'existing immutable receipt')
    assert.equal(await readFile(join(release, 'latest.yml'), 'utf8'), 'existing desktop pointer')
    assert.equal(await stat(join(artifacts, 'stage')).catch(() => undefined), undefined)
  } finally { await rm(artifacts, { recursive: true, force: true }) }
})

test('invalid publication scope fails before opening credentials or writing artifacts', async () => {
  const missingCredentials = join(tmpdir(), 'zws-missing-publication-credentials.env')
  const child = spawnSync(process.execPath, [join(root, 'scripts/publish-resources.mjs'), 'stage', '--kind', 'plugins'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ZEROWALL_QINIU_ENV_FILE: missingCredentials },
  })
  assert.notEqual(child.status, 0)
  assert.match(child.stderr, /Usage: \[--kind plugin\|skill\|mcp\|python\]/u)
  assert.doesNotMatch(child.stderr, /ENOENT|Missing Qiniu setting/u)
})
