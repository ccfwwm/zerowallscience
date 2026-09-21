export interface ScratchMeasurement {
  sampleId: string
  time: string
  initialArea: number
  remainingArea: number
  closureFraction: number
  closurePercent: number
  flags: string[]
}

export function scratchWoundMeasurement(input: { sampleId: string; time: string; initialArea: number; remainingArea: number }): ScratchMeasurement {
  const text = (value: unknown, name: string): string => { if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`${name} is required.`); return value.trim() }
  const positive = (value: unknown, name: string): number => { if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number.`); return value }
  const nonNegative = (value: unknown, name: string): number => { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number.`); return value }
  const sampleId = text(input.sampleId, 'sampleId'); const time = text(input.time, 'time'); const initialArea = positive(input.initialArea, 'initialArea'); const remainingArea = nonNegative(input.remainingArea, 'remainingArea')
  const closureFraction = (initialArea - remainingArea) / initialArea
  return { sampleId, time, initialArea, remainingArea, closureFraction, closurePercent: closureFraction * 100, flags: [remainingArea > initialArea ? 'wound_area_expanded' : '', remainingArea === 0 ? 'complete_closure_observed' : ''].filter(Boolean) }
}

export interface ColonyMeasurement { wellId: string; independentCount: number; stainedArea: number | null; stainUnit: string | null; flags: string[] }
export function colonyMeasurement(input: { wellId: string; independentCount: number; stainedArea?: number; stainUnit?: string }): ColonyMeasurement {
  if (typeof input.wellId !== 'string' || !input.wellId.trim()) throw new Error('wellId is required.')
  if (!Number.isSafeInteger(input.independentCount) || input.independentCount < 0) throw new Error('independentCount must be a non-negative integer.')
  const hasArea = input.stainedArea !== undefined || input.stainUnit !== undefined
  if (hasArea && (typeof input.stainedArea !== 'number' || !Number.isFinite(input.stainedArea) || input.stainedArea < 0 || typeof input.stainUnit !== 'string' || !input.stainUnit.trim())) throw new Error('Stained area requires a non-negative value and explicit unit.')
  return { wellId: input.wellId.trim(), independentCount: input.independentCount, stainedArea: hasArea ? input.stainedArea! : null, stainUnit: hasArea ? input.stainUnit!.trim() : null, flags: input.independentCount === 0 ? ['no_independent_colonies_observed'] : [] }
}

export interface CfuMeasurement { plateId: string; colonyCount: number; dilutionFactor: number; platedVolumeMl: number; cfuPerMl: number; flags: string[] }
export function cfuMeasurement(input: { plateId: string; colonyCount: number; dilutionFactor: number; platedVolumeMl: number }): CfuMeasurement {
  if (typeof input.plateId !== 'string' || !input.plateId.trim()) throw new Error('plateId is required.')
  if (!Number.isSafeInteger(input.colonyCount) || input.colonyCount < 0) throw new Error('colonyCount must be a non-negative integer.')
  if (!Number.isFinite(input.dilutionFactor) || input.dilutionFactor <= 0) throw new Error('A positive dilution factor is required; omit CFU when dilution is unknown.')
  if (!Number.isFinite(input.platedVolumeMl) || input.platedVolumeMl <= 0) throw new Error('A positive plated volume in mL is required; omit CFU when volume is unknown.')
  const cfuPerMl = input.colonyCount * input.dilutionFactor / input.platedVolumeMl
  return { plateId: input.plateId.trim(), colonyCount: input.colonyCount, dilutionFactor: input.dilutionFactor, platedVolumeMl: input.platedVolumeMl, cfuPerMl, flags: input.colonyCount === 0 ? ['no_colonies_observed'] : [] }
}

export interface CfuImageConfig {
  kind?: 'bacterial-cfu'; plateId: string; dilutionFactor: number; platedVolumeMl: number; threshold: number; minArea: number; maxArea: number
  polarity: 'bright' | 'dark'; roi: { x: number; y: number; width: number; height: number }
}
export interface ScratchImageConfig {
  kind: 'scratch-wound'; sampleId: string; time: string; initialArea: number; threshold: number
  polarity: 'bright' | 'dark'; roi: { x: number; y: number; width: number; height: number }
}
export interface ColonyImageConfig {
  kind: 'colony-formation'; wellId: string; threshold: number; minArea: number; maxArea: number
  polarity: 'bright' | 'dark'; roi: { x: number; y: number; width: number; height: number }; stainUnit?: string
}
export interface TubeImageConfig {
  kind: 'tube-formation'; sampleId: string; threshold: number; polarity: 'bright' | 'dark'
  roi: { x: number; y: number; width: number; height: number }; unit: TubeMeasurement['unit']; unitScale: number
}
export type FijiImageConfig = CfuImageConfig | ScratchImageConfig | ColonyImageConfig | TubeImageConfig
export interface CfuImageResult {
  measurement: CfuMeasurement; width: number; height: number; foregroundPixels: number; componentAreas: number[]; discardedComponents: number; notes: string[]
}

interface MaskResult { mask: Uint8Array; width: number; height: number; foregroundPixels: number }
function thresholdMask(input: { data: Uint8Array; width: number; height: number; threshold: number; polarity: 'bright' | 'dark'; roi: { x: number; y: number; width: number; height: number } }): MaskResult {
  const { data, width, height, threshold, polarity, roi } = input
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || data.length !== width * height) throw new Error('Fiji image dimensions do not match grayscale pixels.')
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) throw new Error('threshold must be between 0 and 255.')
  const { x, y, width: rw, height: rh } = roi
  if (![x, y, rw, rh].every(Number.isSafeInteger) || x < 0 || y < 0 || rw < 1 || rh < 1 || x + rw > width || y + rh > height) throw new Error('Fiji ROI is outside the decoded image.')
  const mask = new Uint8Array(rw * rh); let foregroundPixels = 0
  for (let row = 0; row < rh; row++) for (let col = 0; col < rw; col++) {
    const on = polarity === 'bright' ? data[(y + row) * width + x + col]! >= threshold : data[(y + row) * width + x + col]! <= threshold
    if (on) { mask[row * rw + col] = 1; foregroundPixels++ }
  }
  return { mask, width: rw, height: rh, foregroundPixels }
}
function componentAreas(mask: Uint8Array, width: number, height: number, diagonal = false): number[] {
  const areas: number[] = []; const queue = new Int32Array(Math.max(1, mask.length))
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue; mask[start] = 0; let head = 0; let tail = 0; queue[tail++] = start; let area = 0
    while (head < tail) {
      const index = queue[head++]!; area++; const row = Math.floor(index / width); const col = index - row * width
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 || (!diagonal && Math.abs(dx) + Math.abs(dy) !== 1)) continue
        const nx = col + dx; const ny = row + dy; if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const next = ny * width + nx; if (mask[next]) { mask[next] = 0; queue[tail++] = next }
      }
    }
    areas.push(area)
  }
  return areas
}
export interface ScratchImageResult { measurement: ScratchMeasurement; width: number; height: number; foregroundPixels: number; notes: string[] }
export function analyzeScratchMask(input: { data: Uint8Array; width: number; height: number; config: ScratchImageConfig }): ScratchImageResult {
  const config = input.config; const initialArea = config.initialArea
  if (typeof config.sampleId !== 'string' || !config.sampleId.trim() || typeof config.time !== 'string' || !config.time.trim()) throw new Error('sampleId and time are required.')
  if (!Number.isFinite(initialArea) || initialArea <= 0) throw new Error('initialArea must be positive.')
  const mask = thresholdMask({ ...input, threshold: config.threshold, polarity: config.polarity, roi: config.roi })
  const measurement = scratchWoundMeasurement({ sampleId: config.sampleId, time: config.time, initialArea, remainingArea: mask.foregroundPixels })
  return { measurement, width: mask.width, height: mask.height, foregroundPixels: mask.foregroundPixels, notes: ['Threshold segmentation over a declared wound ROI; the initial area is supplied explicitly.', 'This runner does not infer wound identity or treatment effect.'] }
}
export interface ColonyImageResult { measurement: ColonyMeasurement; width: number; height: number; foregroundPixels: number; componentAreas: number[]; discardedComponents: number; notes: string[] }
export function analyzeColonyMask(input: { data: Uint8Array; width: number; height: number; config: ColonyImageConfig }): ColonyImageResult {
  const config = input.config
  if (!Number.isSafeInteger(config.minArea) || config.minArea < 1 || !Number.isSafeInteger(config.maxArea) || config.maxArea < config.minArea) throw new Error('Colony area bounds are invalid.')
  const mask = thresholdMask({ ...input, threshold: config.threshold, polarity: config.polarity, roi: config.roi })
  const all = componentAreas(mask.mask, mask.width, mask.height, false); const kept = all.filter(area => area >= config.minArea && area <= config.maxArea)
  const stainedArea = config.stainUnit?.trim() ? kept.reduce((sum, area) => sum + area, 0) : undefined
  const measurement = colonyMeasurement({ wellId: config.wellId, independentCount: kept.length, ...(stainedArea === undefined ? {} : { stainedArea, stainUnit: config.stainUnit }) })
  return { measurement, width: mask.width, height: mask.height, foregroundPixels: input.width * input.height === 0 ? 0 : mask.foregroundPixels, componentAreas: kept, discardedComponents: all.length - kept.length, notes: ['4-connected component segmentation keeps independent count separate from stained area.', 'Area units are pixels unless an explicit calibrated stainUnit is supplied; no clump is split automatically.'] }
}

function thinZhangSuen(source: Uint8Array, width: number, height: number): Uint8Array {
  const mask = Uint8Array.from(source); let changed = true
  const neighbors = (index: number): number[] => { const y = Math.floor(index / width); const x = index - y * width; return [mask[(y - 1) * width + x] ?? 0, mask[(y - 1) * width + x + 1] ?? 0, mask[y * width + x + 1] ?? 0, mask[(y + 1) * width + x + 1] ?? 0, mask[(y + 1) * width + x] ?? 0, mask[(y + 1) * width + x - 1] ?? 0, mask[y * width + x - 1] ?? 0, mask[(y - 1) * width + x - 1] ?? 0] }
  while (changed) {
    changed = false
    for (const phase of [0, 1]) { const remove: number[] = []
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) { const i = y * width + x; if (!mask[i]) continue; const n = neighbors(i); const count = n.reduce((sum, v) => sum + v, 0); const transitions = n.reduce((sum, v, k) => sum + (v === 0 && n[(k + 1) % 8] === 1 ? 1 : 0), 0); if (count < 2 || count > 6 || transitions !== 1) continue; const p2=n[0]!,p4=n[2]!,p6=n[4]!,p8=n[6]!; if (phase===0 ? p2*p4*p6===0 && p4*p6*p8===0 : p2*p4*p8===0 && p2*p6*p8===0) remove.push(i) }
      if (remove.length) { changed = true; for (const i of remove) mask[i] = 0 }
    }
  }
  return mask
}
function skeletonTopology(mask: Uint8Array, width: number, height: number): { length: number; endpoints: number; junctions: number; segments: number; meshes: number } {
  const degree = (i: number): number => { const y=Math.floor(i/width),x=i-y*width; let d=0; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<width&&ny<height&&mask[ny*width+nx])d++} return d }
  let endpoints=0,junctions=0,length=0; const nodes = new Set<number>(); for(let i=0;i<mask.length;i++) if(mask[i]){length++;const d=degree(i);if(d===1){endpoints++;nodes.add(i)}else if(d>=3){junctions++;nodes.add(i)}}
  const edgeKeys=new Set<string>(); const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
  const nextPixels=(i:number)=>{const y=Math.floor(i/width),x=i-y*width;const out:number[]=[];for(const [dy,dx] of dirs){const nx=x+dx!,ny=y+dy!;if(nx>=0&&ny>=0&&nx<width&&ny<height&&mask[ny*width+nx])out.push(ny*width+nx)}return out}
  for(const node of nodes) for(const first of nextPixels(node)){let prev=node,current=first; const path=[node,current]; while(!nodes.has(current)){const next=nextPixels(current).find(i=>i!==prev);if(next===undefined)break;prev=current;current=next;path.push(current)} const end=path[path.length-1]!; const key=[node,end].sort((a,b)=>a-b).join(':'); edgeKeys.add(key)}
  const components=componentAreas(Uint8Array.from(mask),width,height,true).length; const segments=nodes.size===0 && length>0 ? 1 : edgeKeys.size
  return { length, endpoints, junctions, segments, meshes: Math.max(0, components - 1) }
}
export interface TubeImageResult { measurement: TubeMeasurement; width: number; height: number; foregroundPixels: number; skeletonPixels: number; notes: string[] }
export function analyzeTubeMask(input: { data: Uint8Array; width: number; height: number; config: TubeImageConfig }): TubeImageResult {
  const config=input.config; const mask=thresholdMask({ ...input, threshold: config.threshold, polarity: config.polarity, roi: config.roi }); const skeleton=thinZhangSuen(mask.mask,mask.width,mask.height); const topology=skeletonTopology(skeleton,mask.width,mask.height)
  const measurement=tubeMeasurement({sampleId:config.sampleId,unit:config.unit,unitScale:config.unitScale,length:topology.length*config.unitScale,endpoints:topology.endpoints,junctions:topology.junctions,segments:topology.segments,meshes:topology.meshes})
  return {measurement,width:mask.width,height:mask.height,foregroundPixels:mask.foregroundPixels,skeletonPixels:topology.length,notes:['Zhang-Suen thinning is applied to a declared binary ROI before graph topology metrics.','Length is skeleton-pixel count multiplied by the supplied unit scale; calibration and segmentation remain reviewable.']}
}

/** Auditable 4-connected colony segmentation over a declared grayscale ROI. */
export function analyzeCfuMask(input: { data: Uint8Array; width: number; height: number; config: CfuImageConfig }): CfuImageResult {
  const { data, width, height, config } = input
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || data.length !== width * height) throw new Error('CFU image dimensions do not match grayscale pixels.')
  const positive = (value: unknown, name: string): number => { if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive.`); return value }
  if (typeof config.plateId !== 'string' || !config.plateId.trim()) throw new Error('plateId is required.')
  positive(config.dilutionFactor, 'dilutionFactor'); positive(config.platedVolumeMl, 'platedVolumeMl')
  if (!Number.isFinite(config.threshold) || config.threshold < 0 || config.threshold > 255) throw new Error('threshold must be between 0 and 255.')
  if (!Number.isSafeInteger(config.minArea) || config.minArea < 1 || !Number.isSafeInteger(config.maxArea) || config.maxArea < config.minArea) throw new Error('CFU area bounds are invalid.')
  if (!['bright', 'dark'].includes(config.polarity)) throw new Error('CFU polarity must be bright or dark.')
  const { x, y, width: rw, height: rh } = config.roi
  if (![x, y, rw, rh].every(Number.isSafeInteger) || x < 0 || y < 0 || rw < 1 || rh < 1 || x + rw > width || y + rh > height) throw new Error('CFU ROI is outside the decoded image.')
  const foreground = new Uint8Array(rw * rh); let foregroundPixels = 0
  for (let row = 0; row < rh; row++) for (let col = 0; col < rw; col++) {
    const value = data[(y + row) * width + x + col]!
    const on = config.polarity === 'bright' ? value >= config.threshold : value <= config.threshold
    if (on) { foreground[row * rw + col] = 1; foregroundPixels++ }
  }
  const areas: number[] = []; let discardedComponents = 0; const queue = new Int32Array(Math.max(1, rw * rh))
  for (let start = 0; start < foreground.length; start++) {
    if (foreground[start] === 0) continue
    foreground[start] = 0; let head = 0; let tail = 0; queue[tail++] = start; let area = 0
    while (head < tail) {
      const index = queue[head++]!; area++; const row = Math.floor(index / rw); const col = index - row * rw
      const neighbors = col > 0 ? [index - 1] : []
      if (col + 1 < rw) neighbors.push(index + 1); if (row > 0) neighbors.push(index - rw); if (row + 1 < rh) neighbors.push(index + rw)
      for (const next of neighbors) if (foreground[next] === 1) { foreground[next] = 0; queue[tail++] = next }
    }
    if (area >= config.minArea && area <= config.maxArea) areas.push(area); else discardedComponents++
  }
  const measurement = cfuMeasurement({ plateId: config.plateId, colonyCount: areas.length, dilutionFactor: config.dilutionFactor, platedVolumeMl: config.platedVolumeMl })
  return { measurement, width: rw, height: rh, foregroundPixels, componentAreas: areas, discardedComponents, notes: ['4-connected grayscale threshold segmentation over the declared plate ROI.', 'Components outside minArea/maxArea are discarded and reported.', 'CFU/mL uses supplied dilution and plated volume; segmentation alone is not a microbiological identity check.'] }
}

export interface TubeMeasurement { sampleId: string; unit: 'pixel' | 'um' | 'mm'; unitScale: number; length: number; endpoints: number; junctions: number; segments: number; meshes: number; flags: string[] }
export function tubeMeasurement(input: { sampleId: string; unit: TubeMeasurement['unit']; unitScale: number; length: number; endpoints: number; junctions: number; segments: number; meshes: number }): TubeMeasurement {
  if (typeof input.sampleId !== 'string' || !input.sampleId.trim()) throw new Error('sampleId is required.')
  if (!['pixel','um','mm'].includes(input.unit)) throw new Error('Tube length unit must be pixel, um or mm.')
  if (!Number.isFinite(input.unitScale) || input.unitScale <= 0) throw new Error('Positive tube unit scale is required.')
  for (const [name,value] of Object.entries(input).filter(([key]) => ['length','endpoints','junctions','segments','meshes'].includes(key))) if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative.`)
  if (!Number.isInteger(input.endpoints) || !Number.isInteger(input.junctions) || !Number.isInteger(input.segments) || !Number.isInteger(input.meshes)) throw new Error('Topology counts must be integers.')
  const flags = input.segments === 0 ? ['no_skeleton_segments_observed'] : []
  return { sampleId: input.sampleId.trim(), unit: input.unit, unitScale: input.unitScale, length: input.length, endpoints: input.endpoints, junctions: input.junctions, segments: input.segments, meshes: input.meshes, flags }
}

export type FijiExperimentId = 'scratch-wound' | 'colony-formation' | 'bacterial-cfu' | 'tube-formation'
export type FijiExperimentMeasurement = ScratchMeasurement | ColonyMeasurement | CfuMeasurement | TubeMeasurement
export type FijiImageResult = CfuImageResult | ScratchImageResult | ColonyImageResult | TubeImageResult
export interface FijiExperimentResult { format: 'zerowall-fiji-experiment'; version: 1; experiment: FijiExperimentId; measurements: FijiExperimentMeasurement[]; notes: string[]; imageAnalysis?: FijiImageResult }

export function analyzeFijiExperiment(experiment: FijiExperimentId, values: unknown): FijiExperimentResult {
  if (!Array.isArray(values) || values.length < 1 || values.length > 10000) throw new Error('Fiji experiment measurements must contain 1–10,000 rows.')
  const measurements = values.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each Fiji experiment measurement must be an object.')
    switch (experiment) {
      case 'scratch-wound': return scratchWoundMeasurement(value as Parameters<typeof scratchWoundMeasurement>[0])
      case 'colony-formation': return colonyMeasurement(value as Parameters<typeof colonyMeasurement>[0])
      case 'bacterial-cfu': return cfuMeasurement(value as Parameters<typeof cfuMeasurement>[0])
      case 'tube-formation': return tubeMeasurement(value as Parameters<typeof tubeMeasurement>[0])
    }
  })
  return { format: 'zerowall-fiji-experiment', version: 1, experiment, measurements, notes: [
    'Measurements retain declared sample, time/well/plate identifiers and quality flags.',
    experiment === 'bacterial-cfu' ? 'CFU/mL is reported only when dilution factor and plated volume are supplied.' : 'Deterministic metric service; image segmentation and Fiji plugin fields must remain linked in the source run.',
  ] }
}
