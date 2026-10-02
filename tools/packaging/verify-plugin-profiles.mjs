import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, cp, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import yaml from 'yaml'
import { root, stageRoot, releaseRoot, verificationRoot, contract } from '../build/paths.mjs'
import { fileDigest, signCatalog } from '../release/resource-catalog.mjs'
import { initializeProfile } from '../commands/profile.mjs'
import { createResourceManager } from '../commands/resource-manager.mjs'

const directory = join(verificationRoot, 'profiles', randomUUID())
const home = join(directory, 'harness')
const entry = join(stageRoot, 'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js')
await mkdir(directory, { recursive: true })
await initializeProfile(home, JSON.parse(await readFile(join(stageRoot, 'commands/default-plugins.json'))))
const environment = { ...process.env, DSH_HOME: home, ZEROWALL_USER_DATA_DIR: directory,
  ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(entry).href,
  ZEROWALL_RESEARCH_DB: join(directory, 'research.sqlite'), ZEROWALL_DISABLE_DEFAULT_MCP: '1',
  ZEROWALL_PYTHON_ROOT: join(directory, 'zerowall-python'),
  ZEROWALL_BUNDLED_SKILLS: join(stageRoot, 'resources/skills'),
  DSH_BUNDLED_SKILL_DIR: join(stageRoot, 'resources/skills'), DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1' }
let child, output = '', bootCount = 0, hostAddress
const pending = new Map()
const secrets = new Map()
function callHost(operation, args = []) {
  return new Promise((accept, reject) => {
    const id = randomUUID(), timer = setTimeout(() => { pending.delete(id); reject(new Error('Host management timeout: ' + operation)) }, 20_000)
    pending.set(id, { accept: value => { clearTimeout(timer); accept(value) }, reject: error => { clearTimeout(timer); reject(new Error(operation + ': ' + error.message)) } })
    child.send({ type: 'zerowall:management', id, operation, args })
  })
}
async function startHost() {
  output = ''
  const port = await new Promise((accept, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(20000 + Math.floor(Math.random() * 19000), '127.0.0.1', () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : accept(port))
    })
  })
  hostAddress = `http://127.0.0.1:${port}`
  child = spawn(process.execPath, ['--import', pathToFileURL(join(root, 'desktop/build/runtime-esm-register.mjs')).href, '--expose-internals', join(root, 'desktop/build/harness-node-entry.mjs'), entry,
    'web', '--patch', join(stageRoot, 'resources/zerowall-core.patch.yml'), '--port', String(port), '--host', '127.0.0.1', '--no-open'], { cwd: directory, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  const capture = chunk => { output = (output + chunk).slice(-100000) }
  child.stdout.on('data', capture); child.stderr.on('data', capture)
  child.on('message', message => {
    if (message?.kind === 'zerowall-secret-request') {
      if (message.operation === 'set') secrets.set(message.key, message.value)
      if (message.operation === 'delete') secrets.delete(message.key)
      child.send({ kind: 'zerowall-secret-response', requestId: message.requestId, ok: true, value: message.operation === 'get' ? secrets.get(message.key) : undefined })
    }
    if (message?.type !== 'zerowall:management:result') return
    const request = pending.get(message.id); pending.delete(message.id)
    if (request) message.error ? request.reject(new Error(message.error)) : request.accept(message.result)
  })
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline && child.exitCode === null) {
    if (/http:\/\/127\.0\.0\.1:\d+/.test(output)) {
      let health
      try { health = await callHost('host.health') } catch {}
      if (health?.ready) {
        try { await fetch(hostAddress, { signal: AbortSignal.timeout(1000) }); bootCount++; return } catch {}
      }
      if (health?.entries?.some(entry => entry.state === 3)) throw new Error('A configured plugin failed activation')
    }
    await new Promise(accept => setTimeout(accept, 250))
  }
  await writeFile(join(directory, 'host-failed.log'), output.replace(/([?&]token=)[^\s&]+/g, '$1[redacted]'))
  throw new Error('Isolated Host failed; diagnostics: ' + directory)
}
async function stopHost() {
  if (!child || child.exitCode !== null) return
  const instance = child
  instance.kill('SIGTERM')
  await new Promise(accept => { if (instance.exitCode !== null) return accept(); instance.once('close', accept); setTimeout(() => { instance.kill('SIGKILL'); accept() }, 8000).unref() })
}
async function runPlugin(args, profile) {
  console.log('Official DSH plugin operation:', args[0], profile)
  const processChild = spawn(process.execPath, ['tools/commands/dsh.mjs', 'plugin', '--profile', profile, ...args], { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let text = ''
  processChild.stdout.on('data', chunk => { text += chunk }); processChild.stderr.on('data', chunk => { text += chunk })
  const code = await new Promise((accept, reject) => { processChild.on('error', reject); processChild.on('close', accept) })
  await writeFile(join(directory, `${profile}-pnpm.log`), text)
  assert.equal(code, 0, 'Official DSH install failed; diagnostics: ' + directory)
}
const keys = JSON.parse(await readFile(join(releaseRoot, 'catalogs/verification-keys.json')))
const manager = createResourceManager({ home, keys, local: true, target: { desktopVersion: contract.version, dshVersion: '0.2.0-rc.2', platform: process.platform, architecture: process.arch }, yaml, runPlugin, startHost, stopHost, callHost })
try {
  await startHost()
  const before = await callHost('env.list')
  await manager.plugin('@zerowallscience/plugin-environment', join(releaseRoot, 'catalogs/plugin-latest.json'))
  const installed = JSON.parse(await readFile(join(home, 'profiles/web/node_modules/@zerowallscience/plugin-environment/package.json')))
  assert.equal(installed.version, '0.1.0')
  await callHost('env.set', ['ZWS_PROFILE_TEST', 'private-fixture-value'])
  const variables = await callHost('env.list')
  assert(!JSON.stringify(variables).includes('private-fixture-value'))
  assert(variables.some(item => item.name === 'ZWS_PROFILE_TEST' && item.configured))
  await callHost('env.delete', ['ZWS_PROFILE_TEST'])
  // Repack a private fixture at a genuinely newer version. The public
  // migration baseline stays 0.1.0; no fixture is added to release feeds.
  const fixture = join(directory, 'upgrade/package')
  await cp(join(stageRoot, 'plugin-packages/plugin-environment'), fixture, { recursive: true })
  const nextManifest = JSON.parse(await readFile(join(fixture, 'package.json')))
  nextManifest.version = '0.1.1'
  await writeFile(join(fixture, 'package.json'), JSON.stringify(nextManifest))
  const archive = join(directory, 'environment-0.1.1.tgz')
  execFileSync('tar', ['-czf', archive, '-C', join(directory, 'upgrade'), 'package'])
  const privateKey = await readFile(join(contract.cache, 'catalogs/development-private.pem'))
  const document = JSON.parse(await readFile(join(releaseRoot, 'catalogs/plugin-catalog.json')))
  const record = document.resources.find(item => item.id === installed.name)
  Object.assign(record, { version: '0.1.1', downloadUrl: pathToFileURL(archive).href, sha256: await fileDigest(archive), size: (await stat(archive)).size })
  const upgradeCatalog = join(directory, 'upgrade-catalog.json')
  await writeFile(upgradeCatalog, JSON.stringify(signCatalog(document, privateKey, 'local-development')))
  await manager.plugin(installed.name, upgradeCatalog)
  assert.equal(JSON.parse(await readFile(join(home, 'profiles/web/node_modules', installed.name, 'package.json'))).version, '0.1.1')
  await manager.rollback()
  assert.equal(JSON.parse(await readFile(join(home, 'profiles/web/node_modules', installed.name, 'package.json'))).version, '0.1.0')
  assert.deepEqual(await callHost('env.list'), before)
  const skill = join(directory, 'skill-fixture'); await mkdir(skill)
  await writeFile(join(skill, 'SKILL.md'), '---\nname: zws-profile-fixture\ndescription: Isolated hot update verification\n---\nFirst version\n')
  await callHost('skill.import', [{ sourcePath: skill }])
  await writeFile(join(skill, 'SKILL.md'), '---\nname: zws-profile-fixture\ndescription: Updated hot verification\n---\nSecond version\n')
  await callHost('skill.update', [{ sourcePath: skill }])
  assert.equal(bootCount, 4, 'Skills must refresh without restarting the Host')
  assert.equal((await callHost('skill.list')).find(item => item.name === 'zws-profile-fixture').description, 'Updated hot verification')
  await callHost('skill.rollback', ['zws-profile-fixture'])
  assert.equal((await callHost('skill.list')).find(item => item.name === 'zws-profile-fixture').description, 'Isolated hot update verification')
  await callHost('skill.disable', ['zws-profile-fixture', false])
  await callHost('skill.enable', ['zws-profile-fixture', true])
  await callHost('skill.remove', ['zws-profile-fixture'])
  const server = join(directory, 'mcp-fixture.cjs'), pidFile = join(directory, 'mcp-pid.json')
  await writeFile(server, `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({pid:process.pid})); require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;const result=r.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'zws-fixture',version:'1.0.0'}}:r.method==='tools/list'?{tools:[{name:'ping',description:'Lifecycle fixture',inputSchema:{type:'object',properties:{}}}]}:{content:[{type:'text',text:'pong'}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n')});process.stdin.on('end',()=>process.exit(0));`)
  const mcp = await callHost('mcp.add', [{ name: 'ZWS lifecycle fixture', serverName: 'zws-fixture', transport: 'stdio', enabled: true, command: process.execPath, args: [server] }])
  const waitReady = async () => { for (let i=0;i<80;i++) { const item=(await callHost('mcp.list')).find(row=>row.id===mcp.id); if(item.runtimeState==='active' && item.tools.length) return item; await new Promise(resolve=>setTimeout(resolve,250)) } throw new Error('MCP fixture never became active') }
  await waitReady()
  const firstPid = JSON.parse(await readFile(pidFile)).pid
  await callHost('mcp.restart', [mcp.id]); await waitReady()
  const secondPid = JSON.parse(await readFile(pidFile)).pid
  assert.notEqual(firstPid, secondPid, 'Restart must launch a new MCP process')
  await callHost('mcp.disable', [{ id: mcp.id, changes: { enabled: false } }])
  assert.equal((await callHost('mcp.list')).find(row => row.id === mcp.id).enabled, false)
  for(let i=0;i<40;i++) { try { process.kill(secondPid,0) } catch { break } await new Promise(resolve=>setTimeout(resolve,100)) }
  assert.throws(()=>process.kill(secondPid,0), 'Disabled MCP process must stop')
  await callHost('mcp.enable', [{ id: mcp.id, changes: { enabled: true } }]); await waitReady()

  // Independently update the real stdio server from a signed tarball, then
  // restore its previous command without restarting the DSH Host.
  const mcpFolder = join(directory, 'mcp-bundle'); await mkdir(mcpFolder)
  await cp(server, join(mcpFolder, 'server.cjs'))
  const mcpArchive = join(directory, 'mcp-bundle.tgz')
  execFileSync('tar', ['-czf', mcpArchive, '-C', mcpFolder, '.'])
  const mcpResource = { ...record, id: 'zws-fixture-server', kind: 'mcp', version: '0.1.1', role: 'server-bundle', runtime: 'node', entrypoint: 'server.cjs', server: { serverName: 'zws-fixture', enabled: true }, downloadUrl: pathToFileURL(mcpArchive).href, sha256: await fileDigest(mcpArchive), size: (await stat(mcpArchive)).size, restartRequired: false }
  const mcpCatalog = join(directory, 'mcp-catalog.json')
  await writeFile(mcpCatalog, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources: [mcpResource] }, privateKey, 'local-development')))
  const beforeMcpBoots = bootCount
  await manager.resource('mcp', mcpResource.id, mcpCatalog)
  assert.notEqual((await waitReady()).args[0], server)
  await manager.rollbackMcp(mcpResource.id)
  assert.equal((await waitReady()).args[0], server)
  assert.equal(bootCount, beforeMcpBoots)
  await callHost('mcp.remove', [mcp.id])
  // Exercise the real old file archive, including its own remote bundle,
  // before upgrading to the resource-bearing universal viewer package.
  const fileId = '@zerowallscience/plugin-files'
  const oldArchive = join(root, 'artifacts/release/8.0.0/plugins/plugin-files/0.1.0/zerowallscience-plugin-files-0.1.0.tgz')
  const fileDocument = JSON.parse(await readFile(join(releaseRoot, 'catalogs/plugin-catalog.json')))
  const oldRecord = fileDocument.resources.find(item => item.id === fileId)
  Object.assign(oldRecord, { version: '0.1.0', desktopRange: { min: '8.0.0' }, downloadUrl: pathToFileURL(oldArchive).href, sha256: await fileDigest(oldArchive), size: (await stat(oldArchive)).size })
  const oldCatalog = join(directory, 'old-file-catalog.json')
  await writeFile(oldCatalog, JSON.stringify(signCatalog(fileDocument, privateKey, 'local-development')))
  await manager.plugin(fileId, oldCatalog)
  assert.equal(JSON.parse(await readFile(join(home, 'profiles/web/node_modules', fileId, 'package.json'))).version, '0.1.0')
  await manager.plugin(fileId, join(releaseRoot, 'catalogs/plugin-latest.json'))
  const fileRoot = join(home, 'profiles/web/node_modules', fileId)
  assert.equal(JSON.parse(await readFile(join(fileRoot, 'package.json'))).version, '0.2.0')
  const assetManifest = JSON.parse(await readFile(join(fileRoot, 'lib/viewer-assets/asset-manifest.json')))
  assert.equal(await fileDigest(join(fileRoot, 'lib/viewer-assets/build/pdf.worker.mjs')), assetManifest.files['build/pdf.worker.mjs'])
  const cssResponse = await fetch(`${hostAddress}/zerowall/viewer-assets/${assetManifest.version}/leaflet/leaflet.css`)
  assert.equal(cssResponse.status, 200)
  assert.equal(cssResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal((await fetch(`${hostAddress}/zerowall/viewer-assets/${'0'.repeat(64)}/leaflet/leaflet.css`)).status, 404)
  await manager.rollback()
  assert.equal(JSON.parse(await readFile(join(home, 'profiles/web/node_modules', fileId, 'package.json'))).version, '0.1.0')
  await manager.plugin('@zerowallscience/dsh-bundle-science', join(releaseRoot, 'catalogs/plugin-latest.json'))
  const composition = JSON.parse(await readFile(join(home, 'profiles/web/package.json'))).dsh.profile.bundles
  assert(!composition.includes('@zerowallscience/dsh-bundle-science'))
  assert.equal(new Set(composition).size, composition.length)
  assert(composition.includes('dsh-wechat'))
  assert(composition.includes('@zerowallscience/plugin-environment'))
  assert((await callHost('host.health')).ready)
  // Removing a required service must fail health and restore the full profile.
  await assert.rejects(manager.mutate(['remove', '@zerowallscience/plugin-environment']), /failed|activation|Host/)
  assert.deepEqual(JSON.parse(await readFile(join(home, 'profiles/web/package.json'))).dsh.profile.bundles, composition)
  assert((await callHost('host.health')).ready)

  await writeFile(join(directory, 'receipt.json'), JSON.stringify({ applicationVersion: contract.version, dshVersion: '0.2.0-rc.2', installedPlugin: installed.name, version: installed.version, upgradeVersion: '0.1.1', bootCount, pluginInstallation: true, filePluginUpgradeRollback: true, versionedViewerAssets: true, profileUpgradeRollback: true, skillsImportRefreshRollback: true, mcpStartStopRestart: true, mcpSignedBundleUpdateRollback: true, compositionInstallation: true, missingDependencyRollback: true, environmentSecretsRedacted: true }, null, 2))
  console.log('Real profile verification passed:', directory)
} finally {
  await writeFile(join(directory, 'host.log'), output.replace(/([?&]token=)[^\s&]+/g, '$1[redacted]'))
  await stopHost()
}
