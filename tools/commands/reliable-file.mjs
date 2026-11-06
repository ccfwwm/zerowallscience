import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { physicalFs } from './physical-fs.mjs'

const fs = physicalFs.promises
const transient = error => ['EACCES', 'EPERM', 'EBUSY'].includes(error?.code)
export async function retryFile(operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation() } catch (error) {
      if (!transient(error) || attempt >= 5) throw error
      await new Promise(done => setTimeout(done, Math.min(150 * (attempt + 1), 750)))
    }
  }
}

/** Candidate-only copy. CopyFile on Windows can preserve a read-only attribute
 * or be denied by a scanner even when ordinary reads/writes are permitted.
 * Create independent bytes with the destination parent's ACL; never change
 * permissions on a source, user file, junction target or shared package. */
export async function copyCandidateFile(source, destination) {
  const temporary = join(dirname(destination), '.zerowall-copy-' + randomUUID() + '.tmp')
  try {
    try { await fs.copyFile(source, temporary, physicalFs.constants.COPYFILE_EXCL) }
    catch (error) {
      if (!transient(error)) throw error
      await retryFile(() => fs.chmod(temporary, 0o600)).catch(failure => { if (failure.code !== 'ENOENT') throw failure })
      await retryFile(() => fs.unlink(temporary)).catch(failure => { if (failure.code !== 'ENOENT') throw failure })
      await retryFile(async () => {
        const input = await fs.open(source, 'r')
        let output
        try {
          output = await fs.open(temporary, 'wx', 0o600)
          const buffer = Buffer.allocUnsafe(1024 * 1024)
          for (let count; (count = (await input.read(buffer, 0, buffer.length, null)).bytesRead) > 0;) {
            for (let offset = 0; offset < count;) {
              const written = (await output.write(buffer, offset, count - offset)).bytesWritten
              if (!written) throw new Error('Candidate copy made no progress')
              offset += written
            }
          }
          await output.sync()
        } catch (error) {
          await output?.close(); output = undefined
          await fs.unlink(temporary).catch(failure => { if (failure.code !== 'ENOENT') throw failure })
          throw error
        } finally { await Promise.all([input.close(), output?.close()]) }
      })
    }
    await retryFile(() => fs.chmod(temporary, 0o600))
    await retryFile(() => fs.rename(temporary, destination))
  } finally {
    await retryFile(() => fs.unlink(temporary)).catch(error => { if (error.code !== 'ENOENT') console.warn('Candidate temporary cleanup deferred:', error.code ?? 'io') })
  }
}
