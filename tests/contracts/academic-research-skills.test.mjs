import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const skillsRoot = join(root, 'resources', 'skills')
const coreSkills = ['deep-research', 'academic-paper', 'academic-paper-reviewer', 'academic-pipeline']
const arsCommands = ['ars-3w', 'ars-abstract', 'ars-cache-invalidate', 'ars-citation-check', 'ars-disclosure', 'ars-format-convert', 'ars-full', 'ars-lit-review', 'ars-mark-read', 'ars-outline', 'ars-plan', 'ars-rebuttal-audit', 'ars-reviewer', 'ars-revision', 'ars-revision-coach', 'ars-unmark-read']

function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)
  assert.ok(match, 'skill must have YAML frontmatter')
  return Object.fromEntries((match[1] ?? '').split(/\r?\n/u).flatMap(line => {
    const item = /^([\w-]+):\s*(.*)$/u.exec(line)
    return item === null ? [] : [[item[1], item[2]]]
  }))
}

test('ARS v3.21.2 bundled skills and command policy are complete', async () => {
  for (const name of coreSkills) {
    const data = frontmatter(await readFile(join(skillsRoot, name, 'SKILL.md'), 'utf8'))
    assert.equal(data.name, name)
    assert.notEqual(data.description, undefined)
    assert.notEqual(data['disable-model-invocation'], 'true')
  }

  const entries = (await readdir(skillsRoot)).filter(name => name.startsWith('ars-')).sort()
  assert.deepEqual(entries, [...arsCommands].sort())
  for (const name of arsCommands) {
    const data = frontmatter(await readFile(join(skillsRoot, name, 'SKILL.md'), 'utf8'))
    assert.equal(data.name, name)
    assert.equal(data['disable-model-invocation'], 'true')
    assert.equal(data['user-invocable'], 'true')
  }
})

test('ARS bundles retain referenced resource directories without Claude hooks', async () => {
  for (const name of coreSkills) {
    for (const directory of ['agents', 'references', 'templates', 'examples']) {
      const info = await stat(join(skillsRoot, name, directory)).catch(() => undefined)
      assert.ok(info?.isDirectory(), `${name}/${directory} must be bundled`)
    }
  }
  await assert.rejects(stat(join(skillsRoot, 'hooks')))
})
