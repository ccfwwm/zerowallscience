import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { submittedPlan, planAddress, parsePlanAddress } from '../../deepseek-harness/packages/client/ui-plan/src/client/plan.ts'

const root = resolve(import.meta.dirname, '../..')
const read = path => readFile(join(root, path), 'utf8')
const legacyRoutes = /\b(?:tool_search|tool_dispatch|tool_result_read)\b/u
const retiredPlugin = /(?:@everclear077\/)?dsh-progressive-tools/u

test('native exit_plan_mode records expose a durable plan to the pinned sidebar reader', () => {
  const markdown = '# 原生计划\n\n- 修复更新\n- 验证发布'
  const native = {
    type: 'tool/call',
    data: { name: 'exit_plan_mode', callId: 'plan:1', arguments: JSON.stringify({ plan: markdown }) },
  }
  const plan = submittedPlan(native)
  assert.deepEqual(plan, { callId: 'plan:1', title: '原生计划', markdown })
  const address = { session: { kind: 'session', sessionId: 'session / 计划' }, callId: plan.callId }
  assert.deepEqual(parsePlanAddress(planAddress(address)), address)
  // This is the exact incompatible envelope that the retired plugin wrote.
  assert.equal(submittedPlan({
    ...native,
    data: { ...native.data, name: 'tool_dispatch', arguments: JSON.stringify({ name: 'exit_plan_mode', arguments: { plan: markdown } }) },
  }), undefined)
})

test('the shipped composition retains native plan services without the retired tool router', async () => {
  const base = JSON.parse(await read('deepseek-harness/packages/bundle/base/package.json'))
  const web = JSON.parse(await read('deepseek-harness/packages/bundle/web-app/package.json'))
  assert.ok(base.dependencies['@deepseek-ai/dsh-plan-mode'])
  assert.ok(web.dependencies['@deepseek-ai/dsh-client-ui-plan'])
  const surfaces = [
    'profiles/sources/shared.ts',
    'profiles/generated/development.yml',
    'profiles/generated/preview.yml',
    'profiles/generated/stable.yml',
    'config/layout/runtime-profile.json',
    'config/deepseek-harness/plugin-inventory.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'desktop/build/zerowall.patch.yml',
    'plugins/dsh-bundle-science/dsh.bundle.patch.yml',
    'tools/plugins/generate-workspaces.mjs',
    'tools/integration/research-tool-config.mjs',
  ]
  for (const path of surfaces) {
    const text = await read(path)
    assert.doesNotMatch(text, retiredPlugin, path)
    assert.doesNotMatch(text, legacyRoutes, path)
  }
})

test('every first-party plugin manifest and MCP patch use the native tool composition', async () => {
  const inventory = JSON.parse(await read('config/deepseek-harness/plugin-inventory.json'))
  assert.ok(Array.isArray(inventory.zeroWallPlugins), 'the inventory must declare the first-party plugin set')
  const names = new Set()
  let checked = 0
  for (const entry of inventory.zeroWallPlugins) {
    assert.equal(entry.source, `plugins/${entry.id}`, `inventory source for ${entry.id}`)
    assert.equal(entry.package, `@zerowallscience/plugin-${entry.id}`, `inventory package for ${entry.id}`)
    assert.ok(!names.has(entry.package), `duplicate inventory package: ${entry.package}`)
    names.add(entry.package)
    const manifestPath = `${entry.source}/package.json`
    const manifest = JSON.parse(await read(manifestPath))
    assert.equal(manifest.name, entry.package, manifestPath)
    assert.doesNotMatch(JSON.stringify(manifest), retiredPlugin, manifestPath)
    const patchPath = `${entry.source}/dsh.bundle.patch.yml`
    assert.doesNotMatch(await read(patchPath), retiredPlugin, patchPath)
    checked++
  }
  assert.ok(checked > 20, 'the contract must inspect the actual first-party plugin set')
  assert.doesNotMatch(await read('plugins/mcp/src/host/index.ts'), legacyRoutes)
})

test('bundled Skill documents and references no longer instruct legacy routing', async () => {
  let checked = 0
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory() && !['.git', '__pycache__'].includes(entry.name)) await visit(path)
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        assert.doesNotMatch(await readFile(path, 'utf8'), legacyRoutes, path)
        checked++
      }
    }
  }
  await visit(join(root, 'resources/extensions/skills'))
  assert.ok(checked > 100, 'the contract must inspect bundled Skills and their references')
})
