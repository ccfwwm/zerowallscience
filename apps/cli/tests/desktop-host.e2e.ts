/** Built Desktop Host prepares offline Python before profile startup and settles Electron disconnects. */

import { fork } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { finished } from 'node:stream/promises'
import { expect, it, onTestFinished } from 'vitest'
import { writePythonWheelhouseFixture } from '../../desktop-host/tests/fixtures/python-wheelhouse.ts'

it.each([
  { fail: false, brokenRuntime: false, brokenWheelhouse: false },
  { fail: true, brokenRuntime: false, brokenWheelhouse: false },
  { fail: false, brokenRuntime: true, brokenWheelhouse: false },
  { fail: false, brokenRuntime: false, brokenWheelhouse: true },
])('prepares Python before startup and settles disconnects ($fail, runtime: $brokenRuntime, wheels: $brokenWheelhouse)', async ({ fail, brokenRuntime, brokenWheelhouse }) => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-disconnect-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const home = join(root, '便携版 数据')
  const primarySource = join(root, '安装 资源', 'primary-runtime')
  const digest = 'a'.repeat(64)
  const installed = join(home, 'dsh-runtimes', 'primary', `0.2.2-rc.1.test-${digest}`, 'dependencies', 'python')
  const pythonSuffix = process.platform === 'win32' ? ['python.exe'] : ['bin', 'python3']
  const packagesSuffix = process.platform === 'win32' ? ['Lib', 'site-packages'] : ['lib', 'python3.12', 'site-packages']
  const sourcePython = join(primarySource, 'dependencies', 'python', ...pythonSuffix)
  mkdirSync(dirname(sourcePython), { recursive: true })
  mkdirSync(join(primarySource, 'dependencies', 'python', ...packagesSuffix), { recursive: true })
  if (!brokenRuntime) writeFileSync(sourcePython, 'offline Python carrier')
  writeFileSync(join(primarySource, 'runtime.json'), JSON.stringify({
    desktopVersion: '0.2.2-rc.1.test', platform: process.platform, arch: process.arch,
    payloadDigest: digest, python: '3.12.14', pythonPackages: {},
  }))
  const wheelhouse = writePythonWheelhouseFixture(join(dirname(primarySource), 'science-python-wheels'))
  if (brokenWheelhouse) {
    await rm(join(wheelhouse.wheels, wheelhouse.filename))
    expect(existsSync(join(wheelhouse.wheels, wheelhouse.filename))).toBe(false)
  }
  const modules = join(root, 'node_modules', '@deepseek-ai')
  const hostDirectory = fileURLToPath(new URL('../../desktop-host/', import.meta.url))
  const manifest = JSON.parse(readFileSync(join(hostDirectory, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  const stubbed = new Set(['@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh'])
  for (const name of Object.keys(manifest.dependencies)) {
    const destination = join(root, 'node_modules', name)
    mkdirSync(dirname(destination), { recursive: true })
    if (stubbed.has(name)) mkdirSync(destination)
    else symlinkSync(realpathSync(join(hostDirectory, 'node_modules', name)), destination, 'junction')
  }
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  writeFileSync(join(modules, 'dsh-app-boot', 'package.json'), '{"type":"module","exports":"./index.js"}')
  writeFileSync(join(modules, 'dsh-app-boot', 'index.js'), `
    export class StartupError extends Error {}
    export const loadProfileDirectory = () => ({ skippedBundles: [] });
    export const reportSkippedBundles = () => {};
    export const loadLayeredEnv = () => ({});
  `)
  writeFileSync(join(modules, 'dsh', 'package.json'), '{"type":"module","exports":{"./profile-boot":"./profile-boot.js"}}')
  writeFileSync(join(modules, 'dsh', 'profile-boot.js'), `
    import { readFileSync, writeFileSync } from 'node:fs';
    export function runProfile(options) {
      process.send({ type: 'booting', packageManager: options.packageManager, python: {
        executable: process.env.DSH_PYTHON_EXECUTABLE,
        sitePackages: process.env.DSH_PYTHON_SITE_PACKAGES,
        dependenciesRoot: process.env.ZEROWALL_PYTHON_DEPENDENCIES_ROOT,
        wheelhouse: process.env.ZEROWALL_PYTHON_WHEELHOUSE,
        bytes: readFileSync(process.env.DSH_PYTHON_EXECUTABLE, 'utf8'),
      } });
      return new Promise((resolve, reject) => process.once('disconnect', () => {
        if (${String(fail)}) { reject(new Error('fixture boot failure')); return; }
        resolve({ ctx: { plugin: async () => {}, effect: () => {}, on: () => {}, inject: () => {},
          connection: { authenticatedUrl: value => value }, webServer: { port: 19387 } },
          shutdown: { shutdown: async () => writeFileSync(${JSON.stringify(join(root, 'stopped'))}, 'stopped') } });
      }));
    }
  `)
  const entry = join(root, 'index.js')
  copyFileSync(join(hostDirectory, 'lib', 'index.js'), entry)
  const pnpm = join(root, 'bundled-pnpm.mjs')
  const nodeBin = join(root, 'bin')
  const child = fork(entry, [root, root, primarySource, pnpm, nodeBin], {
    execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { ...process.env, DSH_HOME: home, DSH_PYTHON_EXECUTABLE: 'stale-interpreter',
      DSH_PYTHON_SITE_PACKAGES: 'stale-packages', ZEROWALL_PYTHON_DEPENDENCIES_ROOT: undefined },
  })
  const messages: unknown[] = []
  child.on('message', message => messages.push(message))
  let stderr = ''
  child.stderr!.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
  const exited = new Promise<number | null>(resolve => child.once('exit', resolve))
  const unexpectedBoot = Promise.withResolvers<never>()
  const failedStartup = Promise.race([exited, unexpectedBoot.promise])
  child.on('message', (message) => {
    if ((brokenRuntime || brokenWheelhouse) && typeof message === 'object' && message !== null
      && 'type' in message && message.type === 'booting') unexpectedBoot.reject(new Error('Host loaded the profile before rejecting invalid Python resources.'))
  })
  const drained = finished(child.stderr!, { cleanup: true })
  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await Promise.all([exited, drained])
  })
  try {
    if (brokenRuntime || brokenWheelhouse) {
      const exitCode = await failedStartup
      await drained
      expect(child.signalCode).toBeNull()
      expect(exitCode, stderr).toBe(1)
      const fatal = messages.find((message): message is { type: 'fatal'; message: string } => typeof message === 'object'
        && message !== null && 'type' in message && message.type === 'fatal' && 'message' in message && typeof message.message === 'string')
      expect(fatal?.message).toContain('ENOENT')
      expect(messages).not.toContainEqual(expect.objectContaining({ type: 'booting' }))
      expect(stderr).toContain('ENOENT')
      return
    }
    const boot = await new Promise<{
      packageManager: { command: string; args: string[]; env: Record<string, string> }
      python: { executable: string; sitePackages: string; dependenciesRoot: string; wheelhouse: string; bytes: string }
    }>((resolve, reject) => {
      child.on('message', (message) => {
        if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'booting'
          && 'packageManager' in message && 'python' in message) {
          resolve(message as { packageManager: { command: string; args: string[]; env: Record<string, string> }
            python: { executable: string; sitePackages: string; dependenciesRoot: string; wheelhouse: string; bytes: string } })
        }
      })
      child.once('error', reject)
      child.once('exit', (code) => { reject(new Error(`Host exited before booting: ${String(code)} ${stderr}`)) })
    })
    expect(boot.packageManager.command).toBe(process.execPath)
    expect(boot.packageManager.args).toEqual(['--expose-internals', pnpm])
    expect(boot.packageManager.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(boot.packageManager.env.PATH).toBe(`${nodeBin}${delimiter}${process.env.PATH ?? ''}`)
    expect(boot.python).toEqual({
      executable: join(installed, ...pythonSuffix), sitePackages: join(installed, ...packagesSuffix),
      dependenciesRoot: join(home, 'zerowall', 'python'), bytes: 'offline Python carrier',
      wheelhouse: wheelhouse.wheels,
    })
    child.disconnect()
    const exitCode = await exited
    await drained
    expect(child.signalCode).toBeNull()
    expect(exitCode, stderr).toBe(fail ? 1 : 0)
    expect(stderr).not.toContain('ERR_IPC_CHANNEL_CLOSED')
    expect(stderr).not.toContain('Unhandled')
    if (fail) expect(stderr).toContain('fixture boot failure')
    else expect(readFileSync(join(root, 'stopped'), 'utf8')).toBe('stopped')
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await Promise.all([exited, drained])
  }
})
