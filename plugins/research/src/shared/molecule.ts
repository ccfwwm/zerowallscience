export interface MoleculeAtom {
  index: number; serial: string; name: string; element: string; chain: string; residueId: string; residueName: string
  residueNumber: string; insertionCode: string; altLoc: string; hetero: boolean; x: number; y: number; z: number
  formalCharge?: number
}
export interface MoleculeResidue { id: string; chain: string; name: string; number: string; insertionCode: string; hetero: boolean; atoms: number }
export interface MoleculeSummary {
  format: 'pdb' | 'mmcif' | 'sdf'; sourceSha256: string; title: string; atomCount: number; model: string; modelCount: number
  chains: Array<{ id: string; atoms: number; residues: number }>; residues: MoleculeResidue[]; atoms: MoleculeAtom[]; notes: string[]
  sdfEncoding?: 'V2000' | 'V3000'; bonds?: Array<{ atomA: number; atomB: number; order: number }>
}
export interface MoleculeCamera { mode: 'perspective' | 'orthographic'; position: [number, number, number]; target: [number, number, number]; up: [number, number, number]; radius: number; radiusMax: number; fov: number; fog: number; clipFar: boolean; minNear: number; minFar: number }
export interface MoleculeViewState { chain: string | null; residueId: string | null; representation: 'ball-and-stick' | 'cartoon' | 'molecular-surface'; camera: MoleculeCamera | null; atomA: number | null; atomB: number | null }
export interface MoleculeMeasurement { atomA: MoleculeAtom; atomB: MoleculeAtom; distanceAngstrom: number; convention: 'Euclidean distance in source Cartesian coordinates; first model only'; sourceSha256: string }
export interface MoleculeRuntime { version: '5.11.0'; source: string; sha256: string; bytes: number }
export const INITIAL_MOLECULE_STATE: MoleculeViewState = { chain: null, residueId: null, representation: 'ball-and-stick', camera: null, atomA: null, atomB: null }
