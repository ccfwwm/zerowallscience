/** Generate a plugin's Remote metadata using the installed DSH declarations. */
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

/**
 * Stage declaration owners for Typert's independent-package analysis.
 * @param root - Absolute npm package directory.
 * @returns Completes after the generated Host and browser metadata is written.
 */
export async function generateRemote(root) {
  const require = createRequire(resolve(root, 'package.json'))
  const { WorkspaceAnalyzer, FaceModelEmitter, writePackageArtifacts } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-generator')).href)
  const workspace = await mkdtemp(resolve(root, '.typert-build-'))
  const staged = resolve(workspace, 'packages/plugin')
  await mkdir(staged, { recursive: true })
  try {
    await cp(resolve(root, 'src'), resolve(staged, 'src'), { recursive: true })
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
    await writeFile(resolve(staged, 'package.json'), JSON.stringify(pkg))
    await symlink(resolve(root, 'node_modules'), resolve(workspace, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    const references = [{ path: './packages/plugin/tsconfig.host.json' }]
    const paths = {}
    const queue = (await readdir(resolve(root, 'node_modules/@deepseek-ai')))
      .filter(name => name.startsWith('dsh-')).map(name => resolve(root, 'node_modules/@deepseek-ai', name))
    const seen = new Set()
    for (let index = 0; index < queue.length; index++) {
      const dependencyRoot = queue[index]
      const manifest = JSON.parse(await readFile(resolve(dependencyRoot, 'package.json'), 'utf8'))
      if (seen.has(manifest.name)) continue
      seen.add(manifest.name)
      const dependencyRequire = createRequire(resolve(dependencyRoot, 'package.json'))
      for (const name of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
        if (!name.startsWith('@deepseek-ai/dsh-') || seen.has(name)) continue
        try { queue.push(resolve(dependencyRequire.resolve(name + '/package.json'), '..')) }
        catch (error) { if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error }
      }
      if (!manifest.types?.includes('lib/types/')) continue
      const name = manifest.name.slice('@deepseek-ai/'.length)
      const dependency = resolve(workspace, 'packages', name)
      await mkdir(dependency, { recursive: true })
      await symlink(resolve(dependencyRoot, 'node_modules'), resolve(dependency, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      await cp(resolve(dependencyRoot, 'lib/types'), resolve(dependency, 'declarations'), { recursive: true })
      for (const [subpath, entry] of Object.entries(manifest.exports ?? {})) {
        if (entry === null || typeof entry !== 'object' || !entry.types?.startsWith('./lib/types/')) continue
        entry.types = entry.types.replace('./lib/types/', './declarations/')
        paths[manifest.name + (subpath === '.' ? '' : subpath.slice(1))] = [resolve(dependency, entry.types)]
      }
      await writeFile(resolve(dependency, 'package.json'), JSON.stringify(manifest))
      await writeFile(resolve(dependency, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', skipLibCheck: true }, include: ['declarations/**/*.ts'] }))
      references.push({ path: './packages/' + name + '/tsconfig.json' })
    }
    const config = JSON.parse(await readFile(resolve(root, 'tsconfig.host.json'), 'utf8'))
    const base = JSON.parse(await readFile(resolve(root, 'tsconfig.build.json'), 'utf8'))
    config.compilerOptions = { ...base.compilerOptions, noEmit: true, paths }
    delete config.extends
    await writeFile(resolve(staged, 'tsconfig.host.json'), JSON.stringify(config))
    await writeFile(resolve(workspace, 'tsconfig.host.json'), JSON.stringify({ compilerOptions: config.compilerOptions, files: [], references }))
    const model = new WorkspaceAnalyzer({ root: workspace, packages: [pkg.name], faces: ['host'] }).analyze()
    const artifacts = model.faces.map(face => ({ ...new FaceModelEmitter(face).emit(pkg.name), packageRoot: 'packages/plugin' }))
    if (!artifacts.some(artifact => artifact.remote !== undefined)) throw new Error(`${pkg.name} generated no Remote metadata`)
    writePackageArtifacts(root, artifacts)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}
