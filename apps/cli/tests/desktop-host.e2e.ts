/** Built Desktop Host credential receipt and shutdown before profile startup settles. */

import { fork } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { finished } from 'node:stream/promises'
import { expect, it, onTestFinished } from 'vitest'

interface BootMessage {
  packageManager: { command: string; args: string[]; env: Record<string, string> }
  python: { executable: string; sitePackages: string; dependenciesRoot: string; wheelhouse: string; bytes: string }
}

const hostCases = [
  { event: 'disconnect', phase: 'credentials', fail: false },
  { event: 'shutdown', phase: 'credentials', fail: false },
  { event: 'invalid-credential', phase: 'credentials', fail: true },
  { event: 'disconnect', phase: 'startup', fail: false },
  { event: 'disconnect', phase: 'startup', fail: true },
  { event: 'shutdown', phase: 'startup', fail: false },
  { event: 'shutdown', phase: 'startup', fail: true },
].map(fixture => ({ ...fixture, brokenRuntime: false }))

it.each([
  ...hostCases,
  { event: 'disconnect', phase: 'startup', fail: true, brokenRuntime: true },
])('settles $event during $phase (failure: $fail, runtime missing: $brokenRuntime)', async ({
  event, phase, fail, brokenRuntime,
}) => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-disconnect-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const home = join(root, '便携版 数据')
  const primarySource = join(root, '安装 资源', 'primary-runtime')
  const digest = 'a'.repeat(64)
  const installed = join(home, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python')
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
  const wheelhouse = join(root, 'operator-wheels')
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
    import { writeFileSync } from 'node:fs';
    export class StartupError extends Error {}
    export const loadProfileDirectory = () => {
      writeFileSync(${JSON.stringify(join(root, 'profile-loaded'))}, 'loaded');
      return { skippedBundles: [] };
    };
    export const reportSkippedBundles = () => {};
    export const loadLayeredEnv = () => ({});
    export const readBusinessUpdateState = () => undefined;
    export const businessGenerationDependencies = () => ({});
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
      return new Promise((resolve, reject) => {
        const settle = () => {
          process.off('disconnect', settle);
          process.off('message', onMessage);
          if (${String(fail)}) { reject(new Error('fixture boot failure')); return; }
          resolve({ ctx: { plugin: async () => {}, effect: () => {}, on: () => {}, inject: () => {},
            connection: { authenticatedUrl: value => value }, webServer: { port: 19387 } },
            shutdown: { shutdown: async () => writeFileSync(${JSON.stringify(join(root, 'stopped'))}, 'stopped') } });
        };
        const onMessage = message => { if (message.type === 'shutdown') settle(); };
        process.once('disconnect', settle);
        process.on('message', onMessage);
      });
    }
  `)
  const entry = join(root, 'index.js')
  copyFileSync(join(hostDirectory, 'lib', 'index.js'), entry)
  const pnpm = join(root, 'bundled-pnpm.mjs')
  const nodeBin = join(root, 'bin')
  const bundledNode = join(primarySource, 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  mkdirSync(dirname(bundledNode), { recursive: true })
  writeFileSync(bundledNode, 'offline Node carrier')
  writeFileSync(pnpm, '')
  const child = fork(entry, [root, root, primarySource, pnpm, nodeBin], {
    execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { ...process.env, DSH_HOME: home, DSH_PYTHON_EXECUTABLE: 'stale-interpreter',
      DSH_PYTHON_SITE_PACKAGES: 'stale-packages', ZEROWALL_PYTHON_DEPENDENCIES_ROOT: undefined,
      ZEROWALL_PYTHON_WHEELHOUSE: wheelhouse },
  })
  const messages: unknown[] = []
  child.on('message', message => messages.push(message))
  let stderr = ''
  child.stderr!.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
  const exited = new Promise<number | null>(resolve => child.once('exit', resolve))
  const unexpectedBoot = Promise.withResolvers<never>()
  const failedStartup = Promise.race([exited, unexpectedBoot.promise])
  child.on('message', (message) => {
    if (!brokenRuntime || typeof message !== 'object' || message === null || !('type' in message)) return
    if (message.type === 'starting') child.send({ type: 'desktop-auth', secret: randomBytes(32).toString('base64url') }, (error) => {
      if (error !== null) unexpectedBoot.reject(error)
    })
    if (message.type === 'booting') unexpectedBoot.reject(new Error('Host loaded the profile before rejecting invalid Python resources.'))
  })
  const drained = finished(child.stderr!, { cleanup: true })
  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await Promise.all([exited, drained])
  })
  try {
    if (brokenRuntime) {
      const exitCode = await failedStartup
      await drained
      expect(child.signalCode).toBeNull()
      expect(exitCode, stderr).toBe(1)
      const fatal = messages.find((message): message is { type: 'fatal'; message: string } => typeof message === 'object'
        && message !== null && 'type' in message && message.type === 'fatal' && 'message' in message && typeof message.message === 'string')
      const missing = 'expected file'
      expect(fatal?.message).toContain(missing)
      expect(messages).not.toContainEqual(expect.objectContaining({ type: 'booting' }))
      expect(stderr).toContain(missing)
      return
    }
    const boot = await new Promise<BootMessage | undefined>((resolve, reject) => {
      child.on('message', (message) => {
        if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'starting') {
          if (phase === 'credentials') { resolve(undefined); return }
          child.send({ type: 'desktop-auth', secret: randomBytes(32).toString('base64url') }, (error) => {
            if (error !== null) reject(error)
          })
        }
        if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'booting'
          && 'packageManager' in message && 'python' in message) {
          resolve(message as BootMessage)
        }
      })
      child.once('error', reject)
      child.once('exit', (code) => { reject(new Error(`Host exited before ${phase}: ${String(code)} ${stderr}`)) })
    })
    if (phase === 'startup') {
      expect(boot?.packageManager.command).toBe(process.execPath)
      expect(boot?.packageManager.args).toEqual(['--expose-internals', pnpm])
      expect(boot?.packageManager.env.ELECTRON_RUN_AS_NODE).toBe('1')
      expect(boot?.packageManager.env.PATH).toBe(`${nodeBin}${delimiter}${process.env.PATH ?? ''}`)
      expect(boot?.python).toEqual({
        executable: join(installed, ...pythonSuffix), sitePackages: join(installed, ...packagesSuffix),
        dependenciesRoot: join(home, 'python'), bytes: 'offline Python carrier', wheelhouse,
      })
    }
    if (event === 'disconnect') child.disconnect()
    else await new Promise<void>((resolve, reject) => {
      child.send(event === 'shutdown' ? { type: 'shutdown' } : { type: 'desktop-auth', secret: 'bad-secret' }, (error) => {
        if (error === null) resolve()
        else reject(error)
      })
    })
    const exitCode = await exited
    await drained
    expect(child.signalCode).toBeNull()
    expect(exitCode, stderr).toBe(fail ? 1 : 0)
    expect(stderr).not.toContain('ERR_IPC_CHANNEL_CLOSED')
    expect(stderr).not.toContain('Unhandled')
    expect(messages).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'ready' })]))
    if (event === 'shutdown' && !fail) {
      expect(messages.filter(message => typeof message === 'object' && message !== null && 'type' in message
        && message.type === 'shutdown-complete')).toHaveLength(1)
    }
    if (fail) {
      expect(stderr).toContain(event === 'invalid-credential' ? 'Desktop authentication message is invalid' : 'fixture boot failure')
    } else {
      expect(stderr).toBe('')
      expect(messages).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'fatal' })]))
    }
    if (phase === 'credentials') {
      expect(existsSync(join(root, 'profile-loaded'))).toBe(false)
      expect(existsSync(join(root, 'stopped'))).toBe(false)
      expect(messages).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'booting' })]))
    } else if (!fail) expect(readFileSync(join(root, 'stopped'), 'utf8')).toBe('stopped')
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await Promise.all([exited, drained])
  }
})
