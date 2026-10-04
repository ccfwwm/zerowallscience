import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root, verificationRoot } from '../build/paths.mjs'

if (!process.env.npm_execpath) throw new Error('Run pnpm plugins:verify-pack')
const directory = join(verificationRoot, 'native-pack', randomUUID())
const receipts = []
for (const id of await readdir(join(root, 'plugins'))) {
  if (id === 'wechat') continue
  const source = JSON.parse(await readFile(join(root, 'plugins', id, 'package.json'), 'utf8'))
  if (!source.name.startsWith('@zerowallscience/plugin-')) continue
  const target = join(directory, id)
  await mkdir(target, { recursive: true })
  const output = execFileSync(process.execPath, [process.env.npm_execpath, '--filter', source.name, 'pack', '--pack-destination', target], { cwd: root, encoding: 'utf8' })
  await writeFile(join(target, 'pack.log'), output)
  const archive = join(target, (await readdir(target)).find(name => name.endsWith('.tgz')))
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).split(/\r?\n/)
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }))
  const descriptor = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/zerowall.plugin.json'], { encoding: 'utf8' }))
  for (const entry of [manifest.main, descriptor.host, descriptor.client, descriptor.remote, 'dsh.bundle.patch.yml'].filter(Boolean)) {
    assert(entries.includes('package/' + entry.replace(/^\.\//, '')), `${source.name}: missing ${entry}`)
  }
  if (descriptor.client) {
    const clientSource = execFileSync('tar', ['-xOf', archive, `package/${descriptor.client.replace(/^\.\//, '')}`], { encoding: 'utf8', maxBuffer: 128 * 1024 ** 2 })
    assert(!/require\(["']@zerowallscience\/plugin-base\/client-helpers["']\)/u.test(clientSource), `${source.name}: client helper escaped into the DSH module table`)
  }
  for (const section of ['dependencies', 'peerDependencies']) {
    assert(!/workspace:|github:|git\+|git:/.test(JSON.stringify(manifest[section] ?? {})), `${source.name}: unpublished dependency`)
  }
  assert.equal(manifest.scripts, undefined)
  assert.equal(manifest.devDependencies, undefined)
  assert.equal(manifest.publishConfig?.directory, undefined)
  assert.equal(manifest.version, source.version)
  const bytes = await readFile(archive)
  receipts.push({ id: source.name, version: source.version, archive, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), requiredEntriesPresent: true })
  console.log(`Native pnpm pack verified: ${source.name}@${source.version}`)
}
await writeFile(join(directory, 'receipt.json'), JSON.stringify({ count: receipts.length, verifiedAt: new Date().toISOString(), packages: receipts }, null, 2) + '\n')
console.log(`All ${receipts.length} native plugin packs verified: ${directory}`)
