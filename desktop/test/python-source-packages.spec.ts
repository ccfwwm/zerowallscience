import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { downloadSourceArchive, missingSourceRequirement, verifySourceWheel, type BuiltSourceWheel } from '../src/main/python-source-packages.js'
import { applyPackagePlanFiles, packageResolutionRequirements, type StoredPackagePlan } from '../src/main/python-packages.js'

const roots: string[] = []
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex')
const pkg = { name: 'docopt', version: '0.6.2', filename: 'docopt-0.6.2.tar.gz', sha256: hash('source bytes') }
const mirror = { indexUrl: 'https://mirror.example/simple' }
async function temp() { const root = await mkdtemp(join(tmpdir(), 'zerowall-source-plan-')); roots.push(root); return root }
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 3 }) })

it('keeps full missing-package ranges and extras, refusing unparseable constraints', () => {
  expect(missingSourceRequirement('ERROR: No matching distribution found for docopt >= 0.6.1, < 0.7 (from consumer)\n')).toBe('docopt>=0.6.1,<0.7')
  expect(missingSourceRequirement('ERROR: No matching distribution found for package[extra]>=1,!=1.4,<2')).toBe('package[extra]>=1,!=1.4,<2')
  expect(missingSourceRequirement('ERROR: No matching distribution found for https://unknown.invalid/pkg.tar.gz')).toBeUndefined()
  expect(missingSourceRequirement('ERROR: No matching distribution found for foo; unknown marker')).toBeUndefined()
  expect(missingSourceRequirement('Connection error')).toBeUndefined()
})

it('selects the exact locked source archive, verifies bytes before saving, and uses only configured mirror index', async () => {
  const root = await temp()
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(`<a href="/files/${pkg.filename}#sha256=${pkg.sha256}">source</a>`)).mockResolvedValueOnce(new Response('source bytes'))
  const result = await downloadSourceArchive(pkg, mirror, root, fetcher)
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(['https://mirror.example/simple/docopt/', `https://mirror.example/files/${pkg.filename}`])
  expect(await readFile(result.archivePath, 'utf8')).toBe('source bytes')
})

it('refuses changed source bytes without retaining them or running a package hook', async () => {
  const root = await temp()
  // A bad archive is retried by design. Keep returning the same corrupt bytes
  // so the final error preserves the integrity diagnostic instead of exercising
  // an exhausted mock response.
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(`<a href="/files/${pkg.filename}">source</a>`)).mockImplementation(async () => new Response('tampered archive'))
  await expect(downloadSourceArchive(pkg, mirror, root, fetcher)).rejects.toThrow(/SHA-256/)
  await expect(access(join(root, pkg.filename))).rejects.toThrow()
})

it('rejects index hash mismatch before downloading the archive', async () => {
  const root = await temp()
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(`<a href="/files/${pkg.filename}#sha256=${'f'.repeat(64)}">source</a>`))
  await expect(downloadSourceArchive(pkg, mirror, root, fetcher)).rejects.toThrow(/SHA-256/)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('rejects insecure redirects and archive traversal', async () => {
  const root = await temp()
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 302, headers: { location: 'http://mirror.example/simple/docopt/' } }))
  await expect(downloadSourceArchive(pkg, mirror, root, fetcher)).rejects.toThrow(/HTTPS/)
  await expect(downloadSourceArchive({ ...pkg, filename: `../${pkg.filename}` }, mirror, root, fetcher)).rejects.toThrow(/文件名/)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

async function builtFixture() {
  const root = await temp(); const sourceBuildId = randomUUID(); const buildRoot = join(root, 'plans', 'source-builds', sourceBuildId)
  await mkdir(join(buildRoot, 'source'), { recursive: true }); await mkdir(join(buildRoot, 'wheels'))
  const wheelPath = join(buildRoot, 'wheels', 'docopt-0.6.2-py2.py3-none-any.whl')
  await writeFile(join(buildRoot, 'source', pkg.filename), 'source bytes'); await writeFile(wheelPath, 'built wheel')
  const wheel: BuiltSourceWheel = { name: pkg.name, version: pkg.version, url: pathToFileURL(wheelPath).href, hash: hash('built wheel'), sourceArchiveSha256: pkg.sha256, sourceFilename: pkg.filename, sourceBuildId, sourceUrl: `https://mirror.example/files/${pkg.filename}` }
  await writeFile(join(buildRoot, 'receipt.json'), JSON.stringify(wheel))
  return { root, buildRoot, wheelPath, wheel }
}

it('retains all conflicting top-level ranges and extras alongside a source candidate', async () => {
  const { wheel } = await builtFixture()
  const requests = ['docopt>=0.5', 'docopt[extra]<0.6', 'consumer==1.0']
  const requirements = packageResolutionRequirements(requests, [], [wheel])
  // docopt 0.6.2 must remain incompatible with the second requested constraint.
  // Replacing either request with a URL would silently widen the user's range.
  expect(requirements.slice(1)).toEqual(requests)
  expect(requirements[0]).toBe(`docopt @ ${wheel.url}#sha256=${wheel.hash}`)
})

it('retains existing-package upgrade bounds and transitive source candidates', async () => {
  const { wheel } = await builtFixture()
  expect(packageResolutionRequirements(['docopt'], [{ name: 'docopt', version: '0.6.2' }], [wheel])[1]).toBe('docopt>0.6.2')
  expect(packageResolutionRequirements(['docopt==0.6.2'], [{ name: 'docopt', version: '0.6.2' }], [wheel])[1]).toBe('docopt==0.6.2')
  const requests = ['consumer>=1,<2']
  expect(packageResolutionRequirements(requests, [], [wheel])).toEqual([`docopt @ ${wheel.url}#sha256=${wheel.hash}`, ...requests])
})

it('validates source and wheel provenance again immediately before candidate modification', async () => {
  const { root, wheelPath, wheel } = await builtFixture()
  await expect(verifySourceWheel(root, wheel)).resolves.toBeUndefined()
  await writeFile(wheelPath, 'tampered after preview')
  const plan: StoredPackagePlan = { planId: randomUUID(), snapshotId: 'current', requested: ['docopt==0.6.2'], changes: [], wheels: [wheel] }
  const target = join(root, 'candidate')
  await expect(applyPackagePlanFiles(root, {} as any, target, plan)).rejects.toThrow(/SHA-256/)
  await expect(access(target)).rejects.toThrow()
})

it('rejects source tampering, receipt tampering and wheel paths outside the owned cache', async () => {
  const { root, buildRoot, wheel } = await builtFixture()
  await expect(verifySourceWheel(root, { ...wheel, sourceBuildId: '../outside' })).rejects.toThrow(/本地依赖路径/)
  const other = join(root, 'outside.whl'); await writeFile(other, 'built wheel')
  await expect(verifySourceWheel(root, { ...wheel, url: pathToFileURL(other).href })).rejects.toThrow(/越界/)
  await writeFile(join(buildRoot, 'source', pkg.filename), 'changed archive')
  await expect(verifySourceWheel(root, wheel)).rejects.toThrow(/SHA-256/)
  await writeFile(join(buildRoot, 'source', pkg.filename), 'source bytes')
  await writeFile(join(buildRoot, 'receipt.json'), JSON.stringify({ ...wheel, hash: 'f'.repeat(64) }))
  await expect(verifySourceWheel(root, wheel)).rejects.toThrow(/记录/)
})
