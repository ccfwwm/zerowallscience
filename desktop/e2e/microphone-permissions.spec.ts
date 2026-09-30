/** Exercise the shipped desktop permission policy in Windows Electron with a fake audio device. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(desktopRoot, '..')
const tag = 'ZEROWALL_MICROPHONE_E2E '

function transpile(source: string, module: ts.ModuleKind): string {
  return ts.transpileModule(source, { compilerOptions: { module, target: ts.ScriptTarget.ES2022 } }).outputText
}

async function runElectron(executable: string, main: string, origin: string, userData: string, fakeDevice: boolean): Promise<Array<Record<string, unknown>>> {
  return await new Promise((resolveResult, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ZW_MIC_TEST_ORIGIN: origin, ZW_MIC_TEST_DATA: userData }
    delete env.ELECTRON_RUN_AS_NODE
    const child: ChildProcessWithoutNullStreams = spawn(executable, [...(fakeDevice ? ['--use-fake-device-for-media-stream'] : []), main], {
      cwd: desktopRoot, env, stdio: 'pipe', windowsHide: true,
    })
    let output = '', errors = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Electron microphone probe timed out: ${errors.slice(-2500)}`)) }, 45_000)
    child.stdout.on('data', chunk => { output += String(chunk) })
    child.stderr.on('data', chunk => { errors += String(chunk) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => {
      clearTimeout(timer)
      const records = output.split(/\r?\n/u).filter(line => line.startsWith(tag)).map(line => JSON.parse(line.slice(tag.length)) as Record<string, unknown>)
      if (code !== 0 || !records.some(record => record.kind === 'outcome')) reject(new Error(`Electron microphone probe failed (${code}): ${output.slice(-3000)} ${errors.slice(-2000)}`))
      else resolveResult(records)
    })
  })
}

it.skipIf(process.platform !== 'win32')('reaches microphone permission, capture and recording through Windows Electron', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'zerowall-microphone-e2e-'))
  const target = resolve(scratch)
  if (!target.startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error(`Unsafe temporary directory: ${target}`)
  const server = createServer((request, response) => {
    if (request.url === '/audio.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' })
      response.end(transpile(readFileSync(join(workspace, 'deepseek-harness', 'packages', 'experimental', 'client-ui-voice-input', 'src', 'client', 'audio.ts'), 'utf8'), ts.ModuleKind.ESNext))
      return
    }
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(`<button id="microphone">Record</button><script type="module">
      import { Recording } from '/audio.js'
      window.recordWithVoicePlugin = async () => {
        const capture = new Recording(() => {})
        try { await capture.start(); return { phase: 'recording', recorder: typeof MediaRecorder } }
        catch (error) { return { phase: 'failed', name: error?.name, message: error?.message } }
        finally { await capture.dispose() }
      }
      document.querySelector('#microphone').addEventListener('click', () => {
        window.voiceButtonResult = window.recordWithVoicePlugin()
      })
    </script>`)
  })
  try {
    mkdirSync(join(scratch, 'user-data'))
    for (const name of ['security.ts', 'security-policy.ts']) {
      const input = readFileSync(join(desktopRoot, 'src', 'main', name), 'utf8')
      writeFileSync(join(scratch, name.replace(/\.ts$/u, '.js')), transpile(input, ts.ModuleKind.CommonJS))
    }
    const main = `
      const { app, BrowserWindow, dialog, systemPreferences } = require('electron')
      const { secureWindow } = require('./security.js')
      const tag = ${JSON.stringify(tag)}
      const report = value => process.stdout.write(tag + JSON.stringify(value) + '\\n')
      app.setPath('userData', process.env.ZW_MIC_TEST_DATA)
      dialog.showMessageBox = async () => ({ response: 1 })
      app.whenReady().then(async () => {
        const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } })
        const session = window.webContents.session
        const originalCheck = session.setPermissionCheckHandler.bind(session)
        const originalRequest = session.setPermissionRequestHandler.bind(session)
        session.setPermissionCheckHandler = handler => originalCheck((contents, permission, origin, details) => {
          const allowed = handler(contents, permission, origin, details)
          report({ kind: 'check', permission, origin, mediaType: details.mediaType, main: details.isMainFrame, owned: contents === window.webContents, allowed })
          return allowed
        })
        session.setPermissionRequestHandler = handler => originalRequest((contents, permission, callback, details) => {
          handler(contents, permission, allowed => {
            report({ kind: 'request', permission, mediaTypes: details.mediaTypes, main: details.isMainFrame, owned: contents === window.webContents, allowed })
            callback(allowed)
          }, details)
        })
        const systemStatus = systemPreferences.getMediaAccessStatus('microphone')
        secureWindow(window, () => process.env.ZW_MIC_TEST_ORIGIN)
        await window.loadURL(process.env.ZW_MIC_TEST_ORIGIN)
        const outcome = await window.webContents.executeJavaScript(\`(async () => {
          const permission = await navigator.permissions.query({ name: 'microphone' })
          let direct
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
            direct = { ok: true, kinds: stream.getTracks().map(track => track.kind) }
            stream.getTracks().forEach(track => track.stop())
          } catch (error) { direct = { ok: false, name: error.name, message: error.message } }
          document.querySelector('#microphone').click()
          const button = await window.voiceButtonResult
          return { secureContext: window.isSecureContext, mediaDevices: !!navigator.mediaDevices, permissionState: permission.state, direct, button }
        })()\`)
        report({ kind: 'outcome', systemStatus, ...outcome })
        app.quit()
      }).catch(error => { report({ kind: 'error', message: String(error?.stack || error) }); app.exit(1) })
    `
    const mainPath = join(scratch, 'main.cjs')
    writeFileSync(mainPath, main)
    await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing microphone probe port')
    const origin = `http://127.0.0.1:${address.port}`
    const authenticatedUrl = `${origin}/?token=desktop-launch-token`
    const executable = join(desktopRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
    const fakeDevice = process.env.ZEROWALL_MIC_REAL_DEVICE_TEST !== '1'
    const records = await runElectron(executable, mainPath, authenticatedUrl, join(scratch, 'user-data'), fakeDevice)
    const outcome = records.find(record => record.kind === 'outcome')!
    const checks = records.filter(record => record.kind === 'check' && record.permission === 'media')
    const requests = records.filter(record => record.kind === 'request' && record.permission === 'media')
    console.info(`Windows microphone permission probe (${fakeDevice ? 'fake' : 'real'} device):`, JSON.stringify({ outcome, checks, requests }))
    expect(outcome.secureContext).toBe(true)
    expect(outcome.mediaDevices).toBe(true)
    if (outcome.systemStatus === 'denied' || outcome.systemStatus === 'restricted') {
      expect((outcome.direct as { ok: boolean }).ok).toBe(false)
      expect((outcome.button as { phase: string }).phase).toBe('failed')
    } else {
      expect(checks.some(record => record.allowed === true)).toBe(true)
      expect(requests.some(record => record.allowed === true)).toBe(true)
      if (fakeDevice || (outcome.direct as { name?: string }).name !== 'NotFoundError') {
        expect((outcome.direct as { ok: boolean }).ok).toBe(true)
        expect((outcome.button as { phase: string }).phase).toBe('recording')
      }
    }
  } finally {
    await new Promise<void>(resolveClose => server.close(() => resolveClose()))
    rmSync(target, { recursive: true, force: true })
  }
})
