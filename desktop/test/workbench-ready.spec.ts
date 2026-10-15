// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { WORKBENCH_READY_SCRIPT } from '../src/main/workbench-ready.js'

function mounted(html: string, visible = true): boolean {
  document.body.innerHTML = html
  for (const element of document.querySelectorAll('[data-composer-input], [contenteditable=true]')) {
    element.getBoundingClientRect = () => ({ width: visible ? 400 : 0, height: visible ? 40 : 0 }) as DOMRect
  }
  return window.eval(WORKBENCH_READY_SCRIPT) as boolean
}

describe('workbench mount detection', () => {
  it('starts with the real inert no-workspace composer and with blocked input', () => {
    expect(mounted('<div data-composer-input contenteditable="false" role="textbox" data-phase="inert">选择一个工作区开始</div>')).toBe(true)
    expect(mounted('<div data-composer-input contenteditable="false" aria-disabled="true">选择模型</div>')).toBe(true)
    expect(mounted('<div data-composer-input contenteditable="true"></div>')).toBe(true)
  })
  it('continues waiting for hidden or unmounted UI and preserves boot failure checks', () => {
    expect(mounted('<button>设置</button>')).toBe(false)
    expect(mounted('<div data-composer-input></div>', false)).toBe(false)
    expect(mounted('<div data-composer-input style="visibility:hidden"></div>')).toBe(false)
    expect(mounted('<div data-dsh-boot></div><div data-composer-input></div>')).toBe(false)
    expect(mounted('<div data-dsh-boot-failed></div><div data-composer-input></div>')).toBe(false)
  })
})
