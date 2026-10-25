import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, realpath, stat, writeFile } from 'node:fs/promises'
import { delimiter, extname, isAbsolute, join } from 'node:path'
import type { ClaudeMcpRuntimeProjection, McpSkipReason } from './projection.js'

/** A protocol-only relay. Launch data contains paths/arguments, never resolved env values. */
const launcherSource = `'use strict';
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { isAbsolute } = require('node:path');
let spec;
try {
  spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (!isAbsolute(spec.command) || !isAbsolute(spec.cwd) || !Array.isArray(spec.args)
    || spec.args.some(value => typeof value !== 'string' || value.includes('\\0'))
    || spec.env !== undefined && (typeof spec.env !== 'object' || Object.values(spec.env).some(value => typeof value !== 'string' || !/^ZW_CLAUDE_MCP_[A-F0-9]{20}$/.test(value)))) throw new Error();
} catch {
  process.stderr.write('ZeroWall MCP launch configuration is invalid.\\n');
  process.exit(1);
}
let child;
try {
  const childEnv = { ...process.env };
  const inherited = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'APPDATA', 'LOCALAPPDATA', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'NO_COLOR', 'FORCE_COLOR']);
  for (const key of Object.keys(childEnv)) if (!inherited.has(key.toUpperCase())) delete childEnv[key];
  delete childEnv.ELECTRON_RUN_AS_NODE;
  if (spec.electron === true) childEnv.ELECTRON_RUN_AS_NODE = '1';
  for (const [target, reference] of Object.entries(spec.env || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(target) || typeof process.env[reference] !== 'string') throw new Error();
    childEnv[target] = process.env[reference];
  }
  child = spawn(spec.command, spec.args, { cwd: spec.cwd, shell: false, windowsHide: true,
    env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
} catch {
  process.stderr.write('ZeroWall MCP process could not start.\\n');
  process.exit(1);
}
let stopping = false;
let eofTimer;
const stop = () => {
  if (stopping) return;
  stopping = true;
  process.stdin.unpipe(child.stdin);
  child.stdin.destroy();
  child.kill();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('SIGHUP', stop);
process.on('exit', () => { if (child.exitCode === null) child.kill(); });
process.stdin.on('error', stop);
process.stdout.on('error', stop);
process.stderr.on('error', stop);
child.stdin.on('error', stop);
process.stdin.pipe(child.stdin);
process.stdin.once('end', () => {
  // Give an orderly protocol shutdown a short window before stopping a server
  // that keeps running after Claude closes its input.
  eofTimer = setTimeout(stop, 1000);
  eofTimer.unref();
});
child.stdout.pipe(process.stdout, { end: false });
child.stderr.pipe(process.stderr, { end: false });
child.once('error', () => {
  process.stderr.write('ZeroWall MCP process could not start.\\n');
});
child.once('close', (code, signal) => {
  clearTimeout(eofTimer);
  process.stdin.unpipe(child.stdin);
  process.stdin.destroy();
  process.exitCode = Number.isInteger(code) ? code : signal ? 143 : 1;
});
`

export interface McpLauncherOptions {
  root: string
  /** The current Host's application-owned Node or Electron executable. */
  executable: string
  electron: boolean
  searchPath?: string
}

async function resolveNativeFromPath(command: string, searchPath: string | undefined): Promise<string | undefined> {
  if (!searchPath || /[\\/:]/u.test(command) || command !== command.trim()) return undefined
  const extensions = process.platform === 'win32'
    ? (extname(command) ? (/\.(?:exe|com)$/iu.test(command) ? [''] : []) : ['.exe', '.com'])
    : ['']
  for (const entry of searchPath.split(delimiter)) {
    const directory = entry.replace(/^"(.*)"$/u, '$1')
    if (!isAbsolute(directory)) continue
    for (const suffix of extensions) {
      try {
        const candidate = await realpath(join(directory, `${command}${suffix}`))
        if (!(await stat(candidate)).isFile()) continue
        if (process.platform !== 'win32') await access(candidate, constants.X_OK)
        return candidate
      } catch { /* Try the next application/user PATH entry without invoking a shell. */ }
    }
  }
  return undefined
}

/** Materialize only selected launchers under the turn-owned projection directory. */
export async function writeClaudeMcpLaunchers(
  projection: ClaudeMcpRuntimeProjection,
  options: McpLauncherOptions,
): Promise<{ servers: ClaudeMcpRuntimeProjection['servers']; skipped: Array<{ serverName: string; reason: McpSkipReason }> }> {
  if (!isAbsolute(options.root) || !isAbsolute(options.executable)
    || options.root.includes('\0') || options.executable.includes('\0')) throw new Error('Invalid MCP launcher runtime.')
  const root = join(options.root, 'mcp-launchers')
  const wrapped = projection.servers.some(server => server.type === 'stdio' && server.launcher)
  if (wrapped) {
    await mkdir(root, { recursive: true, mode: 0o700 })
    await writeFile(join(root, 'launch.cjs'), launcherSource, { mode: 0o600 })
  }
  const servers: ClaudeMcpRuntimeProjection['servers'] = []
  const skipped: Array<{ serverName: string; reason: McpSkipReason }> = []
  for (const server of projection.servers) {
    if (server.type !== 'stdio') { servers.push(server); continue }
    const { launcher } = server
    if (!launcher) { skipped.push({ serverName: server.serverName, reason: 'unsupported-launch' }); continue }
    const command = launcher.useBundledNode ? options.executable : launcher.resolveFromPath
      ? await resolveNativeFromPath(launcher.command, options.searchPath)
      : launcher.command
    if (!command) { skipped.push({ serverName: server.serverName, reason: 'unsupported-launch' }); continue }
    const specPath = join(root, `${createHash('sha256').update(server.serverName).digest('hex')}.json`)
    const env = Object.fromEntries(Object.entries(server.env ?? {}).map(([target, placeholder]) => {
      const match = /^\$\{(ZW_CLAUDE_MCP_[A-F0-9]{20})\}$/u.exec(placeholder)
      if (!match) throw new Error('Claude MCP launcher credential placeholder is invalid.')
      return [target, match[1]]
    }))
    await writeFile(specPath, JSON.stringify({
      command,
      args: launcher.args,
      cwd: launcher.cwd,
      env,
      electron: Boolean(options.electron && launcher.useBundledNode),
    }), { mode: 0o600 })
    servers.push({
      serverName: server.serverName,
      type: 'stdio' as const,
      command: options.executable,
      args: [join(root, 'launch.cjs'), specPath],
      ...(server.env || options.electron
        ? { env: { ...server.env, ...(options.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) } }
        : {}),
    })
  }
  return { servers, skipped }
}
