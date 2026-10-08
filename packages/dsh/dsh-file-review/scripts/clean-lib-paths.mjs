import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

export async function findWorkspaceRoot(start) {
  let current = resolve(start)
  while (true) {
    try {
      const manifest = JSON.parse(await readFile(join(current, 'package.json'), 'utf8'))
      if (manifest.name === 'zerowallscience') return current
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }

    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

export async function expectedGeneratedLibPath(packageRoot, env = process.env) {
  const workspaceRoot = await findWorkspaceRoot(packageRoot)
  if (workspaceRoot) {
    const require = createRequire(join(workspaceRoot, 'package.json'))
    const { buildPaths } = require(join(workspaceRoot, 'tools/build/paths.cjs'))
    return resolve(buildPaths(workspaceRoot).dev, 'dsh-file-review', 'lib')
  }

  if (env.ZEROWALL_ARTIFACT_ROOT) {
    return resolve(env.ZEROWALL_ARTIFACT_ROOT, 'dev', 'dsh-file-review', 'lib')
  }
  return undefined
}
