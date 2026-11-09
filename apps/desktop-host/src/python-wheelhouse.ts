/** Validate the release-owned offline Python wheels kept outside the copied interpreter payload. */
import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'

interface Wheel { filename: string; sha256: string; bytes: number }
interface Manifest { platform: string; arch: string; pythonVersion: string; revision: string; files: Wheel[] }

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)

function parseManifest(value: unknown): Manifest {
  if (!isRecord(value) || value.schema !== 1 || typeof value.platform !== 'string' || typeof value.arch !== 'string'
    || typeof value.pythonVersion !== 'string' || value.requirements !== 'core.lock' || value.wheels !== 'wheels'
    || !isHash(value.revision) || !Array.isArray(value.files) || value.files.length === 0) {
    throw new Error('Desktop Python wheelhouse manifest is invalid. Prepare matching Python resources again.')
  }
  const names = new Set<string>()
  const files: Wheel[] = value.files.map((file: unknown) => {
    if (!isRecord(file) || typeof file.filename !== 'string' || basename(file.filename) !== file.filename
      || file.filename.includes('\\') || !file.filename.endsWith('.whl') || !isHash(file.sha256)
      || typeof file.bytes !== 'number' || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || names.has(file.filename)) {
      throw new Error('Desktop Python wheelhouse contains an invalid wheel record. Prepare matching Python resources again.')
    }
    names.add(file.filename)
    return { filename: file.filename, sha256: file.sha256, bytes: file.bytes }
  })
  return { platform: value.platform, arch: value.arch, pythonVersion: value.pythonVersion, revision: value.revision, files }
}

async function physicalFile(path: string): Promise<Buffer> {
  if (!(await lstat(path)).isFile()) throw new Error(`Desktop Python wheelhouse requires a physical file: ${path}`)
  return readFile(path)
}

/**
 * Verify metadata, the core lock and all release wheels before publication or application startup.
 * @param root - Absolute resource directory containing runtime.json, core.lock and wheels/.
 * @param target - Carrier platform, architecture and optional interpreter version.
 * @returns The absolute directory uv can read without copying wheels into the Harness home.
 * @throws For missing, linked, changed or incompatible resources; no environment values are published.
 */
export async function verifyPythonWheelhouse(
  root: string, target: { platform: string; arch: string; pythonVersion?: string },
): Promise<string> {
  if (!isAbsolute(root)) throw new Error('Desktop Python wheelhouse directory must be absolute.')
  if (!(await lstat(root)).isDirectory()) throw new Error('Desktop Python wheelhouse requires a physical directory.')
  const manifest = parseManifest(JSON.parse((await physicalFile(join(root, 'runtime.json'))).toString('utf8')))
  if (manifest.platform !== target.platform || manifest.arch !== target.arch
    || (target.pythonVersion !== undefined && manifest.pythonVersion !== target.pythonVersion)) {
    throw new Error('Desktop Python wheelhouse does not match the target interpreter. Prepare matching Python resources again.')
  }
  if (hash(await physicalFile(join(root, 'core.lock'))) !== manifest.revision) throw new Error('Desktop Python wheelhouse core lock checksum mismatch.')
  const wheels = join(root, 'wheels')
  if (!(await lstat(wheels)).isDirectory()) throw new Error('Desktop Python wheelhouse requires a physical wheels directory.')
  for (const file of manifest.files) {
    const bytes = await physicalFile(join(wheels, file.filename))
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`Desktop Python wheel checksum mismatch: ${file.filename}`)
  }
  return wheels
}
