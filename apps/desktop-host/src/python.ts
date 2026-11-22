/** Publish carrier-owned Python locations before profile plugins are loaded. */
import { join } from 'node:path'
import { installPrimaryRuntime, readPrimaryRuntime } from '@deepseek-ai/dsh-tool-workspace-dependencies'

/**
 * Materialize DSH's base payload at the path shared by Desktop and its Office tools.
 * @param source - Bundled primary-runtime resources selected by the carrier.
 * @param home - Resolved DSH home, including portable or explicitly configured homes.
 * @returns The stable primary-runtime installation directory.
 * @throws If the bundled interpreter cannot be prepared; Python environment values remain unchanged.
 */
export async function configurePythonRuntime(source: string, home: string): Promise<string> {
  const root = join(home, 'dsh-runtimes', 'dsh-primary-runtime')
  const manifest = await readPrimaryRuntime(source)
  const paths = await installPrimaryRuntime(source, root)
  process.env.DSH_PYTHON_EXECUTABLE = paths.python
  process.env.DSH_PYTHON_SITE_PACKAGES = paths.pythonPackages
  process.env.ZEROWALL_PYTHON_BASE_REVISION = manifest.payloadDigest ?? `${manifest.platform}-${manifest.arch}-${manifest.python}`
  process.env.ZEROWALL_PYTHON_DEPENDENCIES_ROOT ??= join(home, 'python')
  return root
}
