import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

for (const retainReviewer of [false, true]) test(`profile generation preserves selected activation with Reviewer compatibility supply=${retainReviewer}`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-selected-profile-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const put = async (path, document) => {
    const file = join(root, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, typeof document === 'string' ? document : JSON.stringify(document))
  }
  const selected = ['@zerowallscience/plugin-base', '@zerowallscience/plugin-claude-code', 'third-party-selected']
  await put('tools/build/paths.mjs', "import { resolve } from 'node:path'; export const root = resolve(import.meta.dirname, '../..'); export const stageRoot = resolve(root, 'stage')")
  await put('config/layout/runtime-profile.json', { corePlugins: [selected[0]], offlinePackageDependencies: { 'support-only': 'support', ...(retainReviewer ? { '@zerowallscience/plugin-reviewer': 'reviewer' } : {}) } })
  await put('config/deepseek-harness/plugin-inventory.json', { profiles: { stable: { plugins: selected } } })
  await put('config/catalogs/resource-versions.json', { skill: { example: '0.1.9' } })
  await put('desktop/build/zerowall.patch.yml', 'patch: []\n')
  for (const [name, id] of [['base', selected[0]], ['claude', selected[1]], ['reviewer', '@zerowallscience/plugin-reviewer'], ['unselected', '@zerowallscience/plugin-unselected']]) {
    await put(`plugins/${name}/package.json`, { name: id, version: '0.1.0' })
  }
  for (const id of ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-experimental-voice-input-bundle']) {
    await put(`stage/runtime/node_modules/${id}/package.json`, { name: id, version: '0.2.1-rc.2' })
  }
  for (const id of ['third-party-selected', 'support-only']) await put(`stage/offline-profile/modules/${id}/package.json`, { name: id, version: '1.0.0' })
  if (retainReviewer) await put('stage/offline-profile/modules/@zerowallscience/plugin-reviewer/package.json', { name: '@zerowallscience/plugin-reviewer', version: '0.1.8' })
  await put('stage/resources/extensions/skills/example/SKILL.md', 'example')
  await mkdir(join(root, 'tools/commands'), { recursive: true })
  await copyFile(new URL('../../tools/commands/prepare-profile.mjs', import.meta.url), join(root, 'tools/commands/prepare-profile.mjs'))
  execFileSync(process.execPath, [join(root, 'tools/commands/prepare-profile.mjs')], { windowsHide: true })
  const defaults = JSON.parse(await readFile(join(root, 'stage/commands/default-plugins.json'), 'utf8'))
  const bundled = JSON.parse(await readFile(join(root, 'stage/commands/bundled-plugins.json'), 'utf8'))
  assert.deepEqual(defaults, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...selected])
  assert(bundled.some(item => item.id === selected[1]), 'Claude must enter the selected runtime')
  assert(bundled.some(item => item.id === 'support-only'), 'explicit support packages remain available for recovery')
  assert(!defaults.includes('support-only'), 'recovery supply must not be activated by default')
  assert(!bundled.some(item => item.id === '@zerowallscience/plugin-unselected'))
  assert.equal(bundled.some(item => item.id === '@zerowallscience/plugin-reviewer'), retainReviewer)
  assert(!defaults.includes('@zerowallscience/plugin-reviewer'), 'Reviewer compatibility must not restore default activation')
  if (retainReviewer) assert.equal(bundled.find(item => item.id === '@zerowallscience/plugin-reviewer').version, '0.1.8')
})
