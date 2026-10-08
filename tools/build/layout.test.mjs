import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { packageSource, resourceSource } from './layout.mjs'

const require = createRequire(import.meta.url)
const { buildPaths } = require('./paths.cjs')

test('resource path helper normalizes Windows separators and retains a legacy fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-layout-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.0.7' }))
    const paths = buildPaths(root)
    const resolved = paths.resource('skills', 'example\\SKILL.md')
    assert.equal(resolved.logical, 'skills/example/SKILL.md')
    assert.ok(resolved.preferred.endsWith(join('resources', 'extensions', 'skills', 'example', 'SKILL.md')))
    assert.ok(resolved.legacy.endsWith(join('resources', 'skills', 'example', 'SKILL.md')))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('layout resolver reads canonical package and resource roots before legacy paths', async () => {
  const canonicalPackage = await packageSource('dsh-better-sidebar')
  assert.ok(canonicalPackage.endsWith(join('packages', 'dsh', 'dsh-better-sidebar')) || canonicalPackage.endsWith(join('packages', 'dsh-better-sidebar')))
  const skill = await resourceSource('skills', 'example')
  assert.ok(skill.endsWith(join('resources', 'skills', 'example')) || skill.endsWith(join('resources', 'extensions', 'skills', 'example')))
})
