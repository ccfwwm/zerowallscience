import { targetPackageRoot, verificationRoot } from '../build/paths.mjs'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const unpacked = resolve(targetPackageRoot, 'win-unpacked')
const executable = resolve(unpacked, 'ZeroWallScience.exe')
const worker = resolve(unpacked, 'resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs')
const nodePath = resolve(unpacked, 'resources/app.asar/node_modules')
const dialogBindings = resolve(root, 'deepseek-harness/packages/host/directory-picker-native/lib/types/win32-dialog-bindings.js')
const timeoutMs = Number(process.env.PICKER_TEST_TIMEOUT_MS ?? 120_000)
const selectIndex = process.argv.indexOf('--select')
const selection = selectIndex < 0 ? undefined : resolve(process.argv[selectIndex + 1] ?? '')
if (selectIndex >= 0 && !process.argv[selectIndex + 1]) throw new Error('--select requires an explicit directory')
if (selection) await mkdir(selection, { recursive: true })

const child = spawn(executable, [worker], {
  windowsHide: false,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: nodePath, DSH_DIALOG_TITLE: 'ZeroWall Science 目录选择测试' },
})
let finished = false
let terminalReceived = false
const closeTimers = []
let selector
const timer = setTimeout(() => finish(2, `directory picker timed out after ${timeoutMs}ms`), timeoutMs)
function finish(code, message) {
  if (finished) return
  finished = true
  clearTimeout(timer)
  for (const closeTimer of closeTimers) clearTimeout(closeTimer)
  if (selector && selector.exitCode === null) selector.kill()
  if (message) console.error(message)
  if (!child.killed) child.kill()
  process.exitCode = code
}
child.stdout.on('data', data => process.stdout.write(`OUT ${data}`))
child.stderr.on('data', data => process.stderr.write(`ERR ${data}`))
child.on('error', error => finish(1, error.stack ?? String(error)))
child.on('message', message => {
  console.log('MSG', message)
  if (message?.kind === 'showing' && Number.isInteger(message.threadId)) {
    if (selection) {
      // Target only this regression worker's native dialog, never another app.
      selector = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(import.meta.dirname, 'select-test-directory.ps1'), '-PickerProcessId', String(child.pid), '-Directory', selection], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      selector.stderr.on('data', data => process.stderr.write(data))
      selector.stdout.on('data', data => process.stdout.write(data))
      selector.once('error', error => finish(1, String(error)))
      selector.once('exit', code => { if (code && !finished) finish(1, `Test dialog selection failed (${code})`) })
      return
    }
    // Close the test dialog through the same thread-window cancellation path
    // used by the production picker. This keeps the packaged smoke unattended
    // and verifies that the worker reports a terminal `done` message.
    void import(pathToFileURL(dialogBindings).href)
      .then(module => {
        // `showing` is emitted immediately before COM's Show call, so allow
        // the native window to materialize before closing it. Koffi callback
        // prototypes are process-global, so this cancellation is invoked once.
        for (const delay of [750]) {
          closeTimers.push(setTimeout(() => {
            if (!finished) void module.closeThreadWindows(message.threadId)
              .catch(error => finish(1, error instanceof Error ? error.stack : String(error)))
          }, delay))
        }
      })
      .catch(error => finish(1, error instanceof Error ? error.stack : String(error)))
  }
  if (message?.kind === 'done') {
    terminalReceived = true
    try {
      if (selection) assert.equal(resolve(message.path ?? ''), selection, 'Native dialog must return the selected Unicode path')
      void mkdir(verificationRoot, { recursive: true }).then(() => writeFile(resolve(verificationRoot, selection ? 'directory-picker-selection.json' : 'directory-picker-cancel.json'), JSON.stringify({ selected: selection !== undefined, path: message.path, returnedTerminalResult: true }, null, 2))).then(() => finish(0), error => finish(1, String(error)))
    } catch (error) { finish(1, String(error)) }
  }
  if (message?.kind === 'error') finish(1, message.message ?? 'directory picker worker failed')
})
child.on('exit', (code, signal) => {
  console.log('EXIT', code, signal)
  if (!finished && !terminalReceived) finish(1, `worker exited before returning a result (${signal ?? code})`)
})
