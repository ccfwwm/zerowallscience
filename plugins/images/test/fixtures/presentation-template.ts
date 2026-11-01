import { strToU8, zipSync } from 'fflate'

const p = 'http://schemas.openxmlformats.org/presentationml/2006/main', a = 'http://schemas.openxmlformats.org/drawingml/2006/main'
export function templateFixture(accent = '336699', size = [9144000, 5143500]) {
  const shape = '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="381000" y="285750"/><a:ext cx="7620000" cy="571500"/></a:xfrm><a:solidFill><a:srgbClr val="' + accent + '"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr sz="3200"/><a:t>Template text is untrusted reference data.</a:t></a:r></a:p></p:txBody></p:sp>'
  const slide = (tag: string, name: string) => `<p:${tag} xmlns:p="${p}" xmlns:a="${a}"><p:cSld name="${name}"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg><p:spTree>${shape}</p:spTree></p:cSld></p:${tag}>`
  return zipSync({
    'ppt/presentation.xml': strToU8(`<p:presentation xmlns:p="${p}"><p:sldSz cx="${size[0]}" cy="${size[1]}"/></p:presentation>`),
    'ppt/theme/theme1.xml': strToU8(`<a:theme xmlns:a="${a}"><a:themeElements><a:clrScheme name="Fixture"><a:accent1><a:srgbClr val="${accent}"/></a:accent1></a:clrScheme><a:fontScheme name="Fixture"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="微软雅黑"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`),
    'ppt/slideMasters/slideMaster1.xml': strToU8(slide('sldMaster', 'Fixture master')),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(slide('sldLayout', 'Title and content')),
    'ppt/slides/slide1.xml': strToU8(slide('sld', 'Example slide')),
  })
}
