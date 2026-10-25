import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { exportPluginSource, mergePluginImporter } from './export-plugin-source.mjs'

test('selective export preserves every other importer and snapshot byte', () => {
  const before = "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\n  plugins/other:\n    dependencies: {}\n\npackages:\n  react@18.2.0: {}\n\nsnapshots:\n  react@18.2.0: {}\n"
  const source = "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\n  plugins/claude-code:\n    dependencies:\n      react:\n        specifier: 18.2.0\n        version: 18.2.0\n\n  plugins/other:\n    dependencies:\n      changed: {}\n\npackages:\n  react@18.2.0: {}\n\nsnapshots:\n  react@18.2.0: {}\n"
  const result = mergePluginImporter(before, source, 'plugins/claude-code')
  const block = source.slice(source.indexOf('  plugins/claude-code:'), source.indexOf('  plugins/other:'))
  assert.equal(result.replace(block, ''), before)
  assert.equal(mergePluginImporter(result, source, 'plugins/claude-code'), result)
  assert.equal(mergePluginImporter(before.replaceAll('\n', '\r\n'), source, 'plugins/claude-code').replaceAll('\r\n', '\n'), result)
})

test('selective export refuses an implicit new registry resolution', () => {
  const before = "importers:\n  .: {}\nsnapshots: {}\n"
  const source = "importers:\n  plugins/claude-code:\n    dependencies:\n      react:\n        specifier: 19.0.0\n        version: 19.0.0\nsnapshots:\n  react@19.0.0: {}\n"
  assert.throws(() => mergePluginImporter(before, source, 'plugins/claude-code'), /separately reviewed lockfile resolution/u)
})

test('selected importer replacement retains literal dollar replacement sequences', () => {
  const before = "importers:\n  plugins/claude-code:\n    dependencies: {}\n\nsnapshots: {}\n"
  const source = "importers:\n  plugins/claude-code:\n    dependencies:\n      local:\n        specifier: 'link:../$&'\n        version: 'link:../$&'\n\nsnapshots: {}\n"
  assert.equal(mergePluginImporter(before, source, 'plugins/claude-code'), source)
})

async function sourceFixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'zws-plugin-source-boundary-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const root = join(temporary, 'main'), destination = join(temporary, 'source')
  const git = (directory, args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
  const commit = directory => git(directory, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'])
  const put = async (directory, path, content) => {
    await mkdir(dirname(join(directory, path)), { recursive: true })
    await writeFile(join(directory, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  for (const directory of [root, destination, join(root, 'deepseek-harness')]) {
    await mkdir(directory, { recursive: true })
    git(directory, ['init', '-q'])
    commit(directory)
  }
  const dshCommit = git(join(root, 'deepseek-harness'), ['rev-parse', 'HEAD'])
  const id = '@zerowallscience/plugin-claude-code'
  const integration = { package: id, source: 'plugins/claude-code', resourceVersion: '0.1.0' }
  for (const directory of [root, destination]) await put(directory, 'config/deepseek-harness/upstream.json', { commit: dshCommit })
  await put(root, 'config/integrations/upstream-sources.json', { claudeCode: integration })
  await put(destination, 'config/integrations/upstream-sources.json', { unrelated: { version: 'published' } })
  await put(root, 'plugins/claude-code/package.json', { name: id, version: '0.1.0' })
  await put(root, 'plugins/claude-code/src/current.ts', 'new plugin source\n')
  await put(destination, 'plugins/claude-code/src/current.ts', 'previous plugin source\n')
  await put(root, 'pnpm-lock.yaml', 'importers:\n  plugins/claude-code:\n    dependencies: {}\n\nsnapshots: {}\n')
  await put(destination, 'pnpm-lock.yaml', 'importers:\n  .: {}\n\nsnapshots: {}\n')
  await put(destination, 'source-provenance.json', { sourceOnly: true, packages: [] })
  git(destination, ['add', '.'])
  commit(destination)
  const exportSelected = options => exportPluginSource({ root, destination, plugin: id, operationalTooling: [], ...options })
  const clean = () => assert.equal(git(destination, ['status', '--porcelain']), '')
  return { temporary, root, destination, git, commit, put, exportSelected, clean }
}

test('only explicit includes accompany the selected plugin and necessary metadata', async t => {
  const f = await sourceFixture(t)
  const included = 'tools/plugins/reviewed-helper.mjs'
  const unchanged = [
    'plugins/other/src/index.ts', 'resources/extensions/skills/example/SKILL.md',
    'config/catalogs/skill-catalog.json', 'desktop/src/shared/retained.ts',
  ]
  await f.put(f.root, included, 'reviewed source change\n')
  await f.put(f.destination, included, 'old shared source\n')
  for (const path of unchanged) {
    await f.put(f.root, path, 'unrelated dirty main source\n')
    await f.put(f.destination, path, 'published source remains\n')
  }
  f.git(f.destination, ['add', '.'])
  f.commit(f.destination)
  const receipt = await f.exportSelected({ include: [included] })
  assert.equal(await readFile(join(f.destination, included), 'utf8'), 'reviewed source change\n')
  for (const path of unchanged) assert.equal(await readFile(join(f.destination, path), 'utf8'), 'published source remains\n')
  assert.deepEqual(receipt.files.map(({ path }) => path), [
    'config/integrations/upstream-sources.json', 'plugins/claude-code/package.json',
    'plugins/claude-code/src/current.ts', 'pnpm-lock.yaml', included,
  ].sort())
  const changed = f.git(f.destination, ['diff', '--name-only']).split('\n').filter(Boolean)
  assert.deepEqual(changed.sort(), [
    'config/integrations/upstream-sources.json', 'plugins/claude-code/src/current.ts',
    'pnpm-lock.yaml', 'source-provenance.json', included,
  ].sort())
})

test('unsafe and private includes fail before any destination mutation', async t => {
  const f = await sourceFixture(t)
  for (const path of ['../outside.ts', 'plugins/claude-code/../../outside.ts', 'plugins/claude-code/.env', 'plugins/claude-code/lib/index.js', 'tools\\helper.mjs']) {
    await assert.rejects(f.exportSelected({ include: [path] }), /Private\/generated\/unsafe source path/u)
    f.clean()
  }
})

test('a mismatched DSH pin or plugin version fails before copying files', async t => {
  const f = await sourceFixture(t)
  const pin = JSON.parse(await readFile(join(f.root, 'config/deepseek-harness/upstream.json'), 'utf8'))
  await f.put(f.root, 'config/deepseek-harness/upstream.json', { commit: '0'.repeat(40) })
  await assert.rejects(f.exportSelected(), /cannot change the DSH pin/u)
  f.clean()
  await f.put(f.root, 'config/deepseek-harness/upstream.json', pin)
  await f.put(f.root, 'plugins/claude-code/package.json', { name: '@zerowallscience/plugin-claude-code', version: '0.2.0' })
  await assert.rejects(f.exportSelected(), /manifest and source contract differ/u)
  f.clean()
})

test('explicit includes cannot traverse a source directory junction', async t => {
  const f = await sourceFixture(t)
  const outside = join(f.temporary, 'outside-source')
  await f.put(outside, 'helper.mjs', 'must not be exported\n')
  await mkdir(join(f.root, 'tools'), { recursive: true })
  await symlink(outside, join(f.root, 'tools/linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(f.exportSelected({ include: ['tools/linked/helper.mjs'] }), /symbolic link/u)
  f.clean()
})

test('a clean tracked metadata symlink cannot redirect exporter writes', async t => {
  const f = await sourceFixture(t)
  const outside = join(f.temporary, 'outside-provenance.json')
  const original = '{"sourceOnly":true,"outsideMustRemain":true}\n'
  await writeFile(outside, original)
  await unlink(join(f.destination, 'source-provenance.json'))
  try {
    await symlink(outside, join(f.destination, 'source-provenance.json'), 'file')
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows file symlink privilege is unavailable')
      return
    }
    throw error
  }
  f.git(f.destination, ['add', 'source-provenance.json'])
  f.commit(f.destination)
  f.clean()
  await assert.rejects(f.exportSelected(), /symbolic link/u)
  f.clean()
  assert.equal(await readFile(outside, 'utf8'), original)
})

test('selective export merges one plugin into a clean source repository and preserves unrelated dirty source', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'zws-plugin-source-'))
  const root = join(temporary, 'main'), destination = join(temporary, 'source')
  const git = (directory, args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
  const commit = directory => git(directory, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'])
  const put = async (directory, path, content) => {
    await mkdir(dirname(join(directory, path)), { recursive: true })
    await writeFile(join(directory, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  try {
    for (const directory of [root, destination, join(root, 'deepseek-harness')]) {
      await mkdir(directory, { recursive: true })
      git(directory, ['init', '-q'])
      commit(directory)
    }
    const dshCommit = git(join(root, 'deepseek-harness'), ['rev-parse', 'HEAD'])
    const id = '@zerowallscience/plugin-claude-code'
    const integration = { package: id, source: 'plugins/claude-code', resourceVersion: '0.1.0' }
    for (const directory of [root, destination]) await put(directory, 'config/deepseek-harness/upstream.json', { commit: dshCommit })
    await put(root, 'config/integrations/upstream-sources.json', { claudeCode: integration, unrelated: { version: 'dirty-main-only' } })
    await put(destination, 'config/integrations/upstream-sources.json', { unrelated: { version: 'published-source' } })
    await put(root, 'plugins/claude-code/package.json', { name: id, version: '0.1.0' })
    await put(root, 'plugins/claude-code/src/current.ts', 'export const current = true\n')
    await put(root, 'plugins/other/src/index.ts', 'unrelated dirty implementation\n')
    await put(destination, 'plugins/other/src/index.ts', 'published implementation\n')
    await put(destination, 'plugins/claude-code/obsolete.ts', 'obsolete tracked file\n')
    await put(destination, '.gitignore', 'ignored-local.txt\n')
    await put(destination, 'ignored-local.txt', 'ignored local state\n')
    const beforeLock = "importers:\n  .: {}\n\nsnapshots: {}\n"
    await put(root, 'pnpm-lock.yaml', "importers:\n  plugins/claude-code:\n    dependencies: {}\n\nsnapshots: {}\n")
    await put(destination, 'pnpm-lock.yaml', beforeLock)
    await put(destination, 'source-provenance.json', { sourceOnly: true, packages: [], historicalFact: 'retained' })
    git(destination, ['add', '.'])
    commit(destination)
    const receipt = await exportPluginSource({ root, destination, plugin: 'claude-code', operationalTooling: [] })
    assert.equal(await readFile(join(destination, 'plugins/other/src/index.ts'), 'utf8'), 'published implementation\n')
    assert.equal(await readFile(join(destination, 'ignored-local.txt'), 'utf8'), 'ignored local state\n')
    assert.equal(await readFile(join(destination, 'plugins/claude-code/src/current.ts'), 'utf8'), 'export const current = true\n')
    await assert.rejects(readFile(join(destination, 'plugins/claude-code/obsolete.ts')), { code: 'ENOENT' })
    const integrations = JSON.parse(await readFile(join(destination, 'config/integrations/upstream-sources.json'), 'utf8'))
    assert.deepEqual(integrations.unrelated, { version: 'published-source' })
    assert.deepEqual(integrations.claudeCode, integration)
    const provenance = JSON.parse(await readFile(join(destination, 'source-provenance.json'), 'utf8'))
    assert.equal(provenance.historicalFact, 'retained')
    assert.equal(provenance.pluginSourceUpdates[0].id, id)
    assert.deepEqual(receipt.removed, ['plugins/claude-code/obsolete.ts'])
    assert.equal(receipt.publicationAsserted, false)
    assert.equal(receipt.retainedOtherSources, true)
    await assert.rejects(exportPluginSource({ root, destination, plugin: 'claude-code', operationalTooling: [] }), /dirty source repository/u)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
