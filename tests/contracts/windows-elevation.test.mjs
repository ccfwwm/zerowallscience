import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const read = name => readFile(resolve(root, name), 'utf8')

test('Windows preserves user identity and elevates only protected installer writes', async () => {
  const [builder, installer, offlineProfile, legacyProfile] = await Promise.all([
    read('desktop/build/electron-builder.base.cjs'),
    read('desktop/build/installer.nsh'),
    read('tools/commands/offline-profile.mjs'),
    read('tools/commands/legacy-cli-profile.mjs'),
  ])

  assert.match(builder, /win:\s*\{[\s\S]*requestedExecutionLevel:\s*'asInvoker'/u)
  assert.match(builder, /nsis:\s*\{[\s\S]*allowElevation:\s*true/u)
  assert.match(installer, /!macro customHeader[\s\S]*RequestExecutionLevel user[\s\S]*!macroend/u)
  assert.match(installer, /--can-write[\s\S]*UAC_RunElevated/u)
  assert.match(installer, /UAC_AsUser_Call Function ZeroWallRegisterUser|ZeroWallUserPath/u)
  assert.match(installer, /UAC_AsUser_GetGlobal \$INSTDIR \$ZeroWallSelectedDirectory/u)
  assert.match(installer, /UAC_AsUser_ExecShell/u)
  assert.match(offlineProfile, /materializeOfflinePackages/u)
  assert.match(legacyProfile, /process\.platform === 'win32' \? 'junction' : 'dir'/u)
})
