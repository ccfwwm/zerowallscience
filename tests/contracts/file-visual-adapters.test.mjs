import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
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
  for (const name of Object.keys(UNIVER_SKILL_HASHES)) assert.throws(() => adaptUniverSkill(name, 'unexpected', '0.3.7', '8f85ce4074fdbe51416b6c337468bb916a302c2a'), /hash/u)
  assert.throws(() => adaptUniverSkill('univer', 'unexpected', '0.3.5', 'ce7f3e0bfa1e9b6bc4eb855e1c220b77fcdab806'), /identity/u)
})
test('pinned Univer slide skill uses rich evidence and batch repair through the adapter', async () => {
  const installed = (await readdir(resolve(root, 'node_modules/.pnpm'))).find(name => name.startsWith('dsh-univer-office@0.3.7_'))
  assert(installed, 'Install the locked Univer dependency before contract verification.')
  const upstream = await readFile(resolve(root, 'node_modules/.pnpm', installed, 'node_modules/dsh-univer-office/skills/univer-slide/SKILL.md'), 'utf8')
  const adapted = adaptUniverSkill('univer-slide', upstream, '0.3.7', '8f85ce4074fdbe51416b6c337468bb916a302c2a')
  assert.match(adapted, /presentation_compile_pages/u)
  assert.match(adapted, /presentation-spec\.json/u)
  assert.match(adapted, /setSpeakerNotes/u)
  assert.match(adapted, /alpha PNG derivative/u)
  assert.match(adapted, /take precedence/u)
  assert.match(adapted, /automatic top-left kickers/u)
  assert.match(adapted, /no universal palette/u)
  assert.match(adapted, /presentation_set_chart_ticks/u)
  assert.match(adapted, /setYAxis facade drops interval\/majorUnit/u)
  assert.match(adapted, /separate univer_status tool/u)
  assert.match(adapted, /current PNGs already returned by presentation_check_pages/u)
  assert.match(adapted, /Native charts and tables are the deliberate exceptions/u)
  assert.doesNotMatch(adapted, /After batch construction, call `univer_screenshot` for every page|Clear every compiler warning/u)
  assert.doesNotMatch(adapted, /page generation needs no fresh decisions|Exact layout, tier\/card counts|Do not merge unless the user explicitly asks/u)
  assert.doesNotMatch(adapted, /Finish page N before authoring page N\+1\.|three generated style samples|speaker notes.*unsupported/u)
})
