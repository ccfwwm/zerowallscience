import { parseArgs } from 'node:util'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { importHeEngine, rollbackHeEngine, verifyPackage } from './science-engine-package.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
  engine: { type: 'string', default: 'he' },
  manifest: { type: 'string' }, archive: { type: 'string' }, 'manifest-sha256': { type: 'string' },
  root: { type: 'string', default: join(process.env.LOCALAPPDATA ?? tmpdir(), 'ZeroWallScience', 'science-engines') }, python: { type: 'string', default: 'python' },
} })
const command = positionals[0]
if (positionals.length !== 1 || !['verify', 'import', 'rollback'].includes(command)) throw new Error('Usage: science-engine.mjs <verify|import|rollback> [--manifest file --archive file --manifest-sha256 trusted-hash] [--root science-engines] [--python path]')
const options = { root: resolve(values.root), python: values.python, temporaryRoot: join(tmpdir(), 'zerowall-engine-verification') }
if (command !== 'rollback') {
  if (!values.manifest || !values.archive) throw new Error('--manifest and --archive are required.')
  Object.assign(options, { manifestPath: resolve(values.manifest), archivePath: resolve(values.archive), manifestSha256: values['manifest-sha256'] })
}
const result = command === 'verify' ? await verifyPackage(options) : command === 'import' ? await importHeEngine(options) : await rollbackHeEngine(options.root, values.engine)
console.log(JSON.stringify(result, null, 2))
