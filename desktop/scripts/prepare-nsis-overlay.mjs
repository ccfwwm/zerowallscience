import { stageRoot } from '../../tools/build/paths.mjs'
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
extraction = extraction.replace(extractMacro, `!macro extractUsing7za FILE
  Push $OUTDIR
  CreateDirectory "$PLUGINSDIR\\7z-out"
  SetOutPath "$PLUGINSDIR\\7z-out"
  Nsis7z::Extract "\${FILE}"
  Pop $R0
  SetOutPath $R0
  File /oname=$PLUGINSDIR\\zerowall-copy-files.mjs "${resolve(desktop, '../tools/commands/installer-copy-files.mjs')}"
  File /oname=$PLUGINSDIR\\zerowall-owned-files.ps1 "${resolve(desktop, '../tools/commands/uninstall-owned-files.ps1')}"
  ; CopyFiles silently omits MAX_PATH files. The bundled Node API handles
  ; long Unicode paths and reports every incomplete copy as an install error.
  System::Call 'kernel32::SetEnvironmentVariableW(w "ELECTRON_RUN_AS_NODE", w "1")'
  nsExec::ExecToStack '"$PLUGINSDIR\\7z-out\\ZeroWallScience.exe" "$PLUGINSDIR\\zerowall-copy-files.mjs" "$PLUGINSDIR\\7z-out" "$INSTDIR" --move-source --log "$ZeroWallLogFile"'
  Pop $R0
  Pop $R1
  !insertmacro ZW_LOG "transaction-exit=$R0; $R1"
  System::Call 'kernel32::SetEnvironmentVariableW(w "ELECTRON_RUN_AS_NODE", p 0)'
  \${If} $R0 != 0
    \${If} $ZeroWallUiState != ""
      WriteINIStr "$ZeroWallUiState" "Install" "Error" "安装失败（退出码 $R0）。日志：$ZeroWallLogFile"
    \${EndIf}
    MessageBox MB_OK|MB_ICONSTOP "应用文件安装失败（退出码 $R0）。日志：$ZeroWallLogFile。Python 和用户文件已保留。"
    SetErrorLevel 2
    Abort
  \${EndIf}
!macroend`)
await writeFile(resolve(output, 'extractAppPackage.nsh'), extraction)
console.log('Prepared NSIS in-place upgrade section from electron-builder 26.15.3')

await mkdir(resolve(desktop, 'out'), { recursive: true })
await writeFile(resolve(desktop, 'out/installer-paths.nsh'), '!define ZW_NSIS_OVERLAY "'+output+'"\n!define ZW_UI_BINARY "'+resolve(stageRoot, 'installer-ui/modern-installer.exe')+'"\n')
