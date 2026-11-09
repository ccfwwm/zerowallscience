/** Installed package resources, shared by source execution and the bundled Host. */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Physical package directory used by Skill resources. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  .replace(/\.asar([\\/])/u, '.asar.unpacked$1')
