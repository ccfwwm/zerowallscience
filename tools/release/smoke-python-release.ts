/** Exercise the real desktop updater and registered Python tool on release bytes. */
import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Readable } from 'node:stream'
import { McpEnvironmentController, MCP_ENVIRONMENT_KEYRING } from '../../desktop/src/main/mcp-environment.js'
import { apply } from '../../plugins/python/src/host/index.js'

const work = resolve(process.argv[2] ?? '.build/python-1.4.0')
const manifest = JSON.parse(await readFile(join(work, 'dist/latest.json'), 'utf8'))
const archive = join(work, 'dist', new URL(manifest.archiveUrl).pathname.split('/').at(-1)!)
const originalStore = join(process.env.APPDATA!, 'zerowall-science/zerowall-python')
const old = JSON.parse(await readFile(join(originalStore, 'current.json'), 'utf8'))
assert.equal(old.manifest.environmentVersion, '1.3.0', 'Upgrade fixture must be the existing signed 1.3.0 runtime')
const publicKey = MCP_ENVIRONMENT_KEYRING['stable-3']
const events: Record<string, unknown>[] = []
function controller(root: string, corrupt = false) {
  let last = ''
  return new McpEnvironmentController({ root, publicKey, publicKeys: MCP_ENVIRONMENT_KEYRING,
    manifestUrl: 'https://release.test/latest.json',
    fetcher: (async (url: string | URL | Request) => String(url).endsWith('latest.json')
      ? new Response(JSON.stringify(manifest))
      : corrupt ? new Response('deliberately truncated archive')
      : new Response(Readable.toWeb(createReadStream(archive)) as ReadableStream, { headers: { 'Content-Length': String(manifest.archiveSize) } })) as typeof fetch,
    publish: status => { const state = `${status.phase}:${status.progress}`; if (last !== state) { console.log(root.split(/[\\/]/u).at(-1), state); last = state } },
  })
}
const freshRoot = join(work, 'client-fresh')
const fresh = await controller(freshRoot).initialize()
assert.equal(fresh.phase, 'ready', fresh.message)
assert.equal(fresh.environmentVersion, manifest.environmentVersion)
events.push({ test: 'fresh-install-real-archive-and-health', ok: true })

const upgradeRoot = join(work, 'client-upgrade')
await mkdir(upgradeRoot, { recursive: true })
await writeFile(join(upgradeRoot, 'current.json'), JSON.stringify(old))
const oldOverlay = join(originalStore, 'python-overlay')
await cp(oldOverlay, join(upgradeRoot, 'python-overlay'), { recursive: true })
const failureRoot = join(work, 'client-failure')
await mkdir(failureRoot, { recursive: true })
await writeFile(join(failureRoot, 'current.json'), JSON.stringify(old))
const failed = await controller(failureRoot, true).initialize()
assert.equal(failed.environmentVersion, '1.3.0')
assert.ok(failed.lastUpdateError)
events.push({ test: 'corrupt-archive-retains-real-1.3.0', ok: true })

const updated = await controller(upgradeRoot).initialize()
assert.equal(updated.phase, 'ready', updated.message)
assert.equal(updated.environmentVersion, manifest.environmentVersion)
assert.equal(updated.rollbackAvailable, true)
const rollback = JSON.parse(await readFile(join(upgradeRoot, 'rollback.json'), 'utf8'))
assert.equal(rollback.root, old.root)
events.push({ test: 'upgrade-from-real-1.3.0', ok: true })
const info = await controller(upgradeRoot).pythonInfo()
assert.equal(info.ready, true, info.message)
assert.equal(info.version, '3.12.10')
assert.equal(info.corePackageCount, 381)
assert.equal(info.overlayPackageCount, 6)
assert.equal(info.packageCount, 387)
events.push({ test: 'desktop-package-list-381-core-plus-6-extensions', ok: true })

process.env.ZEROWALL_PYTHON_ROOT = upgradeRoot
const tools: any[] = []
apply({ tools: { register: (tool: unknown) => tools.push(tool) } } as never)
const python = tools.find(t => t.name === 'python')
assert.ok(python)
const cwd = join(work, 'desktop-tool')
await mkdir(cwd, { recursive: true })
const code = `import sys,json,hashlib,pathlib,importlib.metadata as m,cv2,numpy as np,imagehash,pyzotero
assert sys.version_info[:3] == (3,12,10)
assert sys.flags.no_user_site
assert np.array_equal(cv2.flip(np.arange(9,dtype=np.uint8).reshape(3,3),1)[:,0],[2,5,8])
source=pathlib.Path(${JSON.stringify(oldOverlay)})
target=pathlib.Path(${JSON.stringify(join(upgradeRoot, 'python-overlay'))})
count=0
for p in source.rglob('*'):
 if p.is_file() and '__pycache__' not in p.parts:
  q=target/p.relative_to(source)
  assert q.is_file() and hashlib.sha256(p.read_bytes()).digest()==hashlib.sha256(q.read_bytes()).digest(),str(p)
  count+=1
overlay=target/'python-3.12'
extensions={d.metadata['Name']:d.version for d in m.distributions(path=[str(overlay)])}
assert len(extensions)==6,extensions
print(json.dumps({'python':sys.version,'extensions':extensions,'preservedFiles':count}))
`
const value = await python.execute({ code, description: 'Release acceptance via desktop Python tool', timeoutMs: 120000 }, { signal: new AbortController().signal, agent: { session: { header: { cwd } } } })
assert.equal(value.exitCode, 0, value.stderr)
events.push({ test: 'desktop-python-tool-and-six-real-extensions', ok: true, output: value.stdout })
await writeFile(join(work, 'client-verification.json'), JSON.stringify({ ok: false, events }, null, 2))

const restored = await controller(upgradeRoot).selectManual(old.root)
assert.equal(restored.phase, 'manual')
assert.equal(restored.environmentVersion, '1.3.0')
events.push({ test: 'rollback-to-signed-1.3.0-with-real-health', ok: true })
await writeFile(join(work, 'client-verification.json'), JSON.stringify({ ok: true, events }, null, 2))
console.log('Real desktop installation, upgrade, failure retention, extensions, Python tool and rollback passed.')
