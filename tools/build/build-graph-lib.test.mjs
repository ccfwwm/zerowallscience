import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fingerprintInputs, isContained, tasksForChangedFiles } from './build-graph-lib.mjs'

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
