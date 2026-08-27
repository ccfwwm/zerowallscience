import { describe, expect, it, vi } from 'vitest'
import { openImageDupWorkbench } from '../src/client/plugin.js'

describe('image duplicate workbench routing', () => {
  it('opens a session-scoped tab and preserves the job identity', () => {
    const openTab = vi.fn()
    openImageDupWorkbench({ openTab }, { sessionId: 'session-1', jobId: 'job-1', projectId: 'project-1' })
    expect(openTab).toHaveBeenCalledWith({
      type: 'zerowall:image-dup', id: 'zerowall:image-dup:job-1', title: '科研图片查重',
      meta: { jobId: 'job-1', projectId: 'project-1' },
    }, { sessionId: 'session-1' })
  })
})
