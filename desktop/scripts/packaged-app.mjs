import { access, readdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

/** Locate the unpacked executable produced by Electron Builder. */
export async function locatePackagedApp(packageRoot) {
  // Verification can target an isolated builder output while a previous
  // package is still held open by the OS or an external scanner.
  const outputRoot = resolve(packageRoot, process.env.ZEROWALL_PACKAGED_OUTPUT ?? 'dist')
  if (process.platform === 'win32') {
    const root = resolve(outputRoot, 'win-unpacked')
    const executablePath = resolve(root, 'ZeroWallScience.exe')
    try { await access(executablePath) } catch { throw new Error(`Stable ZeroWall Science executable was not found: ${executablePath}`) }
    return { root, resourcesRoot: resolve(root, 'resources'), executablePath }
  }

  const outputs = (await readdir(outputRoot, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name.startsWith('mac'))
  const preferredNames = process.arch === 'arm64' ? ['mac-arm64', 'mac'] : ['mac', 'mac-x64']
  const output = preferredNames.map(name => outputs.find(entry => entry.name === name)).find(entry => entry !== undefined)
  if (output === undefined) throw new Error(`No macOS unpacked output found under ${outputRoot}.`)
  const app = (await readdir(resolve(outputRoot, output.name), { withFileTypes: true })).find(entry => entry.isDirectory() && entry.name.endsWith('.app'))
  if (app === undefined) throw new Error(`No macOS application bundle found under ${resolve(outputRoot, output.name)}.`)
  const root = resolve(outputRoot, output.name, app.name, 'Contents')
  return { root, resourcesRoot: resolve(root, 'Resources'), executablePath: resolve(root, 'MacOS', basename(app.name, '.app')) }
}
