import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { _electron } from 'playwright'
import { contract } from '../../tools/build/paths.mjs'
import { locatePackagedApp } from './packaged-app.mjs'

const packaged = await locatePackagedApp(join(import.meta.dirname, '..'))
const directory = join(contract.verification, 'commands', randomUUID())
const userdata = join(directory, 'userdata')
const commands = join(packaged.resourcesRoot, 'commands')
await mkdir(userdata, { recursive: true })
const env = { ...process.env, ZEROWALL_USER_DATA_DIR: userdata, ZEROWALL_DISABLE_DEFAULT_MCP: '1',
  APPDATA: join(directory, 'appdata'), LOCALAPPDATA: join(directory, 'localappdata') }
delete env.ELECTRON_RUN_AS_NODE
await Promise.all(['appdata', 'localappdata'].map(name => mkdir(join(directory, name), { recursive: true })))
const application = await _electron.launch({ executablePath: packaged.executablePath, env, args: [`--user-data-dir=${join(directory, 'chromium')}`], timeout: 120_000 })

async function execute(argv, input, wrapper = false) {
  const child = spawn(wrapper ? 'cmd.exe' : packaged.executablePath,
    wrapper ? ['/d', '/c', ...argv] : ['--expose-internals', join(commands, 'zws.mjs'), ...argv],
    { cwd: commands, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = '', errors = ''
  child.stdout.on('data', data => { output += data }); child.stderr.on('data', data => { errors += data })
  child.stdin.end(input)
  const timer = setTimeout(() => child.kill(), 90_000)
  const code = await new Promise((accept, reject) => { child.on('error', reject); child.on('close', accept) }).finally(() => clearTimeout(timer))
  assert.equal(code, 0, `Packaged command failed: ${argv.slice(0, 2).join(' ')}; ${errors.slice(-2000)}`)
  return output
}
const zws = async (argv, input) => JSON.parse(await execute(argv, input))
async function waitFor(task) {
  const deadline = Date.now() + 30_000
  do { try { if (await task()) return } catch {} await new Promise(accept => setTimeout(accept, 250)) } while (Date.now() < deadline)
  throw new Error('Packaged command state did not become ready')
}

try {
  await waitFor(async () => { await zws(['env', 'list']); return true })
  assert.match(await execute(['dsh.cmd', '--version'], undefined, true), /0\.2\.0-rc\.2/)
  assert.equal(JSON.parse(await execute(['zws.cmd', '--version'], undefined, true)).applicationVersion, contract.version)
  const doctor = await zws(['doctor'])
  assert.equal(doctor.host, 'ready')
  const files = doctor.plugins.find(item => item.id === '@zerowallscience/plugin-files')
  assert.equal(files.version, '0.2.0')
  assert.equal(files.source, 'bundled')
  assert.equal(files.compatibility, 'compatible')
  assert((await zws(['plugin', 'list'])).bundles.includes('@zerowallscience/plugin-skills'))
  const secret = 'isolated-cli-value'
  await zws(['env', 'set', 'ZWS_COMMAND_FIXTURE'], secret)
  const variables = await zws(['env', 'list'])
  assert(!JSON.stringify(variables).includes(secret))
  assert(variables.some(item => item.name === 'ZWS_COMMAND_FIXTURE' && item.configured))
  await zws(['env', 'delete', 'ZWS_COMMAND_FIXTURE'])
  const skill = join(directory, 'skill'); await mkdir(skill)
  await writeFile(join(skill, 'SKILL.md'), '---\nname: zws-command-fixture\ndescription: Packaged command import\n---\nInitial content\n')
  await zws(['skill', 'import', skill])
  await zws(['skill', 'disable', 'zws-command-fixture'])
  await zws(['skill', 'enable', 'zws-command-fixture'])
  await writeFile(join(skill, 'SKILL.md'), '---\nname: zws-command-fixture\ndescription: Packaged command refreshed\n---\nUpdated content\n')
  await zws(['skill', 'update', skill])
  assert.equal((await zws(['skill', 'list'])).find(item => item.name === 'zws-command-fixture').description, 'Packaged command refreshed')
  await zws(['skill', 'rollback', 'zws-command-fixture'])
  await zws(['skill', 'remove', 'zws-command-fixture'])
  const server = join(directory, 'server.cjs')
  await writeFile(server, `require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;const result=r.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'zws-command-fixture',version:'1.0.0'}}:r.method==='tools/list'?{tools:[{name:'ping',description:'Packaged lifecycle check',inputSchema:{type:'object',properties:{}}}]}:{content:[{type:'text',text:'pong'}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n')});process.stdin.on('end',()=>process.exit(0));`)
  const mcp = await zws(['mcp', 'add'], JSON.stringify({ name: 'Packaged fixture', serverName: 'zws-command-fixture', enabled: true, transport: 'stdio', command: process.execPath, args: [server] }))
  const active = async () => (await zws(['mcp', 'list'])).find(item => item.id === mcp.id)?.runtimeState === 'active'
  await waitFor(active)
  await zws(['mcp', 'stop', mcp.id])
  assert.equal((await zws(['mcp', 'list'])).find(item => item.id === mcp.id).enabled, false)
  await zws(['mcp', 'start', mcp.id]); await waitFor(active)
  await zws(['mcp', 'restart', mcp.id]); await waitFor(active)
  await zws(['mcp', 'logs', mcp.id])
  await zws(['mcp', 'remove', mcp.id])
  await zws(['python', 'status'])
  await writeFile(join(directory, 'receipt.json'), JSON.stringify({ applicationVersion: contract.version, dshVersion: '0.2.0-rc.2', ok: true,
    commandWrappers: true, pluginProfileList: true, actualFilePlugin: files, safeEnvironment: true, skillsImportRefreshRollback: true, mcpStartStopRestart: true, pythonStatus: true }, null, 2))
  console.log('Packaged commands verified:', directory)
} finally { await application.close() }
