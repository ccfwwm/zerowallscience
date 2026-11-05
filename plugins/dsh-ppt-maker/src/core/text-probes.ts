import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
export const TEXT_PROBE_VERSION = 'isolated-text-v2'
export interface TextProbeColor { elementId: string; color: string }

/** Diagnostic copy only. Keep the exported text geometry/runs and group
 * transforms, remove artwork, and give each object an unambiguous ink color.
 * Never save this copy as the deliverable or use it for whole-page fidelity. */
export function buildTextProbePptx(bytes: Uint8Array): { bytes: Uint8Array; pages: Record<number, TextProbeColor[]> } {
  const parts = unzipSync(bytes), pages: Record<number, TextProbeColor[]> = {}
  for (const name of Object.keys(parts)) {
    if (!/^ppt\/(?:slides\/slide\d+|slideMasters\/slideMaster\d+|slideLayouts\/slideLayout\d+)\.xml$/.test(name)) continue
    const doc = new DOMParser().parseFromString(strFromU8(parts[name]), 'application/xml')
    const slide = /^ppt\/slides\/slide(\d+)\.xml$/.exec(name)
    const colors: TextProbeColor[] = []
    const tree = doc.getElementsByTagNameNS(P, 'spTree')[0]
    type XmlElement = ReturnType<typeof doc.createElementNS>
    function strip(parent: XmlElement): void {
      for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType !== 1) continue
        const node = child as XmlElement, kind = node.localName
        if (kind === 'nvGrpSpPr' || kind === 'grpSpPr') continue
        if (kind === 'grpSp') { strip(node); continue }
        const body = node.getElementsByTagNameNS(P, 'txBody')[0]
        if (!slide || kind !== 'sp' || !body || !body.getElementsByTagNameNS(A, 't').length) { parent.removeChild(node); continue }
        if (colors.length >= 216) throw new Error('Text probe page exceeds 216 distinct text objects')
        // Fixed minimum channel gives each color a distinct ray from white,
        // so antialiasing cannot turn one object's ink into another's color.
        const palette = Array.from({ length: 1000 }, (_, i) => [i % 10, Math.floor(i / 10) % 10, Math.floor(i / 100)])
          .filter(rgb => Math.min(...rgb) === 0)
        const rgb = palette[(colors.length * 97) % palette.length].map(value => 24 + value * 23)
        const color = rgb.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase()
        const elementId = node.getElementsByTagNameNS(P, 'cNvPr')[0]?.getAttribute('name') ?? ''
        colors.push({ elementId, color: `#${color}` })
        const spPr = node.getElementsByTagNameNS(P, 'spPr')[0]
        if (spPr) {
          for (const c of Array.from(spPr.childNodes)) if (c.nodeType === 1 && !['xfrm', 'prstGeom', 'custGeom'].includes((c as XmlElement).localName!)) spPr.removeChild(c)
          spPr.appendChild(doc.createElementNS(A, 'a:noFill'))
          const line = doc.createElementNS(A, 'a:ln'); line.appendChild(doc.createElementNS(A, 'a:noFill')); spPr.appendChild(line)
          spPr.appendChild(doc.createElementNS(A, 'a:effectLst'))
        }
        // Retain fontRef/theme inheritance in p:style. Explicit noFill/line and
        // an empty effect list above suppress its visual shape decoration.
        // Explicit run color wins over theme/default/markup colors, while all
        // font and paragraph metrics remain exactly as in the exported deck.
        for (const run of ['r', 'fld'].flatMap(tag => Array.from(body.getElementsByTagNameNS(A, tag)))) {
          if (!run.getElementsByTagNameNS(A, 'rPr').length) run.insertBefore(doc.createElementNS(A, 'a:rPr'), run.firstChild)
        }
        for (const tag of ['rPr', 'defRPr', 'endParaRPr']) for (const props of Array.from(body.getElementsByTagNameNS(A, tag))) {
          for (const c of Array.from(props.childNodes)) if (c.nodeType === 1 && /Fill$|^highlight$|^effectLst$|^effectDag$/.test((c as XmlElement).localName!)) props.removeChild(c)
          const fill = doc.createElementNS(A, 'a:solidFill'), rgb = doc.createElementNS(A, 'a:srgbClr')
          rgb.setAttribute('val', color); fill.appendChild(rgb); props.insertBefore(fill, props.firstChild)
        }
      }
    }
    if (tree) strip(tree)
    for (const bg of Array.from(doc.getElementsByTagNameNS(P, 'bg'))) bg.parentNode?.removeChild(bg)
    if (slide) {
      doc.documentElement!.setAttribute('showMasterSp', '0')
      const common = doc.getElementsByTagNameNS(P, 'cSld')[0]
      const bg = doc.createElementNS(P, 'p:bg'), props = doc.createElementNS(P, 'p:bgPr')
      const fill = doc.createElementNS(A, 'a:solidFill'), rgb = doc.createElementNS(A, 'a:srgbClr')
      rgb.setAttribute('val', 'FFFFFF'); fill.appendChild(rgb); props.appendChild(fill); bg.appendChild(props); common.insertBefore(bg, common.firstChild)
      pages[Number(slide[1])] = colors
    }
    parts[name] = strToU8(new XMLSerializer().serializeToString(doc))
  }
  return { bytes: zipSync(parts), pages }
}
