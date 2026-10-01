import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { adaptLibreOfficeKit } from '../../tools/packaging/adapt-libreoffice-kit.mjs'
import { adaptDocumentPreview, adaptExcelChunk } from '../../tools/packaging/adapt-document-preview.mjs'
import { adaptUniverSkill, UNIVER_SKILL_HASHES } from '../../tools/packaging/adapt-univer-office.mjs'
const root = resolve(import.meta.dirname, '../..')
test('physical engine adapter is exact-version bounded and preserves the engine resource root', () => {
  assert.match(adaptLibreOfficeKit('const root = dirname(packageFile);', '0.1.2'), /app\.asar\.unpacked/u)
  assert.throws(() => adaptLibreOfficeKit('changed', '0.1.2'), /anchor/u)
  assert.throws(() => adaptLibreOfficeKit('const root = dirname(packageFile);', '0.1.3'), /version/u)
})
test('native Excel boundary catches lazy/Worker/render errors and offers viewer switching', async () => {
  const source = await readFile(resolve(root, 'deepseek-harness/packages/client/ui-sidebar-documentpreview/lib/client.js'), 'utf8')
  const adapted = adaptDocumentPreview(source, '0.2.0-rc.2')
  assert.match(adapted, /getDerivedStateFromError/u)
  assert.match(adapted, /zerowall:viewer-switch/u)
  assert.match(adapted, /SHA-256/u)
  assert.throws(() => adaptDocumentPreview(source, 'other'), /rc\.2/u)
  const chunk = await readFile(resolve(root, 'deepseek-harness/packages/client/ui-sidebar-documentpreview/lib/client.excel.js'), 'utf8')
  const stable = adaptExcelChunk(chunk, '0.2.0-rc.2')
  assert.match(stable, /react\.useMemo/u)
  assert.match(stable, /cellContextMenu: stableMenus\.cell/u)
  assert.match(stable, /requestAnimationFrame/u)
  assert.match(stable, /width === previousWidth && height === previousHeight/u)
  assert.match(stable, /cancelAnimationFrame/u)
  assert.match(stable, /readonlyHighlight\.current !== key/u)
  assert.throws(() => adaptExcelChunk(chunk, 'other'), /rc\.2/u)
  assert.throws(() => adaptExcelChunk(chunk.replace('cellContextMenu: ["copy"]', 'cellContextMenu: undefined'), '0.2.0-rc.2'), /anchors/u)
  assert.throws(() => adaptExcelChunk(chunk.replace('if (!context.allowEdit) setContext(function(ctx)', 'if (context.allowEdit) setContext(function(ctx)'), '0.2.0-rc.2'), /highlight anchor/u)
})
test('Univer skill adaptation rejects unexpected bytes instead of blindly changing upstream instructions', () => {
  for (const name of Object.keys(UNIVER_SKILL_HASHES)) assert.throws(() => adaptUniverSkill(name, 'unexpected', '0.3.5', 'ce7f3e0bfa1e9b6bc4eb855e1c220b77fcdab806'), /hash/u)
})
