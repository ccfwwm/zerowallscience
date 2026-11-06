import { readFile } from 'node:fs/promises'
import { globSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
import type { SkillSummary } from '@deepseek-ai/dsh-skill'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { TASK_ROUTING } from '../../base/src/host/task-routing.ts'
import { rankSkills, taskQuery } from '../src/host/index.js'

const root = resolve(import.meta.dirname, '../../..')
const skillRoot = resolve(root, 'resources/extensions/skills')
const paths = globSync('*/SKILL.md', { cwd: skillRoot }).map(path => resolve(skillRoot, path))
paths.push(resolve(root, 'plugins/dsh-ppt-maker/skills/ppt-maker/SKILL.md'), resolve(root, 'plugins/videos/knowledge/media-create/SKILL.md'))
const catalog: SkillSummary[] = await Promise.all(paths.map(async path => {
  const markdown = await readFile(path, 'utf8')
  const metadata = parse(/^---\r?\n([\s\S]*?)\r?\n---/u.exec(markdown)![1]!)
  return { name: metadata.name, description: metadata.description, whenToUse: metadata.whenToUse, source: 'bundled', provider: 'zerowall-scientific', invocation: { modelInvocable: true, userInvocable: true } } as SkillSummary
}))

const scenarios = [
  ['帮我生成一张海报', 'gpt-image-generator'], ['画一张科研示意图', 'gpt-image-generator'],
  ['create a poster', 'gpt-image-generator'], ['Generate an image of a forest', 'gpt-image-generator'],
  ['生成一张PPT配图', 'gpt-image-generator'], ['把这张图片的背景换成蓝色', 'gpt-image-generator'], ['edit this photo', 'gpt-image-generator'],
  ['帮我做一份产品发布PPT', 'zerowall-presentation'], ['制作PPTX演示文稿', 'zerowall-presentation'],
  ['create a PowerPoint presentation', 'zerowall-presentation'], ['修改slides', 'zerowall-presentation'],
  ['解析这份PDF，提取表格和公式', 'mineru-document-parser'], ['扫描件OCR', 'mineru-document-parser'],
  ['extract tables from PDF', 'mineru-document-parser'], ['识别图片公式', 'mineru-document-parser'],
  ['translate this PDF', 'mineru-document-parser'],
  ['帮我处理Excel表格', 'zerowall-spreadsheet'], ['整理这个CSV', 'zerowall-spreadsheet'],
  ['update this XLSX spreadsheet', 'zerowall-spreadsheet'], ['读取TSV文件', 'zerowall-spreadsheet'],
  ['用这个CSV做统计分析并画图', 'statistical-analysis'], ['plot scatter from data.csv', 'statistical-analysis'],
  ['根据Excel数据生成柱状图', 'statistical-analysis'],
  ['检索近五年肺癌免疫治疗论文', 'pubmed-literature'], ['search literature about lung cancer', 'pubmed-literature'], ['PubMed查找论文', 'pubmed-literature'],
  ['撰写文献综述', 'literature-review'], ['帮我写一篇综述', 'literature-review'], ['总结研究现状', 'literature-review'], ['literature review of education', 'literature-review'],
  ['对教育政策做深度研究', 'deep-research'], ['systematic review of lung cancer', 'deep-research'],
  ['帮我研究人工智能在教育中的应用', 'literature-review'], ['精读这篇论文', 'zerowall-paper-analysis'],
  ['compare these papers', 'zerowall-paper-compare'], ['对比两篇论文', 'zerowall-paper-compare'],
  ['模拟同行评审', 'academic-paper-reviewer'], ['帮我写一篇论文', 'academic-paper'], ['write a manuscript', 'academic-paper'],
  ['研究到论文的完整流程', 'academic-pipeline'], ['用GEO数据做差异表达分析', 'zerowall-geo'],
  ['NHANES复杂抽样分析', 'zerowall-nhanes'], ['FAERS药物警戒', 'zerowall-faerskit'],
  ['分析单细胞H5AD数据', 'zerowall-omicverse'], ['用R做回归分析', 'zerowall-rmcp'],
  ['图像强度分析', 'zerowall-image-intensity'], ['FASTA序列分析', 'zerowall-sequence'],
  ['查看PDB蛋白结构', 'zerowall-molecule-viewer'], ['生成一个视频', 'media-create'], ['create music', 'media-create'],
] as const

it.each(scenarios)('recommends the real installed Skill for %s', (query, expected) => {
  expect(catalog.length).toBeGreaterThan(270)
  expect(rankSkills(catalog, query, TASK_ROUTING)[0]?.name).toBe(expected)
})

it('composes parsing and presentation without starting a paper pipeline', () => {
  const names = rankSkills(catalog, '读取PDF并制作PPT', TASK_ROUTING).slice(0, 3).map(skill => skill.name)
  expect(names).toEqual(['zerowall-presentation', 'ppt-maker', 'mineru-document-parser'])
})

it('prioritizes explicit Skill names and preserves third-party metadata search', () => {
  const custom = { ...catalog[0]!, name: 'my-deck', provider: 'my-company', description: '自定义课程报告' }
  expect(rankSkills([...catalog, custom], '用my-deck制作PPT', TASK_ROUTING)[0]?.name).toBe('my-deck')
  expect(rankSkills([...catalog, custom], 'my-company', TASK_ROUTING)[0]?.name).toBe('my-deck')
  expect(rankSkills([...catalog, custom], '课程报告', TASK_ROUTING)).toContain(custom)
})

it('never synthesizes absent or disabled Skills from navigation hints', () => {
  const available = catalog.filter(skill => skill.name !== 'gpt-image-generator')
  expect(rankSkills(available, '生成海报', TASK_ROUTING).every(skill => available.includes(skill))).toBe(true)
  expect(rankSkills([], '创建PPT', TASK_ROUTING)).toEqual([])
})

it.each(['继续', '再试一次', '查看进度', 'continue', 'retry', 'check progress', '选第二种', '确认方案'])('resolves %s from the latest human task only', query => {
  const session = Session.create(SessionId('routing-continuation'))
  const append = (text: string, source: 'user' | 'skill-catalog' = 'user') => session.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: source === 'user' ? { kind: 'user' } : { kind: 'skill-catalog', form: 'catalog', entries: [] } as never }), { surfaceOp: 'append' })
  append('生成一张海报'); append('帮我做产品发布PPT'); append('选第二种'); append('继续'); append('FAERS药物警戒', 'skill-catalog')
  const resolved = taskQuery(query, session, TASK_ROUTING)
  expect(resolved).toBe('帮我做产品发布PPT')
  expect(rankSkills(catalog, resolved, TASK_ROUTING)[0]?.name).toBe('zerowall-presentation')
  expect(taskQuery('处理Excel', session, TASK_ROUTING)).toBe('处理Excel')
  expect(rankSkills(catalog, query, TASK_ROUTING)).toEqual([])
  expect(taskQuery(query, undefined, TASK_ROUTING)).toBe('')
})

it.each(['什么是PPT', '不要生成海报，只查资料', '解释一下GEO是什么', '撰写产品报告'])('does not route a mention or negated request: %s', query => {
  expect(TASK_ROUTING.match(query)).toEqual([])
})
