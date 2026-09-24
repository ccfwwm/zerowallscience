/**
 * Split the hash-verified Windows lock into the layer that ships inside the
 * release archive (BASE) and the layer the cloud publishes as a dependency
 * manifest (SCIENCE).
 *
 * The rule is mechanical rather than a hand-maintained list, so it stays
 * auditable as the lock grows: BASE is the transitive closure, over
 * `Requires-Dist` edges with win32/cp312 markers already evaluated, of the
 * direct names in `resources/python/requirements-base.txt` plus the bootstrap
 * roots from `resources/python/science-layer-policy.json`. Every other lock
 * entry is SCIENCE.
 *
 * Edges are produced by the caller from installed distribution metadata
 * (`packaging` evaluates the environment markers); this module stays a pure
 * graph and document module so a synthetic lock can unit test it without a
 * built Python runtime.
 */
import { sign, verify } from 'node:crypto'

export const LOCK_LINE_PATTERN = /^([A-Za-z0-9_.-]+)==([^\s]+) --hash=sha256:([a-f0-9]{64})$/u
export const SCIENCE_LATEST_NAME = 'latest.json'

export function normalizePackageName(name) {
  return name.trim().toLowerCase().replace(/[-_.]+/gu, '-')
}

/** Lock entries keyed by normalised name, retaining the original spelling pip shows. */
export function parseLockedPackages(lockText) {
  const packages = new Map()
  for (const raw of lockText.split(/\r?\n/u)) {
    const match = LOCK_LINE_PATTERN.exec(raw.trim())
    if (match === null) continue
    packages.set(normalizePackageName(match[1]), { name: match[1], version: match[2], sha256: match[3] })
  }
  return packages
}

/** Direct names from a `-r` requirements file; nested `-r` includes are expanded by the caller. */
export function parseDirectRequirements(text) {
  const names = []
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#') || line.startsWith('-r')) continue
    const match = /^([A-Za-z0-9_.-]+)/u.exec(line)
    if (match !== null) names.push(normalizePackageName(match[1]))
  }
  return names
}

/**
 * Resolve BASE as the closure of `roots` over `edges`, then assign every lock
 * entry to exactly one layer. Roots and closure members that the lock lacks are
 * reported instead of throwing: a missing root is a policy bug, a missing
 * transitive dependency is a lock bug, and the caller decides which is fatal.
 */
export function partitionLock({ packages, edges, roots }) {
  const rootNames = [...new Set(roots.map(normalizePackageName))]
  const closure = new Set()
  const pending = [...rootNames]
  while (pending.length > 0) {
    const name = pending.pop()
    if (closure.has(name)) continue
    closure.add(name)
    for (const dependency of edges.get(name) ?? []) if (!closure.has(dependency)) pending.push(dependency)
  }
  const base = []
  const science = []
  for (const name of [...packages.keys()].sort()) (closure.has(name) ? base : science).push(packages.get(name))
  const missing = [...closure].filter(name => !packages.has(name))
  return {
    base,
    science,
    baseNames: new Set(base.map(pkg => normalizePackageName(pkg.name))),
    scienceNames: new Set(science.map(pkg => normalizePackageName(pkg.name))),
    // Keep the two reports disjoint: a policy root the lock lacks is a policy
    // bug, a transitive dependency the lock lacks is a lock bug, and either one
    // must be actionable on its own.
    rootsNotInLock: missing.filter(name => rootNames.includes(name)).sort(),
    closureNotInLock: missing.filter(name => !rootNames.includes(name)).sort(),
  }
}

/** The two layers must cover the lock exactly; a dropped package would ship nowhere. */
export function assertCompletePartition({ packages, base, science }) {
  const baseNames = new Set(base.map(pkg => normalizePackageName(pkg.name)))
  const scienceNames = new Set(science.map(pkg => normalizePackageName(pkg.name)))
  if (baseNames.size !== base.length || scienceNames.size !== science.length) throw new Error('Python layer split produced duplicate package names.')
  if (baseNames.size + scienceNames.size !== packages.size) throw new Error('Python layer split does not cover the lock exactly.')
  for (const name of [...baseNames, ...scienceNames]) if (!packages.has(name)) throw new Error(`Python layer split invented a package: ${name}`)
}

/** Import name to distribution name, from the audited policy aliases. */
export function packageForModule(moduleName, importAliases) {
  return normalizePackageName(importAliases[moduleName] ?? moduleName)
}

export function scienceManifestName({ environmentVersion, scienceRevision }) {
  return `manifest-${environmentVersion}-r${scienceRevision}.json`
}

/** Replace release-machine wheel hashes with the locked upstream sdist identity.
 * This list contains metadata only; users build the archive locally through pip. */
export function applySourceDistributions(packages, sourceLock, sources) {
  const sourceEntries = new Map()
  for (const line of sourceLock.replace(/\\\r?\n[ \t]*/gu, ' ').split(/\r?\n/u)) {
    const match = /^([A-Za-z0-9_.-]+)==([^\s]+)\s+(.+)$/u.exec(line)
    if (match) sourceEntries.set(normalizePackageName(match[1]), { version: match[2], hashes: [...match[3].matchAll(/--hash=sha256:([a-f0-9]{64})/gu)].map(row => row[1]) })
  }
  const result = new Map(packages)
  const seen = new Set()
  for (const source of sources) {
    const name = normalizePackageName(source.name)
    const locked = packages.get(name); const upstream = sourceEntries.get(name)
    const filename = source.filename
    if (seen.has(name) || !locked || locked.version !== source.version || upstream?.version !== source.version || !upstream.hashes.includes(source.sha256)
      || typeof filename !== 'string' || !/^[A-Za-z0-9_.+-]+\.(?:tar\.gz|zip)$/u.test(filename)
      || normalizePackageName(filename.replace(/\.tar\.gz$|\.zip$/u, '')) !== normalizePackageName(`${name}-${source.version}`)) {
      throw new Error(`Source distribution does not match the upstream lock: ${name}`)
    }
    seen.add(name)
    result.set(name, { ...locked, source: 'sdist', filename, sha256: source.sha256 })
  }
  return result
}

/**
 * The cloud science manifest. It carries package identity — name and exact
 * version — which is what the client enforces: the lock has no wheel URLs (a
 * wheel's filename is not derivable from its hash), so the client resolves
 * artifacts from `index`. A digest is emitted only where one is genuinely
 * required, i.e. source distributions that must be fetched and built.
 */
export function scienceManifestDocument({ environmentVersion, scienceRevision, pythonVersion, index, basePackageCount, packages, keyId, generatedAt = new Date().toISOString(), applicationVersion = environmentVersion }) {
  return {
    schema: 3,
    kind: 'zerowall-science-python',
    runtimeId: 'zerowall-science-python',
    platform: 'win32-x64',
    environmentVersion,
    revision: String(scienceRevision).startsWith(`${environmentVersion}-`) ? String(scienceRevision) : `${environmentVersion}-r${scienceRevision}`,
    pythonVersion,
    createdAt: generatedAt,
    index: { indexUrl: index.indexUrl, ...(index.trustedHost ? { trustedHost: index.trustedHost } : {}) },
    packages: packages.map(pkg => pkg.source === 'sdist'
      ? { name: pkg.name, version: pkg.version, sha256: pkg.sha256, required: true, capabilities: [], source: 'sdist', filename: pkg.filename }
      : { name: pkg.name, version: pkg.version, required: true, capabilities: [] }),
    compatibility: { minApplicationVersion: applicationVersion },
    signature: { algorithm: 'ed25519', keyId, value: '' },
  }
}

/** Signature payload: every field except the signature itself, in insertion order. */
export function canonicalDocument(document) {
  const { signature: _signature, ...unsigned } = document
  return Buffer.from(JSON.stringify(unsigned))
}

export function signDocument(document, privateKey, publicKey) {
  document.signature.value = sign(null, canonicalDocument(document), privateKey).toString('base64')
  if (!verify(null, canonicalDocument(document), publicKey, Buffer.from(document.signature.value, 'base64'))) throw new Error('Signed manifest failed self-verification.')
  return document
}

export function verifyDocument(document, publicKey) {
  const { signature } = document
  return signature?.algorithm === 'ed25519' && typeof signature.value === 'string' && signature.value.length > 0
    && verify(null, canonicalDocument(document), publicKey, Buffer.from(signature.value, 'base64'))
}
