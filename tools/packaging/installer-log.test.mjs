import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const compiler = resolve('artifacts/cache/electron-builder/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe')
test('native NSIS log macros append Unicode phases even with an inherited error flag', { skip: process.platform !== 'win32' || !existsSync(compiler) }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'zws-installer-log-'))
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
