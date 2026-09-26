import { parseArgs } from 'node:util'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { importHeEngine, verifyPackage } from './science-engine-package.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
  engine: { type: 'string', default: 'he' },
  manifest: { type: 'string' }, archive: { type: 'string' }, 'manifest-sha256': { type: 'string' },
  root: { type: 'string' },
} })
const command = positionals[0]
if (positionals.length !== 1 || !['verify', 'import'].includes(command)) throw new Error('Usage: science-engine.mjs <verify|import> --manifest file --archive file --manifest-sha256 trusted-hash [--root model-data-directory]')
if (!values.manifest || !values.archive) throw new Error('--manifest and --archive are required.')
const options = { ...(values.root ? { root: resolve(values.root) } : {}), temporaryRoot: join(tmpdir(), 'zerowall-engine-verification'), manifestPath: resolve(values.manifest), archivePath: resolve(values.archive), manifestSha256: values['manifest-sha256'] }
const result = command === 'verify' ? await verifyPackage(options) : await importHeEngine(options)
console.log(JSON.stringify(result, null, 2))
