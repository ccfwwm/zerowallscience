import { describe, expect, it } from 'vitest'
import { localizePythonText } from '../src/client/python-localization.js'

describe('Python task message localization', () => {
  it('localizes durable core dependency progress records', () => {
    expect(localizePythonText('依赖检查完成：1/42 已安装，41 待安装。', 'en'))
      .toBe('1/42 dependencies installed; 41 pending.')
    expect(localizePythonText('正在预检 42 个 core 依赖的镜像、版本和安装兼容性。', 'en'))
      .toBe('Preflighting mirrors, versions, and compatibility for 42 core dependencies.')
    expect(localizePythonText('核心 MCP 依赖不完整：mcp==1.30.0、numpy==2.5.3', 'en'))
      .toBe('Core MCP dependencies are incomplete: mcp==1.30.0、numpy==2.5.3')
  })

  it('localizes mixed pip output and keeps Chinese copy for Chinese users', () => {
    const line = '分组 1/2 · annotated-types 等 40 个包: Looking in indexes: https://mirror.example/simple'
    expect(localizePythonText(line, 'en'))
      .toBe('Group 1/2 · annotated-types and 40 packages: Looking in indexes: https://mirror.example/simple')
    expect(localizePythonText(line, 'zh')).toBe(line)
  })

  it('does not expose untranslated Chinese when a future backend message is unknown', () => {
    const rendered = localizePythonText('新增的 Python 后端状态消息。', 'en')
    expect(rendered).not.toMatch(/\p{Script=Han}/u)
    expect(rendered).toContain('Python')
  })
})
