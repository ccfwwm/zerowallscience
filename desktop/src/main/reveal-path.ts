import { isAbsolute } from 'node:path'

/** Validate a renderer-supplied path before passing it to Electron shell APIs. */
export function resolveRevealPath(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || !isAbsolute(value)) {
    throw new Error('desktop:reveal-path requires an absolute path')
  }
  return value
}
