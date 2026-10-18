import { test } from 'node:test'
import assert from 'node:assert/strict'
import { removeRetiredPlugins, removeRetiredResolutionRules, retiredPackageSelector } from '../../tools/commands/retired-plugins.mjs'

test('retired selectors include pnpm parents and Yarn paths without matching other scoped packages', () => {
  for (const selector of ['dsh-univer-office', 'dsh-genui@^1', '@changfenhuang/dsh-genui@1', 'kept > dsh-genui', 'dsh-genui > kept', '**/dsh-univer-office', 'kept/@changfenhuang/dsh-genui']) {
    assert.equal(retiredPackageSelector(selector), true, selector)
  }
  for (const selector of ['dsh-genui-tools', 'dsh-univer-office-extra', '@changfenhuang/dsh-genui-extra', '@other/dsh-genui', '**/@other/dsh-genui', '@other/dsh-univer-office@1', 'kept > @other/dsh-genui']) {
    assert.equal(retiredPackageSelector(selector), false, selector)
  }
})

test('all manifest resolver formats remove retired rules and preserve unrelated nested policy', () => {
  const manifest = {
    dependencies: { 'dsh-univer-office': '1', 'third-party': '2' },
    pnpm: { overrides: { 'dsh-univer-office@1 > shared': '3', '@other/dsh-genui': '4', kept: '5' }, onlyBuiltDependencies: ['kept'] },
    overrides: { kept: { '.': '2', 'dsh-genui': '1', shared: '3' }, '@changfenhuang/dsh-genui': '1' },
    resolutions: { '**/dsh-genui': '1', 'parent/@changfenhuang/dsh-genui': '1', '**/@other/dsh-genui': '4', shared: '3' },
    zerowall: { model: 'selected-model', disabledPlugins: ['third-party'] },
  }
  assert.equal(removeRetiredPlugins(manifest), true)
  assert.deepEqual(manifest.dependencies, { 'third-party': '2' })
  assert.deepEqual(manifest.pnpm, { overrides: { '@other/dsh-genui': '4', kept: '5' }, onlyBuiltDependencies: ['kept'] })
  assert.deepEqual(manifest.overrides, { kept: { '.': '2', shared: '3' } })
  assert.deepEqual(manifest.resolutions, { '**/@other/dsh-genui': '4', shared: '3' })
  assert.deepEqual(manifest.zerowall, { model: 'selected-model', disabledPlugins: ['third-party'] })
  assert.equal(removeRetiredResolutionRules(manifest), false)
  assert.equal(removeRetiredPlugins(manifest), false)
})
