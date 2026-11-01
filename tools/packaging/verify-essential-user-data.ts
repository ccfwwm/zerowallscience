/** Read-only local investigation: recovery runs exclusively on temporary copies
 * of settings. Never launch or mutate either real user profile. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parse } from 'yaml'
import { recoverEssentialUserData } from '../../desktop/src/main/essential-user-data.js'
import { openWindowsProfileEncryption } from '../../desktop/src/main/credentials/windows-profile.js'

const temporary = await mkdtemp(join(tmpdir(), 'zws-local-recovery-verification-'))
const source = join(temporary, 'legacy'), secondary = join(temporary, 'secondary'), target = join(temporary, 'current')
const files = ['Local State', 'credentials/vault.json', 'harness/storages/workspace.json', 'harness/.credentials.yaml', 'harness/profiles/web/cordis.patch.yml']
const sources = [join(process.env.APPDATA!, 'zerowall-science'), join(process.env.APPDATA!, 'zerowall-science-3'), join(process.env.LOCALAPPDATA!, 'zerowall-science')]
const originals = new Map<string, Buffer>()
try {
  for (const [index, root] of [source, secondary, target].entries()) for (const file of files) {
    const from = join(sources[index]!, file), to = join(root, file)
    try {
      const bytes = await readFile(from); originals.set(from, bytes)
      await mkdir(dirname(to), { recursive: true }); await writeFile(to, bytes, { mode: 0o600 })
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  const encryption = await openWindowsProfileEncryption(target), oldEncryption = await openWindowsProfileEncryption(source)
  try {
    const result = await recoverEssentialUserData({ enabled: true, userDataPath: target, legacyRoots: [source, secondary], encryption })
    const oldVault = JSON.parse(await readFile(join(source, 'credentials/vault.json'), 'utf8'))
    const newVault = JSON.parse(await readFile(join(target, 'credentials/vault.json'), 'utf8'))
    const oldWorkspace = JSON.parse(await readFile(join(source, 'harness/storages/workspace.json'), 'utf8'))
    const newWorkspace = JSON.parse(await readFile(join(target, 'harness/storages/workspace.json'), 'utf8'))
    let decrypted = 0
    for (const value of Object.values(newVault.entries) as string[]) { encryption.decrypt(Buffer.from(value, 'base64')); decrypted++ }
    for (const suffix of ['login', 'session']) {
      const key = `zerowall.ai-cloud.${suffix}`
      if (oldVault.entries[key]) assert.ok(encryption.decrypt(Buffer.from(newVault.entries[key], 'base64')) === oldEncryption.decrypt(Buffer.from(oldVault.entries[key], 'base64')), 'Legacy account credential was not restored intact')
    }
    const oldPatch = parse(await readFile(join(source, 'harness/profiles/web/cordis.patch.yml'), 'utf8'))
    const newPatch = parse(await readFile(join(target, 'harness/profiles/web/cordis.patch.yml'), 'utf8'))
    const currentPatch = parse(originals.get(join(sources[2]!, 'harness/profiles/web/cordis.patch.yml'))?.toString() ?? '[]')
    for (const id of ['agent-default-model', 'zerowall-environment']) {
      const oldConfig = oldPatch.find((row: any) => row.id === id)?.config
      const newConfig = newPatch.find((row: any) => row.id === id)?.config
      const currentConfig = currentPatch.find((row: any) => row.id === id)?.config
      for (const key of ['provider', 'model', 'reasoningEffort', 'imageModel', 'imageQuality', 'contextBudgetTokens']) {
        const expected = currentConfig?.[key] ?? oldConfig?.[key]
        if (expected !== undefined) assert.ok(JSON.stringify(expected) === JSON.stringify(newConfig?.[key]), 'A selected model or image parameter changed')
      }
    }
    assert.ok(Object.keys(oldWorkspace.tables.workspaces).every(id => newWorkspace.tables.workspaces[id]), 'A workspace was lost')
    for (const [path, bytes] of originals) assert.ok((await readFile(path)).equals(bytes), 'A live settings file changed during read-only verification')
    const report = { passed: true, realProfilesWritten: false, temporarySettingsOnly: true, ...result, decryptableCredentials: decrypted,
      sourceWorkspaces: Object.keys(oldWorkspace.tables.workspaces).length, recoveredWorkspaces: Object.keys(newWorkspace.tables.workspaces).length, currentSelectionsPreservedAndMissingModelSettingsRestored: true }
    const output = resolve('artifacts/verification/8.4.21/essential-recovery/local-settings-fixture.json')
    await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally { encryption.dispose(); oldEncryption.dispose() }
} finally { await rm(temporary, { recursive: true, force: true, maxRetries: 3 }) }
