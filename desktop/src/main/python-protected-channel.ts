import { EventEmitter } from 'node:events'
import { createServer, type Socket } from 'node:net'
import { execFile } from 'node:child_process'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { MCP_ENVIRONMENT_KEYRING } from './mcp-environment.js'

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`
/** UAC applies to the signed Python worker only. The UI, model credentials and
 * Host remain in their original processes. No shell text comes from a request. */
export async function protectedPythonChannel(entry: string, runtimeRoot: string): Promise<ChildProcess> {
  const pipe = `\\\\.\\pipe\\zerowall-python-${randomUUID()}`
  const token = randomBytes(32).toString('hex')
  const events = new EventEmitter() as EventEmitter & { send: Function; kill: Function; stderr: null }
  events.on('error', () => {})
  let socket: Socket | undefined, buffered = ''
  let acceptConnection!: () => void, rejectConnection!: (error: Error) => void
  const connection = new Promise<void>((accept, reject) => { acceptConnection = accept; rejectConnection = reject })
  const server = createServer(client => {
    if (socket) { client.destroy(); return }
    let authenticated = false, incoming = ''
    const authorizationTimer = setTimeout(() => client.destroy(), 5000)
    client.setEncoding('utf8')
    client.on('data', bytes => {
      let chunk = bytes.toString()
      if (!authenticated) {
        incoming += chunk
        if (incoming.length > 1024) { client.destroy(); return }
        const end = incoming.indexOf('\n'); if (end < 0) return
        let hello: { token?: string }
        try { hello = JSON.parse(incoming.slice(0, end)) } catch { client.destroy(); return }
        if (socket || typeof hello.token !== 'string' || hello.token.length !== token.length || !timingSafeEqual(Buffer.from(hello.token), Buffer.from(token))) { client.destroy(); return }
        authenticated = true; socket = client; clearTimeout(authorizationTimer)
        server.close(); acceptConnection(); chunk = incoming.slice(end + 1)
      }
      buffered += chunk
      if (buffered.length > 16 * 1024 ** 2) { client.destroy(new Error('PYTHON_PROTECTED_CHANNEL_LIMIT')); return }
      for (;;) {
        const end = buffered.indexOf('\n'); if (end < 0) break
        const line = buffered.slice(0, end); buffered = buffered.slice(end + 1)
        try { events.emit('message', JSON.parse(line)) } catch { client.destroy(new Error('PYTHON_PROTECTED_CHANNEL_FORMAT')) }
      }
    })
    client.on('error', error => { if (authenticated) events.emit('error', error) })
    client.on('close', () => { clearTimeout(authorizationTimer); if (authenticated) events.emit('exit', 0) })
  })
  await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(pipe, () => { server.off('error', reject); accept() }) })
  events.stderr = null
  events.send = (message: object, callback?: (error?: Error) => void) => {
    if (!socket) { callback?.(new Error('PYTHON_PROTECTED_CHANNEL_CLOSED')); return false }
    socket.write(JSON.stringify(message) + '\n', error => callback?.(error ?? undefined)); return true
  }
  events.kill = () => { socket?.destroy(); if (server.listening) server.close(); return true }
  // Verify again inside the elevated process, before importing any worker
  // code. A file changed while the UAC prompt is open must never execute.
  const bootstrap = `
    const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
    const entry=${JSON.stringify(entry)}, root=path.dirname(entry), keys=${JSON.stringify(MCP_ENVIRONMENT_KEYRING)};
    const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'worker-manifest.json'),'utf8'));
    const {signature,...payload}=manifest;
    if(manifest.schema!==1||manifest.abi!==1||manifest.localOnly||!Array.isArray(manifest.files)||manifest.entry!==path.basename(entry)||signature?.algorithm!=='ed25519'||!keys[signature?.keyId]||!crypto.verify(null,Buffer.from(JSON.stringify(canonical(payload))),keys[signature.keyId],Buffer.from(signature.value,'base64')))throw Error('PYTHON_WORKER_SIGNATURE');
    const seen=new Set();
    for(const file of manifest.files){
      const target=path.resolve(root,file.path),local=path.relative(root,target);
      if(!local||local.startsWith('..')||path.isAbsolute(local)||seen.has(file.path))throw Error('PYTHON_WORKER_PATH');
      seen.add(file.path);const info=fs.lstatSync(target),physical=path.relative(fs.realpathSync(root),fs.realpathSync(target));
      if(!info.isFile()||info.isSymbolicLink()||physical.startsWith('..')||path.isAbsolute(physical))throw Error('PYTHON_WORKER_PATH');
      const bytes=fs.readFileSync(target);
      if(bytes.length!==file.size||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('PYTHON_WORKER_INTEGRITY');
    }
    if(!seen.has(path.basename(entry)))throw Error('PYTHON_WORKER_ENTRY');
    const actual=new Set();
    const collect=base=>{for(const item of fs.readdirSync(base,{withFileTypes:true})){const target=path.join(base,item.name);if(item.isDirectory())collect(target);else if(item.isFile())actual.add(path.relative(root,target).replaceAll('\\\\','/'));else throw Error('PYTHON_WORKER_PATH')}};
    collect(root);actual.delete('worker-manifest.json');actual.delete('receipt.json');
    if(actual.size!==seen.size||[...actual].some(file=>!seen.has(file)))throw Error('PYTHON_WORKER_FILES');
    process.env.ZEROWALL_PROTECTED_CHANNEL_TOKEN=${JSON.stringify(token)};
    process.env.ZEROWALL_PROTECTED_RUNTIME_ROOT=${JSON.stringify(runtimeRoot)};
    import(require('node:url').pathToFileURL(entry).href).catch(error=>{console.error(error);process.exit(1)});
  `
  const evaluation = `eval(Buffer.from('${Buffer.from(bootstrap).toString('base64')}','base64').toString())`
  const elevated = `$ErrorActionPreference='Stop'; $env:ELECTRON_RUN_AS_NODE='1'; Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue; $env:NODE_PATH=${literal(join(dirname(entry), 'modules'))}; & ${literal(process.execPath)} '-e' ${literal(evaluation)} '--' '--protected-pipe' ${literal(pipe)}; exit $LASTEXITCODE`
  const encoded = Buffer.from(elevated, 'utf16le').toString('base64')
  const outer = `$ErrorActionPreference='Stop'; try { $p=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe') -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand','${encoded}') -PassThru -Wait; exit $p.ExitCode } catch { exit 1223 }`
  const launcher = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(outer, 'utf16le').toString('base64')], { windowsHide: true }, error => {
    if (!socket) { server.close(); rejectConnection(new Error('PYTHON_AUTHORIZATION_CANCELLED: authorization cancelled or protected worker unavailable.')) }
    else if (error) socket.destroy(new Error('PYTHON_PROTECTED_WORKER_EXITED'))
  })
  const timer = setTimeout(() => { server.close(); rejectConnection(new Error('PYTHON_AUTHORIZATION_TIMEOUT')) }, 120_000)
  try { await connection } finally { clearTimeout(timer) }
  launcher.unref()
  return events as unknown as ChildProcess
}
