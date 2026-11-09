/** Verified OCR assets live in user data; inference never downloads models. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'

const Model = z.object({ name: z.string().regex(/^[A-Za-z0-9_.-]+\.onnx$/u), url: z.url().refine(value => new URL(value).protocol === 'https:'), bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/u) })
const Manifest = z.object({ schemaVersion: z.literal(1), version: z.string(), models: z.array(Model).min(1) })
/** Persistent UI state describes only verified resources and the current attempt. */
export interface OcrModelStatus { phase: 'idle' | 'checking' | 'downloading' | 'verifying' | 'ready' | 'failed'; receivedBytes: number; totalBytes: number; message?: string; code?: string }
/** Download locations and bounded retry policy supplied by the plugin configuration. */
export interface OcrModelConfig { root: string; manifest: string; mirror?: string; attempts: number; timeoutMs: number; retryDelayMs: number }

/** Failures leave committed models intact; callers may explicitly retry preparation. */
export class OcrModelError extends Error {
  constructor(readonly code: 'OCR_DOWNLOAD_FAILED' | 'OCR_MODEL_INTEGRITY' | 'OCR_STORAGE_FAILED' | 'OCR_CANCELLED', message: string, options?: ErrorOptions) { super(message, options) }
}

/** One lifecycle-owned task prepares each model set and atomically publishes verified files. */
export class OcrModels {
  private readonly controller = new AbortController()
  private pending: Promise<string> | undefined
  status: OcrModelStatus = { phase: 'idle', receivedBytes: 0, totalBytes: 0 }
  constructor(private readonly config: OcrModelConfig) {
    if (!isAbsolute(config.root)) throw new Error('ZEROWALL_OCR_MODELS_ROOT must be an absolute data directory.')
    if (config.mirror) this.mirrorUrl(config.mirror)
  }

  /** Join startup preparation; failures stay visible until retry or the next launch. */
  prepare(): Promise<string> {
    if (this.controller.signal.aborted) return Promise.reject(new OcrModelError('OCR_CANCELLED', 'OCR preparation was cancelled.'))
    return this.pending ??= this.run()
  }
  /** Retry a failed task, retaining every model that already passed verification. */
  retry(): Promise<string> { if (this.status.phase === 'failed') this.pending = undefined; return this.prepare() }

  private mirrorUrl(value: string): URL {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('OCR model mirror must be an HTTPS directory without credentials, query parameters or fragments.')
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    return url
  }

  private async valid(path: string, model: z.infer<typeof Model>): Promise<boolean> {
    let bytes: Buffer
    try { bytes = await readFile(path) }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false; throw error }
    return bytes.length === model.bytes && createHash('sha256').update(bytes).digest('hex') === model.sha256
  }

  private async run(): Promise<string> {
    this.status = { phase: 'checking', receivedBytes: 0, totalBytes: 0 }
    try {
      this.controller.signal.throwIfAborted()
      const manifest = Manifest.parse(JSON.parse(await readFile(this.config.manifest, 'utf8')))
      const identity = createHash('sha256').update(JSON.stringify(manifest.models.map(({ name, sha256 }) => ({ name, sha256 })))).digest('hex').slice(0, 24)
      const directory = join(this.config.root, identity)
      await mkdir(directory, { recursive: true })
      this.status.totalBytes = manifest.models.reduce((sum, model) => sum + model.bytes, 0)
      for (const model of manifest.models) {
        this.controller.signal.throwIfAborted()
        const destination = join(directory, model.name)
        if (!await this.valid(destination, model)) await this.download(destination, model)
        this.status.receivedBytes += model.bytes
      }
      this.controller.signal.throwIfAborted()
      this.status.phase = 'ready'
      return directory
    } catch (cause) {
      const error = this.controller.signal.aborted ? new OcrModelError('OCR_CANCELLED', 'OCR preparation was cancelled.', { cause })
        : cause instanceof OcrModelError ? cause : new OcrModelError('OCR_STORAGE_FAILED', 'OCR resources could not be prepared. Check the data directory and retry.', { cause })
      this.status = { ...this.status, phase: 'failed', message: error.message, code: error.code }
      throw error
    }
  }

  private async download(destination: string, model: z.infer<typeof Model>): Promise<void> {
    const url = this.config.mirror ? new URL(model.name, this.mirrorUrl(this.config.mirror)).href : model.url
    for (let attempt = 0; attempt < this.config.attempts; attempt++) {
      this.controller.signal.throwIfAborted()
      const temporary = `${destination}.${randomUUID()}.tmp`
      const completed = this.status.receivedBytes
      let received = 0
      try {
        this.status.phase = 'downloading'
        const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(this.config.timeoutMs)])
        let response: Response
        try { response = await fetch(url, { signal, redirect: 'follow' }) }
        catch (cause) { throw new OcrModelError('OCR_DOWNLOAD_FAILED', 'OCR model download failed. Check the network or model mirror and retry.', { cause }) }
        if (!response.ok || !response.body || new URL(response.url || url).protocol !== 'https:') {
          await response.body?.cancel()
          throw new OcrModelError('OCR_DOWNLOAD_FAILED', 'OCR model download failed. Check the network or model mirror and retry.')
        }
        const file = await open(temporary, 'wx')
        const digest = createHash('sha256')
        try {
          try {
            for await (const chunk of response.body) {
              signal.throwIfAborted(); received += chunk.length
              if (received > model.bytes) throw new OcrModelError('OCR_MODEL_INTEGRITY', 'OCR model size did not match its release. Check the mirror and retry.')
              digest.update(chunk)
              try { await file.writeFile(chunk) }
              catch (cause) { throw new OcrModelError('OCR_STORAGE_FAILED', 'OCR resources could not be saved. Check the data directory and free disk space, then retry.', { cause }) }
              this.status.receivedBytes = completed + received
            }
          } catch (cause) {
            if (cause instanceof OcrModelError) throw cause
            if (cause instanceof Error && 'code' in cause && ['ENOSPC', 'EACCES', 'EPERM'].includes(String(cause.code))) throw cause
            throw new OcrModelError('OCR_DOWNLOAD_FAILED', 'OCR model download was interrupted. Check the network and retry.', { cause })
          }
        } finally { await file.close() }
        this.status.phase = 'verifying'
        if (received !== model.bytes || digest.digest('hex') !== model.sha256) throw new OcrModelError('OCR_MODEL_INTEGRITY', 'OCR model checksum did not match its release. Check the mirror and retry.')
        this.controller.signal.throwIfAborted()
        await rename(temporary, destination)
        this.status.receivedBytes = completed
        return
      } catch (error) {
        this.status.receivedBytes = completed
        if (!(error instanceof OcrModelError) || error.code !== 'OCR_DOWNLOAD_FAILED' || attempt + 1 === this.config.attempts) throw error
      } finally { await rm(temporary, { force: true }) }
      await delay(this.config.retryDelayMs, undefined, { signal: this.controller.signal })
    }
  }

  /** Cancel transfers and await file closure before releasing the plugin. */
  async dispose(): Promise<void> { this.controller.abort(); await Promise.allSettled([this.pending]) }
}
