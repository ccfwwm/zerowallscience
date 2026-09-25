import type { JsonObject } from '@zerowallscience/research-store/types'
import type { ScienceToolId } from '../shared/workbench.js'

/** Map a workbench operation to an existing deterministic science_viewer action. */
export function scienceViewerAction(tool: ScienceToolId, operation?: string): string {
  const op = operation?.trim()
  const prefix: Partial<Record<ScienceToolId, string>> = {
    imagej: 'image', he: 'he', molecule: 'molecule', sanger: 'sanger', flow: 'flow',
    canvas: 'canvas', cells: 'cell', brainglobe: 'brain',
  }
  const mapped = prefix[tool]
  if (!mapped) {
    if (!op || op === 'sequence_open') return 'open'
    if (['open', 'read', 'save', 'analyze', 'export'].includes(op)) return op
    throw new Error(`Unsupported workbench operation ${op} for ${tool}.`)
  }
  // BrainGlobe owns a managed atlas and is deliberately opt-in.  A missing
  // operation used to be treated as `brain_open`, which meant that a generic
  // workbench request (or a replayed event without an operation) could start
  // loading the Allen atlas.  Require the caller to name the action instead.
  if (!op) {
    if (tool === 'brainglobe') throw new Error('BrainGlobe requires an explicit operation; the atlas is never opened implicitly.')
    return tool === 'canvas' ? 'canvas_render' : `${mapped}_open`
  }
  const allowed: Record<string, string[]> = {
    imagej: ['open', 'read', 'save', 'analyze', 'mask_analyze', 'native_status', 'launch_native'],
    he: ['open', 'read', 'analyze', 'export', 'segment', 'status', 'cancel'],
    molecule: ['runtime', 'open', 'read', 'save', 'measure', 'export'],
    sanger: ['open', 'analyze', 'export', 'review', 'revise'],
    flow: ['open', 'analyze', 'export', 'import', 'workspace_import', 'batch_submit', 'batch_status', 'batch_cancel', 'batch_list'],
    canvas: ['render', 'export'], cells: ['open', 'read', 'analyze', 'export', 'select', 'export_selection', 'view'],
    brainglobe: ['open', 'read', 'analyze', 'export', 'cells', 'trajectory', 'register', 'cellfinder', 'render', 'transform'],
  }
  const aliases: Record<string, string> = { cells_open: 'cell_open', brainglobe_open: 'brain_open', canvas_open: 'canvas_render' }
  const canonical = aliases[op] ?? op
  if (canonical === 'native_status' || canonical === 'launch_native') {
    if (tool !== 'imagej') throw new Error(`Workbench operation ${op} does not belong to ${tool}.`)
    return canonical
  }
  if (canonical.startsWith(`${mapped}_`)) {
    const suffix = canonical.slice(mapped.length + 1)
    if (allowed[tool]?.includes(suffix)) return canonical
    throw new Error(`Unsupported workbench operation ${op} for ${tool}.`)
  }
  if (allowed[tool]?.includes(canonical)) return `${mapped}_${canonical}`
  if (/^[a-z]+_[a-z_]+$/u.test(op)) throw new Error(`Workbench operation ${op} does not belong to ${tool}.`)
  if (!allowed[tool]?.includes(op)) throw new Error(`Unsupported workbench operation ${op} for ${tool}.`)
  return `${mapped}_${op}`
}

export const scienceSkillForTool: Partial<Record<ScienceToolId, string>> = {
  imagej: 'zerowall-fiji', he: 'zerowall-he', molecule: 'zerowall-molecule-viewer',
  sanger: 'zerowall-sanger', flow: 'zerowall-flow', canvas: 'zerowall-science-canvas',
  cells: 'zerowall-cells', sequence: 'zerowall-sequence', brainglobe: 'zerowall-brainglobe',
}

export function workbenchTabTitle(tool: ScienceToolId): string {
  return ({ home: '主页', imagej: 'ImageJ', he: 'HE 查看器', molecule: '分子结构', sanger: 'Sanger', flow: '流式', canvas: '科研画布', cells: '细胞查看器', sequence: '序列', brainglobe: '脑图谱' } as Record<ScienceToolId, string>)[tool]
}

export function scienceToolForAction(action: string): ScienceToolId | undefined {
  if (action.startsWith('image_') || action.startsWith('annotation_') || action === 'launch_native' || action === 'native_status') return 'imagej'
  if (action.startsWith('he_')) return 'he'
  if (action.startsWith('molecule_')) return 'molecule'
  if (action.startsWith('sanger_')) return 'sanger'
  if (action.startsWith('flow_')) return 'flow'
  if (action.startsWith('canvas_')) return 'canvas'
  if (action.startsWith('cell_')) return 'cells'
  if (action.startsWith('brain_')) return 'brainglobe'
  return undefined
}

export function workbenchContext(input: { tool?: ScienceToolId; assetId?: string; artifactId?: string; viewerId?: string; runId?: string; operation?: string }): JsonObject {
  return {
    ...(input.tool ? { tool: input.tool } : {}), ...(input.assetId ? { assetId: input.assetId } : {}),
    ...(input.artifactId ? { artifactId: input.artifactId } : {}), ...(input.viewerId ? { viewerId: input.viewerId } : {}),
    ...(input.runId ? { runId: input.runId } : {}), ...(input.operation ? { operation: input.operation } : {}),
  }
}
