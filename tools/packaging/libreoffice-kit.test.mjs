import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { adaptLibreOfficeKit } from './adapt-libreoffice-kit.mjs'

for (const owner of ['deepseek-harness/packages/document/office-to-pdf', 'plugins/dsh-ppt-maker']) test(`configured Office kit for ${owner} locates physical engines outside app.asar`, async () => {
  const require = createRequire(new URL(`../../${owner}/package.json`, import.meta.url))
  const manifest = require('@deepseek-ai/libreoffice-kit/package.json')
  const source = await readFile(require.resolve('@deepseek-ai/libreoffice-kit'), 'utf8')
  const adapted = adaptLibreOfficeKit(source, manifest.version)
  const declaration = adapted.match(/const root = dirname\(packageFile\)[^;]+;/u)?.[0]
  assert(declaration)
  const rootOf = Function('dirname', 'packageFile', `${declaration} return root`)
  assert.equal(rootOf(dirname, 'C:/app/resources/app.asar/node_modules/engine/package.json'), 'C:/app/resources/app.asar.unpacked/node_modules/engine')
  assert.equal(rootOf(dirname, 'C:/profile/engine/package.json'), 'C:/profile/engine')
  assert.throws(() => adaptLibreOfficeKit(source, 'unreviewed'), /configured version/)
  assert.throws(() => adaptLibreOfficeKit('changed upstream', manifest.version), /anchor changed/)
})
