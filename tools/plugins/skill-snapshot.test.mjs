import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { copyCanonicalSkillSnapshot, isObsoleteSkillSnapshot } from './skill-snapshot.mjs'

test('full exports copy canonical Skills and prune only paths absent from that source', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'zws-skill-snapshot-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const source = join(temporary, 'main')
  const destination = join(temporary, 'source')
  const current = join(source, 'resources/extensions/skills/example/SKILL.md')
  const privateFile = join(source, 'resources/extensions/skills/example/.env')
  const oldSnapshot = join(destination, 'skills/example/SKILL.md')
  await mkdir(dirname(current), { recursive: true })
  await mkdir(dirname(oldSnapshot), { recursive: true })
  await writeFile(current, 'canonical source\n')
  await writeFile(privateFile, 'must not be exported\n')
  await writeFile(oldSnapshot, 'stale stage snapshot\n')

  const selected = new Set(['resources/extensions/skills/example/SKILL.md'])
  assert.equal(isObsoleteSkillSnapshot(selected, 'skills/example/SKILL.md'), false)
  assert.equal(isObsoleteSkillSnapshot(selected, 'skills/removed/SKILL.md'), true)
  assert.equal(isObsoleteSkillSnapshot(selected, 'skills/example/.env'), true)
  assert.equal(isObsoleteSkillSnapshot(selected, 'plugins/example/index.ts'), false)
  await copyCanonicalSkillSnapshot(source, destination, selected)

  assert.equal(await readFile(oldSnapshot, 'utf8'), 'canonical source\n')
  await assert.rejects(readFile(join(destination, 'skills/example/.env')), { code: 'ENOENT' })
})
