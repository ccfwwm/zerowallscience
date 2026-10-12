import { isAbsolute, toNamespacedPath } from 'node:path'

/** CreateProcess rejects ordinary absolute paths at MAX_PATH even when fs IO succeeds. */
export function windowsProcessPath(path: string): string {
  return process.platform === 'win32' && isAbsolute(path) && path.length >= 260
    ? toNamespacedPath(path) : path
}
