const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir, homedir } = require('node:os')
const { join } = require('node:path')
const { spawn } = require('node:child_process')

// SciMaster only reads ~/.scimaster/config.json. Keep the credential in a
// process-scoped temporary home so it never enters the MCP archive or a
// regular settings snapshot.
const apiKey = String(process.env.ZEROWALL_SCIMASTER_API_KEY || '').trim()
const temporaryHome = mkdtempSync(join(tmpdir(), 'zerowall-scimaster-'))
const configDirectory = join(temporaryHome, '.scimaster')
mkdirSync(configDirectory, { recursive: true })
writeFileSync(join(configDirectory, 'config.json'), JSON.stringify({
  version: 1,
  apiKey,
  apiBaseUrl: 'https://scimaster.bohrium.com',
  defaults: { limit: 10, mode: 'low' },
}) + '\n', { encoding: 'utf8', mode: 0o600 })

const environment = {
  ...process.env,
  HOME: temporaryHome,
  USERPROFILE: temporaryHome,
  HOMEDRIVE: '',
  HOMEPATH: '',
}
delete environment.ZEROWALL_SCIMASTER_API_KEY

const child = spawn(process.execPath, [join(__dirname, 'dist', 'mcp.cjs')], {
  cwd: __dirname,
  env: environment,
  stdio: 'inherit',
  windowsHide: true,
})

let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  try { rmSync(temporaryHome, { recursive: true, force: true }) } catch { /* best effort */ }
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => child.kill(signal))
child.once('error', (error) => { cleanup(); console.error(`SciMaster MCP launcher failed: ${error.message}`); process.exitCode = 1 })
child.once('exit', (code, signal) => {
  cleanup()
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
