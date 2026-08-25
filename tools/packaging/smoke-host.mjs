import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

// Keep the public smoke:host command aligned with the packaged-runtime gate.
// That gate starts the packaged DSH Host, probes the loopback web surface,
// checks plugin inventory/WebSockets/session persistence, and then tears it
// down. This wrapper intentionally adds no second Host implementation.
const script = resolve(import.meta.dirname, '../../desktop/scripts/verify-packaged-runtime.mjs')
const child = spawn(process.execPath, [script], { stdio: 'inherit', windowsHide: true })
child.once('error', error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  if (signal !== null) {
    console.error(`Packaged Host smoke terminated by ${signal}.`)
    process.exitCode = 1
  } else {
    process.exitCode = code ?? 1
  }
})
