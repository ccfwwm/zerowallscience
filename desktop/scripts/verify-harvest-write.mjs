import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { locatePackagedApp } from './packaged-app.mjs'

const root = resolve(import.meta.dirname, '../..')
const packaged = await locatePackagedApp(resolve(root, 'desktop'))
const asar = resolve(packaged.resourcesRoot, 'app.asar')
const child = spawn(packaged.executablePath, [
  '--import', pathToFileURL(resolve(asar, 'runtime/runtime-esm-register.mjs')).href,
  '--test', resolve(root, 'packages/zotero-harvest/tests/save.test.mjs'),
], { cwd: packaged.root, windowsHide: true, stdio: 'inherit', env: {
  ...process.env, ELECTRON_RUN_AS_NODE: '1',
  ZEROWALL_HARVEST_MODULE_ROOT: resolve(asar, 'node_modules/@dsh-external/zotero-harvest'),
} })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
