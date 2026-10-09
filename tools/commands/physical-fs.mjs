import nativeFs from 'node:fs'
import { createRequire } from 'node:module'

// Archive signatures and copies bind the actual carrier bytes, rather than
// Electron's virtual ASAR directory. Virtual module reads keep using node:fs.
export const physicalFs = process.versions.electron
  ? createRequire(import.meta.url)('original-fs') : nativeFs
