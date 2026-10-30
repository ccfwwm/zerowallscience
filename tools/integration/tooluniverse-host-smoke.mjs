// Run after the public Gateway cutover, against a disposable, updated profile.
// Does not modify the packaged app, the user's profile, or a release pointer.
import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve, delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'

const [installationArg, homeArg, outputArg, skillArg] = process.argv.slice(2)
assert.ok(installationArg && homeArg && outputArg && skillArg,
  'Usage: node tools/integration/tooluniverse-host-smoke.mjs <installation> <disposable-home> <new-evidence-directory> <verified-skill-folder>')
const project = process.env.ZEROWALL_TOOLUNIVERSE_PROJECT_ID?.trim()
assert.ok(project, 'Set ZEROWALL_TOOLUNIVERSE_PROJECT_ID to an existing remote project; this smoke never creates one.')
const installation = resolve(installationArg), home = resolve(homeArg), output = resolve(outputArg)
// A new output directory prevents accidental reuse of earlier acceptance.
await mkdir(output)
const workspace = join(output, 'workspace'); await mkdir(workspace)
const resources = join(installation, 'resources'), asar = join(resources, 'app.asar')
const offlineProfile = join(resources, 'offline-profile')
const sessionId = randomUUID()
const token = process.env.R_PLATFORM_MCP_AUTHORIZATION || 'Bearer ' + execFileSync('ssh', ['rdatalinux', 'python3', '-'], {
  encoding: 'utf8', input: 'from pathlib import Path\nx=dict(l.split("=",1) for l in Path("/etc/rdatalinux-r-platform/platform.env").read_text().splitlines() if "=" in l and not l.startswith("#"))\nprint(x["R_PLATFORM_MCP_KEY"].strip("\\\"\'"))\n',
}).trim()
const fixture = join(output, 'host-fixture.mjs'), patch = join(output, 'host.patch.yml')
await writeFile(fixture, `
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
export const inject=['tools','agents','sessionController','zerowallCapabilities','zerowallMcp'];
export function apply(ctx){
 const root=${JSON.stringify(output)};let busy=false,agent;
 const timer=setInterval(async()=>{if(busy)return;busy=true;let request;
  try{request=JSON.parse(await readFile(join(root,'request.json'),'utf8'));await unlink(join(root,'request.json'));
   if(!agent){await ctx.sessionController.create({sessionId:${JSON.stringify(sessionId)},cwd:${JSON.stringify(workspace)}});agent=ctx.agents.get(${JSON.stringify(sessionId)});}
   const result=request.name==='import_verified_skill'
    ?{value:await ctx.zerowallCapabilities.updateSkill(request.arguments)}
    :await ctx.tools.execute({name:request.name,arguments:request.arguments,callId:request.id,agent,signal:new AbortController().signal});
   await writeFile(join(root,request.id+'.json'),JSON.stringify({result}));
  }catch(error){if(request)await writeFile(join(root,request.id+'.json'),JSON.stringify({error:String(error)}));}
  finally{busy=false;}
 },100);ctx.effect(()=>()=>clearInterval(timer));writeFile(join(root,'ready'),'ready');
}
`)
await writeFile(patch, await readFile(join(resources, 'zerowall.patch.yml'), 'utf8')
  + `\n- insert:\n    - id: tooluniverse-acceptance\n      name: ${JSON.stringify(pathToFileURL(fixture).href)}\n`)
const executable = join(installation, 'ZeroWallScience.exe')
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home, ZEROWALL_USER_DATA_DIR: output,
  ZEROWALL_RESEARCH_DB: join(output, 'research.sqlite'),
  NODE_PATH: [join(offlineProfile, 'profile-runtime.asar', 'node_modules'),
    join(offlineProfile, 'profile-runtime.asar.unpacked', 'node_modules'),
    join(asar, 'node_modules'), join(home, 'profiles/web/node_modules')].join(delimiter),
  ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(join(asar, 'package.json')).href,
  ZEROWALL_PROFILE_ANCHOR: pathToFileURL(join(home, 'profiles/web/package.json')).href,
  ZEROWALL_DEFER_DEFAULT_MCP: '1', R_PLATFORM_MCP_AUTHORIZATION: token, DSH_TELEMETRY_DISABLED: '1' }
let logs = ''
const child = spawn(executable, ['--import', pathToFileURL(join(asar, 'runtime/runtime-esm-register.mjs')).href,
  '--expose-internals', join(asar, 'runtime/harness-node-entry.mjs'), join(asar, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
  'web', '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open'],
  { env, cwd: output, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
child.stdout.on('data', value => { logs = (logs + value).slice(-200000) })
child.stderr.on('data', value => { logs = (logs + value).slice(-200000) })
child.on('message', message => { if (message?.kind === 'zerowall-secret-request') child.send({ kind: 'zerowall-secret-response', requestId: message.requestId, ok: message.operation === 'get' }) })
const report = { project, complete: false, checks: [] }
const wait = async (get, timeout = 120000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = await get(); if (value) return value
    if (child.exitCode !== null) throw new Error('Actual Host exited before acceptance')
    await new Promise(done => setTimeout(done, 250))
  }
  throw new Error('Actual Host acceptance timed out')
}
try {
  await wait(() => readFile(join(output, 'ready'), 'utf8').catch(() => undefined))
  const call = async (name, args) => {
    const id = randomUUID(); await writeFile(join(output, 'request.json'), JSON.stringify({ id, name, arguments: args }))
    const response = await wait(() => readFile(join(output, id + '.json'), 'utf8').then(JSON.parse, () => undefined))
    assert.ok(!response.error, response.error); assert.ok(!response.result?.isError, JSON.stringify(response.result))
    return response.result.value?.structuredContent ?? response.result.value
  }
  await call('import_verified_skill', { sourcePath: resolve(skillArg) })
  const skill = await call('skill', { name: 'zerowall-tooluniverse' })
  assert.ok(skill.resourceBase?.path); report.checks.push('actual Host loads verified ToolUniverse Skill')
  await call('mcp_connect', { server: 'rmcp' })
  report.checks.push('actual Host connects public RMCP')
  const search = await call('research_workflow', { action: 'search', workflow_id: 'tooluniverse', query: 'UniProt_get_entry_by_accession', limit: 10 })
  assert.ok(JSON.stringify(search).includes('tooluniverse.tool.UniProt_get_entry_by_accession'))
  const detail = await call('research_workflow', { action: 'describe', workflow_id: 'tooluniverse', operation: 'tooluniverse.tool.UniProt_get_entry_by_accession' })
  assert.equal(detail.id, 'tooluniverse.tool.UniProt_get_entry_by_accession')
  const parameters = { operation: detail.id, request_id: 'host-uniprot-p05067', arguments: {
    project_id: project, tool_arguments: { accession: 'P05067', compact: true }, confirm: true } }
  const run = await call('research_workflow', { action: 'run', workflow_id: 'tooluniverse', parameters })
  assert.ok(run.run_id, JSON.stringify(run))
  report.run = run
  const duplicate = await call('research_workflow', { action: 'run', workflow_id: 'tooluniverse', parameters })
  assert.equal(duplicate.run_id, run.run_id)
  let readFailures = 0
  const completed = await wait(async () => {
    let state
    try {
      state = await call('research_workflow', { action: 'status', run_id: run.run_id })
    } catch (error) {
      // Retry bounded read-only discovery/status failures against the same Run.
      // Submission is never replayed and persistent failures still fail smoke.
      if (!String(error).includes('UNKNOWN_CAPABILITY: tooluniverse.get.job') || ++readFailures > 3) throw error
      report.transientStatusErrors = readFailures
      await new Promise(done => setTimeout(done, 1000))
      return undefined
    }
    return ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(state.status) ? state : undefined
  }, 180000)
  assert.equal(completed.status, 'succeeded', JSON.stringify(completed))
  const file = completed.result.artifacts.files.find(file => file.project_artifact_path.endsWith('/result.json'))
  assert.ok(file)
  await call('r_files', { action: 'download_workspace', source: 'project', project_id: project,
    remote_path: file.project_artifact_path, local_path: 'uniprot.json' })
  const bytes = await readFile(join(workspace, 'uniprot.json'))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
  const record = JSON.parse(bytes)
  assert.equal(record.result.data.primaryAccession, 'P05067')
  assert.equal(record.result.data.uniProtkbId, 'A4_HUMAN')
  report.checks.push('discover, describe, idempotent submit, status, Manifest, workspace download and SHA-256')
  report.run = completed; report.file = file; report.complete = true
} catch (error) { report.error = String(error); throw error }
finally {
  if (child.pid && child.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  await writeFile(join(output, 'host-acceptance.json'), JSON.stringify(report, null, 2))
  await writeFile(join(output, 'host.log'), logs.replaceAll(token, '[REDACTED]').replace(/([?&]token=)[^\s&]+/gu, '$1[REDACTED]'))
}
