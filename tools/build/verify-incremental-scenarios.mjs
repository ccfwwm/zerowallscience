import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { root, verificationRoot, releaseRoot } from './paths.mjs'
import { sharedSourceInputs } from './component-inputs.mjs'
import { fileDigest } from '../commands/resource-catalog.mjs'

// Run after other build processes finish. Probes change source comments and
// execute the real task graph; published resources are never changed.
const output = join(verificationRoot, 'incremental-' + Date.now())
await mkdir(output, { recursive: true })
const graph = join(root, 'tools/build/build-graph.mjs')
const report = { output, cases: [], probes: 'temporary source comments, real compiler executions and restored original bytes' }
const sources = ['desktop/src/main/index.ts', 'plugins/pubmed/src/host/index.ts', 'plugins/base/src/shared/client-helpers.ts']
const originals = new Map(await Promise.all(sources.map(async path => [path, await readFile(join(root, path))])))
const packages = JSON.parse(await readFile(join(releaseRoot, 'plugin-packages.json')))
const packageHashes = await Promise.all(packages.map(async record => [record.id, await fileDigest(record.path)]))

function run(name, args, expected) {
  const started = Date.now()
  const result = spawnSync(process.execPath, [graph, ...args], { cwd: root, env: process.env, windowsHide: true, encoding: 'utf8', maxBuffer: 20 * 1024 ** 2 })
  const text = result.stdout + result.stderr
  writeFile(join(output, name + '.log'), text)
  assert.equal(result.status, 0, name + ': task graph failed; see ' + output)
  const rebuilt = [...text.matchAll(/^REBUILD ([^:]+(?::[^: ]+)?):/gmu)].map(match => match[1]).sort()
  if (expected) assert.deepEqual(rebuilt, [...expected].sort(), name + ': wrong affected task set')
  report.cases.push({ name, durationMs: Date.now() - started, rebuilt, cacheHits: [...text.matchAll(/^CACHE HIT /gmu)].length })
}
async function probe(name, path, expected) {
  await writeFile(join(root, path), Buffer.concat([originals.get(path), Buffer.from('\n// Incremental build verification: ' + name + '\n')]))
  try { run(name, ['build:changed'], expected) }
  finally {
    await writeFile(join(root, path), originals.get(path))
    // Restore the original compiled resource bytes from authenticated history.
    for (const task of expected) {
      if (task === 'desktop') run(name + '-restore-desktop', ['desktop'], ['desktop'])
      else {
        const [kind, id] = task.split(':')
        run(name + '-restore-' + id, [kind === 'plugin-build' ? 'plugin:build' : 'package:build', id, '--bootstrap-published'])
      }
    }
  }
}
try {
  run('synchronize', ['build:changed'])
  run('no-change', ['build:changed'], [])
  await probe('desktop-only', sources[0], ['desktop'])
  await probe('one-plugin', sources[1], ['plugin-build:pubmed'])
  const users = ['plugin-build:base']
  for (const entry of await readdir(join(root, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory() || ['base', 'wechat'].includes(entry.name)) continue
    if ((await sharedSourceInputs(root, join(root, 'plugins', entry.name))).includes(sources[2])) users.push('plugin-build:' + entry.name)
  }
  await probe('shared-helper', sources[2], users)
  run('final-no-change', ['build:changed'], [])
  const after = await Promise.all(packages.map(async record => [record.id, await fileDigest(record.path)]))
  assert.deepEqual(after, packageHashes)
  report.unchangedPackages = packageHashes.length
  report.passed = true
} finally {
  for (const [path, bytes] of originals) await writeFile(join(root, path), bytes)
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
}
console.log(JSON.stringify(report, null, 2))
