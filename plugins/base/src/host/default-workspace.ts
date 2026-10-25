import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Restore the desktop's fixed local default without probing historical paths.
 * Registry creation reuses an existing canonical path and retains its title,
 * Session membership and identity. Other Workspace registrations are untouched. */
export async function ensureDefaultWorkspace(registry: { list(): readonly { path: string }[]; create(path: string, title: string): Promise<unknown> }, userData: string): Promise<void> {
  const path = join(userData, 'workspace')
  await mkdir(path, { recursive: true })
  await registry.create(path, 'default-workspace')
}
