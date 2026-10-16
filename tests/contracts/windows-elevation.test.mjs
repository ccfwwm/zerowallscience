import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const read = name => readFile(resolve(root, name), 'utf8')

test('Windows packaged runtime requests elevation for plugin profile operations', async () => {
  const [builder, installer, offlineProfile, legacyProfile] = await Promise.all([
    read('desktop/build/electron-builder.base.cjs'),
    read('desktop/build/installer.nsh'),
    read('tools/commands/offline-profile.mjs'),
    read('tools/commands/legacy-cli-profile.mjs'),
  ])

  assert.match(builder, /win:\s*\{[\s\S]*requestedExecutionLevel:\s*'requireAdministrator'/u)
  assert.match(builder, /nsis:\s*\{[\s\S]*allowElevation:\s*true/u)
  assert.match(installer, /!macro customHeader[\s\S]*RequestExecutionLevel admin[\s\S]*!macroend/u)
  assert.doesNotMatch(installer, /UAC_RunElevated|StdUtils\.ExecShellAsUser/u)
  assert.match(installer, /entry-token=administrator/u)
  assert.match(installer, /Exec '"\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}"'/u)
  assert.match(offlineProfile, /process\.platform === 'win32' \? 'junction' : 'dir'/u)
  assert.match(legacyProfile, /process\.platform === 'win32' \? 'junction' : 'dir'/u)
})
