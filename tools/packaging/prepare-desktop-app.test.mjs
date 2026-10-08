import assert from 'node:assert/strict'
import test from 'node:test'
import { packagingManifest } from './prepare-desktop-app.mjs'

test('packaging manifest preserves the application entry without workspace dependencies or hooks', () => {
  const manifest = packagingManifest({ name: '@zerowallscience/desktop', version: '8.0.7',
    main: './out/main/index.js', type: 'module', license: 'AGPL-3.0-only',
    dependencies: { '@zerowallscience/plugin-research': 'workspace:^' },
    optionalDependencies: { largeRuntime: '1.0.0' },
    devDependencies: { electron: '43.0.0' }, scripts: { postinstall: 'unexpected' }, pnpm: {} })
  assert.equal(manifest.main, './out/main/index.js')
  assert.equal(manifest.version, '8.0.7')
  assert.deepEqual(manifest.dependencies, {})
  assert.deepEqual(manifest.devDependencies, {})
  assert.equal(manifest.optionalDependencies, undefined)
  assert.equal(manifest.scripts, undefined)
  assert.equal(manifest.pnpm, undefined)
})
