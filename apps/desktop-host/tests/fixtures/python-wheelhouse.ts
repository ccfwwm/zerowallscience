/** Small offline wheel payloads for carrier preparation and built startup tests. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Write one physical wheel and its hash-locked resource metadata without invoking Python or uv.
 * @param root - Private resource directory owned by the calling test.
 * @param target - Target identifiers; defaults to this test process.
 * @returns Paths and metadata callers can mutate to exercise resource failures.
 */
export function writePythonWheelhouseFixture(root: string, target = { platform: process.platform, arch: process.arch }) {
  const wheel = Buffer.from('offline test wheel')
  const lock = 'fixture-package==1.0.0 --hash=sha256:fixture\n'
  const filename = 'fixture_package-1.0.0-py3-none-any.whl'
  const wheels = join(root, 'wheels')
  mkdirSync(wheels, { recursive: true })
  writeFileSync(join(wheels, filename), wheel)
  writeFileSync(join(root, 'core.lock'), lock)
  const manifest = {
    schema: 1, platform: target.platform, arch: target.arch, pythonVersion: '3.12.14',
    requirements: 'core.lock', wheels: 'wheels', revision: createHash('sha256').update(lock).digest('hex'),
    files: [{ filename, sha256: createHash('sha256').update(wheel).digest('hex'), bytes: wheel.length }],
  }
  const manifestPath = join(root, 'runtime.json')
  writeFileSync(manifestPath, JSON.stringify(manifest))
  return { root, wheels, filename, manifest, manifestPath }
}
