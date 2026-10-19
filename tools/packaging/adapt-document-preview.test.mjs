import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { adaptDocumentPreview, adaptExcelChunk } from './adapt-document-preview.mjs'
import { pinnedDsh } from './adapt-reviewed-dsh.mjs'

test('pinned compiled Excel chunks retain diagnostics and avoid resize/formula render loops', async () => {
  for (const [file, adapt] of [['client.js', adaptDocumentPreview], ['client.excel.js', adaptExcelChunk]]) {
    const source = await readFile(new URL(`../../deepseek-harness/packages/client/ui-sidebar-documentpreview/lib/${file}`, import.meta.url), 'utf8')
    const adapted = adapt(source, pinnedDsh.version)
    const syntax = spawnSync(process.execPath, ['--check'], { input: adapted, encoding: 'utf8' })
    assert.equal(syntax.status, 0, syntax.stderr)
    if (file === 'client.js') {
      assert.match(adapted, /class ZeroWallExcelBoundary/)
      assert.match(adapted, /switchViewer\('office-pdf'\)/)
    } else {
      assert.match(adapted, /readonlyHighlight.current !== key/)
      assert.match(adapted, /cancelAnimationFrame\(resizeFrame\)/)
      assert.match(adapted, /cellContextMenu: stableMenus.cell/)
      assert.match(adapted, /throw new Error\("Excel Worker parsing:/)
    }
    assert.throws(() => adapt(source, 'unreviewed'), /Review/)
    assert.throws(() => adapt('changed upstream structure', pinnedDsh.version), /anchor/)
  }
})
