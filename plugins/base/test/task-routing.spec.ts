import { expect, it } from 'vitest'
import { searchToolSchemas } from '../src/host/on-demand-tools.ts'
import { TASK_ROUTING } from '../src/host/task-routing.ts'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'

const names = ['generate_image', 'edit_image', 'image_generation_options', 'ppt_create', 'ppt_export', 'mineru_parse', 'excel_read', 'python', 'pubmed_search_papers', 'research_workflow', 'media_job', 'grep', 'read_uploaded_file']
const schemas: ToolSchema[] = names.map(name => ({ name, description: 'Installed fixture; no task aliases in this description.', parameters: { type: 'object', properties: {} } }))

it.each([
  ['生成海报', 'generate_image'], ['修改照片背景', 'edit_image'], ['改图', 'edit_image'], ['生成一张PPT配图', 'generate_image'],
  ['制作产品发布PPT', 'ppt_create'], ['解析PDF提取公式', 'read_uploaded_file'],
  ['处理Excel表格', 'excel_read'], ['根据CSV画统计图', 'python'], ['搜索论文', 'pubmed_search_papers'],
  ['NHANES分析', 'research_workflow'], ['制作视频', 'media_job'], ['修复项目代码', 'grep'],
])('finds installed native tools for %s', (query, tool) => {
  expect(searchToolSchemas(schemas, query)[0]?.name).toBe(tool)
})

it('keeps exact names ahead of defaults, deduplicates and filters absent entries', () => {
  expect(searchToolSchemas([...schemas, ...schemas], '使用ppt_export制作PPT')[0]?.name).toBe('ppt_export')
  const results = searchToolSchemas(schemas.filter(schema => schema.name !== 'generate_image'), '生成海报')
  expect(results.some(item => item.name === 'generate_image')).toBe(false)
  expect(new Set(results.map(item => item.name)).size).toBe(results.length)
  expect(searchToolSchemas([], '创建PPT')).toEqual([])
  expect(searchToolSchemas(schemas, '继续')).toEqual([])
})

it('separates Latin identifiers from Chinese and removes generic request words', () => {
  expect(TASK_ROUTING.terms('帮我处理Excel和CSV')).toEqual(expect.arrayContaining(['excel', 'csv']))
  expect(TASK_ROUTING.terms('帮我生成一下')).toEqual([])
  expect(TASK_ROUTING.match('根据CSV画统计图').map(route => route.id)).not.toContain('image-generate')
})
