/**
 * Icon resolution engine tests (src/client/resolve-icon.ts over the
 * generated vscode-icons manifest): pin the VSCode-style matching semantics
 * — exact filename, permissive (case-insensitive) filename, extension
 * candidates longest-first each exact-then-permissive, folder open/closed +
 * permissive, the light variants, the bundled defaults — and guard the
 * manifest↔assets contract: every icon file the maps reference must ship in
 * icons/ (a missing SVG breaks the row, not just the beauty).
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ICON_THEME } from '../src/client/icons-manifest.generated.ts'
import { extCandidates, iconUrl, resolveFileIcon, resolveFolderIcon } from '../src/client/resolve-icon.ts'

const ICONS_DIR = join(process.cwd(), 'icons')

describe('extCandidates (termination + semantics)', () => {
  it('enumerates every dot-to-end suffix, shortest first', () => {
    expect(extCandidates('archive.tar.gz')).toEqual(['gz', 'tar.gz'])
    expect(extCandidates('a.d.ts')).toEqual(['ts', 'd.ts'])
    expect(extCandidates('file.v1.js')).toEqual(['js', 'v1.js'])
    expect(extCandidates('test.js')).toEqual(['js'])
  })

  it('never loops or yields candidates for a leading-dot name', () => {
    // Regression: `'.hidden1'.lastIndexOf('.', -1)` clamps to 0 and re-finds
    // the leading dot — the old loop grew the array forever and froze the
    // page the first time a dotfile row rendered (node_modules' hidden
    // files). A leading dot is not an extension separator (VSCode's
    // extname('.hidden1') is ''), so no candidates.
    expect(extCandidates('.hidden1')).toEqual([])
    expect(extCandidates('.gitignore')).toEqual([])
    // A dot INSIDE the tail is still a separator (VSCode matches these).
    expect(extCandidates('.modules.yaml')).toEqual(['yaml'])
    expect(extCandidates('.package-map.json')).toEqual(['json'])
    expect(extCandidates('.pnpm-workspace-state-v1.json')).toEqual(['json'])
  })
})

describe('resolveFileIcon (VSCode better-sidebar-icons semantics)', () => {
  it('matches exact filenames', () => {
    expect(resolveFileIcon('package.json', false)).toBe('file_type_npm.svg')
    expect(resolveFileIcon('LICENSE', false)).toBe('file_type_license.svg')
    expect(resolveFileIcon('.gitignore', false)).toBe('file_type_git.svg')
    expect(resolveFileIcon('Dockerfile', false)).toBe('file_type_docker.svg')
  })

  it('falls back to permissive (case-insensitive) filename matching', () => {
    expect(resolveFileIcon('PACKAGE.JSON', false)).toBe(ICON_THEME.fileNames['package.json'])
    expect(resolveFileIcon('dockerfile', false)).toBe('file_type_docker.svg')
    expect(resolveFileIcon('DOCKERFILE', false)).toBe('file_type_docker.svg')
  })

  it('matches extensions (exact and case-insensitive)', () => {
    expect(resolveFileIcon('index.ts', false)).toBe('file_type_typescript.svg')
    expect(resolveFileIcon('INDEX.TS', false)).toBe('file_type_typescript.svg')
    expect(resolveFileIcon('foo.js', false)).toBe('file_type_js.svg')
    expect(resolveFileIcon('notes.md', false)).toBe('file_type_markdown.svg')
    expect(resolveFileIcon('main.py', false)).toBe('file_type_python.svg')
  })

  it('tries every dot-to-end extension candidate, longest first', () => {
    // Multi-dot keys match suffix segments (vscode-docs: "lib.d.ts can
    // match multiple extensions; 'd.ts' and 'ts'"), longest first — so
    // 'x.test.js' (a glob-expanded 'test' × 'js' filename pattern in the
    // manifest) beats the bare 'js' extension…
    expect(resolveFileIcon('x.test.js', false)).toBe('file_type_testjs.svg')
    // …while a single-dot file named exactly 'test.js' only exposes the
    // 'js' segment and gets the plain JS icon.
    expect(resolveFileIcon('test.js', false)).toBe('file_type_js.svg')
    // 'archive.tar.gz' has no 'tar.gz' key; the shorter 'gz' candidate wins.
    expect(resolveFileIcon('archive.tar.gz', false)).toBe('file_type_zip.svg')
    // 'a.d.ts' prefers the longer 'd.ts' segment over 'ts' (exactly the
    // vscode-docs example: "lib.d.ts can match 'd.ts' and 'ts'").
    expect(resolveFileIcon('a.d.ts', false)).toBe('file_type_typescriptdef.svg')
    expect(resolveFileIcon('lib.d.ts', false)).toBe('file_type_typescriptdef.svg')
  })

  it('falls back to the bundled default file icon', () => {
    expect(resolveFileIcon('no-extension-file', false)).toBe(ICON_THEME.defaults.file)
    expect(resolveFileIcon('weird.xyz', false)).toBe(ICON_THEME.defaults.file)
    expect(resolveFileIcon('weird.xyz', true)).toBe(ICON_THEME.defaults.file)
    // Regression: dotfile rows must resolve (and terminate) — the old
    // extCandidates loop froze the page on these (node_modules' hidden
    // files). No-leading-dot-only names hit the default; names with a dot
    // in the tail still match their extension (VSCode semantics).
    expect(resolveFileIcon('.hidden1', false)).toBe(ICON_THEME.defaults.file)
    expect(resolveFileIcon('.modules.yaml', false)).toBe(ICON_THEME.fileExtensions['yaml'])
    expect(resolveFileIcon('.package-map.json', false)).toBe(ICON_THEME.fileExtensions['json'])
  })

  it('resolves the light variants where the upstream set ships them', () => {
    // 'ada' is a light-only icon in upstream: the light scheme points at the
    // light file, the dark scheme at the shared dark file.
    const dark = resolveFileIcon('hello.ada', false)
    const light = resolveFileIcon('hello.ada', true)
    const map = ICON_THEME.fileExtensions as Record<string, string>
    expect(dark).toBe(map['ada'])
    expect(light).toBe('file_type_light_ada.svg')
    expect(existsSync(join(ICONS_DIR, light))).toBe(true)
  })

  it('never resolves an unknown name to a folder icon', () => {
    const file = resolveFileIcon('node_modules', false)
    expect(file.startsWith('folder_')).toBe(false)
  })
})

describe('resolveFolderIcon (open/closed + permissive)', () => {
  it('matches folder names exactly (closed and open)', () => {
    expect(resolveFolderIcon('src', false, false)).toBe('folder_type_src.svg')
    expect(resolveFolderIcon('src', true, false)).toBe('folder_type_src_opened.svg')
    expect(resolveFolderIcon('node_modules', false, false)).toBe('folder_type_node.svg')
    expect(resolveFolderIcon('.github', false, false)).toBe('folder_type_github.svg')
  })

  it('matches folder names case-insensitively', () => {
    expect(resolveFolderIcon('SRC', false, false)).toBe('folder_type_src.svg')
    expect(resolveFolderIcon('Src', true, false)).toBe('folder_type_src_opened.svg')
  })

  it('falls back to the bundled default folder icons for unknowns', () => {
    expect(resolveFolderIcon('totally-unknown-dir', false, false)).toBe(ICON_THEME.defaults.folder)
    expect(resolveFolderIcon('totally-unknown-dir', true, false)).toBe(ICON_THEME.defaults.folderOpen)
    expect(resolveFolderIcon('totally-unknown-dir', false, true)).toBe(ICON_THEME.defaults.folder)
  })

  it('resolves light folder variants when upstream ships them', () => {
    const light = resolveFolderIcon('node_modules', true, true)
    expect(light).toBe(ICON_THEME.folderNamesOpenLight['node_modules'])
    // The dark scheme keeps the dark file.
    expect(resolveFolderIcon('node_modules', true, false)).toBe(ICON_THEME.folderNamesOpen['node_modules'])
  })
})

describe('iconUrl', () => {
  it('builds the plugin route URL (same-origin, encoded)', () => {
    expect(iconUrl('file_type_ts.svg')).toBe('/dsh-better-sidebar-icons/icons/file_type_ts.svg')
    expect(iconUrl('weird name.svg')).toBe('/dsh-better-sidebar-icons/icons/weird%20name.svg')
  })
})

describe('manifest ↔ assets consistency (every referenced SVG ships)', () => {
  it('every icon file referenced by any map or default exists in icons/', () => {
    const referenced = new Set<string>()
    for (const map of [
      ICON_THEME.fileNames,
      ICON_THEME.fileExtensions,
      ICON_THEME.fileNamesLight,
      ICON_THEME.fileExtensionsLight,
      ICON_THEME.folderNames,
      ICON_THEME.folderNamesOpen,
      ICON_THEME.folderNamesLight,
      ICON_THEME.folderNamesOpenLight,
    ]) {
      for (const file of Object.values(map)) referenced.add(file)
    }
    for (const file of Object.values(ICON_THEME.defaults)) referenced.add(file)
    const missing = [...referenced].filter(file => !existsSync(join(ICONS_DIR, file)))
    expect(missing, `missing icon assets: ${missing.join(', ')}`).toEqual([])
    for (const file of referenced) {
      const size = readFileSync(join(ICONS_DIR, file)).length
      expect(size, `${file} is empty`).toBeGreaterThan(0)
    }
  })

  it('light values either point at an existing light file or the dark file', () => {
    const lightMap = ICON_THEME.fileExtensionsLight as Record<string, string>
    const darkMap = ICON_THEME.fileExtensions as Record<string, string>
    for (const key of Object.keys(lightMap)) {
      const light = lightMap[key]!
      const dark = darkMap[key]!
      if (light === dark) continue
      expect(existsSync(join(ICONS_DIR, light)), `${light} (from '${key}')`).toBe(true)
    }
  })

  it('folder light maps are subsets of the dark key sets (fallback works)', () => {
    for (const key of Object.keys(ICON_THEME.folderNamesLight)) {
      expect(Object.prototype.hasOwnProperty.call(ICON_THEME.folderNames, key), `folderNames has ${key}`).toBe(true)
    }
    for (const key of Object.keys(ICON_THEME.folderNamesOpenLight)) {
      expect(Object.prototype.hasOwnProperty.call(ICON_THEME.folderNamesOpen, key), `folderNamesOpen has ${key}`).toBe(true)
    }
  })
})
