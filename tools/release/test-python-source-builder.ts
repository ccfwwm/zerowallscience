import { resolve, join } from 'node:path'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { buildPythonSourceWheel } from '../../desktop/src/main/python-source-builder.js'

const root = resolve(import.meta.dirname, '../..')
const python = process.env.ZEROWALL_TEST_PYTHON ?? join(root, '.build/shared-python-migration/run-1790128820162/snapshot/Python/python.exe')
const site = process.env.ZEROWALL_TEST_SOURCE_SITE ?? resolve(python, '../Lib/site-packages')
const output = join(root, '.build/python-source-builder-live')
await mkdir(output, { recursive: true })
const prior = await readFile(join(output, 'receipt.json'), 'utf8').then(JSON.parse, () => ({ results: [] }))
const results: Array<{ name: string; [key: string]: unknown }> = process.env.ZEROWALL_TEST_SOURCE_PACKAGE ? prior.results : []
for (const name of (process.env.ZEROWALL_TEST_SOURCE_PACKAGE ? [process.env.ZEROWALL_TEST_SOURCE_PACKAGE] : ['flowio-1.4.0', 'docopt-0.6.2', 'autograd-gamma-0.5.0', 'bibtexparser-1.4.4', 'nglview-4.0.1'])) {
  const archivePath = join(root, '.build/python-source-audit', `${name}.tar.gz`)
  const archiveSha256 = createHash('sha256').update(await readFile(archivePath)).digest('hex')
  console.log(`Building ${name} with ${python}`)
  const startedAt = Date.now()
  const oldIndex = results.findIndex(row => row.name === name)
  if (oldIndex !== -1) results.splice(oldIndex, 1)
  try {
    const result = await buildPythonSourceWheel({ executable: python, sitePackages: site, archivePath, archiveSha256, outputDirectory: join(output, name), mirror: { indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple' } })
    results.push({ name, ...result, archiveSha256, wheelSha256: createHash('sha256').update(await readFile(result.wheelPath)).digest('hex'), ok: true, milliseconds: Date.now() - startedAt })
    console.log(JSON.stringify(results.at(-1)))
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
    console.error(error)
    process.exitCode = 1
    break
  } finally { await writeFile(join(output, 'receipt.json'), JSON.stringify({ python, results }, null, 2)) }
}
