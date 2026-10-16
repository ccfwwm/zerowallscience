import { expect, it, vi } from 'vitest'
import { withPackageDownloadRetries } from '../src/main/python-download-retry.js'
import { withPythonOperation } from '../src/main/python-operation.js'

it('clears an interrupted package download, backs off, and validates each successful artifact', async () => {
  const clear = vi.fn(async () => undefined)
  const pause = vi.fn(async () => undefined)
  const run = vi.fn().mockRejectedValueOnce(new Error('IncompleteRead: Connection broken')).mockResolvedValueOnce({ bytes: 42, sha256: 'a'.repeat(64) })
  const validate = vi.fn(async value => { if (value.bytes !== 42 || value.sha256.length !== 64) throw new Error('corrupt') })
  await expect(withPackageDownloadRetries({ packageName: 'numpy', mirrorUrl: 'https://mirrors.aliyun.com/pypi/simple', run, validate, clear, pause })).resolves.toEqual({ bytes: 42, sha256: 'a'.repeat(64) })
  expect(clear).toHaveBeenCalledTimes(2)
  expect(run).toHaveBeenCalledTimes(2)
  expect(validate).toHaveBeenCalledExactlyOnceWith({ bytes: 42, sha256: 'a'.repeat(64) }, 2)
  expect(pause).toHaveBeenCalledExactlyOnceWith(500)
})

it('reports the selected mirror, package, retry count, and original error after repeated failures', async () => {
  const clear = vi.fn(async () => undefined)
  await expect(withPackageDownloadRetries({ packageName: 'tensorflow', mirrorUrl: 'https://mirrors.aliyun.com/pypi/simple', attempts: 3, run: async () => { throw new Error('ChunkedEncodingError: HTTP 503') }, validate: () => undefined, clear, pause: async () => undefined })).rejects.toThrow(/tensorflow.*mirrors\.aliyun\.com.*重试 2 次.*ChunkedEncodingError/u)
  expect(clear).toHaveBeenCalledTimes(4)
})

it('clears partial output before surfacing cancellation from a failed attempt', async () => {
  const controller = new AbortController()
  const clear = vi.fn(async () => undefined)
  const pause = vi.fn(async () => undefined)
  const run = vi.fn(async () => {
    controller.abort()
    throw new Error('download interrupted')
  })
  await expect(withPythonOperation(controller.signal, () => withPackageDownloadRetries({
    packageName: 'numpy', mirrorUrl: 'https://mirrors.aliyun.com/pypi/simple', run, validate: () => undefined, clear, pause,
  }))).rejects.toThrow('PYTHON_OPERATION_CANCELLED')
  expect(clear).toHaveBeenCalledTimes(2)
  expect(run).toHaveBeenCalledOnce()
  expect(pause).not.toHaveBeenCalled()
})
