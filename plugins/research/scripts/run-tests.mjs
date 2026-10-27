import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, lstatSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootRequire = createRequire(join(packageRoot, 'package.json'))
const vitestManifestPath = rootRequire.resolve('vitest/package.json')
const vitestManifest = rootRequire(vitestManifestPath)
const vitestCli = resolve(dirname(vitestManifestPath), vitestManifest.bin.vitest)
const env = { ...process.env }

function isUsablePythonRoot(path) {
  try {
    const root = resolve(path)
    const rootInfo = lstatSync(root)
    const executableInfo = lstatSync(join(root, 'python.exe'))
    return rootInfo.isDirectory() && !rootInfo.isSymbolicLink()
      && executableInfo.isFile() && !executableInfo.isSymbolicLink()
      && existsSync(join(root, 'Lib', 'site-packages'))
  } catch {
    return false
  }
}

const requestedRoot = env.ZEROWALL_RESEARCH_TEST_PYTHON_ROOT?.trim()
const configuredRoot = env.ZEROWALL_PYTHON_RUNTIME_ROOT?.trim()
const installedRoot = process.platform === 'win32' && env.LOCALAPPDATA
  ? join(env.LOCALAPPDATA, 'Programs', 'ZeroWallScience', 'Python')
  : undefined
const pythonRoot = requestedRoot || configuredRoot || (installedRoot && isUsablePythonRoot(installedRoot) ? installedRoot : undefined)

if (requestedRoot && !isUsablePythonRoot(requestedRoot)) {
  throw new Error('ZEROWALL_RESEARCH_TEST_PYTHON_ROOT must point to a fixed Python root containing python.exe and Lib/site-packages.')
}

if (pythonRoot && isUsablePythonRoot(pythonRoot)) {
  const executable = join(resolve(pythonRoot), 'python.exe')
  env.ZEROWALL_PYTHON_RUNTIME_ROOT = resolve(pythonRoot)
  // A test-root override must win over ambient per-test interpreter variables.
  if (requestedRoot) {
    env.ZEROWALL_PYTHON = executable
    env.ZEROWALL_CELL_PYTHON = executable
    env.ZEROWALL_BRAINGLOBE_PYTHON = executable
  } else {
    env.ZEROWALL_PYTHON ??= executable
    env.ZEROWALL_CELL_PYTHON ??= executable
    env.ZEROWALL_BRAINGLOBE_PYTHON ??= executable
  }
  console.log(`Research tests use fixed Python root: ${resolve(pythonRoot)}`)
} else if (configuredRoot) {
  throw new Error('ZEROWALL_PYTHON_RUNTIME_ROOT must point to a fixed Python root containing python.exe and Lib/site-packages.')
}

const result = spawnSync(process.execPath, [vitestCli, 'run', '--config', '../../vitest.plugins.config.ts', '--no-file-parallelism', ...process.argv.slice(2)], {
  cwd: packageRoot,
  env,
  stdio: 'inherit',
  windowsHide: true,
})

if (result.error) throw result.error
if (result.signal) process.exit(1)
process.exit(result.status ?? 1)
