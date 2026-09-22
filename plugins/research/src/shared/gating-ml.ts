import type { FlowAnalysis, FlowCompensation, FlowGate } from './flow.js'
const xml = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

export function gatingMlSubset(analysis: FlowAnalysis, gates: FlowGate[], compensation?: FlowCompensation): string {
  const G = 'http://www.isac-net.org/std/Gating-ML/v2.0/gating'; const T = 'http://www.isac-net.org/std/Gating-ML/v2.0/transformations'; const D = 'http://www.isac-net.org/std/Gating-ML/v2.0/datatypes'
  const ids = new Set(gates.map(gate => gate.id)); const transformId = 'zw_asinh'; const matrixId = 'zw_compensation'
  if (ids.size !== gates.length || gates.some(gate => !/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(gate.id)) || ids.has(transformId) || ids.has(matrixId)) throw new Error('GatingML requires unique supported XML IDs, excluding reserved transform/matrix names.')
  if (gates.some(gate => gate.boundaryMode !== 'gatingml')) throw new Error('Legacy inclusive gates cannot be silently exported as GatingML. Explicitly adopt standard min-inclusive/max-exclusive boundaries and recompute first.')
  if (!gates.length) throw new Error('GatingML export requires at least one gate.')
  const compensationRef = analysis.compensationApplied ? compensation ? matrixId : 'FCS' : 'uncompensated'
  const transformationRef = analysis.transform === 'arcsinh' ? ` gating:transformation-ref="${transformId}"` : ''
  const transform = analysis.transform === 'arcsinh' ? `<transforms:transformation transforms:id="${transformId}"><transforms:fasinh transforms:T="${analysis.cofactor * Math.sinh(1)}" transforms:M="${1 / Math.LN10}" transforms:A="0"/></transforms:transformation>` : ''
  const matrix = analysis.compensationApplied && compensation ? `<transforms:spectrumMatrix transforms:id="${matrixId}"><transforms:fluorochromes>${compensation.channels.map(name => `<data-type:fcs-dimension data-type:name="${xml(name)}"/>`).join('')}</transforms:fluorochromes><transforms:detectors>${compensation.channels.map(name => `<data-type:fcs-dimension data-type:name="${xml(name)}"/>`).join('')}</transforms:detectors>${compensation.matrix.map(row => `<transforms:spectrum>${row.map(value => `<transforms:coefficient transforms:value="${value}"/>`).join('')}</transforms:spectrum>`).join('')}</transforms:spectrumMatrix>` : ''
  const body = gates.map(gate => {
    const tag = gate.polygon ? 'PolygonGate' : 'RectangleGate'; const dimensions = [gate.x, ...(gate.y ? [gate.y] : [])]
    const dimensionXml = dimensions.map(dimension => `<gating:dimension gating:compensation-ref="${compensationRef}"${transformationRef}${gate.polygon ? '' : ` gating:min="${dimension.min}" gating:max="${dimension.max}"`}><data-type:fcs-dimension data-type:name="${xml(dimension.channel)}"/></gating:dimension>`).join('')
    const vertices = gate.polygon?.map(point => `<gating:vertex><gating:coordinate data-type:value="${point[0]}"/><gating:coordinate data-type:value="${point[1]}"/></gating:vertex>`).join('') ?? ''
    return `<gating:${tag} gating:id="${xml(gate.id)}" zerowall:name="${xml(gate.name)}"${gate.parentId ? ` gating:parent_id="${xml(gate.parentId)}"` : ''}>${dimensionXml}${vertices}</gating:${tag}>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gating:Gating-ML xmlns:gating="${G}" xmlns:transforms="${T}" xmlns:data-type="${D}" xmlns:zerowall="https://zerowallscience.org/gating">${transform}${matrix}${body}</gating:Gating-ML>\n`
}
