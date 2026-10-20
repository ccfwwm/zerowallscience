import { stageRoot } from '../../tools/build/paths.mjs'
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'

// Retain electron-builder's signed uninstaller generation and installer engine.
// Override only its install section so an upgrade does not invoke an old
// uninstaller that may recursively delete files placed next to the application.
const desktop = resolve(import.meta.dirname, '..')
const requireBuilder = createRequire(await realpath(resolve(desktop, 'node_modules/electron-builder/package.json')))
const builder = dirname(requireBuilder.resolve('app-builder-lib/package.json'))
const manifest = JSON.parse(await readFile(resolve(builder, 'package.json'), 'utf8'))
const adaptation = JSON.parse(await readFile(resolve(desktop, '../config/build/nsis-adaptation.json'), 'utf8'))
if (adaptation.schema !== 1 || manifest.version !== adaptation.builderVersion) throw new Error('Review the NSIS upgrade adaptation before changing electron-builder')
for (const feature of ['current-user-default', 'uac-user-fallback', 'payload-capacity-preflight', 'fresh-payload-retry', 'phase-error-receipt', 'commit-before-registration', 'no-preinstall-uninstaller']) {
  if (!adaptation.features?.includes(feature)) throw new Error(`Missing reviewed NSIS adaptation feature: ${feature}`)
}
const templates = resolve(builder, 'templates/nsis')
for (const [file, expected] of Object.entries(adaptation.templates)) {
  const actual = createHash('sha256').update(await readFile(resolve(templates, file))).digest('hex')
  if (actual !== expected) throw new Error(`Review the changed NSIS template: ${file}`)
}
let section = (await readFile(resolve(templates, 'installSection.nsh'), 'utf8')).replaceAll('\r\n', '\n')
const old = `!insertmacro uninstallOldVersion SHELL_CONTEXT
!insertmacro handleUninstallResult SHELL_CONTEXT

\${if} $installMode == "all"
  !insertmacro uninstallOldVersion HKEY_CURRENT_USER
  !insertmacro handleUninstallResult HKEY_CURRENT_USER
\${endIf}`
if (section.split(old).length !== 2) throw new Error('Unexpected upstream uninstall sequence')
section = section.replace('!include installer.nsh', '; Installer macros are loaded by the ZeroWall header for original-user callbacks.')
section = section.replace('Var /GLOBAL keepShortcuts', '; keepShortcuts is declared by the ZeroWall header.')
const registrations = `!insertmacro registryAddInstallInfo\n!insertmacro addStartMenuLink $keepShortcuts\n!insertmacro addDesktopLink $keepShortcuts`
if (section.split(registrations).length !== 2) throw new Error('Unexpected upstream installation registration sequence')
section = section.replace(registrations, `\${If} \${UAC_IsInnerInstance}\n\${AndIf} $installMode != "all"\n  StrCpy $R7 $installMode\n  !insertmacro UAC_AsUser_Call Function ZeroWallRegisterUser \${UAC_SYNCREGISTERS}|\${UAC_SYNCINSTDIR}\n\${Else}\n  ${registrations}\n\${EndIf}`)
section = section.replace(old, `; Never invoke an earlier recursive uninstaller.
; Validate the incoming runtime before removing any installed application file.
DetailPrint "正在原位置覆盖升级，保留 Python 和用户文件..."`)
const output = resolve(stageRoot, 'nsis-overlay')
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'installSection.nsh'), `${section}\n!cd "${templates}"\n`)
let utilities = (await readFile(resolve(templates, 'include/installUtil.nsh'), 'utf8')).replaceAll('\r\n', '\n')
for (const name of ['handleUninstallResult', 'uninstallOldVersion', 'GetInQuotes', 'GetFileParent']) {
  const definition = new RegExp(`^Function ${name}\\n[\\s\\S]*?^FunctionEnd\\n`, 'gm')
  if ([...utilities.matchAll(definition)].length !== 1) throw new Error(`Unexpected upstream ${name} definition`)
  utilities = utilities.replace(definition, '')
}
await writeFile(resolve(output, 'installUtil.nsh'), utilities)
let extraction = (await readFile(resolve(templates, 'include/extractAppPackage.nsh'), 'utf8')).replaceAll('\r\n', '\n')
const extractMacro = /^!macro extractUsing7za FILE\n[\s\S]*?^!macroend/gm
if ([...extraction.matchAll(extractMacro)].length !== 1) throw new Error('Unexpected upstream archive extraction macro')
const transactionMacro = (await readFile(resolve(desktop, 'build/installer-extraction.nsh'), 'utf8'))
  .replaceAll('@ZW_COPY_SCRIPT@', resolve(desktop, '../tools/commands/installer-copy-files.mjs'))
  .replaceAll('@ZW_UNINSTALL_SCRIPT@', resolve(desktop, '../tools/commands/uninstall-owned-files.ps1'))
extraction = extraction.replace(extractMacro, () => transactionMacro.trimEnd())
await writeFile(resolve(output, 'extractAppPackage.nsh'), extraction)
await writeFile(resolve(output, 'installer-definitions.nsh'), `!include "${resolve(templates, 'include/installer.nsh')}"\n`)
console.log(`Prepared NSIS in-place upgrade section from electron-builder ${manifest.version}`)

await mkdir(resolve(desktop, 'out'), { recursive: true })
await writeFile(resolve(desktop, 'out/installer-paths.nsh'), '!define ZW_NSIS_OVERLAY "'+output+'"\n!define ZW_UI_BINARY "'+resolve(stageRoot, 'installer-ui/modern-installer.exe')+'"\n')
