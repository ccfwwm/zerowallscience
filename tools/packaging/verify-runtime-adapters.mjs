import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { adaptLibreOfficeKit } from './adapt-libreoffice-kit.mjs'
import { adaptDocumentPreview, adaptExcelChunk } from './adapt-document-preview.mjs'
import { adaptConversationClient } from './adapt-conversation.mjs'
import { adaptSessionDelete } from './adapt-session-delete.mjs'
import { adaptDirectoryPicker } from './adapt-directory-picker.mjs'
import { adaptBetterSidebarClient } from './adapt-better-sidebar.mjs'
import { adaptDreamSkinClient, adaptDreamSkinHost } from './adapt-dream-skin.mjs'
import * as zotero from './adapt-zotero.mjs'

const root = resolve(import.meta.dirname, '../..')
const desktopRequire = createRequire(join(root, 'desktop/package.json'))
const officeRequire = createRequire(join(root, 'deepseek-harness/packages/document/office-to-pdf/package.json'))
const pptRequire = createRequire(join(root, 'plugins/dsh-ppt-maker/package.json'))

/** Validate every runtime rewrite against freshly compiled, pinned inputs before copying any assembly. */
export async function verifyRuntimeAdapters() {
  const checks = []
  const dsh = 'deepseek-harness/packages/'
  const rows = [
    [dsh + 'client/ui-sidebar-documentpreview', 'lib/client.js', adaptDocumentPreview],
    [dsh + 'client/ui-sidebar-documentpreview', 'lib/client.excel.js', adaptExcelChunk],
    [dsh + 'client/ui-conversation', 'lib/client.js', adaptConversationClient],
    [dsh + 'client/ui-workspace', 'lib/client.js', adaptSessionDelete],
    [dsh + 'host/directory-picker-native', 'lib/worker.cjs', adaptDirectoryPicker],
    [dsh + 'host/directory-picker-native', 'lib/types/win32-dialog-bindings.js', adaptDirectoryPicker],
    ['plugins/dsh-better-sidebar', 'lib/client.js', adaptBetterSidebarClient],
    [dirname(desktopRequire.resolve('dsh-dream-skin/package.json')), 'lib/client.js', adaptDreamSkinClient],
    [dirname(desktopRequire.resolve('dsh-dream-skin/package.json')), 'lib/index.js', adaptDreamSkinHost],
    [dirname(officeRequire.resolve('@deepseek-ai/libreoffice-kit/package.json')), 'lib/index.js', adaptLibreOfficeKit],
    [dirname(pptRequire.resolve('@deepseek-ai/libreoffice-kit/package.json')), 'lib/index.js', adaptLibreOfficeKit],
  ]
  const zoteroRoot = dirname(desktopRequire.resolve('dsh-zotero/package.json'))
  for (const [file, adapt, optional] of [
    ['package.json', zotero.adaptZoteroManifest], ['lib/command.js', zotero.adaptZoteroCommand],
    ['lib/client.js', zotero.adaptZoteroClient], ['lib/item-graph.js', zotero.adaptZoteroItemGraph, true],
    ['lib/local/detail.js', zotero.adaptZoteroDetail, true], ['lib/remote.js', zotero.adaptZoteroRemote],
    ['lib/contract.js', zotero.adaptZoteroContract, true], ['lib/status-codec.js', zotero.adaptZoteroStatusCodec, true],
  ]) rows.push([zoteroRoot, file, adapt, optional])
  for (const [directory, file, adapt, optional] of rows) {
    const packageRoot = resolve(root, directory)
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    const source = await readFile(join(packageRoot, file), 'utf8').catch(error => {
      if (optional && error.code === 'ENOENT') return undefined
      throw error
    })
    if (source === undefined) continue
    const output = adapt(source, manifest.version)
    if (file === 'package.json') JSON.parse(output)
    else {
      const syntax = spawnSync(process.execPath, ['--check', ...(file.endsWith('.cjs') ? ['--input-type=commonjs'] : ['--input-type=module'])], { input: output, encoding: 'utf8' })
      if (syntax.status !== 0) throw new Error(`Invalid adapted ${manifest.name}/${file}: ${syntax.stderr}`)
    }
    checks.push({ package: manifest.name, version: manifest.version, file })
  }
  console.log(`Verified ${checks.length} runtime adapters against compiled pinned packages`)
  return checks
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await verifyRuntimeAdapters()
