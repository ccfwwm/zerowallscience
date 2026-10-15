// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gt } from 'semver'
import { CodeNode, DiffNode, JsonNode } from '../src/client/blocks/advanced.tsx'
import type { GenuiCode, GenuiDiff, GenuiJson } from '../src/client/spec.ts'
import { diffBlockLabels } from '../src/client/primitive-labels.ts'

const originalClipboard = navigator.clipboard

// 0.1.7+ 与 0.2.x 宿主的 DiffBlock 工具栏不再随容器 textContent 暴露（DOM 契约
// 调整）。「rc.1 内联标签契约」只在最低宿主世代（≤0.1.2-rc.1，即本仓库锁定的
// devDependencies）上断言；check:host-api 切换到更新的宿主时跳过。
// 0.1.7+/0.2.x 专属契约待真实宿主浏览器验证后补充。
const hostPrimitivesVersion = JSON.parse(
  readFileSync('node_modules/@deepseek-ai/dsh-client-ui-primitives/package.json', 'utf8'),
).version as string
const isRc1ContractHost = !gt(hostPrimitivesVersion, '0.1.2-rc.1')

afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard })
})

describe('GenUI diff labels', () => {
  it('supplies the shared code toolbar labels', () => {
    expect(diffBlockLabels()).toMatchObject({ codeLabel: '代码', wrapLabel: '自动换行', unwrapLabel: '取消自动换行' })
  })

  it.skipIf(!isRc1ContractHost)('renders the rc.1 diff contract with localized copy labels', () => {
    const node: GenuiDiff = {
      type: 'diff',
      diffs: [{ path: 'a.txt', oldText: 'x', newText: 'y' }],
    }

    render(<DiffNode node={node} />)

    const diff = document.querySelector('[data-diff]')
    expect(diff).not.toBeNull()
    expect(diff?.textContent).toContain('复制')
    expect(diff?.textContent).toContain('1 个文件')
    expect(diff?.textContent).not.toContain('undefined')
  })

  it('passes required copy labels to CodeBlock', () => {
    const node: GenuiCode = { type: 'code', lang: 'text', code: 'hello' }

    render(<CodeNode node={node} />)

    expect(document.querySelector('.md-code-block')?.textContent).toContain('复制')
    expect(document.querySelector('.md-code-block')?.textContent).not.toContain('undefined')
  })

  it('uses the localized CodeBlock copied label after copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const node: GenuiCode = { type: 'code', lang: 'text', code: 'hello' }

    render(<CodeNode node={node} />)

    fireEvent.click(document.querySelector('.md-code-block button')!)
    await waitFor(() => expect(document.querySelector('.md-code-block button')?.textContent).toBe('复制成功'))
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('passes required copy labels to JsonTree', () => {
    const node: GenuiJson = { type: 'json', value: { answer: 42 } }

    render(<JsonNode node={node} />)

    const row = document.querySelector('[role="treeitem"]')
    expect(row).not.toBeNull()
    fireEvent.mouseOver(row!)
    const button = document.querySelector('[data-json-copy-button]')
    expect(button?.getAttribute('aria-label')).toContain('复制')
    expect(button?.getAttribute('aria-label')).not.toContain('undefined')
  })

  it('uses the localized JsonTree copied label after copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const node: GenuiJson = { type: 'json', value: { answer: 42 } }

    render(<JsonNode node={node} />)

    const row = document.querySelector('[data-json-root-row]')!
    fireEvent.mouseOver(row)
    const button = document.querySelector<HTMLButtonElement>('[data-json-copy-button]')!
    fireEvent.click(button)
    await waitFor(() => expect(button.getAttribute('aria-label')).toBe('已复制'))
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ answer: 42 }, null, 2))
  })
})
