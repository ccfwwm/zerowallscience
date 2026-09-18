import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const desktopRoot = resolve(import.meta.dirname, '..')

describe('desktop startup splash', () => {
  it('renders the package version supplied by Electron instead of a release constant', async () => {
    const [html, main] = await Promise.all([
      readFile(resolve(desktopRoot, 'build', 'splash.html'), 'utf8'),
      readFile(resolve(desktopRoot, 'src', 'main', 'index.ts'), 'utf8'),
    ])

    expect(main).toContain('version: app.getVersion()')
    expect(html).toContain("params.get('version')")
    expect(html).not.toMatch(/本地科研工作台\s*·\s*\d/u)
    expect(html).not.toContain('6.1.0')
  })

  it('keeps a wide progress surface and removes redundant startup copy', async () => {
    const html = await readFile(resolve(desktopRoot, 'build', 'splash.html'), 'utf8')

    expect(html).toContain('width: min(860px, calc(100% - 96px))')
    expect(html).toContain('height: 14px')
    expect(html).toContain('cubic-bezier(.22, 1, .36, 1)')
    expect(html).not.toContain('工作台就绪后，将在后台连接已启用的 MCP 服务。')
    expect(html).not.toContain('你的会话与设置保存在本机')
  })
})
