/** Publish carrier-owned Python locations before profile plugins are loaded. */
import { join } from 'node:path'
import { installPrimaryRuntime, readPrimaryRuntime } from '@deepseek-ai/dsh-tool-workspace-dependencies'

/**
 * Materialize DSH's base payload in a versioned home so app upgrades do not move an active venv's base.
 * @param source - Bundled primary-runtime resources selected by the carrier.
 * @param home - Resolved DSH home, including portable or explicitly configured homes.
 * @returns The stable primary-runtime installation directory.
 * @throws If the bundled interpreter cannot be prepared; Python environment values remain unchanged.
 */
export async function configurePythonRuntime(source: string, home: string): Promise<string> {
  const manifest = await readPrimaryRuntime(source)
  const payloadIdentity = manifest.payloadDigest ?? `${manifest.python}-${manifest.platform}-${manifest.arch}`
  const identity = `${manifest.desktopVersion}-${payloadIdentity}`
  const root = join(home, 'dsh-runtimes', 'primary', identity)
  const paths = await installPrimaryRuntime(source, root)
  process.env.DSH_PYTHON_EXECUTABLE = paths.python
  process.env.DSH_PYTHON_SITE_PACKAGES = paths.pythonPackages
  process.env.ZEROWALL_PYTHON_DEPENDENCIES_ROOT ??= join(home, 'zerowall', 'python')
  return root
}
