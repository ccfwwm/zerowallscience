import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Test-only preloader: deny outbound Host traffic and package installation. */
export async function prepareOfflineNetworkProbe(root) {
  const receipt = resolve(root, 'offline-network.json')
  const path = resolve(root, 'offline-network-preload.mjs')
  const source = `
import fs from 'node:fs';
import net from 'node:net';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const receipt = ${JSON.stringify(receipt)};
const counters = { isolated: true, outboundBlocked: 0, packageInstallsAttempted: 0 };
const save = () => fs.writeFileSync(receipt, JSON.stringify(counters));
save();
const allowed = host => !host || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase());
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  const host = first !== null && typeof first === 'object' ? first.host : typeof first === 'number' || typeof first === 'string' && /^\\d+$/.test(first) ? normalized[1] : undefined;
  if (typeof host === 'string' && !allowed(host)) {
    counters.outboundBlocked++; save(); throw new Error('Offline verification denies outbound sockets');
  }
  return connect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args) => {
  const url = new URL(typeof args[0] === 'object' && 'url' in args[0] ? args[0].url : args[0]);
  if (!allowed(url.hostname)) { counters.outboundBlocked++; save(); return Promise.reject(new Error('Offline verification denies outbound fetch')); }
  return originalFetch(...args);
};
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync']) {
  const original = childProcess[method];
  childProcess[method] = function(command, ...args) {
    const text = [command, ...(Array.isArray(args[0]) ? args[0] : [])].join(' ');
    if (/(?:^|[\\\\/\\s])(?:npm|pnpm|npx)(?:\\.cmd|\\.exe|\\.cjs|\\.js)?(?:\\s|$)/i.test(text)) {
      counters.packageInstallsAttempted++; save(); throw new Error('Offline verification denies package manager execution');
    }
    return original.call(this, command, ...args);
  };
}
syncBuiltinESMExports();
`
  await writeFile(path, source)
  return { path, receipt }
}

/** Prove the guard works in the same Node runtime before using its evidence. */
export async function verifyOfflineNetworkProbe(probe, { executablePath = process.execPath, env = process.env } = {}) {
  const source = `
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import childProcess from 'node:child_process';
await assert.rejects(fetch('https://offline-probe.invalid/'), /denies outbound fetch/);
for (const port of [443, '443']) {
  const socket = new net.Socket();
  assert.throws(() => socket.connect(port, '192.0.2.1'), /denies outbound sockets/);
  socket.destroy();
}
assert.throws(() => childProcess.spawnSync('npm', ['--version']), /denies package manager/);
const server = http.createServer((_request, response) => response.end('loopback works'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const response = await fetch('http://127.0.0.1:' + server.address().port);
  assert.equal(await response.text(), 'loopback works');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
`
  const result = spawnSync(executablePath, ['--import', pathToFileURL(probe.path).href, '--input-type=module', '--eval', source], {
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 15_000, windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Offline network guard self-test failed: ${result.stderr}`)
  const evidence = JSON.parse(await readFile(probe.receipt, 'utf8'))
  if (evidence.outboundBlocked !== 3 || evidence.packageInstallsAttempted !== 1) throw new Error('Offline guard did not intercept all self-test attempts')
  return { outboundDenied: true, packageManagerDenied: true, loopbackVerified: true }
}
