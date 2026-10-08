import { generateKeyPairSync } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Load the configured release key or the local-only catalog keypair. */
export async function loadResourceSigner({ root, cacheRoot }) {
  const configured = process.env.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE
  if (configured) {
    const privateKey = await readFile(configured, 'utf8')
    const keyId = process.env.ZEROWALL_RESOURCE_KEY_ID ?? 'stable-3'
    const keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
    if (!keys[keyId]) throw new Error(`No trusted resource key is configured for ${keyId}.`)
    return { privateKey, keys, keyId, localOnly: false }
  }

  const directory = join(cacheRoot, 'catalogs')
  await mkdir(directory, { recursive: true })
  const privateFile = join(directory, 'development-private.pem')
  const publicFile = join(directory, 'development-keys.json')
  let privateKey, keys
  try {
    ;[privateKey, keys] = await Promise.all([
      readFile(privateFile, 'utf8'),
      readFile(publicFile, 'utf8').then(JSON.parse),
    ])
  } catch {
    const generated = generateKeyPairSync('ed25519')
    const generatedPrivate = generated.privateKey.export({ type: 'pkcs8', format: 'pem' })
    const generatedKeys = { 'local-development': generated.publicKey.export({ type: 'spki', format: 'pem' }) }
    try {
      await writeFile(privateFile, generatedPrivate, { mode: 0o600, flag: 'wx' })
      await writeFile(publicFile, JSON.stringify(generatedKeys), { flag: 'wx' })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    ;[privateKey, keys] = await Promise.all([
      readFile(privateFile, 'utf8'),
      readFile(publicFile, 'utf8').then(JSON.parse),
    ])
  }
  if (!keys['local-development']) throw new Error('Local resource signing keypair is incomplete.')
  return { privateKey, keys, keyId: 'local-development', localOnly: true }
}
