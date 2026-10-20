import { spawn } from 'node:child_process'
import { once } from 'node:events'

const held = new WeakMap()
export async function releaseWindowsFiles(t) {
  for (const release of held.get(t) ?? []) await release()
}

// Readable snapshot, but no FILE_SHARE_DELETE: matches a loaded native module
// on Windows without artificially preventing candidate preparation.
export async function holdWindowsFile(t, file) {
  const script = "$f=[IO.File]::Open($env:ZWS_LOCK_FILE,'Open','Read','ReadWrite'); [Console]::WriteLine('READY'); [Console]::ReadLine() | Out-Null; $f.Dispose()"
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ZWS_LOCK_FILE: file }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  })
  let closed = false
  const exited = once(child, 'exit').then(() => { closed = true })
  const release = async () => { if (!closed) { child.stdin.end('\n'); await exited } }
  if (!held.has(t)) held.set(t, [])
  held.get(t).push(release)
  t.after(release)
  await new Promise((resolve, reject) => {
    let output = '', errors = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Windows lock fixture timed out: ' + errors)) }, 15000)
    child.stderr.on('data', bytes => { errors += bytes })
    child.stdout.on('data', bytes => { output += bytes; if (output.includes('READY')) { clearTimeout(timer); resolve() } })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', () => { clearTimeout(timer); if (!output.includes('READY')) reject(new Error('Windows lock fixture exited: ' + errors)) })
  })
  return release
}
