import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { WorkspaceAnalyzer, FaceModelEmitter, writePackageArtifacts } from '@deepseek-ai/dsh-typert-generator'

// The upstream generator discovers package faces under a workspace's packages/.
// Stage this independent package there for analysis; runtime ships only the outputs.
const root = resolve(import.meta.dirname, '..')
const workspace = await mkdtemp(resolve(root, '.typert-build-'))
const staged = resolve(workspace, 'packages/ai-cloud')
await mkdir(staged, { recursive: true })
try {
  await cp(resolve(root, 'src'), resolve(staged, 'src'), { recursive: true })
  for (const file of ['package.json', 'tsconfig.json']) {
    await cp(resolve(root, file), resolve(staged, file))
  }
  await symlink(resolve(root, 'node_modules'), resolve(workspace, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  // Register installed declaration owners: Typert requires every merged
  // interface declaration to belong to the analyzed face.
  const references = [{ path: './packages/ai-cloud/tsconfig.json' }]
  const paths = {}
  for (const name of await readdir(resolve(root, 'node_modules/@deepseek-ai'))) {
    if (name.startsWith('.')) continue
    const dependencyRoot = resolve(root, 'node_modules/@deepseek-ai', name)
    const manifest = JSON.parse(await readFile(resolve(dependencyRoot, 'package.json'), 'utf8'))
    if (!manifest.types?.includes('lib/types/')) continue
    const dependency = resolve(workspace, 'packages', name)
    await mkdir(dependency, { recursive: true })
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
  const config = JSON.parse(await readFile(resolve(staged, 'tsconfig.json'), 'utf8'))
  config.compilerOptions.paths = paths
  config.include = ['src/types.ts', 'src/host/**/*.ts', 'src/account/host/**/*.ts', 'src/cloud/host/**/*.ts', 'src/secrets/host/**/*.ts']
  await writeFile(resolve(staged, 'tsconfig.json'), JSON.stringify(config))
  await writeFile(resolve(workspace, 'tsconfig.host.json'), JSON.stringify({ compilerOptions: config.compilerOptions, files: [], references }))
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const model = new WorkspaceAnalyzer({ root: workspace, packages: [pkg.name], faces: ['host'] }).analyze()
  const artifacts = model.faces.map(face => ({ ...new FaceModelEmitter(face).emit(pkg.name), packageRoot: 'packages/ai-cloud' }))
  if (!artifacts.some(artifact => artifact.remote !== undefined)) throw new Error('Account Remote metadata was not generated.')
  writePackageArtifacts(root, artifacts)
} finally {
  await rm(workspace, { recursive: true, force: true })
}
