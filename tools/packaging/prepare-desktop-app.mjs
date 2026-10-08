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
  const sourceMain = join(root, 'desktop/out/main')
  await rm(output, { recursive: true, force: true })
  await mkdir(join(output, 'chunks'), { recursive: true })
  // electron-builder filters node_modules from extraResources. These two
  // packages are a deliberately small runtime dependency closure for the
  // external updater worker, so ship them under a neutral directory name and
  // expose that directory through NODE_PATH when the worker starts.
  await mkdir(join(output, 'modules'), { recursive: true })

  const worker = join(sourceMain, 'python-updater-worker.js')
  await cp(worker, join(output, 'python-updater-worker.js'))
  const chunks = (await readdir(join(sourceMain, 'chunks'))).filter(name => /^mcp-environment-.+\.js$/u.test(name)).sort()
  if (chunks.length === 0) throw new Error('Desktop build did not emit the Python updater environment chunk.')
  for (const name of chunks) await cp(join(sourceMain, 'chunks', name), join(output, 'chunks', name))

  for (const name of ['yauzl', 'pend']) {
    const source = join(stageRoot, 'runtime/node_modules', name)
    if (!(await stat(source).catch(() => undefined))?.isDirectory()) throw new Error(`Core runtime is missing Python updater dependency ${name}.`)
    await cp(source, join(output, 'modules', name), { recursive: true, dereference: true })
  }

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
