/** Versioned operation records retain cloud identities before upload begins. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MineruRunId } from '../shared/types.ts'
import { DEFAULTS, validateConfig } from './config.ts'
import { MineruError } from './errors.ts'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u)
export const optionsSchema = z.object({
  language: z.string().optional(), modelVersion: z.enum(['pipeline', 'vlm', 'MinerU-HTML']).optional(),
  isOcr: z.boolean().optional(), enableTable: z.boolean().optional(), enableFormula: z.boolean().optional(),
  extraFormats: z.array(z.enum(['docx', 'html', 'latex'])).optional(),
  pageRanges: z.string().optional(), pageRange: z.string().optional(), anchor: z.boolean().optional(),
})
export const configSchema = z.object({
  apiBaseUrl: z.string(), tokenCredential: z.string(), mode: z.enum(['auto', 'precision', 'agent']),
  modelVersion: z.enum(['pipeline', 'vlm', 'MinerU-HTML']), language: z.string(),
  enableTable: z.boolean(), enableFormula: z.boolean(), isOcr: z.boolean(), extraFormats: z.array(z.enum(['docx', 'html', 'latex'])),
  timeoutMs: z.number(), pollIntervalMs: z.number(), pollJitterMs: z.number(), submitRatePerMinute: z.number(),
  pollRatePerMinute: z.number().default(DEFAULTS.pollRatePerMinute), dailyLimit: z.number(), inlineMarkdownBytes: z.number(), artifactRootName: z.string(),
}).transform(validateConfig)
export const resultSchema = z.object({
  ok: z.literal(true), api: z.enum(['precision', 'agent']), mode: z.enum(['auto', 'precision', 'agent']),
  modelVersion: z.enum(['pipeline', 'vlm', 'MinerU-HTML']), taskId: id.optional(), runId: id.transform(brandString<MineruRunId>).optional(),
  sourceName: z.string(), runDir: z.string(), durationMs: z.number(),
  preview: z.object({ markdown: z.string(), truncated: z.boolean(), bytes: z.number() }),
  artifacts: z.array(z.object({ name: z.string(), path: z.string(), mediaType: z.string(), bytes: z.number(), checksum: z.string(), kind: z.enum(['markdown', 'json', 'image', 'export', 'archive']) })),
  chunks: z.array(z.object({ pages: z.array(z.number().int().positive()), taskId: id })).optional(),
  anchor: z.object({ path: z.string().optional(), warnings: z.array(z.string()) }).optional(),
})
export const taskSchema = z.object({
  schema: z.literal(2).optional(), api: z.enum(['precision', 'agent']), taskId: id, remoteId: id.optional(),
  batch: z.boolean(), sourceName: z.string(), source: z.string().optional(), sessionId: z.string().optional(),
  dataId: id.optional(), config: configSchema, options: optionsSchema.default({}), pages: z.array(z.number().int().positive()).optional(),
  upload: z.object({ url: z.string().url(), path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/u), complete: z.boolean() }).optional(),
  result: resultSchema.optional(),
})
export type PendingTask = z.infer<typeof taskSchema>
export const runSchema = z.object({
  schema: z.literal(1), runId: id.transform(brandString<MineruRunId>), sessionId: z.string(), source: z.string(), sourceName: z.string(), sha256: z.string(),
  config: configSchema, options: optionsSchema, chunks: z.array(z.object({ pages: z.array(z.number().int().positive()), taskId: id.optional(), submissionUnknown: z.boolean().optional() })),
  result: resultSchema.optional(),
})
export type PendingRun = z.infer<typeof runSchema>

/** Locate a record without accepting path components. @param cwd - Session workspace. @param kind - Record category. @param key - Opaque id. @returns Absolute path. */
export function recordPath(cwd: string, kind: 'tasks' | 'runs', key: string): string {
  return resolve(cwd, '.dsh-mineru', kind, id.parse(key) + '.json')
}

/** Publish a whole record atomically. @param file - Admitted record path. @param value - Serializable state. */
export async function saveRecord(file: string, value: PendingTask | PendingRun): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value) + '\n', { mode: 0o600 })
  await rename(temporary, file)
}

/** Validate a task or run from disk. @param file - Record path. @param schema - Versioned decoder. @returns Admitted record. */
export async function readRecord<T>(file: string, schema: z.ZodType<T>): Promise<T> {
  try { return schema.parse(JSON.parse(await readFile(file, 'utf8'))) }
  catch (error) { throw new MineruError('MINERU_RECORD', 'MinerU 任务记录缺失或无效；保留原文件并核对任务编号。', undefined, { cause: error }) }
}
