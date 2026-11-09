/** Import preparation copies inert files; it never runs imported scripts or package installers. */
import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import { unzipSync } from 'fflate'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { SkillInvocationPolicy } from '@deepseek-ai/dsh-skill'
import type { ImportPreview } from '../shared/types.js'

const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024
const MAX_FILES = 10_000

/** Parsed metadata and original content from one local instruction file. */
export interface ParsedInstruction { name: string; description: string; content: string; metadata: Record<string, unknown>; invocation: SkillInvocationPolicy }

/**
 * Parse and validate the durable Markdown format without evaluating its contents.
 * @param content - UTF-8 instruction document.
 * @returns validated frontmatter and instruction body.
 */
export function parseInstruction(content: string): ParsedInstruction {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(content)
  if (!match) throw new Error('SKILL.md requires YAML name and description frontmatter.')
  const value: unknown = parse(match[1]!)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Skill frontmatter must be an object.')
  const metadata: Record<string, unknown> = Object.fromEntries(Object.entries(value))
  if (typeof metadata.name !== 'string' || !isSkillName(metadata.name)) throw new Error('Skill name must use lowercase kebab-case.')
  if (typeof metadata.description !== 'string' || !metadata.description.trim()) throw new Error('Skill description is required.')
  for (const field of ['disable-model-invocation', 'user-invocable']) {
    if (metadata[field] !== undefined && typeof metadata[field] !== 'boolean') throw new Error(`Skill ${field} must be a boolean.`)
  }
  return { name: metadata.name, description: metadata.description, content: content.slice(match[0].length), metadata,
    invocation: { modelInvocable: metadata['disable-model-invocation'] !== true, userInvocable: metadata['user-invocable'] !== false } }
}

/**
 * Validate an archive member before writing it below a staging directory.
 * @param name - archive member using slash separators.
 * @returns the normalized relative member name.
 */
export function safeArchivePath(name: string): string {
  const normalized = name.replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || isAbsolute(normalized) || /^[a-z]:/iu.test(normalized)
    || normalized.split('/').some(segment => segment === '..' || segment.includes(':')))
    throw new Error('Archive entry escapes the import directory.')
  return normalized
}

/**
 * Expand a bounded ZIP without permitting absolute members or traversal.
 * @param bytes - complete downloaded or local archive.
 * @param destination - owned empty staging directory.
 * @returns completion after every member is written.
 */
export async function extractArchive(bytes: Uint8Array, destination: string): Promise<void> {
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('Skill archive exceeds 64 MiB.')
  let count = 0
  let expanded = 0
  const files = unzipSync(bytes, { filter(file) {
    safeArchivePath(file.name)
    count += 1
    expanded += file.originalSize
    if (count > MAX_FILES || expanded > MAX_EXPANDED_BYTES) throw new Error('Skill archive exceeds the extraction budget.')
    return true
  } })
  for (const [name, content] of Object.entries(files)) {
    const target = resolve(destination, safeArchivePath(name))
    if (name.endsWith('/')) await mkdir(target, { recursive: true })
    else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, content) }
  }
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: 'error' })
  if (!response.ok || !response.body) throw new Error(`Skill source returned HTTP ${response.status}.`)
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > MAX_DOWNLOAD_BYTES) throw new Error('Skill download exceeds 64 MiB.')
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

async function copyLocal(source: string, destination: string): Promise<void> {
  const root = await realpath(source)
  let count = 0
  let bytes = 0
  async function visit(path: string): Promise<void> {
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error('Skill imports cannot contain symbolic links.')
    if (info.isDirectory()) {
      for (const item of await readdir(path)) {
        if (item === '.git' || item === 'node_modules' || item === '__pycache__') continue
        await visit(join(path, item))
      }
    } else if (info.isFile()) {
      count += 1; bytes += info.size
      if (count > MAX_FILES || bytes > MAX_EXPANDED_BYTES) throw new Error('Skill folder exceeds the import budget.')
      const target = join(destination, relative(root, path))
      await mkdir(dirname(target), { recursive: true })
      await cp(path, target)
    }
  }
  await visit(root)
}

/** Staged import retains the complete resource tree and an immutable GitHub commit. */
export interface PreparedImport { preview: ImportPreview; directory: string; root: string }

/**
 * Stage a folder, Markdown, ZIP or public GitHub tree for explicit review.
 * @param source - local path or HTTPS GitHub repository/tree URL.
 * @param staging - application-owned staging root.
 * @param existing - names in the current effective catalog.
 * @returns inert staged files and the preview required to install them.
 */
export async function prepareImport(source: string, staging: string, existing: ReadonlySet<string>): Promise<PreparedImport> {
  const id = randomUUID()
  const directory = join(staging, id)
  const root = join(directory, 'files')
  await mkdir(root, { recursive: true })
  let commit: string | undefined
  let selectedRoot = root
  try {
    if (/^https:\/\//iu.test(source)) {
      const url = new URL(source)
      if (url.hostname !== 'github.com' || url.username || url.password || url.search) throw new Error('Use a public github.com repository or tree URL.')
      const [owner, repository, kind, ref, ...subpath] = url.pathname.split('/').filter(Boolean)
      if (!owner || !repository || kind && kind !== 'tree') throw new Error('GitHub source must identify a repository or tree.')
      const api = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(ref ?? 'HEAD')}`, { signal: AbortSignal.timeout(30_000) })
      const revision: unknown = await api.json()
      if (!api.ok || revision === null || typeof revision !== 'object' || !('sha' in revision) || typeof revision.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(revision.sha)) throw new Error('GitHub revision could not be resolved.')
      commit = revision.sha
      await extractArchive(await download(`https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/zip/${commit}`), root)
      const roots = await readdir(root)
      if (roots.length !== 1) throw new Error('GitHub archive has no unique repository root.')
      selectedRoot = resolve(root, roots[0]!, ...subpath.map(safeArchivePath))
      const inside = relative(root, selectedRoot)
      if (inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error('GitHub tree escapes its repository.')
    } else {
      const local = resolve(source)
      const info = await lstat(local)
      if (info.isSymbolicLink()) throw new Error('Select a real folder or file, not a symbolic link.')
      if (info.isDirectory()) await copyLocal(local, root)
      else if (/\.zip$/iu.test(local)) await extractArchive(await readFile(local), root)
      else if (/\.md$/iu.test(local)) await cp(local, join(root, 'SKILL.md'))
      else throw new Error('Select a folder, Markdown file or ZIP archive.')
    }
    const skills: ImportPreview['skills'] = []
    async function scan(path: string): Promise<void> {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const file = join(path, entry.name)
        if (entry.isDirectory()) await scan(file)
        else if (entry.name === 'SKILL.md') {
          const parsed = parseInstruction(await readFile(file, 'utf8'))
          if (skills.some(skill => skill.name === parsed.name)) throw new Error(`Import repeats skill name: ${parsed.name}.`)
          skills.push({ name: parsed.name, description: parsed.description, relativePath: relative(selectedRoot, file).replaceAll('\\', '/'), conflict: existing.has(parsed.name) })
        }
      }
    }
    await scan(selectedRoot)
    if (!skills.length) throw new Error('No SKILL.md found in this source.')
    return { directory, root: selectedRoot, preview: { id, source, ...(commit ? { commit } : {}), skills } }
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
}

/**
 * Atomically publish the staged tree without running any of its content.
 * @param prepared - previewed import.
 * @param destination - application-owned import storage.
 * @returns installed tree path.
 */
export async function publishImport(prepared: PreparedImport, destination: string): Promise<string> {
  const key = createHash('sha256').update(prepared.preview.source).digest('hex').slice(0, 16) + '-' + prepared.preview.id
  const target = join(destination, key)
  await mkdir(destination, { recursive: true })
  await rename(prepared.directory, target)
  return join(target, relative(prepared.directory, prepared.root))
}
