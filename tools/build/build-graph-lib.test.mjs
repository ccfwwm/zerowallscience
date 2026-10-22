import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fingerprintInputs, isContained, matchesCompilationInputs, tasksForChangedFiles } from './build-graph-lib.mjs'

test('build fingerprint changes when an input changes and records the dependency lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-build-graph-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: root })
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src/index.ts'), 'one')
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 1\n')
    execFileSync('git', ['add', '.'], { cwd: root })
    const first = await fingerprintInputs({ root, inputs: ['src'], dshCommit: 'abc', dependencyVersions: { plugin: '1.0.0' } })
    await writeFile(join(root, 'src/index.ts'), 'two')
    const second = await fingerprintInputs({ root, inputs: ['src'], dshCommit: 'abc', dependencyVersions: { plugin: '1.0.0' } })
    assert.notEqual(first.fingerprint, second.fingerprint)
    assert.match(first.lockHash, /^[a-f0-9]{64}$/u)
    assert.equal(second.files, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('containment rejects the root itself and parent traversal', () => {
  assert.equal(isContained('C:/repo/artifacts/dev', 'C:/repo/artifacts/dev/item'), true)
  assert.equal(isContained('C:/repo/artifacts/dev', 'C:/repo/artifacts'), false)
  assert.equal(isContained('C:/repo/artifacts/dev', 'C:/repo/artifacts/dev'), false)
})

test('compilation reuses test-only changes while package inputs and imported helpers remain strict', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-compile-test-inputs-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync('git', ['init', '-q'], { cwd: root })
  await mkdir(join(root, 'plugins/example/test'), { recursive: true })
  await mkdir(join(root, 'plugins/example/src'), { recursive: true })
  await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 1\n')
  await writeFile(join(root, 'plugins/example/src/index.ts'), 'export const version = 1')
  await writeFile(join(root, 'plugins/example/test/host.spec.ts'), 'first assertion')
  const inputs = ['plugins/example']
  const compiled = await fingerprintInputs({ root, inputs, excludeTests: true })
  const packed = await fingerprintInputs({ root, inputs })
  await writeFile(join(root, 'plugins/example/test/host.spec.ts'), 'second assertion')
  const afterTestChange = await fingerprintInputs({ root, inputs, excludeTests: true })
  assert.equal(afterTestChange.fingerprint, compiled.fingerprint)
  assert.equal(matchesCompilationInputs(packed, afterTestChange), true)
  const damagedReceipt = structuredClone(packed)
  damagedReceipt.inputs[0].sha256 = '0'.repeat(64)
  assert.equal(matchesCompilationInputs(damagedReceipt, afterTestChange), false)
  assert.notEqual((await fingerprintInputs({ root, inputs })).fingerprint, packed.fingerprint)
  const explicitInputs = [...inputs, 'plugins/example/test/host.spec.ts']
  const imported = await fingerprintInputs({ root, inputs: explicitInputs, excludeTests: true })
  await writeFile(join(root, 'plugins/example/test/host.spec.ts'), 'changed imported helper')
  const afterImportedChange = await fingerprintInputs({ root, inputs: explicitInputs, excludeTests: true })
  assert.notEqual(afterImportedChange.fingerprint, imported.fingerprint)
  assert.equal(matchesCompilationInputs(packed, afterImportedChange), false)
  await writeFile(join(root, 'plugins/example/src/index.ts'), 'export const version = 2')
  const afterSourceChange = await fingerprintInputs({ root, inputs, excludeTests: true })
  assert.notEqual(afterSourceChange.fingerprint, compiled.fingerprint)
  assert.equal(matchesCompilationInputs(packed, afterSourceChange), false)
  assert.equal(matchesCompilationInputs(packed, { ...afterTestChange, lockHash: 'changed dependency lock' }), false)
  assert.equal(matchesCompilationInputs(packed, { ...afterTestChange, dshCommit: 'changed DSH pin' }), false)
})

test('task selection defers test-only cache decisions to the compilation fingerprint', () => {
  // A production entry may import a helper from a test directory. Keep its
  // build root eligible; fingerprinting decides whether compilation is needed.
  assert.deepEqual(tasksForChangedFiles(['plugins/skills/test/helper.ts', 'desktop/test/harness-runtime.spec.ts', 'tools/plugins/snapshot.test.mjs']), ['plugin-build:skills', 'runtime', 'desktop'])
  assert.deepEqual(tasksForChangedFiles(['resources/extensions/skills/example/tests/input.json']), ['resource:skill:example'])
  assert.deepEqual(tasksForChangedFiles(['deepseek-harness/packages/agent/tests/agent.test.ts']), ['dsh', 'runtime'])
})

test('Skill, MCP and Python changes each select only their independent resource task', () => {
  for (const prefix of ['resources/extensions', 'resources']) {
    assert.deepEqual(tasksForChangedFiles([`${prefix}/skills/example/SKILL.md`]), ['resource:skill:example'])
    assert.deepEqual(tasksForChangedFiles([`${prefix}/mcp/example/server.js`]), ['resource:mcp:example'])
    assert.deepEqual(tasksForChangedFiles([`${prefix}/python/dependency-manifest.json`]), ['resource:python:science'])
    assert.deepEqual(tasksForChangedFiles([`${prefix}/python/core-dependency-manifest.json`]), ['resource:python:core'])
    assert.deepEqual(tasksForChangedFiles([`${prefix}/python/requirements-base.txt`]), ['resource:python:core', 'resource:python:science'])
    assert.deepEqual(
      tasksForChangedFiles([`${prefix}/python/skill-dependencies.json`], { pythonCapabilities: ['r-platform', 'bio-tools'] }),
      ['resource:python:capability:bio-tools', 'resource:python:capability:r-platform', 'resource:python:science'],
    )
  }
  assert.deepEqual(tasksForChangedFiles(['plugins/base/src/host/index.ts']), ['plugin-build:base'])
  assert.deepEqual(tasksForChangedFiles(['deepseek-harness', 'desktop/src/main/index.ts']), ['dsh', 'runtime', 'desktop'])
})

test('flat package sources route through plugins while retired roots do not schedule work', () => {
  assert.deepEqual(tasksForChangedFiles(['plugins/research-store/src/index.ts']), ['plugin-build:research-store'])
  assert.deepEqual(tasksForChangedFiles(['plugins/dsh-bundle-science/package.json']), ['plugin-build:dsh-bundle-science'])
  assert.deepEqual(tasksForChangedFiles(['packages/dsh/retired-ui/src/index.ts', 'store/src/index.ts', 'artifacts/packages/8.3.0/windows-x64/installer.exe']), [])
  assert.deepEqual(tasksForChangedFiles(['deepseek-harness/packages/client/store/src/index.ts']), ['dsh', 'runtime'])
})

test('DSH source edits invalidate the fingerprint even with an unchanged gitlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-build-submodule-'))
  try {
    const git = (cwd, args) => execFileSync('git', args, { cwd })
    git(root, ['init', '-q'])
    const dsh = join(root, 'deepseek-harness')
    await mkdir(dsh)
    git(dsh, ['init', '-q'])
    await writeFile(join(dsh, 'source.js'), 'one')
    git(dsh, ['add', '.'])
    git(dsh, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'fixture'])
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 1\n')
    git(root, ['add', '.'])
    const first = await fingerprintInputs({ root, inputs: ['deepseek-harness'], dshCommit: 'fixed' })
    await writeFile(join(dsh, 'source.js'), 'two')
    const second = await fingerprintInputs({ root, inputs: ['deepseek-harness'], dshCommit: 'fixed' })
    assert.notEqual(first.fingerprint, second.fingerprint)
    assert.equal(second.inputs[0].path, 'deepseek-harness/source.js')
  } finally { await rm(root, { recursive: true, force: true }) }
})
