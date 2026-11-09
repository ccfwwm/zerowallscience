/** Immutable business package generations activated only while the Desktop Host is stopped. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

/** User-profile update journal; package contents live in immutable generation directories. */
export interface BusinessUpdateState {
  schemaVersion: 1
  active?: string
  previous?: string
  pending?: string
  failed?: string
  phase: 'prepared' | 'activating' | 'verified' | 'restored' | 'restore-failed'
}

/**
 * Resolve a validated generation id inside its profile.
 * @param profileDir - User-owned profile directory.
 * @param id - Generated UUID, never a filesystem path.
 * @returns Absolute generation directory.
 */
export function businessGenerationDir(profileDir: string, id: string): string {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(id)) throw new Error('Invalid business update generation')
  return join(profileDir, '.business-updates', 'generations', id)
}

/**
 * Read and validate the durable activation journal; a damaged journal blocks startup.
 * @param profileDir - User-owned profile directory.
 * @returns Journal, or undefined before the first business update.
 */
export function readBusinessUpdateState(profileDir: string): BusinessUpdateState | undefined {
  const path = join(profileDir, '.business-updates', 'state.json')
  if (!existsSync(path)) return undefined
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value) || value.schemaVersion !== 1
    || !('phase' in value) || !['prepared', 'activating', 'verified', 'restored', 'restore-failed'].includes(String(value.phase))) {
    throw new Error('Business update journal is damaged; repair the profile before starting')
  }
  for (const key of ['active', 'previous', 'pending', 'failed']) {
    const id: unknown = Reflect.get(value, key)
    if (id !== undefined) {
      if (typeof id !== 'string') throw new Error('Invalid business update journal')
      businessGenerationDir(profileDir, id)
    }
  }
  if ((value.phase === 'prepared') !== ('pending' in value && value.pending !== undefined)) throw new Error('Invalid pending business update')
  if (value.phase === 'activating' && !('active' in value && typeof value.active === 'string')) throw new Error('Invalid active business update')
  return value as BusinessUpdateState
}

/**
 * Atomically replace the activation journal after its immutable generation is complete.
 * @param profileDir - User-owned profile directory.
 * @param state - Validated transition owned by the updater or Desktop lifecycle.
 */
export function writeBusinessUpdateState(profileDir: string, state: BusinessUpdateState): void {
  const directory = join(profileDir, '.business-updates')
  mkdirSync(directory, { recursive: true })
  const temporary = join(directory, `state-${randomUUID()}.tmp`)
  writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', flush: true })
  renameSync(temporary, join(directory, 'state.json'))
}

/**
 * Read the active generation's exact npm dependencies without falling back on unreadable data.
 * @param profileDir - User-owned profile directory.
 * @returns Active exact dependencies, or an empty map for the bundled baseline.
 */
export function businessGenerationDependencies(profileDir: string): Record<string, string> {
  const active = readBusinessUpdateState(profileDir)?.active
  if (active === undefined) return {}
  const value: unknown = JSON.parse(readFileSync(join(businessGenerationDir(profileDir, active), 'package.json'), 'utf8'))
  if (typeof value !== 'object' || value === null || !('dependencies' in value) || typeof value.dependencies !== 'object' || value.dependencies === null
    || Array.isArray(value.dependencies) || !Object.values(value.dependencies).every(version => typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version))) {
    throw new Error('Active business update manifest is damaged')
  }
  return value.dependencies as Record<string, string>
}

/**
 * Activate one prepared generation, or restore an interrupted activation, before spawning a Host.
 * @param profileDir - Profile whose Host has stopped.
 * @returns True when this startup must verify a candidate or a recovery.
 */
export function activateBusinessUpdate(profileDir: string): boolean {
  const state = readBusinessUpdateState(profileDir)
  if (state === undefined) return false
  if (state.phase === 'activating') {
    restoreBusinessUpdate(profileDir)
    const restored = readBusinessUpdateState(profileDir)
    try { if (restored?.active !== undefined) verifyBusinessGeneration(profileDir, restored.active) }
    catch (error) { confirmBusinessUpdate(profileDir, false); throw error }
    return true
  }
  if (state.pending === undefined) {
    if (state.active !== undefined) verifyBusinessGeneration(profileDir, state.active)
    return state.phase === 'restored' || state.phase === 'restore-failed'
  }
  const { pending, active } = state
  writeBusinessUpdateState(profileDir, { schemaVersion: 1, active: pending, ...active === undefined ? {} : { previous: active }, phase: 'activating' })
  try { verifyBusinessGeneration(profileDir, pending) }
  catch (_error) {
    // Candidate bytes are untrusted; verify recovery before a Host can start.
    restoreBusinessUpdate(profileDir)
    const restored = readBusinessUpdateState(profileDir)
    try { if (restored?.active !== undefined) verifyBusinessGeneration(profileDir, restored.active) }
    catch (error) { confirmBusinessUpdate(profileDir, false); throw error }
  }
  return true
}

/**
 * Restore the previously verified generation after a candidate startup fails.
 * @param profileDir - Profile whose failed Host has stopped.
 */
export function restoreBusinessUpdate(profileDir: string): void {
  const state = readBusinessUpdateState(profileDir)
  if (state === undefined) throw new Error('Business update recovery has no journal')
  writeBusinessUpdateState(profileDir, {
    schemaVersion: 1, ...state.previous === undefined ? {} : { active: state.previous },
    ...state.active === undefined ? {} : { failed: state.active }, phase: 'restored',
  })
}

/**
 * Record the independently observed Host startup result, including failed recovery.
 * @param profileDir - User-owned profile directory.
 * @param healthy - Host is ready and every selected Client entry activated and mounted.
 */
export function confirmBusinessUpdate(profileDir: string, healthy: boolean): void {
  const state = readBusinessUpdateState(profileDir)
  if (state === undefined) return
  writeBusinessUpdateState(profileDir, { ...state, phase: healthy ? (state.failed !== undefined ? 'restored' : 'verified') : 'restore-failed' })
}

/**
 * Return to the installation after an explicit native recovery action, retaining the original journal as evidence.
 * @param profileDir - Profile whose Host has stopped and whose plugins the user chose to disable.
 */
export function resetBusinessUpdate(profileDir: string): void {
  const directory = join(profileDir, '.business-updates')
  const path = join(directory, 'state.json')
  if (!existsSync(path)) return
  writeFileSync(join(directory, `state-before-repair-${randomUUID()}.json`), readFileSync(path), { flag: 'wx', flush: true })
  writeBusinessUpdateState(profileDir, { schemaVersion: 1, phase: 'restored' })
}

/** Hash all generation files and contained symlinks; external links are refused. */
function generationDigest(directory: string): string {
  const root = realpathSync(directory)
  const hash = createHash('sha256')
  const walk = (path: string): void => {
    for (const name of readdirSync(path).sort()) {
      if (path === root && name === 'seal.json') continue
      const entry = join(path, name)
      const key = relative(root, entry).replaceAll('\\', '/')
      const stat = lstatSync(entry)
      if (stat.isSymbolicLink()) {
        const target = relative(root, realpathSync(entry))
        if (target === '..' || target.startsWith('..\\') || target.startsWith('../') || isAbsolute(target)) throw new Error('Business generation links outside its directory')
        hash.update(JSON.stringify(['link', key, target.replaceAll('\\', '/')]))
      } else if (stat.isDirectory()) walk(entry)
      else if (stat.isFile()) { hash.update(JSON.stringify(['file', key, stat.size])); hash.update(readFileSync(entry)) }
      else throw new Error('Business generation contains unsupported files')
    }
  }
  walk(root)
  return hash.digest('hex')
}

/**
 * Seal a completed candidate before it can be scheduled for activation.
 * @param profileDir - User profile owning the immutable candidate.
 * @param id - Generation UUID.
 */
export function sealBusinessGeneration(profileDir: string, id: string): void {
  const directory = businessGenerationDir(profileDir, id)
  writeFileSync(join(directory, 'seal.json'), JSON.stringify({ schemaVersion: 1, sha256: generationDigest(directory) }) + '\n', { flag: 'wx', flush: true })
}

/**
 * Refuse missing, modified, or externally linked candidate files before starting a Host.
 * @param profileDir - User profile owning the generation.
 * @param id - Generation UUID.
 */
export function verifyBusinessGeneration(profileDir: string, id: string): void {
  const directory = businessGenerationDir(profileDir, id)
  const seal: unknown = JSON.parse(readFileSync(join(directory, 'seal.json'), 'utf8'))
  if (typeof seal !== 'object' || seal === null || !('schemaVersion' in seal) || seal.schemaVersion !== 1
    || !('sha256' in seal) || seal.sha256 !== generationDigest(directory)) throw new Error('Business update files failed integrity verification')
}
