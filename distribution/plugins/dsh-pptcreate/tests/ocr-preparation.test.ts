// @vitest-environment jsdom
import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { OcrPreparation } from '../client/components/OcrPreparation.js'
import { api } from '../client/api.js'
import { zh } from '../client/ocr-locales.js'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('shows a localized preparation failure and retries without a Session', async () => {
  const status = vi.spyOn(api, 'ocrStatus').mockResolvedValue({ status: { phase: 'ready' }, ocr: { phase: 'failed', receivedBytes: 0, totalBytes: 0 } })
  const retry = vi.spyOn(api, 'retryOcr').mockResolvedValue({ status: { phase: 'ready' }, ocr: { phase: 'ready', receivedBytes: 1024, totalBytes: 1024 } })
  render(React.createElement(OcrPreparation, { t: key => zh[key] }))
  expect((await screen.findByRole('alert')).textContent).toMatchInlineSnapshot('"OCR 准备失败，请检查网络后重试"')
  expect(status).toHaveBeenCalledOnce()
  expect(retry).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '重试 OCR 准备' }))
  await screen.findByText('OCR 已就绪')
  expect(retry).toHaveBeenCalledOnce()
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
})
