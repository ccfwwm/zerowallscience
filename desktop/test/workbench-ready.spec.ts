// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { WORKBENCH_READY_SCRIPT } from '../src/main/workbench-ready.js'

function mountWorkbench(composer = '<div data-composer-input contenteditable="true"></div>'): void {
  document.body.innerHTML = `
    <div data-frame style="display:grid">
      <div data-sidebar style="display:flex;flex-direction:column"><div data-sidebar-footer></div></div>
      <div data-conversation-content style="display:flex;flex-direction:column">${composer}</div>
      <div data-rightbar-col></div>
    </div>`
  for (const element of document.querySelectorAll('*')) {
    element.getBoundingClientRect = () => ({ width: 400, height: 800 }) as DOMRect
  }
}

function mounted(): boolean {
  return window.eval(WORKBENCH_READY_SCRIPT) as boolean
}

function productImage(complete: boolean, width: number, height = width): HTMLImageElement {
  const image = document.createElement('img')
  image.src = '/zerowall-icon.png'
  image.alt = 'ZeroWall Science'
  image.getBoundingClientRect = () => ({ width: 34, height: 34 }) as DOMRect
  Object.defineProperties(image, {
    complete: { configurable: true, value: complete },
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  })
  document.querySelector('[data-conversation-content]')!.append(image)
  return image
}

describe('workbench renderer health', () => {
  beforeEach(() => { mountWorkbench() })

  it('starts with the real inert no-workspace composer and with blocked input', () => {
    for (const composer of [
      '<div data-composer-input contenteditable="false" role="textbox" data-phase="inert">选择一个工作区开始</div>',
      '<div data-composer-input contenteditable="false" aria-disabled="true">选择模型</div>',
      '<div data-composer-input contenteditable="true"></div>',
    ]) {
      mountWorkbench(composer)
      expect(mounted()).toBe(true)
    }
  })

  it('does not require optional plugins, account login, history rows, or a product image', () => {
    expect(document.querySelector('[data-dsh-better-sidebar], [role=treeitem], img')).toBeNull()
    expect(mounted()).toBe(true)
  })

  it('allows the desktop collapsed sidebar zero-width track', () => {
    const sidebar = document.querySelector<HTMLElement>('[data-sidebar]')!
    sidebar.getBoundingClientRect = () => ({ width: 0, height: 800 }) as DOMRect
    expect(mounted()).toBe(false)
    document.querySelector('[data-frame]')!.setAttribute('data-sidebar-collapsed', 'true')
    expect(mounted()).toBe(true)
  })

  it('waits for the native sidebar and conversation shell, including their layout styles', () => {
    for (const selector of ['[data-frame]', '[data-sidebar]', '[data-conversation-content]']) {
      const element = document.querySelector<HTMLElement>(selector)!
      const previous = element.style.cssText
      element.style.cssText = ''
      expect(mounted()).toBe(false)
      element.style.cssText = previous
    }
    document.querySelector('[data-sidebar-footer]')!.remove()
    expect(mounted()).toBe(false)
  })

  it('waits for loading or broken visible brand images instead of exposing wrapped alt text', () => {
    productImage(false, 0)
    expect(mounted()).toBe(false)
    document.querySelector('img')!.remove()
    productImage(true, 0)
    expect(mounted()).toBe(false)
    document.querySelector('img')!.remove()
    productImage(true, 34, 0)
    expect(mounted()).toBe(false)
    document.querySelector('img')!.remove()
    productImage(true, 256)
    expect(mounted()).toBe(true)
  })

  it('does not wait for optional images or a brand image hidden in a collapsed sidebar', () => {
    const optional = document.createElement('img')
    optional.src = '/optional-plugin-preview.png'
    document.querySelector('[data-frame]')!.append(optional)
    const hidden = productImage(true, 0)
    hidden.style.display = 'none'
    expect(mounted()).toBe(true)
    hidden.style.display = ''
    document.querySelector('[data-sidebar]')!.append(hidden)
    // A zero-width overflow-clipped track can leave a child's own rect nonzero.
    document.querySelector('[data-sidebar]')!.getBoundingClientRect = () => ({ width: 0, height: 800 }) as DOMRect
    document.querySelector('[data-frame]')!.setAttribute('data-sidebar-collapsed', 'true')
    expect(mounted()).toBe(true)
  })

  it('continues waiting for hidden or unmounted UI and preserves boot failure checks', () => {
    mountWorkbench('<button>设置</button>')
    expect(mounted()).toBe(false)
    mountWorkbench('<div data-composer-input></div>')
    document.querySelector('[data-composer-input]')!.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect
    expect(mounted()).toBe(false)
    mountWorkbench('<div data-composer-input style="visibility:hidden"></div>')
    expect(mounted()).toBe(false)
    for (const marker of ['data-dsh-boot', 'data-dsh-boot-failed']) {
      mountWorkbench(`<div ${marker}></div><div data-composer-input></div>`)
      expect(mounted()).toBe(false)
    }
  })
})
