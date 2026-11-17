/** Compatibility declarations admit later runtimes while preserving their minimum. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { assertMinimumCompatibility } from './plugin-compatibility.mjs'

test('accepts minimum-only engines, peers and plugin metadata', () => {
  assert.doesNotThrow(() => assertMinimumCompatibility({ name: 'feature', engines: { dsh: '>=0.2.2-rc.1' },
    peerDependencies: { react: '>=18.2.0' }, dependencies: { '@deepseek-ai/dsh-tools': '>=0.2.2-rc.1' },
    zerowall: { dsh: { min: '0.2.2-rc.1' } } }))
})

test('rejects explicit maximums and implicit peer or runtime caps', () => {
  for (const manifest of [
    { zerowall: { dsh: { min: '0.2.2-rc.1', max: '0.2.2-rc.1' } } },
    { desktop: { min: '9.1.5', max: '9.1.5' } },
    { peerDependencies: { react: '^18.2.0' } },
    { peerDependencies: { '@deepseek-ai/dsh-tools': '0.2.2-rc.1' } },
    { dependencies: { '@deepseek-ai/dsh-tools': '0.2.2-rc.1' } },
    { engines: { dsh: '>=0.2.2-rc.1 <1.0.0' } },
  ]) assert.throws(() => assertMinimumCompatibility(manifest), /minimum|max/)
})
