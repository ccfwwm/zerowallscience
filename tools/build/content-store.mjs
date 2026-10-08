import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, link, lstat, mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { artifactRoot } from './paths.mjs'

export async function digestFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Store one immutable payload by SHA-256 and return a manifest reference. */
export async function storeObject(source, { root = artifactRoot, referencePath } = {}) {
  const absoluteSource = resolve(source)
  const info = await lstat(absoluteSource)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Content store accepts regular files only.')
  const sha256 = await digestFile(absoluteSource)
  const absoluteReference = referencePath ? resolve(referencePath) : undefined
  if (absoluteReference) {
    const previous = await readFile(absoluteReference, 'utf8').then(JSON.parse, error => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (previous && (previous.algorithm !== 'sha256' || previous.digest !== sha256 || previous.size !== info.size || previous.object !== `objects/sha256/${sha256.slice(0, 2)}/${sha256}`)) {
      throw new Error(`Content reference is immutable and already points to different bytes: ${absoluteReference}`)
    }
  }
  const objectPath = join(root, 'objects', 'sha256', sha256.slice(0, 2), sha256)
  await mkdir(dirname(objectPath), { recursive: true })
  const existing = await lstat(objectPath).catch(() => undefined)
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink() || existing.size !== info.size || await digestFile(objectPath) !== sha256) throw new Error(`Content-addressed object conflict: ${sha256}`)
  } else {
    const temporary = `${objectPath}.${randomUUID()}.tmp`
    await copyFile(absoluteSource, temporary)
    try { await rename(temporary, objectPath) }
    catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error
      const raced = await lstat(objectPath).catch(() => undefined)
      if (!raced?.isFile() || raced.isSymbolicLink() || raced.size !== info.size || await digestFile(objectPath) !== sha256) throw new Error(`Content-addressed object race conflict: ${sha256}`)
    }
  }
  const ref = { schema: 1, algorithm: 'sha256', digest: sha256, size: info.size, object: `objects/sha256/${sha256.slice(0, 2)}/${sha256}`, sourceName: basename(absoluteSource) }
  if (absoluteReference) {
    await mkdir(dirname(absoluteReference), { recursive: true })
    try { await writeFile(absoluteReference, `${JSON.stringify(ref, null, 2)}\n`, { flag: 'wx' }) }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      const previous = JSON.parse(await readFile(absoluteReference, 'utf8'))
      if (previous.algorithm !== ref.algorithm || previous.digest !== ref.digest || previous.size !== ref.size || previous.object !== ref.object) throw new Error(`Content reference is immutable and already points to different bytes: ${absoluteReference}`)
      await resolveObject(previous, { root })
    }
  }
  return { ...ref, objectPath }
}

/**
 * Store a just-built payload once and retain its familiar release/stage path as
 * a hard link. Consumers can keep reading the path while identical payloads
 * share the same physical bytes. This is only for distributable payloads;
 * installed runtime trees must keep their ordinary directory layout.
 */
export async function storeAndLink(source, options = {}) {
  const absoluteSource = resolve(source)
  const reference = await storeObject(absoluteSource, options)
  if (resolve(reference.objectPath) === absoluteSource) return reference

  const temporaryLink = `${absoluteSource}.${randomUUID()}.link`
  const backup = `${absoluteSource}.${randomUUID()}.original`
  await link(reference.objectPath, temporaryLink)
  const linked = await lstat(temporaryLink)
  if (!linked.isFile() || linked.isSymbolicLink() || linked.size !== reference.size || await digestFile(temporaryLink) !== reference.digest) {
    await unlink(temporaryLink).catch(() => undefined)
    throw new Error('Content-addressed hard link failed verification.')
  }

  await rename(absoluteSource, backup)
  try {
    await rename(temporaryLink, absoluteSource)
  } catch (error) {
    await rename(backup, absoluteSource).catch(() => undefined)
    await unlink(temporaryLink).catch(() => undefined)
    throw error
  }
  await rm(backup, { force: true })
  return reference
}

export async function resolveObject(reference, { root = artifactRoot } = {}) {
  if (reference?.algorithm !== 'sha256' || !/^[a-f0-9]{64}$/u.test(reference.digest) || !Number.isSafeInteger(reference.size)) throw new Error('Invalid content reference.')
  const path = resolve(root, reference.object)
  const expectedRoot = resolve(root, 'objects', 'sha256')
  const relativePath = relative(expectedRoot, path)
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`)) throw new Error('Content reference escapes the object store.')
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size !== reference.size || await digestFile(path) !== reference.digest) throw new Error('Content object failed size or hash verification.')
  return path
}
