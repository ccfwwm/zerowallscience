import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yaml from 'yaml'
import { reconcileBundledCatalogSkills } from '../../tools/commands/bundled-skills.mjs'

test('desktop upgrade reveals newer bundled Skills only when the catalog copy is untouched', async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-skill-upgrade-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const bundledRoot = join(home, 'bundle'), versions = {}
  for (const [index, name] of ['pristine', 'edited', 'custom', 'disabled'].entries()) {
    versions[name] = '0.2.0'
    const text = '---\n' + yaml.stringify({ name, description: 'test', metadata: { zerowall: { source: name === 'custom' ? 'import' : 'catalog', version: '0.1.0' } } }) + '---\nold text\n'
    const cached = join(home, 'resources/skills', String(index).repeat(64))
    const target = join(home, 'zerowall-skills', name === 'disabled' ? 'disabled' : 'enabled', name)
    for (const directory of [cached, target, join(bundledRoot, name)]) await mkdir(directory, { recursive: true })
    await writeFile(join(cached, 'SKILL.md'), text)
    await writeFile(join(target, 'SKILL.md'), text)
    await writeFile(join(bundledRoot, name, 'SKILL.md'), 'new text')
    if (name === 'edited') await writeFile(join(target, 'user-note.md'), 'keep my edits')
  }
  const result = await reconcileBundledCatalogSkills({ home, bundledRoot, versions, yaml })
  assert.deepEqual(result.updated.map(entry => entry.id), ['pristine'])
  assert.deepEqual(result.preserved, ['edited'])
  assert.match(await readFile(join(result.updated[0].backup, 'SKILL.md'), 'utf8'), /old text/)
  assert.deepEqual((await readdir(join(home, 'zerowall-skills/enabled'))).sort(), ['custom', 'edited'])
  assert.match(await readFile(join(home, 'zerowall-skills/disabled/disabled/SKILL.md'), 'utf8'), /old text/)
  assert.equal((await reconcileBundledCatalogSkills({ home, bundledRoot, versions, yaml })).updated.length, 0)
})
