import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { root, stageRoot, buildId } from '../build/paths.mjs'
import { verifyRuntimeFreshness } from './verify-runtime-freshness.mjs'

// electron-builder must inspect only the curated runtime, not the development
// workspace with every optional plugin and its transitive dependencies.
export function packagingManifest(manifest) {
  const { name, version, description, type, main, license, author } = manifest
  return { name, version, description, type, main, license,
    ...(author ? { author } : {}), dependencies: {}, devDependencies: {} }
}

async function preparePythonUpdaterAssets() {
  const output = join(stageRoot, 'python-updater')
  const sourceWorker = join(root, 'plugins/python/lib/worker')
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await cp(sourceWorker, output, { recursive: true, dereference: true })
  const manifest = JSON.parse(await readFile(join(output, 'worker-manifest.json'), 'utf8'))
  if (manifest.abi !== 1 || !manifest.files?.length) throw new Error('Python plugin worker ABI or closure is missing.')

  const files = []
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await collect(path)
      else if (entry.isFile()) {
        const bytes = await readFile(path)
        files.push({ path: path.slice(output.length + 1).replaceAll('\\', '/'), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
      } else throw new Error(`Unsupported Python updater asset entry: ${path}`)
    }
  }
  await collect(output)
  const receipt = { schema: 1, buildId, files: files.sort((a, b) => a.path.localeCompare(b.path)) }
  await writeFile(join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
  return receipt
}

export async function prepareDesktopApp() {
  await verifyRuntimeFreshness(root)
  const source = JSON.parse(await readFile(join(root, 'desktop/package.json'), 'utf8'))
  const pythonUpdaterReceipt = await preparePythonUpdaterAssets()
  const appRoot = join(stageRoot, 'electron-app')
  await mkdir(appRoot, { recursive: true })
  await writeFile(join(appRoot, 'package.json'), JSON.stringify(packagingManifest(source), null, 2) + '\n')
  await writeFile(join(stageRoot, 'desktop-package-receipt.json'), JSON.stringify({
    schema: 1, applicationVersion: source.version, buildId, appRoot,
    runtimeReceipt: JSON.parse(await readFile(join(stageRoot, 'runtime/build-receipt.json'), 'utf8')),
    pythonUpdaterReceipt,
  }, null, 2) + '\n')
  console.log(`Prepared dependency-free Electron app manifest for build ${buildId}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await prepareDesktopApp()
