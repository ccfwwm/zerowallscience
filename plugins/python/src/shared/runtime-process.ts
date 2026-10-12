import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { configuredPythonRuntimeRoot } from './runtime-path.js'

/** Synchronous spawn-compatible boundary for existing scientific job runners.
 * Acquiring and checking the lease twice closes the writer/reader race. */
export const spawnWithRuntimeLease: typeof spawn = ((command: string, ...args: any[]): ChildProcess => {
  const runtime = configuredPythonRuntimeRoot()
  const isPython = /^python(?:3(?:\.\d+)?)?(?:\.exe)?$/iu.test(basename(command))
  if (!isPython) return (spawn as any)(command, ...args)
  if (!runtime || resolve(command).toLowerCase() !== resolve(runtime, 'python.exe').toLowerCase()) throw new Error('PYTHON_RUNTIME_MISMATCH: scientific jobs require the fixed application interpreter.')
  const manager = join(runtime, '.zerowall'); const writer = join(manager, 'write-lock.json')
  if (existsSync(writer)) throw new Error('PYTHON_RUNTIME_UPDATING: wait for the current Python update.')
  const directory = join(manager, 'leases'); mkdirSync(directory, { recursive: true })
  const lease = join(directory, `${process.pid}-${randomUUID()}.json`)
  writeFileSync(lease, JSON.stringify({ pid: process.pid, kind: 'research-runner', snapshot: runtime, createdAt: new Date().toISOString() }), { flag: 'wx' })
  const release = () => rmSync(lease, { force: true })
  if (existsSync(writer)) { release(); throw new Error('PYTHON_RUNTIME_UPDATING: wait for the current Python update.') }
  try {
    const child = (spawn as any)(command, ...args) as ChildProcess
    child.once('close', release); child.once('error', release)
    return child
  } catch (error) { release(); throw error }
}) as typeof spawn
