import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { pythonShellScript } from '../../plugins/python/src/worker/python-shell.js'
import { scanFixedPython } from '../src/main/python-local-inventory.js'
import { applyPackagePlanFiles, prepareManifestPackagePlan } from '../src/main/python-packages.js'

const execute = promisify(execFile), roots: string[] = []
const source = process.env.ZEROWALL_TEST_BOOTSTRAP_ROOT
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
describe.skipIf(!source || process.platform !== 'win32')('Python plugin real fixed-runtime operations', () => {
  async function fixture() {
    const base = await mkdtemp(join(tmpdir(), 'zws-python-plugin-')); roots.push(base)
    const root = join(base, "安装 目录 O'Neil", 'Python'); await mkdir(root, { recursive: true })
    for (const entry of await readdir(source!, { withFileTypes: true })) if (entry.isFile()) await cp(join(source!, entry.name), join(root, entry.name))
    const site = join(root, 'Lib/site-packages'); await mkdir(site, { recursive: true })
    for (const entry of await readdir(join(source!, 'Lib/site-packages'))) if (/^pip(?:$|-)/u.test(entry)) await cp(join(source!, 'Lib/site-packages', entry), join(site, entry), { recursive: true })
    await mkdir(join(root, '.zerowall'))
    return root
  }
  it('runs pip and Python on Windows PowerShell 5 with Unicode, spaces, apostrophes and a dead writer', async () => {
    const root = await fixture(), manager = join(root, '.zerowall'), lock = join(manager, 'write-lock.json')
    const bytes = JSON.stringify({ pid: 2147483647 }); await writeFile(lock, bytes)
    const file = join(manager, 'shell-test.ps1')
    await writeFile(file, '\uFEFF' + pythonShellScript(root) + '\npip --version\npython -c "import sys; print(sys.executable)"\nif ($LASTEXITCODE) { exit $LASTEXITCODE }\n', 'utf8')
    const result = await execute(join(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true, timeout: 30_000, encoding: 'utf8' })
    expect(result.stdout).toContain('pip ')
    expect(result.stdout).toContain(join(root, 'python.exe'))
    expect(result.stderr).toBe('')
    expect(await readFile(lock, 'utf8')).toBe(bytes)
    expect(await readdir(join(manager, 'leases'))).toEqual([])
  }, 45_000)
  it('installs missing packages one at a time, tracks completed attempts, and preserves a different local version', async () => {
    const root = await fixture(), manager = join(root, '.zerowall'), site = join(root, 'Lib/site-packages')
    await mkdir(join(site, 'pandas-1.0.0.dist-info'))
    await writeFile(join(site, 'pandas-1.0.0.dist-info/METADATA'), 'Metadata-Version: 2.1\nName: pandas\nVersion: 1.0.0\n')
    const initial = await scanFixedPython(root, ['pandas'])
    const manifest = {
      schema: 3 as const, runtimeId: 'zerowall-science-python' as const, platform: 'win32-x64' as const, pythonVersion: '3.12.10', environmentVersion: '3.12.10', revision: 'fixture', layer: 'science' as const,
      createdAt: new Date().toISOString(), index: { indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple' }, compatibility: { minApplicationVersion: '8.1.3' }, signature: { algorithm: 'ed25519' as const, keyId: 'fixture', value: 'fixture' },
      packages: [
        { name: 'pandas', version: '3.0.5', required: true, capabilities: [] },
        { name: 'six', version: '1.17.0', required: true, capabilities: [] },
        { name: 'attrs', version: '99999.0.0', required: true, capabilities: [] },
        { name: 'idna', version: '3.10', required: true, capabilities: [] },
      ],
    }
    const context = { root, executable: join(root, 'python.exe'), sitePackages: site, mirror: manifest.index, manifest: { python: { relativeExecutable: 'python.exe', relativeSitePackages: 'Lib/site-packages' } } as never }
    const plan = await prepareManifestPackagePlan(manager, context, manifest, initial)
    const events: Array<{ completed: number; total: number; name?: string; stage?: string }> = []
    const outcome = await applyPackagePlanFiles(manager, context, root, plan, event => events.push(event))
    expect(outcome).toMatchObject({ installed: 2, skipped: [{ name: 'attrs' }] })
    expect(events.filter(event => event.stage?.startsWith('已安装')).map(event => [event.name, event.completed])).toEqual([['six', 1], ['idna', 3]])
    expect(events.find(event => event.stage?.startsWith('安装失败'))).toMatchObject({ name: 'attrs', completed: 2, total: 3 })
    const installed = await scanFixedPython(root, ['pandas', 'six', 'idna'])
    expect(installed.coreReady).toBe(true)
    expect(installed.packages.find(pkg => pkg.name === 'pandas')?.version).toBe('1.0.0')
    expect(installed.executable).toBe(join(root, 'python.exe'))
    expect(await readdir(manager)).not.toContain('slots')
  }, 180_000)

  it('restores a package transaction when the newly written distribution fails import verification', async () => {
    const root = await fixture(), manager = join(root, '.zerowall'), site = join(root, 'Lib/site-packages')
    const planId = '11111111-1111-4111-8111-111111111111', buildId = '22222222-2222-4222-8222-222222222222'
    const oldDistribution = join(site, 'badimport-0.9.0.dist-info')
    await mkdir(oldDistribution, { recursive: true })
    await writeFile(join(site, 'badimport.py'), "VALUE = 'old'\n")
    await writeFile(join(oldDistribution, 'METADATA'), 'Metadata-Version: 2.1\nName: badimport\nVersion: 0.9.0\n')
    await writeFile(join(oldDistribution, 'top_level.txt'), 'badimport\n')
    await writeFile(join(oldDistribution, 'RECORD'), [
      'badimport.py,,',
      'badimport-0.9.0.dist-info/METADATA,,',
      'badimport-0.9.0.dist-info/top_level.txt,,',
      'badimport-0.9.0.dist-info/RECORD,,',
    ].join('\n') + '\n')
    const buildRoot = join(manager, 'plans', 'source-builds', buildId), sourceDir = join(buildRoot, 'source'), wheelsDir = join(buildRoot, 'wheels')
    await mkdir(sourceDir, { recursive: true }); await mkdir(wheelsDir, { recursive: true })
    const sourceArchive = join(sourceDir, 'badimport-1.0.0.tar.gz'); const sourceBytes = Buffer.from('authorized source archive')
    await writeFile(sourceArchive, sourceBytes)
    const sourceArchiveSha256 = createHash('sha256').update(sourceBytes).digest('hex')
    const wheelPath = join(wheelsDir, 'badimport-1.0.0-py3-none-any.whl')
    const wheelCode = `import sys,zipfile\npath=sys.argv[1]\nwith zipfile.ZipFile(path,'w') as z:\n z.writestr('badimport.py', 'from pathlib import Path\\nPath(__file__).resolve().parents[2].joinpath(\".zerowall\", \"badimport-import-marker.txt\").write_text(\"new-fixed-root\")\\nraise ImportError(\"intentional import failure\")\\n')\n z.writestr('badimport-1.0.0.dist-info/METADATA', 'Metadata-Version: 2.1\\nName: badimport\\nVersion: 1.0.0\\n')\n z.writestr('badimport-1.0.0.dist-info/WHEEL', 'Wheel-Version: 1.0\\nGenerator: fixture\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n')\n z.writestr('badimport-1.0.0.dist-info/top_level.txt', 'badimport\\n')\n z.writestr('badimport-1.0.0.dist-info/RECORD', '')\n`
    await execute(join(root, 'python.exe'), ['-I', '-B', '-c', wheelCode, wheelPath], { windowsHide: true })
    const wheelBytes = await readFile(wheelPath); const wheelHash = createHash('sha256').update(wheelBytes).digest('hex')
    const wheelUrl = pathToFileURL(wheelPath).href
    const sourceUrl = 'https://mirror.example/files/badimport-1.0.0.tar.gz'
    await writeFile(join(buildRoot, 'receipt.json'), JSON.stringify({ name: 'badimport', version: '1.0.0', url: wheelUrl, hash: wheelHash, sourceArchiveSha256, sourceFilename: 'badimport-1.0.0.tar.gz', sourceBuildId: buildId, sourceUrl }))
    const plan = { planId, snapshotId: root, requested: ['badimport==1.0.0'], changes: [{ name: 'badimport', to: '1.0.0' }], wheels: [{ name: 'badimport', version: '1.0.0', url: wheelUrl, hash: wheelHash, sourceArchiveSha256, sourceFilename: 'badimport-1.0.0.tar.gz', sourceBuildId: buildId, sourceUrl }] }
    const context = { root, executable: join(root, 'python.exe'), sitePackages: site, mirror: { indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple' }, manifest: { python: { relativeExecutable: 'python.exe', relativeSitePackages: 'Lib/site-packages' } } as never }
    const outcome = await applyPackagePlanFiles(manager, context, root, plan)
    expect(outcome).toMatchObject({ installed: 0, importCheckPassed: false, skipped: [{ name: 'badimport', version: '1.0.0' }] })
    const skipped = (await readFile(join(manager, 'plans', `${planId}-skipped.jsonl`), 'utf8')).trim().split(/\r?\n/u).map(line => JSON.parse(line))
    expect(skipped).toContainEqual(expect.objectContaining({ name: 'badimport', version: '1.0.0', message: expect.stringContaining('intentional import failure') }))
    expect(await readFile(join(site, 'badimport.py'), 'utf8')).toBe("VALUE = 'old'\n")
    expect(await readFile(join(oldDistribution, 'METADATA'), 'utf8')).toContain('Version: 0.9.0')
    await expect(readFile(join(site, 'badimport-1.0.0.dist-info', 'METADATA'))).rejects.toThrow()
    expect(await readFile(join(manager, 'badimport-import-marker.txt'), 'utf8')).toBe('new-fixed-root')
    const journalStates = await Promise.all((await readdir(join(manager, 'transactions'))).map(async id => JSON.parse(await readFile(join(manager, 'transactions', id, 'journal.json'), 'utf8')).state))
    expect(journalStates).toContain('restored')
  }, 180_000)
})
