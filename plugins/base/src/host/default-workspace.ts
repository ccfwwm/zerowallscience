import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Register a writable default only when no existing workspace directory is available. */
export async function ensureDefaultWorkspace(registry: { list(): readonly { path: string }[]; create(path: string, title: string): Promise<unknown> }, userData: string): Promise<void> {
  for (const workspace of registry.list()) {
    try { if ((await stat(workspace.path)).isDirectory()) return }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR' && code !== 'EACCES' && code !== 'EPERM') throw error
    }
  }
  const path = join(userData, 'workspace')
  await mkdir(path, { recursive: true })
  await registry.create(path, 'default-workspace')
}
