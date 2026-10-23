import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const compiler = resolve('artifacts/cache/electron-builder/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe')
test('native NSIS log macros append Unicode phases even with an inherited error flag', { skip: process.platform !== 'win32' || !existsSync(compiler) }, t => {
  const directory = mkdtempSync(join(tmpdir(), 'zws-installer-log-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const source = readFileSync(resolve('desktop/build/installer.nsh'), 'utf8')
  const macros = source.match(/!macro ZW_LOG[\s\S]*?!macroend\r?\n!macro ZW_PHASE[\s\S]*?!macroend/u)?.[0]
  assert(macros)
  const script = join(directory, 'test.nsi'), exe = join(directory, 'test.exe')
  const log = join(directory, 'install.log'), perf = join(directory, 'performance.log')
  writeFileSync(script, '\uFEFF' + `Unicode true
!include LogicLib.nsh
Name "ZeroWall installer log test"
OutFile "${exe}"
RequestExecutionLevel user
SilentInstall silent
Var ZeroWallLogFile
Var ZeroWallPerfFile
Var ZeroWallUiState
${macros}
Section
StrCpy $ZeroWallLogFile "${log}"
StrCpy $ZeroWallPerfFile "${perf}"
!insertmacro ZW_LOG "entry-token=administrator-fixture"
SetErrors
!insertmacro ZW_PHASE "preflight"
!insertmacro ZW_LOG "copy-exit=0; Chinese 日志"
!insertmacro ZW_PHASE "complete"
SectionEnd
`)
  execFileSync(compiler, ['/V2', '/INPUTCHARSET', 'UTF8', script], { windowsHide: true })
  execFileSync(exe, [], { windowsHide: true })
  const text = readFileSync(log, 'utf16le').replace(/^\uFEFF/u, '')
  const lines = text.trim().split(/\r?\n/u)
  assert.equal(lines.length, 4)
  assert(lines.every(line => /^\d+\|/u.test(line)), text)
  assert.match(text, /entry-token=administrator-fixture[\s\S]*phase=preflight[\s\S]*copy-exit=0; Chinese 日志[\s\S]*phase=complete/u)
  assert.match(readFileSync(perf, 'utf8'), /^\d+\|preflight\r?\n\d+\|complete\r?\n$/u)
})

test('extraction transaction and staging elevation compile with the cached NSIS plugins', { skip: process.platform !== 'win32' || !existsSync(compiler) }, () => {
  const root = resolve('node_modules/.pnpm')
  const appBuilder = readdirSync(root).find(name => name.startsWith('app-builder-lib@26.17.0_'))
  const resourceRoot = resolve('artifacts/cache/electron-builder/nsis-resources-3.4.1')
  const nsisResources = readdirSync(resourceRoot).find(name => name.startsWith('nsis-resources-3.4.1-'))
  assert(appBuilder, 'app-builder-lib NSIS templates are installed')
  assert(nsisResources, 'cached NSIS resource plugins are installed')
  const include = resolve(root, appBuilder, 'node_modules/app-builder-lib/templates/nsis/include')
  const plugin = resolve(resourceRoot, nsisResources, 'plugins/x86-unicode')
  const installer = readFileSync(resolve('desktop/build/installer.nsh'), 'utf8')
  const macros = installer.match(/!macro ZW_LOG[\s\S]*?!macroend\r?\n!macro ZW_PHASE[\s\S]*?!macroend/u)?.[0]
  const wait = installer.match(/Function ZeroWallWaitSelection[\s\S]*?FunctionEnd/u)?.[0]
  assert(macros)
  assert(wait)
  const extraction = readFileSync(resolve('desktop/build/installer-extraction.nsh'), 'utf8')
  const directory = mkdtempSync(join(tmpdir(), 'zws-installer-uac-'))
  try {
    const script = join(directory, 'uac-branch.nsi')
    const exe = join(directory, 'uac-branch.exe')
    const fixture = join(directory, 'payload-fixture')
    writeFileSync(fixture, 'compile-only fixture; never executed')
    writeFileSync(script, '\uFEFF' + [
      'Unicode true', '!include LogicLib.nsh', `!addplugindir "${plugin}"`, `!include "${include}\\UAC.nsh"`,
      'Name "ZeroWall UAC branch compile test"', `OutFile "${exe}"`, 'RequestExecutionLevel user',
      '!define APP_EXECUTABLE_FILENAME "fixture.exe"',
      `!define ZW_UI_BINARY "${fixture}"`, '!define ZW_PAYLOAD_BYTES "1"', '!define ZW_HELPER_BYTES "1"', '!define ZW_PAYLOAD_PATH "fixture"',
      ...['ZeroWallFailureStage', 'ZeroWallFailureCode', 'ZeroWallFailureReason', 'ZeroWallRollbackState', 'ZeroWallStagingElevationAttempted', 'ZeroWallSelectedDirectory', 'ZeroWallSelectedMode', 'ZeroWallPayloadDirectory', 'ZeroWallAttempt', 'ZeroWallUiState', 'ZeroWallUiProcess', 'ZeroWallLogFile', 'ZeroWallPerfFile', 'installMode', 'appExe'].map(name => `Var ${name}`),
      '!macro setLinkVars', '!macroend', macros, wait,
      extraction.replaceAll('@ZW_COPY_SCRIPT@', fixture).replaceAll('@ZW_UNINSTALL_SCRIPT@', fixture),
      'Section', '!insertmacro extractUsing7za "compile-only.7z"', 'SectionEnd', '',
    ].join('\r\n'))
    execFileSync(compiler, ['/V2', '/INPUTCHARSET', 'UTF8', script], { windowsHide: true })
    assert.equal(existsSync(exe), true)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
