import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertPluginDesktopCompatibility } from '../../tools/plugins/compatibility.mjs'

test('an unchanged independently versioned plugin accepts later Desktop versions within its declared range', () => {
  for (const version of ['8.0.0', '8.0.1', '8.1.0']) {
    assert.doesNotThrow(() => assertPluginDesktopCompatibility({ min: '8.0.0' }, version, 'plugin 0.1.0'))
  }
  assert.doesNotThrow(() => assertPluginDesktopCompatibility({ min: '8.0.0', max: '8.1.0' }, '8.1.0', 'plugin 0.1.0'))
})

test('build checks reject unsupported Desktop versions and malformed plugin compatibility ranges', () => {
  for (const [range, version] of [[{ min: '8.0.0' }, '7.4.0'], [{ min: '8.0.0', max: '8.1.0' }, '8.1.1'], [undefined, '8.0.0'], [{ min: 'invalid' }, '8.0.0']]) {
    assert.throws(() => assertPluginDesktopCompatibility(range, version, 'plugin 0.1.0'))
  }
})
