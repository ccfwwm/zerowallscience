import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { includePackagedSkillPath, resourceTreeFiles } from './resource-tree.mjs'

test('non-Skill bundled resources retain runtime assets and filter local payloads identically for hashing and copying', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-resource-tree-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'mcp', 'bio-tools'), output = join(root, 'stage', 'bio-tools')
  const retained = ['config.yml', 'payload/model.json', 'src/cli.js', 'viewer/engine.wasm']
  const excluded = ['.git/config', 'Tests/fixture.js', 'node_modules/local/index.js', '.venv/pyvenv.cfg', '__pycache__/module.pyc', 'scripts/cache.PYO', 'output/result.json']
  for (const path of [...retained, ...excluded]) {
    const target = join(source, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, path)
  }
  const filter = candidate => includePackagedSkillPath(source, candidate)
  assert.equal(filter(source), true)
  const expected = await resourceTreeFiles(source, filter)
  assert.deepEqual(expected.map(file => file.path).sort(), retained)
  await cp(source, output, { recursive: true, filter })
  assert.deepEqual(await resourceTreeFiles(output), expected)
})
