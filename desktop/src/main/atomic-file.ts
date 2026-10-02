import { rename } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

/** Windows readers and antivirus can briefly prevent an atomic replacement. */
export async function renameFile(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await rename(from, to); return }
    catch (error) {
      if (attempt >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      await setTimeout(25 * (attempt + 1))
    }
  }
}
