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
for (const entry of ['.', './client']) {
  const declaration = manifest.exports[entry].types.replace(/^\.\//, '')
  assert(pack.files.some(file => file.path === declaration), `Missing declaration: ${declaration}`)
}
const consumer = await mkdtemp(join(tmpdir(), 'zerowall-package-consumer-'))
try {
  const hostDependencies = Object.fromEntries(Object.keys(manifest.peerDependencies).map(name => [name, manifest.devDependencies[name]]))
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: hostDependencies }))
  execFileSync(process.execPath, [npm, 'install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund', join(root, pack.filename)], { cwd: consumer, stdio: 'inherit' })
  assert(createRequire(join(consumer, 'package.json')).resolve(manifest.name + '/package.json'), 'Host client discovery needs the public manifest export')
  await writeFile(join(consumer, 'consumer.ts'), `import type { apply } from '${manifest.name}';\nimport type { apply as clientApply } from '${manifest.name}/client';\nexport type HostPlugin = typeof apply;\nexport type ClientPlugin = typeof clientApply;\n`)
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--target', 'ES2023', join(consumer, 'consumer.ts')], { cwd: consumer, stdio: 'inherit' })
  execFileSync(process.execPath, ['--input-type=module', '-e', 'const plugin = await import(process.argv[1]); if (typeof plugin.apply !== "function") throw new Error("Missing host apply export");', manifest.name], { cwd: consumer, stdio: 'inherit' })
  console.log(`Verified packed consumer: ${manifest.name}@${manifest.version} (${pack.files.length} files)`)
} finally {
  await rm(consumer, { recursive: true, force: true })
}
