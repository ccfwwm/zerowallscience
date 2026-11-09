/** Physical resources installed with this MCP plugin. */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package directory in source and bundled Host layouts. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  .replace(/\.asar([\\/])/u, '.asar.unpacked$1')
