export interface SequenceSimulationOptions {
  forwardPrimer?: string
  reversePrimer?: string
  forwardAnnealLength?: number
  reverseAnnealLength?: number
  templateTopology?: 'linear' | 'circular'
  maxProductLength?: number
  fragments?: Array<{ recordIndex: number; reverseComplement: boolean }>
  productTopology?: 'linear' | 'circular'
  minimumOverlap?: number
  enzyme?: 'BsaI' | 'BsmBI'
}
export interface SequenceSimulationResult {
  algorithm: string
  parameters: SequenceSimulationOptions
  topology: 'linear' | 'circular'
  sourceRecordIndices: number[]
  productLength: number
  junctions: Array<{ fromRecord: number; toRecord: number; overlap: string; length: number }>
  primerSites?: Array<{ primer: 'forward' | 'reverse'; start: number; end: number; strand: 1 | -1; annealLength: number; tail: string }>
  fragments?: Array<{ recordIndex: number; reverseComplement: boolean; sourceLength: number; retainedStart: number; retainedEnd: number; leftOverhang?: string; rightOverhang?: string }>
}
