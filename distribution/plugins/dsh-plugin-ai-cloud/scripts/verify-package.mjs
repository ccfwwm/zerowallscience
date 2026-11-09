import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Exercise npm's published file selection and both exports from a separate consumer.
const root = resolve(import.meta.dirname, '..')
const npm = process.env.npm_execpath
assert(npm, 'Run this check through npm run test:package.')
const pack = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--json'], { cwd: root, encoding: 'utf8' }))[0]
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
for (const entry of ['.', './client', './types', './typert', './remote']) {
  const declaration = manifest.exports[entry].types.replace(/^\.\//, '')
  assert(pack.files.some(file => file.path === declaration), `Missing declaration: ${declaration}`)
}
const consumer = await mkdtemp(join(tmpdir(), 'zerowall-package-consumer-'))
try {
  // The consumer supplies the same DSH/Cordis host versions as the tested release.
  const hostDependencies = Object.fromEntries(Object.keys(manifest.peerDependencies).map(name => [name, manifest.devDependencies[name]]))
  const client = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-ui-plugin-manager/package.json'))
  const manager = createRequire(client.resolve('@deepseek-ai/dsh-plugin-manager/package.json'))
  const boot = createRequire(manager.resolve('@deepseek-ai/dsh-app-boot/package.json'))
  for (const name of ['@deepseek-ai/cordis-plugin-include', '@deepseek-ai/cordis-plugin-loader']) {
    const packagePath = boot.resolve(name + '/package.json')
    hostDependencies[name] = JSON.parse(await readFile(packagePath, 'utf8')).version
  }
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: hostDependencies }))
  execFileSync(process.execPath, [npm, 'install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund', join(root, pack.filename)], { cwd: consumer, stdio: 'inherit' })
  assert(createRequire(join(consumer, 'package.json')).resolve(manifest.name + '/package.json'), 'Host client discovery needs the public manifest export')
  const icon = await readFile(join(root, 'src/account/client/assets/zerowall-science-icon.png'), 'base64')
  const installed = createRequire(join(consumer, 'package.json'))
  assert.equal(await readFile(installed.resolve(manifest.name + '/icon'), 'base64'), icon, 'The installed plugin must provide its own artwork')
  assert((await readFile(installed.resolve(manifest.name + '/client'), 'utf8')).includes(`data:image/png;base64,${icon}`), 'Account and sidebar icons must be bundled with the installed plugin')
  await writeFile(join(consumer, 'consumer.ts'), `import type { apply } from '${manifest.name}';\nimport type { apply as clientApply } from '${manifest.name}/client';\nexport type HostPlugin = typeof apply;\nexport type ClientPlugin = typeof clientApply;\n`)
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--target', 'ES2023', join(consumer, 'consumer.ts')], { cwd: consumer, stdio: 'inherit' })
  execFileSync(process.execPath, ['--input-type=module', '-e', 'const plugin = await import(process.argv[1]); if (typeof plugin.apply !== "function") throw new Error("Missing host apply export");', manifest.name], { cwd: consumer, stdio: 'inherit' })
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { default: remote } = await import(process.argv[1] + '/remote');
    const login = remote.methods['zerowallAccount/login'].input({ strict: true }).create();
    assert.equal(login.safeParse({ input: { email: 123, password: 'test-only' } }).success, false);
    const image = remote.methods['zerowallImages/generate'].input({ strict: true }).create();
    assert.equal(image.safeParse({ input: { requestId: 'test-only', groupId: '1', profileId: 'image', modelId: 'image-test', operation: 'video', prompt: 'Test' } }).success, false);
    assert.equal(image.safeParse({ input: { requestId: 'test-only', groupId: '1', profileId: 'image', modelId: 'image-test', operation: 'image', prompt: 'Test' } }).success, true);
  `, manifest.name], { cwd: consumer, stdio: 'inherit' })
  console.log(`Verified packed consumer: ${manifest.name}@${manifest.version} (${pack.files.length} files)`)
} finally {
  await rm(consumer, { recursive: true, force: true })
}
