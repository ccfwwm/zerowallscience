import { link, lstat } from 'node:fs/promises'

/** NTFS reports its 1024-link limit as UNKNOWN in Node on Windows. Only
 * classify that error as a limit when the actual file has reached the limit. */
export async function tryHardlink(source, destination, linkFile = link) {
  try {
    await linkFile(source, destination)
    return { linked: true }
  } catch (error) {
    let fallback = error.code
    if (fallback === 'UNKNOWN' && process.platform === 'win32' && (await lstat(source)).nlink >= 1024) fallback = 'EMLINK'
    if (!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP', 'EMLINK'].includes(fallback)) throw error
    return { linked: false, fallback }
  }
}
