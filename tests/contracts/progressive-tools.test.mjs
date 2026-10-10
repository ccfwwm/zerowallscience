import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { adaptProgressiveToolsManifest, adaptProgressiveToolsPatch } from '../../tools/packaging/adapt-progressive-tools.mjs'

test('Progressive Tools production manifest strictly targets the tested rc.2 runtime', async () => {
  const source = await readFile(new URL('../../packages/dsh/dsh-progressive-tools/package.json', import.meta.url), 'utf8')
  const manifest = JSON.parse(adaptProgressiveToolsManifest(source))
  assert.equal(manifest.version, '0.7.2-zws.1')
  for (const name of ['agent', 'llm', 'system-prompt', 'tools']) assert.equal(manifest.peerDependencies[`@deepseek-ai/dsh-${name}`], '0.2.0-rc.2')
  const changed = JSON.parse(source)
  changed.peerDependencies['@deepseek-ai/dsh-tools'] = '*'
  assert.throws(() => adaptProgressiveToolsManifest(JSON.stringify(changed)), /upstream peer/u)
  changed.peerDependencies['@deepseek-ai/dsh-new'] = '0.2.0-rc.1'
  assert.throws(() => adaptProgressiveToolsManifest(JSON.stringify(changed)), /peer set/u)
  assert.throws(() => adaptProgressiveToolsManifest(source.replace('"version": "0.7.0"', '"version": "0.8.0"')), /audited upstream/u)
  assert.equal(JSON.parse(source).version, '0.7.0')
})

test('Progressive Tools bundle registers the scoped package actually shipped in the runtime', async () => {
  const source = await readFile(new URL('../../packages/dsh/dsh-progressive-tools/cordis.patch.yml', import.meta.url), 'utf8')
  const patch = parse(adaptProgressiveToolsPatch(source))
  const manifest = JSON.parse(await readFile(new URL('../../packages/dsh/dsh-progressive-tools/package.json', import.meta.url), 'utf8'))
  assert.equal(patch[0].insert[0].name, manifest.name)
  assert.throws(() => adaptProgressiveToolsPatch(source.replace('progressive-tools', 'changed')), /audited upstream registration/u)
})
