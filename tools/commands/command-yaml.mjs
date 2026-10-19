import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Management commands also run in independent Electron-as-Node processes.
// Resolve their YAML parser from this installation's curated ASAR, without
// relying on NODE_PATH, a user profile or an ancestor workspace dependency.
const archive = new URL('../app.asar/package.json', import.meta.url)
const require = createRequire(existsSync(fileURLToPath(new URL('../app.asar', import.meta.url))) ? archive : import.meta.url)
export const { parse, stringify } = require('yaml')
