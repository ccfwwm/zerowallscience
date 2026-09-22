export interface MoleculeDockingRequest {
  sessionId: string
  action: 'list' | 'submit' | 'status' | 'cancel'
  requestId?: string
  runId?: string
  receptorAssetId?: string
  ligandAssetId?: string
  expectedReceptorVersion?: number
  expectedLigandVersion?: number
  preparationSource?: string
  box?: { center: [number, number, number]; size: [number, number, number] }
  threads?: number
}
export interface DockingLigand { id: string; smiles: string; source: string }
export const DOCKING_RUNNER = 'zerowall-vina/7.0.0-1'
export const DOCKING_TOOL = 'biomni.tool.pharmacology.docking_autodock_vina'

export function validateDockingSettings(input: MoleculeDockingRequest): { box: NonNullable<MoleculeDockingRequest['box']>; threads: number; preparationSource: string } {
  const box = input.box
  if (!box || !Array.isArray(box.center) || !Array.isArray(box.size) || box.center.length !== 3 || box.size.length !== 3 || [...box.center, ...box.size].some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Docking box requires three finite center and size coordinates in ångströms.')
  if (box.center.some(v => Math.abs(v) > 100000) || box.size.some(v => v < 1 || v > 60) || box.size.reduce((a, b) => a * b, 1) > 125000) throw new Error('Docking box exceeds the bounded search region: axes 1–60 Å, volume ≤125000 Å³.')
  const threads = input.threads ?? 1
  if (!Number.isInteger(threads) || threads < 1 || threads > 8) throw new Error('Docking uses 1–8 CPU threads.')
  if (typeof input.preparationSource !== 'string' || input.preparationSource.trim().length < 5 || input.preparationSource.length > 4000) throw new Error('Record the receptor preparation source, protonation and retained components before docking.')
  return { box: { center: [...box.center], size: [...box.size] }, threads, preparationSource: input.preparationSource.trim() }
}
export function validateDockingLigands(value: unknown): DockingLigand[] {
  if (!Array.isArray(value) || !value.length || value.length > 32) throw new Error('Ligand asset must be a JSON array of 1–32 {id, smiles, source} records.')
  const ids = new Set<string>()
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/u.test(item.id) || ids.has(item.id) || typeof item.smiles !== 'string' || !item.smiles.trim() || item.smiles.length > 2000 || /[\r\n\0]/u.test(item.smiles) || typeof item.source !== 'string' || !item.source.trim() || item.source.length > 4000) throw new Error('Each ligand needs a unique ID, one SMILES string and an explicit source.')
    ids.add(item.id);return { id: item.id, smiles: item.smiles.trim(), source: item.source.trim() }
  })
}
