import { createHash } from 'node:crypto'
import { verifyDocument } from '../release/python-layer-split.mjs'
import { compareVersions } from '../release/resource-catalog.mjs'

export function assertPythonManifests(science, core, desktopVersion, keys) {
  for (const [label, manifest] of [['science', science], ['core', core]]) {
    compareVersions(manifest.applicationVersion, '0.0.0')
    const range = manifest.compatibility
    if (!range?.minApplicationVersion || compareVersions(range.minApplicationVersion, desktopVersion) > 0 ||
        range.maxApplicationVersion && compareVersions(range.maxApplicationVersion, desktopVersion) < 0) {
      throw new Error(`Python ${label} manifest is incompatible with desktop ${desktopVersion}`)
    }
    const keyId = manifest.signature?.keyId
    if (!/^stable-\d+$/.test(keyId ?? '') || !Object.hasOwn(keys, keyId) || !verifyDocument(manifest, keys[keyId])) {
      throw new Error(`Python ${label} manifest signature verification failed`)
    }
  }
  for (const field of ['applicationVersion', 'runtimeId', 'platform', 'environmentVersion', 'pythonVersion']) {
    if (!science[field] || science[field] !== core[field]) throw new Error(`Python manifest pair differs in ${field}`)
  }
  if (science.layer !== 'science' || core.layer !== 'core' || !science.revision || core.revision !== `${science.revision}-core`) {
    throw new Error('Python manifest layers or revisions are not paired')
  }
}

export function assertPythonManifestBytes(source, packaged, label) {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  const expected = digest(source)
  if (digest(packaged) !== expected) throw new Error(`Packaged Python ${label} SHA-256 differs from source`)
  return expected
}
