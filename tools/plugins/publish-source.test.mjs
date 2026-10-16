import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { integrationPublishSource, usesReviewedRuntime } from './publish-source.mjs'

test('only established runtime-only adapters use the reviewed projection', () => {
  const roots = { root: '/repo', stageRoot: '/stage' }
  for (const name of ['@changfenhuang/dsh-genui', '@dingyi222666/dsh-session-notification', '@dsh-external/zotero-harvest']) {
    const integration = { package: name, source: 'plugins/example' }
    assert.equal(usesReviewedRuntime(integration), true)
    assert.equal(integrationPublishSource(integration, roots), join('/stage', 'offline-profile/modules', name))
  }
  for (const name of ['dsh-better-sidebar', '@michengai/dsh-archive-manager', '@oh-story/dsh', '@zerowallscience/plugin-base']) {
    const integration = { package: name, source: 'plugins/example', catalogOptional: true }
    assert.equal(usesReviewedRuntime(integration), false)
    assert.equal(integrationPublishSource(integration, roots), join('/repo', 'plugins/example'))
  }
  assert.equal(integrationPublishSource({ source: 'resources/skills' }, roots), undefined)
})

test('configured Harvest publication uses its reviewed runtime rather than development declarations', async () => {
  const integrations = JSON.parse(await readFile(new URL('../../config/integrations/upstream-sources.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(await readFile(new URL('../../plugins/zotero-harvest/package.json', import.meta.url), 'utf8'))
  const integration = integrations['zotero-harvest']
  assert.equal(integration.package, manifest.name)
  assert.equal(integrationPublishSource(integration, { root: '/repo', stageRoot: '/stage' }),
    join('/stage', 'offline-profile/modules', manifest.name))
})
