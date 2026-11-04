import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { physicalFs } from './physical-fs.mjs'

const { cp, lstat, readdir, readlink, rename } = physicalFs.promises
const transient = error => ['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY'].includes(error?.code)
const inspect = path => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
const sameEntry = (left, right) => left && right && left.ino !== 0 && left.ino === right.ino && left.dev === right.dev
const occupied = path => Object.assign(new Error('Package publication destination already exists: ' + path), { code: 'EEXIST' })

async function digest(path) {
  const hash = createHash('sha256')
  for await (const bytes of physicalFs.createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}

// Compare physical entries without following links into another package. A
// locked candidate remains intact until acceptance/rollback cleans it later.
async function verifyCopy(source, destination) {
  const [before, copied] = await Promise.all([lstat(source), lstat(destination)])
  if (before.isSymbolicLink() && copied.isSymbolicLink()) {
    if (await readlink(source) === await readlink(destination)) return
  } else if (before.isFile() && copied.isFile()) {
    if (before.size === copied.size && await digest(source) === await digest(destination)) return
  } else if (before.isDirectory() && copied.isDirectory()) {
    const names = (await readdir(source)).sort(), copyNames = (await readdir(destination)).sort()
    if (JSON.stringify(names) === JSON.stringify(copyNames)) {
      for (const name of names) {
        await verifyCopy(join(source, name), join(destination, name))
      }
      return
    }
  }
  throw new Error('Package publication copy differs from its candidate: ' + source)
}

/** Move only into a vacant exact path. Retry short Windows scanner locks;
 * candidate publication may use an independently verified copy, while old
 * active/rollback roots must keep their identity and may never use a copy. */
export async function movePackagePath(source, destination, {
  copyStage, move = rename, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 8,
} = {}) {
  const original = await lstat(source)
  for (let attempt = 0; ; attempt++) {
    if (await inspect(destination)) throw occupied(destination)
    try { await move(source, destination); return }
    catch (error) {
      const [remaining, published] = await Promise.all([inspect(source), inspect(destination)])
      // An interrupted/duplicated handoff is complete only if the very same
      // filesystem entry reached the target; path existence alone is unsafe.
      if (!remaining && sameEntry(original, published)) return
      if (published) throw occupied(destination)
      if (!remaining || !sameEntry(original, remaining) || !transient(error)) throw error
      if (attempt + 1 >= attempts) {
        if (!copyStage || original.isSymbolicLink() || !original.isDirectory() && !original.isFile()) throw error
        break
      }
      await wait(Math.min(100 * (attempt + 1), 500))
    }
  }
  // copyStage is journal-owned and vacant. Never copy/merge into the active
  // destination: the final handoff remains a single rename after verification.
  if (await inspect(copyStage)) throw occupied(copyStage)
  await cp(source, copyStage, { recursive: true, dereference: false, verbatimSymlinks: true, force: false, errorOnExist: true })
  await verifyCopy(source, copyStage)
  if (!sameEntry(original, await lstat(source))) throw new Error('Package candidate changed during publication: ' + source)
  await movePackagePath(copyStage, destination, { move, wait, attempts })
}
