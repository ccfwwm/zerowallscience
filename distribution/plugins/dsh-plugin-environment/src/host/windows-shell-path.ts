/** Process-scoped Windows Shell tool discovery for native file actions. */
import { win32 } from 'node:path'

/** Compare Windows PATH entries without changing their spelling or order. */
function pathKey(value: string): string {
  return win32.normalize(value.replace(/^"(.*)"$/u, '$1')).replace(/[\\/]+$/u, '').toLowerCase()
}

/**
 * Append missing Windows system directories without changing inherited tool precedence.
 * @param environment - Host environment; callers own the returned cleanup through a Cordis effect.
 * @param platform - Host platform; other platforms retain their environment unchanged.
 * @returns cleanup that removes this installation's entries and preserves later PATH edits.
 * @throws Error before mutation when Windows has no absolute SystemRoot or windir.
 */
export function installWindowsShellPath(environment: NodeJS.ProcessEnv, platform: NodeJS.Platform): () => void {
  if (platform !== 'win32') return () => {}
  const keys = Object.keys(environment)
  const root = environment[keys.find(key => key.toLowerCase() === 'systemroot') ?? 'SystemRoot']
    ?? environment[keys.find(key => key.toLowerCase() === 'windir') ?? 'windir']
  if (root === undefined || !win32.isAbsolute(root)) {
    throw new Error('Windows SystemRoot is unavailable. Restore the Windows environment and restart ZeroWall Science.')
  }
  const key = keys.find(key => key.toLowerCase() === 'path') ?? 'Path'
  const original = environment[key]
  const present = new Set((original ?? '').split(';').map(pathKey))
  const added = [root, win32.join(root, 'System32'), win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0')]
    .filter(path => !present.has(pathKey(path)))
  if (added.length === 0) return () => {}
  const installed = [original, ...added].filter(value => value !== undefined && value !== '').join(';')
  environment[key] = installed
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (environment[key] === installed) {
      if (original === undefined) delete environment[key]
      else environment[key] = original
      return
    }
    const current = environment[key]
    if (current === undefined) return
    const entries = current.split(';')
    for (const path of added) {
      const index = entries.indexOf(path)
      if (index !== -1) entries.splice(index, 1)
    }
    environment[key] = entries.join(';')
  }
}
