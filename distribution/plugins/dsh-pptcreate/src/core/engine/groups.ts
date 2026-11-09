import { DOMParser, XMLSerializer, type Element } from '@xmldom/xmldom'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'

export interface NativeGroup { id: string; members: string[]; bounds: number[] }
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'

/** Grouping is a serialization step: the engine has no public group API. */
export function writeNativeGroups(bytes: Uint8Array, pages: NativeGroup[][]): Uint8Array {
  if (!pages.some(page => page.length)) return bytes
  const files = unzipSync(bytes)
  pages.forEach((groups, index) => {
    if (!groups.length) return
    const file = `ppt/slides/slide${index + 1}.xml`
    const doc = new DOMParser().parseFromString(strFromU8(files[file]), 'application/xml')
    const tree = doc.getElementsByTagNameNS(P, 'spTree')[0]
    if (!tree) throw new Error('Cannot group slide without shape tree')
    let nextId = Array.from(doc.getElementsByTagNameNS(P, 'cNvPr')).reduce((max, node) => Math.max(max, Number(node.getAttribute('id')) || 0), 0) + 1
    for (const group of groups) {
      const members = Array.from(tree.childNodes).filter(node => node.nodeType === 1 && group.members.includes((node as Element).getElementsByTagNameNS(P, 'cNvPr')[0]?.getAttribute('name') ?? ''))
      if (members.length !== group.members.length) throw new Error(`Native group ${group.id} has missing members`)
      const element = (ns: string, name: string, attrs: Record<string, string | number> = {}) => {
        const value = doc.createElementNS(ns, name)
        for (const [key, item] of Object.entries(attrs)) value.setAttribute(key, String(item))
        return value
      }
      const shape = element(P, 'p:grpSp'), nv = element(P, 'p:nvGrpSpPr')
      nv.appendChild(element(P, 'p:cNvPr', { id: nextId++, name: group.id }))
      nv.appendChild(element(P, 'p:cNvGrpSpPr')); nv.appendChild(element(P, 'p:nvPr')); shape.appendChild(nv)
      const props = element(P, 'p:grpSpPr'), transform = element(A, 'a:xfrm')
      const [x,y,w,h] = group.bounds.map(value => Math.round(value * 12700))
      transform.appendChild(element(A, 'a:off', { x,y })); transform.appendChild(element(A, 'a:ext', { cx:w,cy:h }))
      transform.appendChild(element(A, 'a:chOff', { x,y })); transform.appendChild(element(A, 'a:chExt', { cx:w,cy:h }))
      props.appendChild(transform); shape.appendChild(props); tree.insertBefore(shape, members[0])
      for (const member of members) shape.appendChild(member)
    }
    files[file] = strToU8(new XMLSerializer().serializeToString(doc))
  })
  return zipSync(files, { level: 6 })
}
