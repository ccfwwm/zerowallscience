import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  estimateSchemaTokens,
  matchingToolNames,
  searchCatalog,
  searchTools,
} from '../src/catalog.js'
import { DEFAULT_GROUPS } from '../src/defaults.js'
import type { ToolSchemaView } from '../src/types.js'

function schema(name: string, description: string): ToolSchemaView {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
    },
  }
}

describe('tool catalog', () => {
  const schemas = [
    schema('browser_open', 'Open a web page'),
    schema('browser_click', 'Click a page element'),
    schema('db_query', 'Run a SQL query'),
    schema('db_tables', 'List database tables'),
    schema('standalone', 'Perform a unique operation'),
  ]
  const groups = [
    {
      id: 'browser',
      description: 'Browser navigation and interaction',
      aliases: ['web page', '浏览器'],
      include: ['browser_*'],
    },
    {
      id: 'database',
      description: 'Database queries and inspection',
      aliases: ['sql', '数据库'],
      include: ['db_*'],
    },
  ]

  it('assigns configured groups first and creates a singleton fallback', () => {
    const catalog = buildCatalog(schemas, groups, 4)

    expect([...catalog.groups.keys()]).toEqual(['browser', 'database', 'standalone'])
    expect(catalog.groups.get('browser')?.tools.map(tool => tool.name)).toEqual([
      'browser_open',
      'browser_click',
    ])
    expect(catalog.toolToGroup.get('standalone')).toBe('standalone')
    expect(catalog.totalEstimatedTokens).toBeGreaterThan(0)
  })

  it('ranks exact family and multilingual aliases ahead of description-only matches', () => {
    const catalog = buildCatalog(schemas, groups, 4)

    expect(searchCatalog(catalog, 'browser', 3)[0]?.group).toBe('browser')
    expect(searchCatalog(catalog, 'SQL', 3)[0]?.group).toBe('database')
    expect(searchCatalog(catalog, '数据库', 3)[0]?.group).toBe('database')
    expect(searchCatalog(catalog, '帮我检查数据库里的记录', 3)[0]?.group).toBe('database')
  })

  it('returns exact definitions and searches nested parameter descriptions', () => {
    const candidates: ToolSchemaView[] = [{
      name: 'records_lookup',
      description: 'Read stored objects',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'Unique account holder identifier',
          },
        },
      },
    }, schema('unrelated', 'Perform another task')]
    const catalog = buildCatalog(candidates, [], 4)
    const matches = searchTools(catalog, 'account holder', 5)

    expect(matches[0]?.name).toBe('records_lookup')
    expect(matches[0]?.parameters).toEqual(candidates[0]?.parameters)
  })

  it('matches CJK queries against definitions through bigram tokens', () => {
    const candidates: ToolSchemaView[] = [
      schema('report_export', '生成数据报表并导出文件'),
      schema('unrelated', 'Perform another task'),
    ]
    const catalog = buildCatalog(candidates, [], 4)

    expect(searchTools(catalog, '报表数据', 5)[0]?.name).toBe('report_export')
    expect(searchTools(catalog, '导出报表', 5)[0]?.name).toBe('report_export')
  })

  it('uses multilingual family aliases for exact-tool search', () => {
    const catalog = buildCatalog(schemas, groups, 4)

    expect(searchTools(catalog, '帮我操作浏览器页面', 2).map(match => match.name))
      .toEqual(['browser_open', 'browser_click'])
  })

  it('excludes eager tools from the managed catalog', () => {
    const catalog = buildCatalog(schemas, groups, 4, new Set(['standalone']))

    expect(catalog.tools.has('standalone')).toBe(false)
    expect(catalog.groups.has('standalone')).toBe(false)
  })

  it('honors exclusions, wildcard matching, and empty searches', () => {
    const catalog = buildCatalog(schemas, [{
      id: 'browser',
      include: ['browser_*'],
      exclude: ['browser_click'],
    }], 4)

    expect(catalog.groups.get('browser')?.tools.map(tool => tool.name)).toEqual(['browser_open'])
    expect(matchingToolNames(catalog, ['db_*'])).toEqual(['db_query', 'db_tables'])
    expect(searchCatalog(catalog, 'capability-that-does-not-exist', 3)).toEqual([])
  })

  it('groups repeated unmatched prefixes and avoids configured ID collisions', () => {
    const catalog = buildCatalog(schemas, [{ id: 'db', include: ['standalone'] }], 4)

    expect(catalog.groups.has('db')).toBe(true)
    expect(catalog.groups.has('auto:db')).toBe(true)
    expect(catalog.groups.get('auto:db')?.tools).toHaveLength(2)
  })

  it('never merges unrelated tools on generic verb prefixes', () => {
    const catalog = buildCatalog([
      schema('get_goal', 'Read the current goal'),
      schema('get_image_generation_task', 'Read an image generation task'),
      schema('list_jobs', 'List background jobs'),
      schema('list_connections', 'List database connections'),
    ], [], 4)

    expect(catalog.groups.has('get')).toBe(false)
    expect(catalog.groups.has('list')).toBe(false)
    expect(catalog.toolToGroup.get('get_goal')).toBe('get_goal')
    expect(catalog.toolToGroup.get('get_image_generation_task')).toBe('get_image_generation_task')
  })

  it('assigns image generation task helpers to the built-in image family', () => {
    const catalog = buildCatalog([
      schema('generate_image', 'Generate an image'),
      schema('edit_image', 'Edit an image'),
      schema('get_image_generation_task', 'Read an image generation task'),
      schema('cancel_image_generation_task', 'Cancel an image generation task'),
      schema('get_goal', 'Read the current goal'),
    ], DEFAULT_GROUPS, 4)

    const family = catalog.groups.get('image-generation')?.tools.map(tool => tool.name).sort()
    expect(family).toEqual([
      'cancel_image_generation_task',
      'edit_image',
      'generate_image',
      'get_image_generation_task',
    ])
    expect(catalog.toolToGroup.get('get_goal')).toBe('get_goal')
  })

  it('returns every family member name alongside each exact match', () => {
    const catalog = buildCatalog(schemas, groups, 4)
    const matches = searchTools(catalog, 'browser', 1)

    expect(matches).toHaveLength(1)
    expect([...matches[0]?.groupTools ?? []].sort()).toEqual(['browser_click', 'browser_open'])

    const singleton = searchTools(catalog, 'unique operation', 5)
      .find(match => match.name === 'standalone')
    expect(singleton?.groupTools).toEqual(['standalone'])
  })

  it('uses the configured character ratio for deterministic estimates', () => {
    const candidate = schema('echo', 'Echo a value')

    expect(estimateSchemaTokens(candidate, 2)).toBeGreaterThan(estimateSchemaTokens(candidate, 8))
    expect(estimateSchemaTokens(candidate, 4)).toBe(Math.ceil(JSON.stringify(candidate).length / 4))
  })
})
