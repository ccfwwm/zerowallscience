import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

// Retain electron-builder's signed uninstaller generation and installer engine.
// Override only its install section so an upgrade does not invoke an old
// uninstaller that may recursively delete files placed next to the application.
const desktop = resolve(import.meta.dirname, '..')
const requireBuilder = createRequire(await realpath(resolve(desktop, 'node_modules/electron-builder/package.json')))
const builder = dirname(requireBuilder.resolve('app-builder-lib/package.json'))
const manifest = JSON.parse(await readFile(resolve(builder, 'package.json'), 'utf8'))
if (manifest.version !== '26.15.3') throw new Error('Review the NSIS upgrade adaptation before changing electron-builder')
const templates = resolve(builder, 'templates/nsis')
let section = (await readFile(resolve(templates, 'installSection.nsh'), 'utf8')).replaceAll('\r\n', '\n')
const old = `!insertmacro uninstallOldVersion SHELL_CONTEXT
!insertmacro handleUninstallResult SHELL_CONTEXT

\${if} $installMode == "all"
  !insertmacro uninstallOldVersion HKEY_CURRENT_USER
  !insertmacro handleUninstallResult HKEY_CURRENT_USER
\${endIf}`
if (section.split(old).length !== 2) throw new Error('Unexpected upstream uninstall sequence')
section = section.replace('!include installer.nsh', `!include "${resolve(templates, 'include/installer.nsh')}"`)
section = section.replace(old, `; ZeroWall in-place upgrade: do not invoke an earlier uninstaller.
; Only these shipped runtime directories are replaced; user files stay intact.
DetailPrint "正在原位置覆盖升级，保留项目与用户数据..."
RMDir /r "$INSTDIR\\resources\\app.asar.unpacked"
RMDir /r "$INSTDIR\\resources\\skills"
RMDir /r "$INSTDIR\\resources\\profiles"
RMDir /r "$INSTDIR\\resources\\licenses"`)
const output = resolve(desktop, '../.build/nsis-overlay')
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'installSection.nsh'), `${section}\n!cd "${templates}"\n`)
let utilities = (await readFile(resolve(templates, 'include/installUtil.nsh'), 'utf8')).replaceAll('\r\n', '\n')
for (const name of ['handleUninstallResult', 'uninstallOldVersion', 'GetInQuotes', 'GetFileParent']) {
  const definition = new RegExp(`^Function ${name}\\n[\\s\\S]*?^FunctionEnd\\n`, 'gm')
  if ([...utilities.matchAll(definition)].length !== 1) throw new Error(`Unexpected upstream ${name} definition`)
  utilities = utilities.replace(definition, '')
}
await writeFile(resolve(output, 'installUtil.nsh'), utilities)
console.log('Prepared NSIS in-place upgrade section from electron-builder 26.15.3')
