import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import { signCatalog } from './resource-catalog.mjs'
import { mergePublishedPlugin, mergePublishedPlugins, mergePublishedSkills, selectedPluginArguments, selectedSkillArguments, assertPublicationBaseline, assertResourcePublicationBaseline } from './targeted-plugin-catalog.mjs'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const keys = { test: publicKey }, sign = value => signCatalog(value, privateKey, 'test')
const resource = (id, version = '1.0.0', sha256 = 'a'.repeat(64)) => sign({ id, version, sha256, size: 42, downloadUrl: `https://example.com/${id}/${version}.tgz` })

test('five-resource publication keeps untouched signatures and rejects ambiguous selections', () => {
  const previous = [resource('account'), resource('cloud'), resource('images'), resource('environment'), resource('unchanged')]
  const selected = ['account', 'cloud', 'images', 'environment', 'story'].map(id => resource(id, '1.0.1'))
  const result = mergePublishedPlugins(previous, selected, keys)
  assert.equal(result.find(e => e.id === 'unchanged'), previous[4])
  assert.deepEqual(result.map(e => e.id).sort(), ['account','cloud','environment','images','story','unchanged'])
  assert.throws(() => mergePublishedPlugins(previous, [...selected, selected[0]], keys), /Duplicate/)
  assert.throws(() => mergePublishedPlugins(previous, [selected[0], resource('images','1.0.0','b'.repeat(64))], keys), /bump/)
  assert.equal(previous[0].version, '1.0.0')
  assert.deepEqual(selectedPluginArguments(['--kind','plugin','--plugin','cloud','--plugin','story']), {remaining:['--kind','plugin'],plugins:['cloud','story']})
  assert.throws(() => selectedPluginArguments(['--plugin','story','--plugin','story']), /duplicate/)
  assert.throws(() => selectedPluginArguments(['--plugin','--kind']), /Invalid/)
})

test('one addition preserves every existing public entry and signature despite pending local versions', () => {
  const existing = [resource('images', '0.2.6'), resource('python', '0.1.7')]
  const selected = resource('archive', '1.0.17-zws.1')
  const merged = mergePublishedPlugin(existing, selected, keys)
  assert.deepEqual(merged, [...existing, selected])
  assert.equal(merged[0], existing[0])
  assert.deepEqual(existing.map(e => e.version), ['0.2.6', '0.1.7'])
})
test('targeted skill updates preserve every other signed entry and reject version regression', () => {
  const previous = [resource('gpt-image-generator', '0.1.6'), resource('other-skill', '1.2.0')]
  const selected = resource('gpt-image-generator', '0.1.7')
  const merged = mergePublishedSkills(previous, [selected], keys)
  assert.deepEqual(merged, [previous[1], selected])
  assert.equal(merged[0], previous[1])
  assert.deepEqual(selectedSkillArguments(['--kind', 'skill', '--skill', 'gpt-image-generator']), { skills: ['gpt-image-generator'], remaining: ['--kind', 'skill'] })
  assert.throws(() => mergePublishedSkills(previous, [resource('gpt-image-generator', '0.1.5')], keys), /downgrade/u)
})

test('targeted publication removes retired resources while preserving unrelated signatures', () => {
  const other = resource('other-skill', '1.2.0')
  const selected = resource('zerowall-presentation', '0.2.6')
  const retired = new Set(['univer', 'univer-slide'])
  const previous = [resource('univer'), other, resource('univer-slide')]
  assert.deepEqual(mergePublishedSkills(previous, [selected], keys, retired), [other, selected])
  assert.equal(mergePublishedSkills(previous, [selected], keys, retired)[0], other)
  assert.throws(() => mergePublishedSkills(previous, [resource('univer')], keys, retired), /retired skill/u)
  assert.throws(() => mergePublishedSkills([{ ...previous[0], size: 43 }, other], [selected], keys, retired), /signature/u)
  const plugin = resource('dsh-ppt-maker')
  assert.deepEqual(mergePublishedPlugins([resource('dsh-univer-office'), resource('@changfenhuang/dsh-genui'), other], [plugin], keys), [other, plugin])
  assert.throws(() => mergePublishedPlugins([other], [resource('dsh-univer-office')], keys), /retired plugin/u)
})
test('updates replace only the selected plugin and reject downgrade, duplicate identity, or same-version changed bytes', () => {
  const existing = [resource('archive'), resource('other')]
  assert.deepEqual(mergePublishedPlugin(existing, resource('archive', '1.0.1'), keys), [existing[1], resource('archive', '1.0.1')])
  assert.throws(() => mergePublishedPlugin(existing, resource('archive', '0.9.9'), keys), /downgrade/u)
  assert.throws(() => mergePublishedPlugin(existing, resource('archive', '1.0.0', 'b'.repeat(64)), keys), /bump/u)
  assert.throws(() => mergePublishedPlugin([...existing, resource('archive', '1.0.1')], resource('archive', '1.0.2'), keys), /Ambiguous/u)
})
test('untrusted or tampered entries are rejected', () => {
  assert.throws(() => mergePublishedPlugin([resource('other')], { ...resource('archive'), size: 43 }, keys), /signature/u)
  assert.throws(() => mergePublishedPlugin([{ ...resource('other'), version: '2.0.0' }], resource('archive'), keys), /signature/u)
})
test('promotion detects concurrent publication and permits idempotent retry', () => {
  const baseline = sign({ kind: 'pointer', catalog: { sha256: 'old' } })
  const intended = sign({ kind: 'pointer', catalog: { sha256: 'archive' } })
  assertPublicationBaseline(baseline, baseline, intended, keys)
  assertPublicationBaseline(intended, baseline, intended, keys)
  assert.throws(() => assertPublicationBaseline(sign({ kind: 'pointer', catalog: { sha256: 'concurrent' } }), baseline, intended, keys), /changed/u)
  assert.throws(() => assertPublicationBaseline({ ...baseline, kind: 'modified' }, baseline, intended, keys), /signature/u)
  assert.throws(() => assertResourcePublicationBaseline(sign({ kind: 'pointer', catalog: { sha256: 'concurrent' } }), baseline, intended, keys, 'skill'), /skill pointer changed/u)
})
