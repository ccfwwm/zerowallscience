import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { hash, workspacePath } from './visual-assets.js'

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
const escape = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

/** The pinned Office exporter drops speaker notes. Add only notes parts and
 * relationships; editable slide/chart/table/image parts are preserved verbatim. */
export async function preservePptxNotes(cwd: string, outputPath: string, notes: string[], signal?: AbortSignal) {
  if (extname(outputPath).toLowerCase() !== '.pptx') return undefined
  const path = await workspacePath(cwd, outputPath), bytes = await readFile(path)
  if (bytes.length > 256 * 1024 ** 2) throw new Error('PPTX notes export exceeds 256 MiB; keep the draft and reduce unused media.')
  const files = unzipSync(bytes)
  const read = (name: string) => files[name] ? strFromU8(files[name]) : undefined
  const put = (name: string, xml: string) => { files[name] = strToU8(xml) }
  let types = read('[Content_Types].xml')
  if (!types || !read('ppt/presentation.xml')) throw new Error('PPTX export has no valid presentation package.')
  const override = (part: string, type: string) => {
    if (!types!.includes(`PartName="/${part}"`)) types = types!.replace('</Types>', `<Override PartName="/${part}" ContentType="${type}"/></Types>`)
  }
  const relationship = (name: string, type: string, target: string, id: string) => {
    const xml = read(name) ?? `${declaration}<Relationships xmlns="${PR}"></Relationships>`
    if (xml.includes(`Type="${R}/${type}"`)) return
    if (xml.includes(`Id="${id}"`)) throw new Error('PPTX notes relationship ID collision; retain export and inspect package.')
    put(name, xml.replace('</Relationships>', `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/></Relationships>`))
  }
  const existingMaster = Object.keys(files).find(name => /^ppt\/notesMasters\/notesMaster\d+\.xml$/u.test(name))
  const master = existingMaster ?? 'ppt/notesMasters/notesMaster1.xml'
  if (!existingMaster) {
    put(master, `${declaration}<p:notesMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree>${group}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:notesStyle/></p:notesMaster>`)
    if (files['ppt/theme/theme1.xml']) relationship('ppt/notesMasters/_rels/notesMaster1.xml.rels', 'theme', '../theme/theme1.xml', 'rId1')
    relationship('ppt/_rels/presentation.xml.rels', 'notesMaster', 'notesMasters/notesMaster1.xml', 'rIdZWNotesMaster')
    const presentation = read('ppt/presentation.xml')!
    if (!presentation.includes('notesMasterIdLst')) put('ppt/presentation.xml', presentation.replace('<p:sldIdLst>', '<p:notesMasterIdLst><p:notesMasterId r:id="rIdZWNotesMaster"/></p:notesMasterIdLst><p:sldIdLst>'))
    override(master, 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml')
  }
  let written = 0
  for (let index = 0; index < notes.length; index++) {
    const number = index + 1, slide = `ppt/slides/slide${number}.xml`
    if (!files[slide]) throw new Error(`PPTX notes/page coverage mismatch at page ${number}.`)
    const part = `ppt/notesSlides/notesSlide${number}.xml`
    const paragraphs = notes[index]!.split(/\r?\n/u).map(text => `<a:p><a:r><a:rPr lang="zh-CN"/><a:t>${escape(text)}</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p>`).join('')
    put(part, `${declaration}<p:notes xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree>${group}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Text"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`)
    relationship(`ppt/slides/_rels/slide${number}.xml.rels`, 'notesSlide', `../notesSlides/notesSlide${number}.xml`, 'rIdZWNotes')
    relationship(`ppt/notesSlides/_rels/notesSlide${number}.xml.rels`, 'slide', `../slides/slide${number}.xml`, 'rId1')
    relationship(`ppt/notesSlides/_rels/notesSlide${number}.xml.rels`, 'notesMaster', `../notesMasters/${master.split('/').at(-1)}`, 'rId2')
    override(part, 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml');written++
  }
  put('[Content_Types].xml', types!)
  signal?.throwIfAborted()
  const output = zipSync(files, { level: 6 }), temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, output);await rename(temporary, path)
  return { notesWritten: written, bytes: output.length, sha256: hash(output) }
}
