import { expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { buildTextProbePptx } from '../src/core/text-probes.js'

it('isolates text without changing run metrics, transforms or the original PPTX', () => {
  const xml = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:bg/><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:pic/><p:sp><p:nvSpPr><p:cNvPr name="title"/></p:nvSpPr><p:spPr><a:xfrm rot="200"><a:off x="20" y="30"/></a:xfrm><a:solidFill/><a:effectLst/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0"/><a:p><a:pPr/><a:r><a:rPr sz="2400" spc="12" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Research</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr name="neighbor"/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>研究</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  const bytes = zipSync({ 'ppt/slides/slide1.xml': strToU8(xml), 'ppt/slideMasters/slideMaster1.xml': strToU8(xml) })
  const before = Buffer.from(bytes), probe = buildTextProbePptx(bytes), parts = unzipSync(probe.bytes)
  const result = strFromU8(parts['ppt/slides/slide1.xml'])
  expect(Buffer.from(bytes)).toEqual(before)
  expect(result).not.toContain('<p:pic'); expect(result).not.toContain('a:outerShdw')
  expect(result).toContain('sz="2400" spc="12" b="1"')
  expect(result).toContain('wrap="none" lIns="0"'); expect(result).toContain('rot="200"')
  expect(result).toContain('typeface="Arial"'); expect(result).toContain('Research'); expect(result).toContain('研究')
  expect(strFromU8(parts['ppt/slideMasters/slideMaster1.xml'])).not.toContain('<a:t>')
  expect(probe.pages[1].map(item => item.elementId)).toEqual(['title', 'neighbor'])
  expect(new Set(probe.pages[1].map(item => item.color)).size).toBe(2)
})
