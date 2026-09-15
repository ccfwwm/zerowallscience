import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, copyFile, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const installed = process.argv[2] ?? 'C:/Users/ccf/AppData/Local/Programs/ZeroWallScience'
const root = await mkdtemp(join(tmpdir(), 'zerowall-host-diagnosis-'))
const resources = resolve(installed, 'resources')
const asar = resolve(resources, 'app.asar')
const entry = resolve(asar, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const original = 'C:/Users/ccf/AppData/Roaming/zerowall-science'
await mkdir(join(root, 'harness/profiles/web'), { recursive: true })
for (const name of ['settings.yaml', 'zerowall-mcp-defaults-v1.json', 'profiles/web/cordis.patch.yml']) {
  await copyFile(join(original, 'harness', name), join(root, 'harness', name)).catch(() => {})
}
const probe = join(root, 'probe.mjs')
await writeFile(probe, `import { Session } from 'node:inspector';
import { appendFileSync, writeFileSync } from 'node:fs';
const session = new Session(); session.connect();
session.post('HeapProfiler.startSampling', { samplingInterval: 32768 });
const destination = process.env.ZEROWALL_DIAGNOSTICS;
setInterval(() => {
 appendFileSync(destination + '/memory.jsonl', JSON.stringify({at:Date.now(),uptime:process.uptime(),...process.memoryUsage(),listeners:process.listenerCount('message'),resources:process.getActiveResourcesInfo()})+'\\n');
 session.post('HeapProfiler.getSamplingProfile', {}, (error, data) => { if(!error) writeFileSync(destination+'/allocation.json', JSON.stringify(data)); });
}, 10000).unref();
`)
const port = Number(process.env.ZEROWALL_DIAG_PORT ?? 59842)
const child = spawn(resolve(installed, 'ZeroWallScience.exe'), ['--import', pathToFileURL(probe).href, '--import', pathToFileURL(resolve(asar, 'runtime/runtime-esm-register.mjs')).href, '--expose-internals', resolve(asar, 'runtime/harness-node-entry.mjs'), entry, 'web', '--patch', resolve(resources, 'zerowall.patch.yml'), '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
 cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env,
 ELECTRON_RUN_AS_NODE:'1', NODE_PATH:resolve(asar,'node_modules'), ZEROWALL_RUNTIME_ANCHOR:pathToFileURL(entry).href,
 DSH_HOME:join(root,'harness'), USERPROFILE:root, HOME:root, ZEROWALL_USER_DATA_DIR:root,
 ZEROWALL_USER_SKILLS:join(root,'harness/zerowall-skills'), ZEROWALL_BUNDLED_SKILLS:resolve(resources,'skills'),
 DSH_BUNDLED_SKILL_DIR:resolve(resources,'skills'), ZEROWALL_RESEARCH_DB:join(root,'research.sqlite'),
 ZEROWALL_MCP_ENVIRONMENT_ROOT:join(original,'mcp-environments'), DSH_TELEMETRY_DISABLED:'1', ZEROWALL_DIAGNOSTICS:root,
 } })
let output = ''
const capture = chunk => { output = (output+chunk.toString()).slice(-200000) }
child.stdout.on('data', capture); child.stderr.on('data', capture)
child.on('message', msg => {
 if(msg?.kind === 'zerowall-secret-request') child.send({kind:'zerowall-secret-response',requestId:msg.requestId,ok:true})
})
console.log(JSON.stringify({root,pid:child.pid,port}))
const logTimer = setInterval(async () => {
 const token = /\?token=([A-Za-z0-9_-]+)/.exec(output)?.[1]
 if(token) await writeFile(join(root,'endpoint.txt'), `http://127.0.0.1:${port}/?token=${token}`)
 await writeFile(join(root,'host.log'), output.replace(/token=[^\s]+/g,'token=[redacted]'))
},10000)
const endTimer = setTimeout(()=>{ if(child.exitCode===null) spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}) }, 21*60000)
child.on('exit', (code)=>{clearInterval(logTimer);clearTimeout(endTimer);console.log(JSON.stringify({exit:code,root}))})
