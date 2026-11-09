import { DOMParser, type Document, type Element } from '@xmldom/xmldom'
import { strFromU8, unzipSync } from 'fflate'

const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 10_000

export interface PresentationTemplateAnalysis {
  sourceSizeBytes: number
  slideCount: number
  width: number
  height: number
  aspectRatio: string
  dimensionsEmu: { width: number; height: number }
  themeCount: number
  masterCount: number
  layoutCount: number
  layoutNames: string[]
  palette: Record<string, string>
  fonts: { heading?: string; body?: string; eastAsia?: string[] }
  visualPatterns: Array<{ part: string; name: string; background?: string; regions: Array<{ kind: string; bounds?: number[]; fill?: string; fontSize?: number }> }>
  complexPartCounts: { charts: number; diagrams: number; embeddedObjects: number }
  limitations: string[]
}

export function presentationTemplateStylePrompt(analysis: PresentationTemplateAnalysis): string {
  const palette = Object.entries(analysis.palette).map(([name, color]) => `${name} ${color}`).join(', ')
  const fonts = [analysis.fonts.heading ? `标题 ${analysis.fonts.heading}` : '', analysis.fonts.body ? `正文 ${analysis.fonts.body}` : '', ...(analysis.fonts.eastAsia ?? []).map(font => `东亚文字 ${font}`)].filter(Boolean).join(', ')
  return [
    `Follow the supplied PowerPoint master as the visual system. Match its ${analysis.width}x${analysis.height} canvas and ${analysis.aspectRatio} aspect ratio.`,
    palette ? `Theme palette: ${palette}.` : '',
    fonts ? `Theme typography: ${fonts}.` : '',
    analysis.layoutNames.length ? `Available layout patterns: ${analysis.layoutNames.join(', ')}.` : '',
    `Master, layout and example-slide geometry in canvas pixels (visual guidance, not content): ${JSON.stringify(analysis.visualPatterns)}.`,
    `The source contains ${analysis.masterCount} master(s), ${analysis.layoutCount} layout(s), and ${analysis.slideCount} slide(s). Use these as visual structure cues while preserving the new page's exact content.`,
    'Do not copy the template slide text, data or images as content. Recreate only the requested page content in the template visual language; do not claim that complex embedded objects were preserved.',
  ].filter(Boolean).join('\n')
}

function centralDirectorySize(bytes: Uint8Array): { entries: number; expandedBytes: number } {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error('PPTX template exceeds the 100 MiB compressed-file limit.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const start = Math.max(0, bytes.byteLength - 65_557)
  let end = -1
  for (let offset = bytes.byteLength - 22; offset >= start; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break }
  }
  if (end < 0) throw new Error('PPTX template is not a supported ZIP archive.')
  const entries = view.getUint16(end + 10, true)
  const directoryBytes = view.getUint32(end + 12, true)
  let offset = view.getUint32(end + 16, true)
  if (entries === 0xffff || directoryBytes === 0xffffffff || offset === 0xffffffff || entries > MAX_ARCHIVE_ENTRIES) throw new Error('PPTX template uses an unsupported or oversized ZIP directory.')
  if (offset + directoryBytes > end) throw new Error('PPTX template ZIP directory is malformed.')
  let expandedBytes = 0
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error('PPTX template ZIP directory is malformed.')
    const expanded = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    if (expanded === 0xffffffff) throw new Error('PPTX template uses an unsupported ZIP64 entry.')
    expandedBytes += expanded
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error('PPTX template expands beyond the 512 MiB analysis limit.')
    offset += 46 + nameLength + extraLength + commentLength
  }
  if (offset > end || offset > view.getUint32(end + 16, true) + directoryBytes) throw new Error('PPTX template ZIP directory length is inconsistent.')
  return { entries, expandedBytes }
}

function xmlDocument(bytes: Uint8Array, name: string): Document {
  const errors: string[] = []
  const document = new DOMParser({ onError: (_level, message) => errors.push(message) }).parseFromString(strFromU8(bytes), 'application/xml')
  if (errors.length || !document.documentElement) throw new Error(`PPTX template contains invalid XML in ${name}.`)
  return document
}

function localElements(parent: Element | Document, namespace: string, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(namespace, name))
}

function emuNumber(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

function visualPattern(name: string, bytes: Uint8Array): PresentationTemplateAnalysis['visualPatterns'][number] {
  const document = xmlDocument(bytes, name)
  const color = (parent: Element | Document): string | undefined => {
    const fill = localElements(parent, DRAWING_NS, 'solidFill')[0]
    if (!fill) return undefined
    const rgb = localElements(fill, DRAWING_NS, 'srgbClr')[0]?.getAttribute('val')
    if (rgb && /^[0-9a-f]{6}$/iu.test(rgb)) return '#' + rgb.toUpperCase()
    const scheme = localElements(fill, DRAWING_NS, 'schemeClr')[0]?.getAttribute('val')
    return scheme ? `theme:${scheme}` : undefined
  }
  const background = localElements(document, PRESENTATION_NS, 'bg')[0]
  const shapes = ['sp', 'pic', 'graphicFrame'].flatMap(kind => localElements(document, PRESENTATION_NS, kind).map(element => ({ kind, element })))
  const backgroundColor = background ? color(background) : undefined
  return {
    part: name, name: localElements(document, PRESENTATION_NS, 'cSld')[0]?.getAttribute('name') || name.split('/').at(-1)!,
    ...(backgroundColor ? { background: backgroundColor } : {}),
    regions: shapes.slice(0, 24).map(({ kind, element }) => {
      const placeholder = localElements(element, PRESENTATION_NS, 'ph')[0]
      const xfrm = localElements(element, DRAWING_NS, 'xfrm')[0] ?? localElements(element, PRESENTATION_NS, 'xfrm')[0]
      const off = xfrm ? localElements(xfrm, DRAWING_NS, 'off')[0] : undefined
      const ext = xfrm ? localElements(xfrm, DRAWING_NS, 'ext')[0] : undefined
      const values = [off?.getAttribute('x'), off?.getAttribute('y'), ext?.getAttribute('cx'), ext?.getAttribute('cy')]
      const bounds = values.every(value => value && /^-?\d+$/u.test(value)) ? values.map(value => Math.round(Number(value) / 9_525)) : undefined
      const properties = localElements(element, DRAWING_NS, 'defRPr')[0] ?? localElements(element, DRAWING_NS, 'rPr')[0]
      const size = Number(properties?.getAttribute('sz')) / 100
      const fill = color(element)
      return { kind: placeholder?.getAttribute('type') || kind, ...(bounds ? { bounds } : {}), ...(fill ? { fill } : {}), ...(size > 0 ? { fontSize: size } : {}) }
    }),
  }
}

export function inspectPresentationTemplate(bytes: Uint8Array): PresentationTemplateAnalysis {
  const directory = centralDirectorySize(bytes)
  const files = unzipSync(bytes)
  const entries = Object.entries(files)
  if (entries.length !== directory.entries || entries.reduce((sum, [, value]) => sum + value.byteLength, 0) > MAX_EXPANDED_BYTES) throw new Error('PPTX template expanded size does not match its declared ZIP limits.')
  const parts = new Map(entries)
  const presentationBytes = parts.get('ppt/presentation.xml')
  if (!presentationBytes) throw new Error('PPTX template is missing ppt/presentation.xml.')
  const presentation = xmlDocument(presentationBytes, 'ppt/presentation.xml')
  const size = localElements(presentation, PRESENTATION_NS, 'sldSz')[0]
  const widthEmu = emuNumber(size?.getAttribute('cx'))
  const heightEmu = emuNumber(size?.getAttribute('cy'))
  if (!widthEmu || !heightEmu) throw new Error('PPTX template is missing valid slide dimensions.')
  const width = Math.round(widthEmu / 9_525), height = Math.round(heightEmu / 9_525)
  const ratio = widthEmu / heightEmu
  const aspectRatio = [[1, '1:1'], [4 / 3, '4:3'], [3 / 4, '3:4'], [16 / 9, '16:9'], [9 / 16, '9:16'], [3 / 2, '3:2'], [2 / 3, '2:3'], [4 / 5, '4:5'], [5 / 4, '5:4'], [21 / 9, '21:9']].sort((a, b) => Math.abs(Number(a[0]) - ratio) - Math.abs(Number(b[0]) - ratio))[0]![1] as string
  const slides = entries.filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).length
  const masters = entries.filter(([name]) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/u.test(name))
  const layouts = entries.filter(([name]) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/u.test(name))
  const themes = entries.filter(([name]) => /^ppt\/theme\/theme\d+\.xml$/u.test(name))
  const palette: Record<string, string> = {}
  const fonts: PresentationTemplateAnalysis['fonts'] = {}
  if (themes[0]) {
    const theme = xmlDocument(themes[0][1], themes[0][0])
    const scheme = localElements(theme, DRAWING_NS, 'clrScheme')[0]
    if (scheme) for (const color of Array.from(scheme.children)) {
      const colorNode = Array.from(color.children).find(node => node.localName === 'srgbClr' || node.localName === 'sysClr')
      const raw = colorNode?.getAttribute(colorNode.localName === 'sysClr' ? 'lastClr' : 'val')
      if (raw && color.localName && /^[0-9a-f]{6}$/iu.test(raw)) palette[color.localName] = `#${raw.toUpperCase()}`
    }
    const major = localElements(theme, DRAWING_NS, 'majorFont')[0]
    const minor = localElements(theme, DRAWING_NS, 'minorFont')[0]
    const heading = localElements(major ?? theme, DRAWING_NS, 'latin')[0]?.getAttribute('typeface')
    const body = localElements(minor ?? theme, DRAWING_NS, 'latin')[0]?.getAttribute('typeface')
    const eastAsia = [...new Set([major, minor].flatMap(item => item ? localElements(item, DRAWING_NS, 'ea').map(font => font.getAttribute('typeface') ?? '') : []).filter(value => value && value !== '+mn-ea' && value !== '+mj-ea'))]
    if (heading) fonts.heading = heading
    if (body) fonts.body = body
    if (eastAsia.length) fonts.eastAsia = eastAsia
  }
  const layoutNames = layouts.slice(0, 50).map(([name, xml]) => {
    try {
      const layout = xmlDocument(xml, name)
      return localElements(layout, PRESENTATION_NS, 'cSld')[0]?.getAttribute('name') || name.split('/').at(-1)!
    } catch { return name.split('/').at(-1)! }
  })
  const visualPatterns = [...masters.slice(0, 3), ...layouts.slice(0, 8), ...entries.filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).slice(0, 4)]
    .map(([name, xml]) => visualPattern(name, xml))
  return {
    sourceSizeBytes: bytes.byteLength, slideCount: slides, width, height, aspectRatio, dimensionsEmu: { width: widthEmu, height: heightEmu },
    themeCount: themes.length, masterCount: masters.length, layoutCount: layouts.length, layoutNames, palette, fonts, visualPatterns,
    complexPartCounts: { charts: entries.filter(([name]) => /^ppt\/charts\/chart\d+\.xml$/u.test(name)).length, diagrams: entries.filter(([name]) => /^ppt\/diagrams\/data\d+\.xml$/u.test(name)).length, embeddedObjects: entries.filter(([name]) => /^ppt\/embeddings\//u.test(name)).length },
    limitations: ['只读解析主题、母版、版式和前四页的形状几何，不执行外部关系、宏或附件中的指令；未渲染原始页面。', '不保真重建分组变换、SmartArt、图表、OLE 或嵌入对象；复杂对象基于部件统计，最终效果需逐页核验。'],
  }
}
