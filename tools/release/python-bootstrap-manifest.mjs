import { createHash, sign, verify } from 'node:crypto'

export function createBootstrapManifest({ applicationVersion, environmentVersion, baseUrl, archiveName, archiveSize, archiveSha256, coreManifest, template, keyId, privateKey }) {
  if (coreManifest?.schema !== 3 || coreManifest.runtimeId !== 'zerowall-science-python' || coreManifest.platform !== 'win32-x64' || coreManifest.layer !== 'core') throw new Error('A signed Windows core dependency manifest is required.')
  if (coreManifest.packages.length !== 42 || coreManifest.packages.some(item => item.required !== true)) throw new Error('The Python bootstrap contract requires exactly 42 required core packages.')
  if (!coreManifest.packages.some(item => item.name.toLowerCase() === 'pip' && item.version === template.pipVersion)) throw new Error('The bootstrap pip version must match the signed core manifest.')
  if (!Number.isSafeInteger(archiveSize) || archiveSize <= 0 || !/^[a-f0-9]{64}$/u.test(archiveSha256)) throw new Error('Python bootstrap archive metadata is invalid.')
  const archiveUrl = `${baseUrl.replace(/\/$/u, '')}/${environmentVersion}/${archiveName}`
  const unsigned = {
    applicationVersion,
    schema: 2,
    environmentVersion,
    contentRevision: 1,
    environmentId: 'zerowall-python',
    platform: 'win32',
    architecture: 'x64',
    archiveUrl,
    archiveSha256,
    archiveSize,
    python: {
      version: template.pythonVersion,
      relativeExecutable: template.python.relativeExecutable,
      relativeSitePackages: template.python.relativeSitePackages,
      modules: ['pip'],
      bootstrapOnly: true,
      layers: template.python.layers,
      dependencyManifests: template.python.dependencyManifests,
      supportsZeroWallTool: true,
    },
    pythonHealth: { imports: ['pip'], ...template.pythonHealth },
    dependencies: {
      corePackages: coreManifest.packages.map(item => ({ name: item.name, requiredVersion: item.version })),
      indexUrl: coreManifest.index.indexUrl,
    },
    updatePolicy: { required: false, reason: 'Python and pip bootstrap only; the 42-package core installs in its own durable background task.' },
    skillsRoot: 'skills',
    sci: template.sci,
    mcp: template.mcp,
    source: {
      pythonArchiveSha256: template.pythonArchiveSha256,
      pipWheelSha256: template.pipWheelSha256,
      coreManifestSha256: createHash('sha256').update(JSON.stringify(coreManifest)).digest('hex'),
    },
  }
  const document = { ...unsigned, signature: { algorithm: 'ed25519', keyId, value: '' } }
  document.signature.value = sign(null, Buffer.from(JSON.stringify(unsigned)), privateKey).toString('base64')
  if (!verify(null, Buffer.from(JSON.stringify(unsigned)), template.publicKey, Buffer.from(document.signature.value, 'base64'))) throw new Error('Signed Python bootstrap manifest failed self-verification.')
  return document
}

export function verifyBootstrapManifest(manifest, publicKey) {
  if (manifest?.python?.bootstrapOnly !== true || manifest?.python?.modules?.join(',') !== 'pip' || manifest?.dependencies?.corePackages?.length !== 42) return false
  const { signature, ...unsigned } = manifest
  return signature?.algorithm === 'ed25519' && verify(null, Buffer.from(JSON.stringify(unsigned)), publicKey, Buffer.from(signature.value ?? '', 'base64'))
}
