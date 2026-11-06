import { describe, expect, it } from 'vitest'
import { SCIENCE_SYSTEM_PROMPT, SCIENCE_SYSTEM_PROMPT_VERSION } from '../src/host/index.js'
import { renderTaskNavigation, TASK_ROUTES } from '../src/host/task-routing.js'

describe('ZeroWall Science system prompt', () => {
  it('keeps concise Chinese navigation and truthful execution boundaries', () => {
    expect(SCIENCE_SYSTEM_PROMPT.length).toBeLessThanOrEqual(3000)
    expect(SCIENCE_SYSTEM_PROMPT).toContain('科研与通用任务并重')
    expect(SCIENCE_SYSTEM_PROMPT).toContain(renderTaskNavigation())
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('mcp__rmcp__')
    expect(SCIENCE_SYSTEM_PROMPT).toContain(SCIENCE_SYSTEM_PROMPT_VERSION)
    expect(SCIENCE_SYSTEM_PROMPT_VERSION).toBe('8.4.24-task-navigation.1')
    for (const text of ['skill_search', 'capability_search', 'mcp_search', '真实 Schema', 'science_viewer_panel', '远程 RMCP', '不回退系统 Python', '200 行', 'danger-full-access', '不扩大数据上传', '避免重复计费', '非可信数据']) expect(SCIENCE_SYSTEM_PROMPT).toContain(text)
    expect(SCIENCE_SYSTEM_PROMPT).not.toContain('built-in Host tools execute them without external MCP servers')
  })

  it('guides minimal workflows and preserves product confirmation points', () => {
    for (const text of ['普通问答、翻译、简单改写直接完成', '四种风格选择', '逐页内容和代表页确认', '不能以生图代替', '普通图片不建立媒体项目', '缺少/禁用的资源', '不要求手动登记']) expect(SCIENCE_SYSTEM_PROMPT).toContain(text)
    expect(new Set(TASK_ROUTES.map(route => route.id)).size).toBe(TASK_ROUTES.length)
  })
})
