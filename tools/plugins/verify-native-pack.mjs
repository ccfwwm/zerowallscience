import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { root, verificationRoot } from '../build/paths.mjs'
import { RETIRED_PLUGIN_IDS } from '../commands/retired-plugins.mjs'

if (!process.env.npm_execpath) throw new Error('Run pnpm plugins:verify-pack')
const directory = join(verificationRoot, 'native-pack', randomUUID())
const receipts = []
for (const id of await readdir(join(root, 'plugins'))) {
  if (id === 'wechat') continue
  const manifestPath = join(root, 'plugins', id, 'package.json')
  const source = await readFile(manifestPath, 'utf8').then(JSON.parse, error => {
    if (error?.code === 'ENOENT') return undefined
    throw error
  })
  // Some upstream adapters intentionally keep only a patch or metadata in
  // the canonical plugins directory. Their reviewed package is supplied by
  // the offline profile and is not a native ZeroWall package to pack here.
  if (!source) continue
  if (RETIRED_PLUGIN_IDS.has(source.name)) continue
  if (!source.name.startsWith('@zerowallscience/plugin-')) continue
  const target = join(directory, id)
  await mkdir(target, { recursive: true })
  const output = execFileSync(process.execPath, [process.env.npm_execpath, '--filter', source.name, 'pack', '--pack-destination', target], { cwd: root, encoding: 'utf8' })
  await writeFile(join(target, 'pack.log'), output)
  const archive = join(target, (await readdir(target)).find(name => name.endsWith('.tgz')))
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).split(/\r?\n/)
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }))
  const descriptor = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/zerowall.plugin.json'], { encoding: 'utf8' }))
  assert.equal(descriptor.name, manifest.name, `${source.name}: plugin descriptor identity differs from package.json`)
  assert.equal(descriptor.version, manifest.version, `${source.name}: plugin descriptor version differs from package.json`)
  for (const entry of [manifest.main, descriptor.host, descriptor.client, descriptor.remote, 'dsh.bundle.patch.yml'].filter(Boolean)) {
    assert(entries.includes('package/' + entry.replace(/^\.\//, '')), `${source.name}: missing ${entry}`)
  }
  if (descriptor.client) {
    const clientSource = execFileSync('tar', ['-xOf', archive, `package/${descriptor.client.replace(/^\.\//, '')}`], { encoding: 'utf8', maxBuffer: 128 * 1024 ** 2 })
    assert(!/require\(["']@zerowallscience\/plugin-base\/client-helpers["']\)/u.test(clientSource), `${source.name}: client helper escaped into the DSH module table`)
    assert(!/require\(["']@deepseek-ai\/dsh-typert-protocol\/remote-info["']\)/u.test(clientSource), `${source.name}: generated remote helper escaped into the DSH module table`)
    assert(!/require\(["']dsh-better-sidebar\/src\//u.test(clientSource), `${source.name}: sidebar source helper escaped into the DSH module table`)
    if (id === 'python') {
      const styles = []
      let registration
      const document = {
        createElement: () => {
          const attributes = new Map()
          return { textContent: '', setAttribute: (key, value) => attributes.set(key, value), getAttribute: key => attributes.get(key) }
        },
        querySelectorAll: () => styles,
        head: { appendChild: style => styles.push(style) },
      }
      const sandbox = { console, document, __ModuleLoader__: { load: value => { registration = value } } }
      sandbox.window = sandbox
      runInNewContext(clientSource, sandbox, { filename: 'plugin-python-client.js' })
      assert.equal(styles.length, 1, 'Python client must inject its stylesheet exactly once')
      assert.equal(styles[0].getAttribute('data-zerowall-plugin-css'), source.name)
      assert.match(styles[0].textContent, /\.[A-Za-z0-9]+_panel\s*\{/u, 'Python panel CSS module selectors must be present')
      assert.match(styles[0].textContent, /height:\s*calc\(100vh\s*-\s*165px\)/u, 'Python panel layout rules must be present')
      assert(!entries.includes('package/lib/style.css'), 'Python stylesheet must be embedded in client.js, not shipped as an unloaded sidecar')
      assert.equal(registration?.id, source.name)
    }
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
