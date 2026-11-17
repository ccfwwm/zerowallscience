/** Authorized sources and checksummed parsing artifacts. */
import { createHash, randomUUID } from 'node:crypto'
import { access, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import JSZip from 'jszip'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Context } from '@deepseek-ai/cordis'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { MineruApi, MineruArtifact, MineruConfig, MineruParseResult } from '../shared/types.ts'
import { MineruError } from './errors.ts'
import { normalizeContent } from './content.ts'
function cwdFor(ctx: Context, sessionId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(sessionId)) throw new Error('MinerU session ID 无效。')
  const cwd = ctx.get('sessions')?.get(SessionId(sessionId))?.header.cwd
  if (cwd) return resolve(cwd)
  // Unscoped conversations are valid DSH sessions. Keep their MinerU
  // artifacts in the private DSH home rather than rejecting an otherwise
  // authorized upload merely because no workspace was selected.
  return resolve(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'attachments', 'mineru-sessions', sessionId)
}

function requireWorkspaceCwd(ctx: Context, sessionId: string): string {
  const cwd = ctx.get('sessions')?.get(SessionId(sessionId))?.header.cwd
  if (!cwd) throw new Error('当前会话没有工作区。')
  return resolve(cwd)
}
function inside(root: string, candidate: string): boolean { const rel = relative(resolve(root), resolve(candidate)); return rel === '' || (!rel.startsWith('..') && !/^(?:[A-Za-z]:[\\/]|[\\/])/u.test(rel)) }
async function ordinaryReadableFile(path: string, workspace?: string): Promise<string> {
  let actual: string
  try {
    const entry = await lstat(path)
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('指定路径不是普通文件。')
    actual = await realpath(path)
    await access(actual, constants.R_OK)
  } catch (error) {
    if (error instanceof Error && error.message === '指定路径不是普通文件。') throw error
    throw new Error(`MinerU 无法读取文件：${error instanceof Error ? error.message : String(error)}`)
  }
  if (workspace !== undefined) {
    const root = await realpath(workspace)
    if (!inside(root, actual)) throw new Error('MinerU 相对路径只能读取当前工作区内的普通文件。')
  }
  return actual
}

/** Resolve all parse inputs with one admission rule, shared by single and batch tools. */
export async function resolveMineruSource(ctx: Context, sessionId: string, input: string): Promise<{ filePath?: string; sourceName: string; url?: string }> {
  const source = input.trim()
  if (!source) throw new Error('MinerU source 不能为空。')
  if (/^https?:\/\//iu.test(source)) return { url: source, sourceName: source }
  if (/^sha256:[a-f0-9]{64}$/u.test(source)) {
    const session = ctx.get('sessions')?.get(SessionId(sessionId))
    const ref = session?.snapshotEvents().flatMap(event =>
      event.type === 'user/message' && event.data.source.kind === 'user'
        ? event.data.content.flatMap(part => part.type === 'file' && String(part.attachment.attachmentId) === source ? [part.attachment] : [])
        : [],
    ).at(-1) as FileAttachmentRef | undefined
    if (!ref) throw new Error('该文件附件未出现在当前会话的用户消息中。')
    const path = ctx.get('attachments')?.fileHostPath(ref)
    if (!path) throw new Error('当前附件存储没有可供 MinerU 读取的本机文件。')
    const filePath = await ordinaryReadableFile(path)
    const bytes = await readFile(filePath)
    if (bytes.length !== ref.bytes || `sha256:${sha(bytes)}` !== source) throw new Error('会话附件完整性校验失败。')
    return { filePath, sourceName: ref.name }
  }

  const workspace = requireWorkspaceCwd(ctx, sessionId)
  const candidate = isAbsolute(source) ? source : resolve(workspace, source)
  if (!inside(workspace, candidate)) throw new Error('MinerU 只能读取当前工作区内的普通文件。')
  const filePath = await ordinaryReadableFile(candidate, workspace)
  return { filePath, sourceName: basename(filePath) }
}
function sha(data: Uint8Array | string): string { return createHash('sha256').update(data).digest('hex') }
function mime(path: string): string { return ({ '.md': 'text/markdown', '.json': 'application/json', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.html': 'text/html', '.tex': 'application/x-latex' } as Record<string, string>)[extname(path).toLowerCase()] ?? 'application/octet-stream' }
function kind(path: string): MineruArtifact['kind'] { const ext = extname(path).toLowerCase(); if (ext === '.md') return 'markdown'; if (ext === '.json') return 'json'; if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) return 'image'; if (ext === '.zip') return 'archive'; return 'export' }
async function artifacts(dir: string): Promise<MineruArtifact[]> { const result: MineruArtifact[] = []; async function visit(path: string): Promise<void> { for (const entry of await readdir(path, { withFileTypes: true })) { const item = join(path, entry.name); if (entry.isDirectory()) await visit(item); else { const info = await stat(item); result.push({ name: entry.name, path: item, mediaType: mime(item), bytes: info.size, checksum: sha(await readFile(item)), kind: kind(item) }) } } } await visit(dir); return result }
async function extractZip(data: Uint8Array, destination: string): Promise<void> { const zip = await JSZip.loadAsync(data, { checkCRC32: true }); const entries = Object.values(zip.files); if (entries.length > 10000) throw new Error('MinerU 结果 ZIP 条目过多。'); let total = 0; for (const entry of entries) { const name = (entry.unsafeOriginalName ?? entry.name).replaceAll('\\', '/'); if ((Number(entry.unixPermissions) & 0o170000) === 0o120000) throw new MineruError('MINERU_ZIP_PATH', 'MinerU 结果 ZIP 包含符号链接。'); if (entry.dir) continue; if (name.startsWith('/') || /^[A-Za-z]:/u.test(name) || name.split('/').includes('..')) throw new Error('MinerU 结果 ZIP 包含不安全路径。'); const output = resolve(destination, name); if (!inside(destination, output)) throw new Error('MinerU 结果 ZIP 路径越界。'); const bytes = await entry.async('uint8array'); total += bytes.byteLength; if (total > 512 * 1024 * 1024) throw new Error('MinerU 结果 ZIP 超过 512 MiB。'); await mkdir(resolve(output, '..'), { recursive: true }); await writeFile(output, bytes, { flag: 'wx' }).catch(async error => { if ((error as NodeJS.ErrnoException).code === 'EEXIST') await writeFile(output, bytes); else throw error }) } }
function preview(markdown: string, limit: number) { const bytes = Buffer.byteLength(markdown); if (bytes <= limit) return { markdown, truncated: false, bytes }; return { markdown: `${Buffer.from(markdown).subarray(0, limit).toString('utf8')}\n...(预览已截断，完整内容见 full.md)`, truncated: true, bytes } }
async function writeResult(cfg: MineruConfig, sessionId: string, cwd: string, sourceName: string, api: MineruApi, taskId: string | undefined, markdown: string | undefined, archive: Uint8Array | undefined, started: number): Promise<MineruParseResult> {
  const dir = resolve(cwd, cfg.artifactRootName, 'artifacts', `run-${Date.now()}-${randomUUID().slice(0, 8)}`)
  await mkdir(dir, { recursive: true })
  if (archive) await extractZip(archive, dir)
  const extracted = await artifacts(dir)
  const markdownFile = extracted.find(item => item.path === resolve(dir, 'full.md')) ?? extracted.find(item => item.name === 'full.md') ?? extracted.find(item => item.kind === 'markdown')
  const text = markdown ?? (markdownFile ? await readFile(markdownFile.path, 'utf8') : undefined)
  if (!text?.trim()) throw new Error('MinerU 未返回可读 Markdown；解析未完成，请保留任务编号后重试。')
  // Preserve relative image links when an upstream archive contains a nested directory.
  const markdownPath = markdownFile?.path ?? resolve(dir, 'full.md')
  if (!markdownFile || markdown !== undefined) await writeFile(markdownPath, text, 'utf8')
  const rawFiles = await artifacts(dir)
  const contentFile = rawFiles.find(item => item.path === resolve(dir, 'content_list.json')) ?? rawFiles.find(item => item.name.endsWith('_content_list_v2.json')) ?? rawFiles.find(item => item.name.endsWith('_content_list.json') || item.name === 'content_list.json')
  const normalizedPath = contentFile ? resolve(dir, 'content-list.normalized.json') : null
  if (contentFile && normalizedPath) {
    const records = normalizeContent(JSON.parse(await readFile(contentFile.path, 'utf8')))
    await writeFile(normalizedPath, JSON.stringify(records, null, 2), 'utf8')
  }
  const files = await artifacts(dir)
  const manifestPath = resolve(dir, 'parse-manifest.json')
  await writeFile(manifestPath, JSON.stringify({ schema: 1, parser: 'mineru', source: sourceName, api, taskId: taskId ?? null,
    markdown: markdownPath, images: files.filter(item => item.kind === 'image').map(item => item.path),
    contentList: normalizedPath, rawContentList: contentFile?.path ?? null, contentListFormat: 'zerowall-1',
    modelVersion: cfg.modelVersion, ocr: { provider: 'mineru', requested: cfg.isOcr, state: 'done' }, state: 'done',
    artifacts: files.map(item => ({ path: item.path, checksum: item.checksum })) }, null, 2), 'utf8')
  await writeFile(resolve(dir, 'run.json'), JSON.stringify({ plugin: 'zerowall-mineru', sessionId, source: sourceName, api, taskId: taskId ?? null, createdAt: new Date().toISOString() }, null, 2), 'utf8')
  return { ok: true, api, mode: cfg.mode, modelVersion: cfg.modelVersion, ...(taskId ? { taskId } : {}), sourceName, runDir: dir,
    durationMs: Date.now() - started, preview: preview(text, cfg.inlineMarkdownBytes), artifacts: await artifacts(dir) }
}


export { cwdFor, inside, ordinaryReadableFile, sha, artifacts, extractZip, writeResult }

/** Verify persisted artifacts before returning a cached result. @param result - Collected artifacts. @param cwd - Owning workspace or private session root. */
export async function verifyResult(result: MineruParseResult, cwd: string): Promise<void> {
  const root = await realpath(cwd)
  if (!inside(root, await realpath(result.runDir))) throw new MineruError('MINERU_ARTIFACT', '解析产物已移出当前会话目录。')
  for (const item of result.artifacts) {
    try {
      const actual = await ordinaryReadableFile(item.path, result.runDir)
      if (sha(await readFile(actual)) !== item.checksum) throw new Error('checksum')
    } catch (error) { throw new MineruError('MINERU_ARTIFACT', '解析产物缺失或已改变；请检查原任务和产物目录。', result.taskId, { cause: error }) }
  }
}
