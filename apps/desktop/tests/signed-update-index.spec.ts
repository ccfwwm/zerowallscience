/** Signed discovery cannot authorize damaged files or lose readiness across an offline launch. */
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { NsisUpdater } from 'electron-updater/out/NsisUpdater.js'
import { SignedDesktopUpdates, verifyDesktopUpdateIndex, type DesktopUpdateIndex } from '../src/signed-update-index.ts'
import { DesktopUpdateReminders } from '../src/update-reminders.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'signed-update-index-')); roots.push(root)
  const pair = generateKeyPairSync('ed25519')
  const trust = { keyId: 'fixture', publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
  const bytes = Buffer.from('MZverified-installer')
  const payload: DesktopUpdateIndex = { schema: 1, platform: 'win-x64', channel: 'stable', version: '9.1.6',
    releaseDate: '2026-11-18T00:00:00.000Z', releaseNotes: 'Current bundled plugins', plugins: { 'dsh-free-search': '0.9.69' },
    installer: { url: 'https://zerowall.chengxunkeji.cn/stable/releases/9.1.6/zerowall-science-9.1.6-win-x64.exe', bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), sha512: createHash('sha512').update(bytes).digest('base64') } }
  const envelope = { keyId: trust.keyId, payload, signature: sign(null, Buffer.from(JSON.stringify(payload)), pair.privateKey).toString('base64') }
  const pending = join(root, 'pending'); await mkdir(pending)
  const path = join(pending, 'setup.exe'), receipt = join(root, 'prepared.json')
  await writeFile(path, bytes)
  await writeFile(join(pending, 'update-info.json'), JSON.stringify({ fileName: 'setup.exe', sha512: payload.installer.sha512 }))
  await writeFile(receipt, JSON.stringify({ schema: 1, envelope, path }))
  return { root, trust, payload, envelope, path, receipt }
}

it('authenticates file identity and rejects edits to a signed candidate', async () => {
  const f = await fixture()
  expect(verifyDesktopUpdateIndex(f.envelope, f.trust)).toEqual(f.payload)
  expect(() => verifyDesktopUpdateIndex({ ...f.envelope, payload: { ...f.payload, version: '9.1.7' } }, f.trust)).toThrow('signature')
  expect(() => verifyDesktopUpdateIndex(f.envelope, { ...f.trust, keyId: 'other' })).toThrow('signature')
})

it('recovers an authorized newer installer offline and discards receipts after successful installation', async () => {
  const f = await fixture()
  const updates = new SignedDesktopUpdates(f.trust, f.receipt)
  expect(await updates.restore('9.1.5')).toBe(true)
  await updates.prepared([f.path], '9.1.6')
  expect(await updates.installer('9.1.6')).toBe(f.path)
  await expect(updates.installer('9.1.7')).rejects.toThrow('No verified installer')
  expect(await new SignedDesktopUpdates(f.trust, f.receipt).restore('9.1.6')).toBe(false)
  await expect(readFile(f.receipt)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rehydrates the pinned NSIS updater from a verified cache without fetching or running an installer', async () => {
  const f = await fixture()
  const config = join(f.root, 'app-update.yml')
  await writeFile(config, 'updaterCacheDirName: .\n')
  const forbidden = () => { throw new Error('Offline preparation must not quit or relaunch') }
  const updater = new NsisUpdater(undefined, {
    version: '9.1.5', name: 'offline-update-qualification', isPackaged: true,
    appUpdateConfigPath: config, userDataPath: f.root, baseCachePath: f.root,
    whenReady: async () => {}, quit: forbidden, relaunch: forbidden, onQuit: forbidden,
  })
  updater.logger = null
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.disableWebInstaller = true
  const updates = new SignedDesktopUpdates(f.trust, f.receipt)
  expect(await updates.restore('9.1.5')).toBe(true)
  updates.configure(updater)
  const checked = await updater.checkForUpdates()
  expect(checked?.isUpdateAvailable).toBe(true)
  const downloaded: string[] = []
  updater.on('update-downloaded', (info) => { downloaded.push(info.version) })
  expect(await updater.downloadUpdate()).toEqual([f.path])
  expect(downloaded).toEqual(['9.1.6'])
  await updates.prepared([f.path], '9.1.6')
})

it('retains evidence and refuses a damaged installer or incomplete updater cache', async () => {
  const f = await fixture()
  await writeFile(f.path, 'MZdamaged-installer!')
  await expect(new SignedDesktopUpdates(f.trust, f.receipt).restore('9.1.5')).rejects.toThrow(/mismatch/u)
  expect(await readFile(f.receipt, 'utf8')).toContain('9.1.6')
  const intact = await fixture()
  await rm(join(intact.root, 'pending/update-info.json'))
  await expect(new SignedDesktopUpdates(intact.trust, intact.receipt).restore('9.1.5')).rejects.toThrow()
})

it('checks cached installer bytes again immediately before launch', async () => {
  const f = await fixture()
  const updates = new SignedDesktopUpdates(f.trust, f.receipt)
  await updates.restore('9.1.5')
  await writeFile(f.path, 'MZchanged-installer!')
  await expect(updates.installer('9.1.6')).rejects.toThrow(/mismatch/u)
})

it('snoozes only the offered version for 24 hours and preserves prepared updates after deferral', async () => {
  const f = await fixture(); let now = 0
  const path = join(f.root, 'snooze.json'), reminders = new DesktopUpdateReminders(path, () => now)
  const available = { phase: 'available', version: '9.1.6' } as const
  expect(reminders.prompt(available)).toBe('available')
  await reminders.dismiss(available)
  const reopened = new DesktopUpdateReminders(path, () => now); await reopened.load()
  expect(reopened.prompt(available)).toBeUndefined()
  expect(reopened.prompt({ ...available, version: '9.1.7' })).toBe('available')
  now += 24 * 60 * 60_000
  expect(reopened.prompt(available)).toBe('available')
  const ready = { ...available, phase: 'ready' } as const
  expect(reopened.prompt(ready)).toBe('ready')
  await reopened.dismiss(ready)
  expect(reopened.prompt(ready)).toBeUndefined()
  expect(await new SignedDesktopUpdates(f.trust, f.receipt).restore('9.1.5')).toBe(true)
})
