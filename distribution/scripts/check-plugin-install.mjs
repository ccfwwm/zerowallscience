/** Verify the public Host exports and release versions in an isolated archive installation. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { load } from 'js-yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { values, positionals } = parseArgs({ allowPositionals: true, options: { manifest: { type: 'string' }, output: { type: 'string' } } })
const directory = positionals[0]
if (!directory) throw new Error('Usage: pnpm run zerowall:check-install <isolated-install-directory> [--manifest <path>] [--output <path>]')
const installed = resolve(directory)
const require = createRequire(join(installed, 'package.json'))
const manifest = JSON.parse(await readFile(resolve(values.manifest ?? join(root, '.artifacts/zerowall-npm/manifest.json')), 'utf8'))
const packages = []
for (const expected of manifest.packages) {
  const actual = require(expected.name + '/package.json')
  if (actual.version !== expected.version) throw new Error(expected.name + ' installed at unexpected version ' + actual.version)
  if (actual.name.startsWith('@zerowall/') && !/^\d+\.\d+\.\d+$/u.test(actual.version)) {
    throw new Error(actual.name + ' is not a formal ZeroWall release: ' + actual.version)
  }
  if (actual.main) await import(pathToFileURL(require.resolve(expected.name)).href)
  for (const detail of expected.details ?? []) {
    const locale = JSON.parse(await readFile(require.resolve(expected.name + '/' + detail.locale), 'utf8'))
    if (locale.meta?.detail !== detail.document) throw new Error(expected.name + ' installed with unexpected localized detail')
    await readFile(join(dirname(require.resolve(expected.name + '/package.json')), detail.document), 'utf8')
  }
  packages.push({ name: actual.name, version: actual.version })
}
const lock = load(await readFile(join(installed, 'pnpm-lock.yaml'), 'utf8'))
const { version: dshVersion } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const { dependencies: officeDependencies } = JSON.parse(await readFile(join(root, 'packages/document/office-kit/package.json'), 'utf8'))
const resolvedVersions = (matches) => [...new Set(Object.entries(lock.packages).flatMap(([locator, record]) => {
  const separator = locator.indexOf('@', 1)
  if (separator < 0 || !matches(locator.slice(0, separator))) return []
  const reference = locator.slice(separator + 1)
  return [reference.startsWith('file:') ? record.version ?? reference : reference]
}))]
const dshVersions = resolvedVersions(name => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
if (dshVersions.length !== 1 || dshVersions[0] !== dshVersion) throw new Error('Isolated installation has inconsistent DSH releases: ' + dshVersions.join(', '))
const engineVersions = resolvedVersions(name => name.startsWith('@deepseek-ai/libreoffice-kit'))
if (engineVersions.length !== 1 || engineVersions[0] !== officeDependencies['@deepseek-ai/libreoffice-kit']) throw new Error('Isolated installation has inconsistent LibreOffice kit releases: ' + engineVersions.join(', '))
const report = { packages, dshVersions, engineVersions }
await writeFile(resolve(values.output ?? join(root, '.artifacts/zerowall-npm/installed-validation.json')), JSON.stringify(report, null, 2) + '\n')
console.log('Validated installed Host exports for ' + packages.length + ' packages; DSH ' + dshVersions[0] + ', LibreOffice kit ' + engineVersions[0])
