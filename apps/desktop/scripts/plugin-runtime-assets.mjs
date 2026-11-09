/** Keep package-declared script and resource trees readable by standalone processes. */
import { lstat, readFile, readdir } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { readAsar } from 'app-builder-lib/out/asar/asar.js'

/**
 * Inventory physical-resource packages and reject missing declared entry files before archiving.
 * @param {string} sourceRoot - Materialized Desktop Node project.
 * @returns {Promise<{ directories: string[], files: string[] }>} Paths relative to the project root.
 */
export async function pluginRuntimeAssets(sourceRoot) {
  const directories = [], files = []
  async function visitFiles(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visitFiles(path)
      else if (entry.isFile()) files.push(relative(sourceRoot, path))
      else throw new Error(`Plugin resources require physical files: ${relative(sourceRoot, path)}`)
    }
  }
  async function visitPackage(directory) {
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    if (manifest.zerowall?.asarUnpack !== undefined && typeof manifest.zerowall.asarUnpack !== 'boolean') {
      throw new Error(`Plugin ${manifest.name}: zerowall.asarUnpack must be a boolean.`)
    }
    if (manifest.zerowall?.asarUnpack === true) {
      const required = manifest.zerowall.runtimeFiles
      if (!Array.isArray(required) || required.length === 0) throw new Error(`Plugin ${manifest.name}: runtimeFiles must declare required resources.`)
      for (const file of required) {
        if (typeof file !== 'string' || isAbsolute(file) || file.includes('\\') || file.includes(':')
          || file.split('/').some(part => part === '' || part === '.' || part === '..')) {
          throw new Error(`Plugin ${manifest.name}: invalid runtimeFiles entry.`)
        }
        const info = await lstat(join(directory, file))
        if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Plugin ${manifest.name}: required resource is not a physical file: ${file}`)
      }
      directories.push(relative(sourceRoot, directory).split(sep).join('/'))
      await visitFiles(directory)
    }
    await visitModules(join(directory, 'node_modules'))
  }
  async function visitModules(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (!entry.isDirectory()) continue
      const path = join(directory, entry.name)
      if (entry.name.startsWith('@')) {
        for (const scoped of await readdir(path, { withFileTypes: true })) if (scoped.isDirectory()) await visitPackage(join(path, scoped.name))
      } else await visitPackage(path)
    }
  }
  await visitModules(join(sourceRoot, 'node_modules'))
  return { directories: directories.sort(), files: files.sort() }
}

/**
 * Reject inline or modified package resources needed by external interpreters.
 * @param {string} sourceRoot - Prepared Desktop Node project.
 * @param {string} resourcesDirectory - Packaged Electron resources.
 * @param {string[]} files - Resource paths returned by pluginRuntimeAssets.
 * @returns {Promise<void>} Resolves only when archive records and disk copies match preparation.
 */
export async function verifyPluginRuntimeAssets(sourceRoot, resourcesDirectory, files) {
  if (files.length === 0) return
  const archive = await readAsar(join(resourcesDirectory, 'app.asar'))
  for (const file of files) {
    const record = archive.getFile(join('dsh', file), false)
    if (record.unpacked !== true || record.link !== undefined) throw new Error(`Plugin resource must be unpacked: ${file}`)
    const physical = join(resourcesDirectory, 'app.asar.unpacked', 'dsh', file)
    const info = await lstat(physical)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Plugin resource must be a physical file: ${file}`)
    const [prepared, packaged] = await Promise.all([readFile(join(sourceRoot, file)), readFile(physical)])
    if (!prepared.equals(packaged)) throw new Error(`Plugin resource bytes changed: ${file}`)
  }
}
