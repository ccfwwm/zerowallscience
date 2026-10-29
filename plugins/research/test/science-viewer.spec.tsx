// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ScienceViewer } from '../src/client/view.js'

afterEach(cleanup)

it('keeps research records and workflow out of the visual viewer', async () => {
  const remote = {
    ensureResearchContext: vi.fn().mockResolvedValue({ ok: true, value: { project: { id: 'project-1' } } }),
    listResearchStudies: vi.fn(),
    autoApproveResearchGate1: vi.fn(),
    autoApproveResearchGate2: vi.fn(),
  }

  render(<ScienceViewer remote={remote as any} scope={{ sessionId: 'session-1', cwd: 'C:/project' } as any} tab={{ meta: {} } as any} visible />)

  expect(await screen.findByText('请在对话中请求打开科研文件或可视化结果。')).toBeTruthy()
  expect(screen.queryByText(/研究页面|数据与资料|证据与结论|Gate 1|Gate 2/u)).toBeNull()
  expect(remote.ensureResearchContext).toHaveBeenCalledOnce()
  expect(remote.listResearchStudies).not.toHaveBeenCalled()
  expect(remote.autoApproveResearchGate1).not.toHaveBeenCalled()
  expect(remote.autoApproveResearchGate2).not.toHaveBeenCalled()
})
