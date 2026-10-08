// @vitest-environment jsdom

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { SideCardSection, type SideCardSectionProps } from '../src/client/SideCardSection.tsx'
import { createBetterSidebarService } from '../src/client/service.ts'
import { createSidebarStore } from '../src/client/state.ts'

const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

afterEach(() => {
  delete document.body.dataset.zerowallFocusFileViewers
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor)
  else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
  document.body.replaceChildren()
})

it('focuses the file viewer controls when opened from ZeroWall plugin settings', () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline fixture')))
  const scrollIntoView = vi.fn()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  const store = createSidebarStore()
  const service = createBetterSidebarService(store)
  const container = document.createElement('div')
  document.body.append(container)
  document.body.dataset.zerowallFocusFileViewers = 'true'
  const root = createRoot(container)

  act(() => root.render(createElement(SideCardSection, { store, service } as SideCardSectionProps)))
  const heading = [...container.querySelectorAll<HTMLElement>('[tabindex="-1"]')]
    .find(element => element.textContent?.includes('File viewers') || element.textContent?.includes('文件预览'))
  expect(heading).toBeDefined()
  expect(scrollIntoView).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(heading)
  expect(document.body.dataset.zerowallFocusFileViewers).toBeUndefined()

  act(() => root.unmount())
})
