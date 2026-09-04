import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type { EditableObject, RebuildSceneMap } from '../shared/types.js'

export interface SceneAnalysisInput {
  slideId: string
  title: string
  body: string
  sourcePath: string
  checksum: string
  widthPx?: number
  heightPx?: number
  instruction?: string
}

export interface SceneAnalysisResult {
  sceneMap: RebuildSceneMap
  manifestObjects: EditableObject[]
}

/**
 * Builds a conservative native-first scene from the semantic slide record.
 * Arbitrary uploaded images are retained only as a bounded visual-core region;
 * the page itself is never emitted as a full-slide raster.
 */
export async function analyzeScene(input: SceneAnalysisInput): Promise<SceneAnalysisResult> {
  const bytes = await readFile(input.sourcePath)
  const widthPx = input.widthPx ?? imageWidth(bytes) ?? 1536
  const heightPx = input.heightPx ?? imageHeight(bytes) ?? 1024
  const body = input.instruction ? [input.body, input.instruction].filter(Boolean).join('\n') : input.body
  const prefix = input.slideId
  const objects: EditableObject[] = [
    { objectId: `${prefix}.background`, kind: 'shape', x: 0, y: 0, w: 960, h: 540, fill: '#FFFFFF', line: '#FFFFFF', lineWidth: 0, z: 0, sourceCategory: 'panel', parentRegion: 'main', editability: 'native', sourceRectPx: [0, 0, widthPx, heightPx] },
    { objectId: `${prefix}.accent`, kind: 'shape', x: 48, y: 90, w: 8, h: 340, fill: '#0F766E', line: '#0F766E', lineWidth: 0, z: 2, sourceCategory: 'native_symbol', parentRegion: 'main', editability: 'native', sourceRectPx: [0, Math.round(heightPx * 0.16), Math.max(1, Math.round(widthPx * 0.01)), Math.round(heightPx * 0.68)] },
    { objectId: `${prefix}.title`, kind: 'text', x: 80, y: 48, w: 390, h: 58, text: input.title, fontFace: 'Aptos Display', fontSize: 26, color: '#17324D', z: 10, sourceCategory: 'text_item', parentRegion: 'main', editability: 'native', sourceRectPx: [Math.round(widthPx * 0.08), Math.round(heightPx * 0.06), Math.round(widthPx * 0.42), Math.round(heightPx * 0.1)] },
    { objectId: `${prefix}.body`, kind: 'text', x: 80, y: 132, w: 360, h: 300, text: body, fontFace: 'Aptos', fontSize: 14, color: '#30465C', z: 10, sourceCategory: 'text_item', parentRegion: 'main', editability: 'native', sourceRectPx: [Math.round(widthPx * 0.08), Math.round(heightPx * 0.2), Math.round(widthPx * 0.4), Math.round(heightPx * 0.65)] },
    { objectId: `${prefix}.visual-core`, kind: 'image', x: 500, y: 92, w: 400, h: 350, imageUri: pathToFileURL(input.sourcePath).href, rasterReason: '复杂视觉核心保留为局部素材；页面文字和布局使用原生对象', z: 5, sourceCategory: 'visual_core', parentRegion: 'visual', editability: 'atomic-raster', sourceRectPx: [Math.round(widthPx * 0.52), Math.round(heightPx * 0.14), Math.round(widthPx * 0.45), Math.round(heightPx * 0.68)], assetRole: 'reference visual core' },
    { objectId: `${prefix}.visual-frame`, kind: 'shape', x: 490, y: 82, w: 420, h: 370, fill: '#F1F6FA', line: '#C7D8E6', lineWidth: 1, z: 3, sourceCategory: 'panel', parentRegion: 'visual', editability: 'native', sourceRectPx: [Math.round(widthPx * 0.5), Math.round(heightPx * 0.12), Math.round(widthPx * 0.48), Math.round(heightPx * 0.72)] },
  ]
  const requiredIds = objects.map(object => object.objectId)
  const sceneObjects = objects.map(object => ({
    id: object.objectId,
    parent_region: object.parentRegion ?? 'main',
    kind: object.kind === 'image' ? 'picture' : object.kind,
    source_category: object.sourceCategory ?? 'native_symbol',
    required: true,
    status: 'planned',
    source_rect_px: object.sourceRectPx ?? [0, 0, widthPx, heightPx],
    mapping: 'scaled',
    layer: object.z ?? 0,
    editability: object.editability,
    ...(object.text === undefined ? {} : { text: object.text, line_breaks: 'exact', style: { fontFace: object.fontFace, fontSize: object.fontSize, color: object.color } }),
    ...(object.kind === 'image' ? { asset: object.objectId, visual_role: object.assetRole ?? 'visual core', raster_reason: object.rasterReason, alpha_method: 'none', expected_content: ['source visual core'], forbidden_content: ['page background', 'editable labels and arrows'], native_surroundings: [`${prefix}.visual-frame`], fidelity_priority: 'high' } : {}),
  }))
  const sceneMap: RebuildSceneMap = {
    version: 1,
    slideId: input.slideId,
    source: { path: input.sourcePath, width_px: widthPx, height_px: heightPx, checksum: input.checksum },
    fidelity_profile: 'reference_lock',
    mode: 'hybrid',
    canvas: { width_pt: 960, height_pt: 540 },
    reference_inventory: { complete: true, regions: ['main', 'visual'], counts: { panels: 2, text_items: 2, visual_cores: 1, native_symbols: 1, links: 0 }, required_ids: requiredIds, unresolved_ambiguities: [], authorized_omissions: [] },
    objects: sceneObjects,
    links: [],
  }
  return { sceneMap, manifestObjects: objects }
}

function imageWidth(bytes: Uint8Array): number | undefined {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return readU32(bytes, 16)
  return undefined
}
function imageHeight(bytes: Uint8Array): number | undefined {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return readU32(bytes, 20)
  return undefined
}
function readU32(bytes: Uint8Array, offset: number): number { return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0 }
