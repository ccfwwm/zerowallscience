import type { PresentationSpecification, VisualManifest } from './visual-assets.js'
import type { PresentationSources } from './presentation-workflow.js'
import { resolvePresentationStyle } from './presentation-style-candidates.js'

const display = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''
const section = (label: string, value: unknown): string => value === undefined || value === '' ? '' : '【' + label + '】\n' + display(value)
function fence(value: string): string {
  const runs = value.match(/`{3,}/g) ?? []
  const marker = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)))
  return marker + 'text\n' + value + '\n' + marker
}
export function compilePresentationPrompts(spec: PresentationSpecification, assets: VisualManifest, research?: PresentationSources) {
  const slides = spec.slides.map((slide, index) => {
    const page = index + 1
    if (!Array.isArray(slide.text) || slide.text.some(text => typeof text !== 'string')) throw new Error('Rich prompt generation requires verbatim slides[].text (use [] for a textless page).')
    const originalPrompt = typeof slide.originalPrompt === 'string' ? slide.originalPrompt : typeof spec.originalPrompt === 'string' ? spec.originalPrompt : ''
    const analysisPrompt = typeof slide.analysisPrompt === 'string' ? slide.analysisPrompt : typeof slide.purpose === 'string' ? slide.purpose : ''
    const editablePlanPrompt = typeof slide.editablePlanPrompt === 'string' ? slide.editablePlanPrompt : '文字使用独立文本框，简单线条和色块还原为原生形状，表格和有数据的图表保留结构；照片、文献图及无法安全拆分的复合区域保留独立图片。保持层级、裁切和坐标。'
    const style = resolvePresentationStyle(spec, slide)
    const stylePrompt = style.stylePrompt ?? ''
    const referenceIds = [...new Set([...style.styleReferenceAssetIds, ...(slide.assetIds ?? [])])]
    const referenceDescriptions = referenceIds.map(id => {
      const asset = assets.assets.find(item => item.assetId === id)
      if (!asset) throw new Error('Unknown prompt reference asset ' + id)
      const usage = asset.role === 'style-candidate'
        ? '仅用于匹配所选候选图的视觉风格；不得复制候选图的事实内容、标题、数字或素材'
        : ['literature', 'user'].includes(asset.sourceKind ?? '') && (slide.assetIds ?? []).includes(id)
          ? '事实素材：指定位置原字节嵌入，留出位置，不重绘内容、文字和数据'
          : '参考素材：用于风格或构图，以明确用途为准'
      return { assetId: id, role: asset.role, sha256: asset.sha256, sourceKind: asset.sourceKind, placement: Array.isArray(slide.assetPlacements) ? slide.assetPlacements.filter((item: any) => item.assetId === id) : [], usage }
    })
    const evidence = (research?.sources ?? []).flatMap(source => source.claims.filter(claim => claim.slideNumbers.includes(page)).map(claim => ({ sourceId: source.id, citation: source.citation, verification: source.verification, claim: claim.text, evidenceNote: claim.evidenceNote ?? '' })))
    const combinedPrompt = [
      section('页面与受众', { page, role: slide.pageRole ?? '内容页', width: spec.width, height: spec.height, audience: spec.audience ?? '', purpose: slide.purpose ?? '', takeaway: slide.takeaway ?? '' }),
      section('用户原始要求', originalPrompt), section('内容分析与论证结构', analysisPrompt),
      section('必须逐字呈现的页面文字', slide.text), section('不可改写的事实、数值和单位', slide.immutableFacts),
      section('客户PPTX母版分析', spec.templateAnalysis),
      section('完整视觉规范', { stylePrompt, selectedStyleId: spec.selectedStyleId, templateStylePrompt: spec.templateStylePrompt, fonts: spec.fonts, palette: spec.palette, typography: slide.typography ?? spec.typography, whitespace: slide.whitespace ?? spec.whitespace }),
      section('版式与坐标', slide.layout), section('主图与配图细节', slide.visualBrief), section('图表、坐标轴、图例与连接关系', slide.chartBrief),
      section('参考图片用途和放置区域', referenceDescriptions.length ? referenceDescriptions : undefined),
      section('证据依据与核验层级（不自动印到画面）', evidence.length ? evidence : undefined),
      section('实际页面引用文字', slide.visibleCitations), section('图示性质', slide.illustrative === true ? '示意图须明确标识，不能绘制或声称不存在的实验数值、统计结果与文献图。' : slide.illustrative === false ? '采用提供的实际数据和原图，保持数值、单位、误差与对照关系。' : '不要凭空补充统计数值；概念示意与真实结果必须区分。'),
      section('负面约束', ['严格保留逐字文字、数字、单位、上下标和专业名词。', '保持既定视觉风格、阅读顺序与留白，不添加未经要求的文案、水印或标识。', '文献图、项目原图与正式标识不得由模型编造或重绘。', '来源状态为 metadata-only、unverified 或 user-provided 的内容不自动视为独立核实的结论。', ...(Array.isArray(slide.negativeConstraints) ? slide.negativeConstraints : [])]),
      section('后续可编辑区域计划（不印到画面）', editablePlanPrompt),
    ].filter(Boolean).join('\n\n')
    const required = ['originalPrompt', 'analysisPrompt', 'purpose', 'layout', 'visualBrief', 'editablePlanPrompt']
    const missing = required.filter(field => !slide[field] && !(field === 'originalPrompt' && originalPrompt))
    const reviewItems = Array.isArray(slide.reviewItems) ? slide.reviewItems : []
    return { page, originalPrompt, analysisPrompt, editablePlanPrompt, combinedPrompt, evidence, missing, reviewItems }
  })
  const sourceList = (research?.sources ?? []).map(source => '- [' + source.id + '] ' + source.citation + ' | ' + source.verification + (source.doi ? ' | DOI: ' + source.doi : '') + (source.url ? ' | ' + source.url : '')).join('\n')
  const markdown = '# 演示文稿逐页提示词确认稿\n\n' +
    '本稿由结构化内容计划与来源清单编译，不额外调用内容模型。请确认事实文字、视觉风格、引用层级和每页 combinedPrompt；只改动有问题的页。\n\n' +
    '风格：' + (spec.selectedStyleId ?? '待选择') + '；画布：' + spec.width + '×' + spec.height + '；共 ' + slides.length + ' 页。\n\n' +
    (research ? '检索预算记录：' + research.timeBudgetSeconds + ' 秒（规划值，不代表实际耗时）；检索式：' + research.queries.join('；') + '\n\n' : '尚未绑定独立检索来源清单。\n\n') +
    slides.map(item => '## 第 ' + item.page + ' 页\n\n' +
      '### originalPrompt\n\n' + fence(item.originalPrompt || '原始要求未记录，待补充') + '\n\n' +
      '### analysisPrompt\n\n' + fence(item.analysisPrompt || '待补充内容分析') + '\n\n' +
      '### combinedPrompt\n\n' + fence(item.combinedPrompt) + '\n\n' +
      '### editablePlanPrompt\n\n' + fence(item.editablePlanPrompt) + '\n\n' +
      '讲稿要点：' + display(spec.slides[item.page - 1]?.speakerNotes ?? spec.slides[item.page - 1]?.notes ?? '未提供') + '\n\n' +
      '置信度：' + display(spec.slides[item.page - 1]?.confidence ?? '未评估') + '；待确认：' + display([...item.reviewItems, ...item.missing.map(field => '补充 ' + field)]) + '\n').join('\n') +
    '\n## 来源与证据状态\n\n' + (sourceList || '无检索记录；不能声称已完成外部事实核验。') + '\n'
  return { markdown, slides }
}
