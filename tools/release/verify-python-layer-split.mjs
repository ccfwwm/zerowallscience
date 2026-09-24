/**
 * Re-check a built release output directory against the two-layer model.
 *
 * The build script already asserts these invariants while producing the assets;
 * this runs afterwards against the files that will actually be published, so a
 * hand-edited manifest or a stale science manifest cannot slip through. It reads
 * only the output directory plus the repository lock and policy, and never
 * touches the network.
 *
 * Usage: node tools/release/verify-python-layer-split.mjs [outputDir]
 */
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { applySourceDistributions, normalizePackageName, parseLockedPackages, verifyDocument } from './python-layer-split.mjs'

const root = resolve(import.meta.dirname, '../..')
const output = resolve(process.argv[2] ?? join(root, 'desktop', 'dist', 'mcp-environment'))
const publicKey = (process.env.ZEROWALL_MCP_ENVIRONMENT_PUBLIC_KEY ?? `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9DJ9yg3F5f67/cEE54AdIDtQshvLP0SF5gVe3F3X+wA=\n-----END PUBLIC KEY-----`).trim()

const lock = applySourceDistributions(
  parseLockedPackages(await readFile(join(root, 'resources', 'python', 'requirements-windows.lock'), 'utf8')),
  await readFile(join(root, 'resources/python/requirements-research.lock'), 'utf8'),
  JSON.parse(await readFile(join(root, 'resources/python/source-distributions.json'), 'utf8')),
)
const policy = JSON.parse(await readFile(join(root, 'resources', 'python', 'science-layer-policy.json'), 'utf8'))

const manifest = JSON.parse(await readFile(join(output, 'latest.json'), 'utf8').catch(error => {
  // A missing or unreadable output directory must read as "no release to check",
  // never as a passing check: a releaser screening this script's exit code has to
  // see the difference between absent and verified.
  if (error.code === 'ENOENT') throw new Error(`No built release to verify at ${output}. Build with ZEROWALL_MCP_ENVIRONMENT_OUTPUT first.`)
  throw error
}))
const versioned = JSON.parse(await readFile(join(output, `${manifest.environmentVersion}.json`), 'utf8'))
if (JSON.stringify(manifest) !== JSON.stringify(versioned)) throw new Error('latest.json and the versioned archive manifest differ.')
const { signature, ...unsigned } = manifest
if (!verifyDocument({ ...unsigned, signature }, publicKey)) throw new Error('Archive manifest signature failed verification.')

const dependencies = manifest.dependencies ?? {}
if (!Array.isArray(dependencies.corePackages)) throw new Error('Archive manifest has no corePackages list.')
const declared = new Set(dependencies.corePackages.map(pkg => normalizePackageName(pkg.name)))
if (declared.size === 0) throw new Error('Archive manifest declares an empty base layer.')
if (declared.size > lock.size) throw new Error('Archive manifest declares more packages than the lock contains.')
// Dependency edges are unavailable here by design: this check validates the
// published documents, so it asserts the reproducible part of the split — every
// policy base root actually shipped — and leaves closure membership to the build.
const missingRoots = policy.baseRoots.map(normalizePackageName).filter(name => !declared.has(name))
if (missingRoots.length > 0) throw new Error(`Archive manifest omits a base root: ${missingRoots.join(', ')}`)

const science = dependencies.science
if (science === undefined) throw new Error('Archive manifest does not reference a science layer.')
if (typeof science.manifestUrl !== 'string' || !science.manifestUrl.startsWith('https://')) throw new Error('Science manifest URL must use HTTPS.')
if (!/^[a-f0-9]{64}$/u.test(String(science.manifestSha256)) || !Number.isSafeInteger(science.manifestSize) || science.manifestSize < 1) throw new Error('Science manifest integrity record is invalid.')
if (!Number.isSafeInteger(science.scienceRevision) || science.scienceRevision < 1) throw new Error('Science manifest revision is invalid.')

const scienceFile = join(output, new URL(science.manifestUrl).pathname.split('/').at(-1))
const scienceBytes = await readFile(scienceFile)
const digest = createHash('sha256').update(scienceBytes).digest('hex')
if (digest !== science.manifestSha256 || scienceBytes.length !== science.manifestSize) throw new Error('Science manifest does not match the reference in the archive manifest.')
const document = JSON.parse(scienceBytes.toString('utf8'))
if (!verifyDocument(document, publicKey)) throw new Error('Science manifest signature failed verification.')
if (document.packages.length !== science.packageCount) throw new Error('Science manifest package count is inconsistent.')
if (document.revision !== `${manifest.environmentVersion}-r${science.scienceRevision}` || document.environmentVersion !== manifest.environmentVersion) throw new Error('Science manifest identity does not match the archive manifest.')

const latestScience = await readFile(join(output, 'science-latest.json'))
if (!latestScience.equals(scienceBytes)) throw new Error('science-latest.json does not point at this science manifest.')

for (const pkg of document.packages) {
  const locked = lock.get(normalizePackageName(pkg.name))
  if (locked === undefined) throw new Error(`Science manifest lists a package that is not locked: ${pkg.name}`)
  if (locked.version !== pkg.version || locked.sha256 !== pkg.sha256) throw new Error(`Science manifest digest for ${pkg.name} does not match the hashed lock.`)
  // The unified dependency list intentionally includes bootstrap/base packages.
}
for (const pkg of document.packages) lock.delete(normalizePackageName(pkg.name))
for (const pkg of dependencies.corePackages) lock.delete(normalizePackageName(pkg.name))
if (lock.size > 0) throw new Error(`The two layers do not cover the lock; unassigned: ${[...lock.keys()].sort().join(', ')}`)

const archiveSize = (await stat(join(output, new URL(manifest.archiveUrl).pathname.split('/').at(-1)))).size
if (archiveSize !== manifest.archiveSize) throw new Error('Archive size does not match the signed manifest.')
console.log(JSON.stringify({ ok: true, environmentVersion: manifest.environmentVersion, base: declared.size, science: document.packages.length, scienceRevision: document.revision, archiveSize }, null, 2))
