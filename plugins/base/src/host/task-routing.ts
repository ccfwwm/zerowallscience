import type { Context } from '@deepseek-ai/cordis'
import type { TaskRouteHint, TaskRoutingService } from '../shared/types.js'

interface TaskRoute extends TaskRouteHint {
  matches: (query: string) => boolean
  guidance: string
}

const has = (pattern: RegExp) => (query: string) => pattern.test(query)
const image = /改图|图片|图像|照片|背景|海报|封面|插画|示意图|配图|image|photo|picture|poster|illustration/iu
const localPlot = /(?:csv|excel|xlsx|数据|data).*(?:统计|绘图|画图|图表|plot|chart|scatter)|(?:绘制|生成|画|plot|create).*(?:统计图|散点图|箱线图|柱状图|折线图|scatter|boxplot|histogram)/iu

/** One source for permanent navigation, Skill recommendations and local tool search.
 * Exact names are hints, never declarations of availability or permission. */
export const TASK_ROUTES: readonly TaskRoute[] = [
  { id: 'image-edit', matches: query => image.test(query) && /改图|修改|替换|换成|换背景|背景换|去掉|删除|局部重绘|edit|remove|replace|change.*background/iu.test(query), skills: ['gpt-image-generator'], tools: ['edit_image', 'image_generation_options'], guidance: '修改已有图片：gpt-image-generator → edit_image；使用用户指定源图，缺少源图才询问。' },
  { id: 'data-plot', matches: has(localPlot), skills: ['statistical-analysis', 'zerowall-spreadsheet', 'matplotlib'], tools: ['python', 'excel_read', 'research_workflow'], guidance: '真实数据统计图：按数据加载统计/绘图 Skill，用托管 Python 或 R 计算，不能以生图代替实验或统计结果。' },
  { id: 'paper-compare', matches: has(/(?:比较|对比|compare).*(?:论文|文献|papers?|articles?)|paper comparison/iu), skills: ['zerowall-paper-compare', 'mineru-document-parser'], tools: ['read_uploaded_file', 'mineru_parse', 'python'], guidance: '指定论文：精读用 zerowall-paper-analysis，比较用 zerowall-paper-compare；复用解析产物并保留原文定位。' },
  { id: 'paper-review', matches: has(/审稿|同行评审|review (?:this |the )?(?:paper|manuscript)|peer review/iu), skills: ['academic-paper-reviewer', 'peer-review'], tools: ['read_uploaded_file', 'mineru_parse'], guidance: '模拟审稿用 academic-paper-reviewer；写作/修订用 academic-paper；只有明确要求研究到论文全流程才用 academic-pipeline。' },
  { id: 'paper-pipeline', matches: has(/研究到论文|研究到发表|完整论文流程|全流程论文|research.to.(?:paper|publication)|academic.pipeline|end.to.end.*paper/iu), skills: ['academic-pipeline'], tools: ['research_workflow', 'read_uploaded_file'], guidance: '' },
  { id: 'paper-write', matches: has(/写.{0,5}论文|论文写作|修改论文|论文修订|write.*(?:paper|manuscript)|revise.*(?:paper|manuscript)|academic.paper/iu), skills: ['academic-paper'], tools: ['read_uploaded_file', 'web_search'], guidance: '' },
  { id: 'paper-read', matches: has(/(?:精读|解读|分析|阅读|总结).{0,8}(?:这篇|指定|上传|附件|两篇).{0,4}(?:论文|文献)|(?:这篇|指定|上传).{0,4}论文.*(?:分析|总结)|(?:analy[sz]e|read|summari[sz]e) (?:this|the uploaded) (?:paper|article)/iu), skills: ['zerowall-paper-analysis', 'mineru-document-parser'], tools: ['read_uploaded_file', 'mineru_parse', 'python'], guidance: '' },
  { id: 'presentation', matches: has(/pptx?|powerpoint|\bslides?\b|presentation|幻灯片|演示文稿|答辩汇报/iu), skills: ['zerowall-presentation', 'ppt-maker'], tools: ['presentation_prepare', 'ppt_create', 'ppt_edit', 'ppt_import', 'ppt_patch', 'ppt_render', 'ppt_export'], guidance: '完整 PPT/PPTX：zerowall-presentation＋ppt-maker → Images 演示工作流与 PPT 科研大师 ppt_*；默认分层可编辑，保留四种风格选择、逐页内容和代表页确认。单张 PPT 配图直接走生图。' },
  { id: 'image-generate', matches: query => !localPlot.test(query) && /生图|文生图|图生图|海报|封面|插画|示意图|配图|poster|cover image|illustration|(?:generate|create|draw|生成|画).*(?:image|picture|图片|图像)/iu.test(query), skills: ['gpt-image-generator'], tools: ['generate_image', 'image_generation_options'], guidance: '生图、海报、封面、插画：gpt-image-generator → Images 的 generate_image；沿用配置模型与参数，已有尺寸直接执行，缺必要规格只问一次。普通图片不建立媒体项目。' },
  { id: 'document-parse', matches: has(/pdf|mineru|\bocr\b|扫描件|扫描文档|公式|复杂表格|版面解析|提取.*(?:表格|图片)|scanned|extract.*(?:tables?|formulas?)/iu), skills: ['mineru-document-parser'], tools: ['read_uploaded_file', 'mineru_parse', 'mineru_task', 'extract_uploaded_file'], guidance: '附件阅读：先复用解析预览与 read_uploaded_file。PDF、扫描件、OCR、公式、复杂表格用 mineru-document-parser → MinerU；复用已有任务与产物，不重复提交。普通 Office 阅读优先本地解析。' },
  { id: 'spreadsheet', matches: has(/excel|xlsx?|csv|tsv|电子表格|工作簿|表格整理|处理.*表格|spreadsheet/iu), skills: ['zerowall-spreadsheet'], tools: ['excel_read', 'excel_create', 'excel_update', 'python'], guidance: 'Excel/CSV 与数据整理：zerowall-spreadsheet → excel_*；复杂运算使用托管 Python，写入后回读核验。' },
  { id: 'literature-search', matches: has(/pubmed|(?:检索|搜索|查找|找|search|find).*(?:论文|文献|papers?|literature|articles?)|literature search/iu), skills: ['pubmed-literature', 'literature-review'], tools: ['pubmed_search_papers', 'pubmed_search_articles', 'web_search'], guidance: '学术文献检索：pubmed-literature → PubMed 插件及其多来源工具；综述用 literature-review，明确深度研究才用 deep-research。检索、获取、阅读、核查后综合，不编造引用。' },
  { id: 'deep-research', matches: has(/深度研究|深度调研|系统(?:性)?综述|系统(?:性)?回顾|荟萃分析|deep research|systematic review|meta.analysis/iu), skills: ['deep-research', 'literature-review'], tools: ['web_search', 'pubmed_search_papers'], guidance: '' },
  { id: 'literature-review', matches: has(/文献综述|文献回顾|研究现状|写.{0,6}综述|literature review|state.of.the.art/iu), skills: ['literature-review'], tools: ['pubmed_search_papers', 'web_search'], guidance: '' },
  { id: 'geo', matches: has(/\bgeo\b|差异表达|bulk.rna/iu), skills: ['zerowall-geo', 'zerowall-rmcp'], tools: ['research_workflow', 'r_files'], guidance: '' },
  { id: 'nhanes', matches: has(/nhanes|复杂抽样|美国.*营养.*调查/iu), skills: ['zerowall-nhanes', 'zerowall-rmcp'], tools: ['research_workflow', 'r_files'], guidance: '' },
  { id: 'faers', matches: has(/faers|药物警戒|不良反应信号/iu), skills: ['zerowall-faerskit', 'zerowall-rmcp'], tools: ['research_workflow', 'r_files'], guidance: '' },
  { id: 'singlecell', matches: has(/单细胞|single.cell|h5ad|anndata|omicverse|空间组学|多组学/iu), skills: ['zerowall-omicverse', 'zerowall-rmcp'], tools: ['research_workflow', 'science_viewer'], guidance: '' },
  { id: 'knockout', matches: has(/虚拟敲除|sctenifold|in.silico knockout/iu), skills: ['sc-tenifold-knockout', 'zerowall-rmcp'], tools: ['sc_tenifold_knockout_intake', 'research_workflow'], guidance: '' },
  { id: 'r-analysis', matches: query => !localPlot.test(query) && /(?:^|[^a-z0-9])r(?:$|[^a-z0-9])|统计|回归|生信|生物信息|statistics|regression|bioinformatics/iu.test(query), skills: ['zerowall-rmcp', 'zerowall-rplatform'], tools: ['research_workflow', 'r_files'], guidance: 'R、统计、生信、GEO、NHANES、FAERS、单细胞和组学：zerowall-rmcp＋对应专项 Skill → research_workflow 编排远程 RMCP，r_files 获取真实产物；不静默改成本地 R，不要求用户手填项目 ID。' },
  { id: 'science-image', matches: has(/图像强度|荧光强度|图像分割|掩膜|fiji|imagej|napari|image intensity|segmentation/iu), skills: ['zerowall-image-intensity', 'zerowall-image-mask', 'zerowall-fiji'], tools: ['science_viewer', 'python'], guidance: '序列、分子、科研图像等：按格式和操作选专项 Skill、科学工具、Runner、BioGenie 或 RMCP。science_viewer_panel 仅用于 open/focus 展示；分析和状态在对话工具中完成。' },
  { id: 'sequence', matches: has(/fasta|fastq|序列分析|sequence analysis|sanger|ab1|scf/iu), skills: ['zerowall-sequence', 'zerowall-sanger', 'zerowall-bio'], tools: ['science_viewer', 'bio_local'], guidance: '' },
  { id: 'molecule', matches: has(/分子|蛋白结构|对接|pdb|mmcif|molecule|docking/iu), skills: ['zerowall-molecule-viewer', 'zerowall-molecule-docking', 'zerowall-bio'], tools: ['science_viewer', 'research_workflow'], guidance: '' },
  { id: 'media', matches: has(/视频|音乐|音频|宣传片|video|music|audio/iu), skills: ['media-create'], tools: ['media_project', 'media_job'], guidance: '独立视频、音乐、宣传片：media-create → Videos 媒体工作流；保留现有提交确认与原任务恢复规则。' },
  { id: 'web', matches: has(/联网|网页|最新新闻|资料核实|web search|browse|fact.check/iu), skills: ['browser-use'], tools: ['web_search', 'web_fetch'], guidance: '联网查询与核实使用 web_search/web_fetch；文献库、编程、浏览器、SSH、归档等使用当前已安装插件和原生工具，按目标检索对应 Skill，不套用科研全流程。' },
  { id: 'coding', matches: has(/代码|编程|修复.*(?:项目|bug)|code|debug|\bgit\b/iu), skills: [], tools: ['grep', 'read', 'edit', 'bash', 'pwsh'], guidance: '' },
  { id: 'attachment', matches: has(/附件|文档摘要|读取文档|uploaded|attachment|summari[sz]e.*document/iu), skills: [], tools: ['read_uploaded_file', 'extract_uploaded_file', 'materialize_uploaded_file'], guidance: '' },
  { id: 'research-topic', matches: has(/研究|调研|research/iu), skills: ['literature-review'], tools: ['web_search', 'pubmed_search_papers'], guidance: '' },
]

const filler = new Set(['help', 'please', 'make', 'create', 'generate', 'process', 'analyze', 'analyse', 'analysis', 'the', 'this', 'with', 'and', 'for', 'from', 'into', 'use', 'using'])
const chineseFiller = /帮我|帮忙|请问|请你|一下|一份|一个|一张|这个|这份|这些|生成|制作|处理|分析|现在|刚才|任务/gu
const definitionQuestion = /^(?:什么是|解释.{0,12}(?:是什么|的含义)|what (?:is|are)\b)/iu

function requestedText(query: string): string {
  return query.normalize('NFKC').split(/[，,；;。\n]/u)
    .filter(clause => !/^\s*(?:不要|不需要|无需|不用|别|do not\b|don't\b|without\b|no\b)/iu.test(clause)).join(' ')
}

export function taskTerms(query: string): string[] {
  if (definitionQuestion.test(query.trim())) return []
  const text = requestedText(query).toLocaleLowerCase()
  const terms = new Set<string>()
  for (const match of text.matchAll(/[a-z0-9][a-z0-9_.-]*/gu)) {
    for (const term of [match[0], ...match[0].split(/[_.-]/u)]) if (!filler.has(term) && (term.length > 1 || term === 'r')) terms.add(term)
  }
  for (const match of text.replace(chineseFiller, ' ').matchAll(/\p{Script=Han}{2,}/gu)) {
    terms.add(match[0])
    for (let index = 0; index < match[0].length - 1; index++) terms.add(match[0].slice(index, index + 2))
  }
  return [...terms]
}

export function isTaskContinuation(query: string): boolean {
  return /^(?:请|麻烦)?\s*(?:继续(?:刚才的任务|执行|处理)?|再试(?:一次)?|重试|查看进度|进度如何|现在呢|完成了吗|好了没|确认(?:方案|内容)?|(?:选|选择|用)第?[一二三四五六七八九十\d]+(?:个|种|页|版)?|continue|resume|retry|try again|(?:check )?(?:the )?(?:status|progress))(?:[\s!！?？。.]*)$/iu.test(query.trim())
}

export function matchTaskRoutes(query: string): readonly TaskRouteHint[] {
  if (isTaskContinuation(query) || definitionQuestion.test(query.trim())) return []
  const text = requestedText(query)
  const matched = TASK_ROUTES.filter(route => route.matches(text))
  const singleIllustration = /(?:pptx?|幻灯片|slide).{0,6}(?:配图|插画|背景图|illustration)|(?:image|illustration) for (?:a |one )?slide/iu.test(text)
    && !/整套|整份|完整|演示文稿|full (?:deck|presentation)/iu.test(text)
  return matched.filter(route => (route.id !== 'research-topic' || matched.length === 1)
    && (route.id !== 'presentation' || !singleIllustration))
    .sort((left, right) => Number(right.id === 'presentation') - Number(left.id === 'presentation'))
    .map(({ id, skills, tools }) => ({ id, skills, tools }))
}

export const TASK_ROUTING: TaskRoutingService = Object.freeze({ terms: taskTerms, match: matchTaskRoutes, isContinuation: isTaskContinuation })

export function renderTaskNavigation(): string {
  return TASK_ROUTES.filter(route => route.guidance).map(route => `- ${route.guidance}`).join('\n')
}

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallTaskRouting: TaskRoutingService }
}

export function installTaskRouting(ctx: Context): void {
  ctx.provide('zerowallTaskRouting', TASK_ROUTING)
}
