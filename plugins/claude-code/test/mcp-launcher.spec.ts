import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeClaudeMcpLaunchers } from '../src/host/mcp-launcher.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function root() {
  const directory = await mkdtemp(join(tmpdir(), 'claude-mcp-launcher-'))
  roots.push(directory)
  return directory
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string; pid: number }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.setEncoding('utf8').on('data', data => { stdout += data })
    child.stderr.setEncoding('utf8').on('data', data => { stderr += data })
    child.once('error', reject)
    child.once('close', code => resolveRun({ code: code ?? -1, stdout, stderr, pid: child.pid ?? -1 }))
    child.stdin.end('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n')
  })
}

describe('Claude MCP directory relay', () => {
  it.each([false, true])('isolates credentials and preserves protocol pipes when a separate cwd is %s', async separateCwd => {
    const projectionRoot = await root()
    const serviceCwd = separateCwd ? join(projectionRoot, 'service cwd') : projectionRoot
    if (separateCwd) await mkdir(serviceCwd)
    const service = join(serviceCwd, 'mcp service.cjs')
    await writeFile(service, [
      "const fs = require('node:fs')",
      "const path = require('node:path')",
      "process.stdin.setEncoding('utf8')",
      "let data = ''",
      "process.stdin.on('data', chunk => data += chunk)",
      "process.stdin.on('end', () => { const request = JSON.parse(data); process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { cwd: process.cwd(), args: process.argv.slice(2), token: process.env.API_TOKEN, ownReference: process.env.ZW_CLAUDE_MCP_0123456789ABCDEF0123, route: process.env.ANTHROPIC_API_KEY, routeToken: process.env.ANTHROPIC_AUTH_TOKEN, claude: process.env.CLAUDE_CONFIG_DIR, dsh: process.env.DSH_CREDENTIAL, otherMcp: process.env.ZW_CLAUDE_MCP_OTHER, unrelatedMcp: process.env.OTHER_MCP_TOKEN } }) + '\\n') })",
    ].join('\n'))
    const sensitiveSentinel = 'never-write-this-secret'
    const args = [service, 'space value', 'semi;colon', 'quote"value']
    const config = {
      servers: [{ serverName: 'different', type: 'stdio' as const, command: process.execPath,
        args: [], env: { API_TOKEN: '${ZW_CLAUDE_MCP_0123456789ABCDEF0123}' }, launcher: {
          cwd: serviceCwd, command: 'node', args, useBundledNode: true,
        } }],
      environment: { ZW_CLAUDE_MCP_0123456789ABCDEF0123: sensitiveSentinel }, skipped: [],
    }
    const { servers: [server] } = await writeClaudeMcpLaunchers(config, { root: projectionRoot, executable: process.execPath, electron: true })
    expect(server?.type).toBe('stdio')
    if (server?.type !== 'stdio') throw new Error('expected stdio projection')
    expect(server.command).toBe(process.execPath)
    expect(server.env?.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(server.args[0]).toContain('mcp-launchers')
    const persisted = await readFile(join(projectionRoot, 'mcp-launchers', 'launch.cjs'), 'utf8')
    const descriptor = await readFile(server.args[1]!, 'utf8')
    expect(persisted + descriptor + JSON.stringify(server)).not.toContain(sensitiveSentinel)
    expect(JSON.parse(descriptor)).toEqual({ command: process.execPath, args, cwd: serviceCwd,
      env: { API_TOKEN: 'ZW_CLAUDE_MCP_0123456789ABCDEF0123' }, electron: true })

    const result = await run(server.command, server.args, projectionRoot, { ...process.env, ...server.env,
      API_TOKEN: sensitiveSentinel, ZW_CLAUDE_MCP_0123456789ABCDEF0123: sensitiveSentinel,
      ZW_CLAUDE_MCP_OTHER: 'another-private-secret', ANTHROPIC_API_KEY: 'route-private-secret',
      ANTHROPIC_AUTH_TOKEN: 'route-token-private', CLAUDE_CONFIG_DIR: 'private-route-config', DSH_CREDENTIAL: 'private-host-secret',
      OTHER_MCP_TOKEN: 'unrelated-mcp-private-secret' })
    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({ jsonrpc: '2.0', id: 1, result: {
      cwd: serviceCwd, args: args.slice(1), token: sensitiveSentinel, ownReference: undefined,
      route: undefined, routeToken: undefined, claude: undefined, dsh: undefined, otherMcp: undefined, unrelatedMcp: undefined,
    } })
  })

  it('resolves bare native commands only through absolute PATH entries and reports unsupported launches', async () => {
    const projectionRoot = await root()
    const config = { servers: [
      { serverName: 'native', type: 'stdio' as const, command: basename(process.execPath), args: [], launcher: {
        cwd: projectionRoot, command: basename(process.execPath), args: ['--version'], useBundledNode: false, resolveFromPath: true,
      } },
      { serverName: 'missing', type: 'stdio' as const, command: 'not-on-path', args: [], launcher: {
        cwd: projectionRoot, command: 'not-on-path', args: [], useBundledNode: false, resolveFromPath: true,
      } },
      { serverName: 'unwrapped', type: 'stdio' as const, command: process.execPath, args: [] },
      { serverName: 'http', type: 'http' as const, url: 'https://mcp.example.test/' },
    ], environment: {}, skipped: [] }
    const projected = await writeClaudeMcpLaunchers(config, { root: projectionRoot, executable: process.execPath,
      electron: false, searchPath: ['relative-ignored', dirname(process.execPath)].join(delimiter) })
    expect(projected.servers.map(server => server.serverName)).toEqual(['native', 'http'])
    expect(projected.skipped).toEqual([
      { serverName: 'missing', reason: 'unsupported-launch' },
      { serverName: 'unwrapped', reason: 'unsupported-launch' },
    ])
    const native = projected.servers[0]!
    if (native.type !== 'stdio') throw new Error('expected stdio projection')
    const descriptor = JSON.parse(await readFile(native.args[1]!, 'utf8'))
    expect(descriptor.command).toBe(await realpath(process.execPath))
    expect(descriptor.electron).toBe(false)
    expect(native).not.toHaveProperty('launcher')
    expect(native).not.toHaveProperty('cwd')
    const result = await run(native.command, native.args, projectionRoot, process.env)
    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe(process.version)
    const relativeOnly = await writeClaudeMcpLaunchers(config, { root: projectionRoot, executable: process.execPath,
      electron: false, searchPath: 'relative-ignored' })
    expect(relativeOnly.servers.map(server => server.serverName)).toEqual(['http'])
  })

  it('reports startup errors safely and terminates a persistent child when Claude closes its input', async () => {
    const projectionRoot = await root()
    const working = join(projectionRoot, 'mcp working')
    await mkdir(working)
    const pidFile = join(projectionRoot, 'child.pid')
    const service = join(working, 'wait.cjs')
    await writeFile(service, `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.stdin.resume(); setInterval(() => {}, 1000)`)
    const config = { servers: [{ serverName: 'wait', type: 'stdio' as const, command: process.execPath,
      args: [], launcher: { cwd: working, command: 'node', args: [service], useBundledNode: true } }], environment: {}, skipped: [] }
    const { servers: [projected] } = await writeClaudeMcpLaunchers(config, { root: projectionRoot, executable: process.execPath, electron: false })
    if (projected?.type !== 'stdio') throw new Error('expected stdio projection')

    const missing = join(projectionRoot, 'does-not-exist.exe')
    const badConfig = { servers: [{ serverName: 'bad', type: 'stdio' as const, command: process.execPath, args: [],
      launcher: { cwd: working, command: missing, args: [], useBundledNode: false } }], environment: {}, skipped: [] }
    const { servers: [bad] } = await writeClaudeMcpLaunchers(badConfig, { root: projectionRoot, executable: process.execPath, electron: false })
    if (bad?.type !== 'stdio') throw new Error('expected stdio projection')
    const failed = await run(bad.command, bad.args, projectionRoot, process.env)
    expect(failed.code).not.toBe(0)
    expect(failed.stderr).toContain('ZeroWall MCP process could not start.')
    expect(failed.stderr).not.toContain(missing)

    const relay = spawn(projected.command, projected.args, { cwd: projectionRoot, env: process.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    await viWaitFor(() => readFile(pidFile, 'utf8'))
    const childPid = Number(await readFile(pidFile, 'utf8'))
    relay.stdin.end()
    await new Promise<void>((resolveExit, reject) => {
      const timer = setTimeout(() => reject(new Error('relay did not exit')), 5000)
      relay.once('close', () => { clearTimeout(timer); resolveExit() })
    })
    expect(() => process.kill(childPid, 0)).toThrow()
  })
})

async function viWaitFor<T>(read: () => Promise<T>): Promise<T> {
  const expires = Date.now() + 5000
  while (Date.now() < expires) {
    try { return await read() } catch { await new Promise(resolveWait => setTimeout(resolveWait, 20)) }
  }
  throw new Error('timed out waiting for MCP child process')
}
