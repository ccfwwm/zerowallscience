import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, realpath, rm, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import type { MirrorConfig } from './python-mirror.js'
import { sanitizePythonTlsEnvironment } from './python-mirror.js'
import { buildPythonSourceWheel } from './python-source-builder.js'
import { withPackageDownloadRetries } from './python-download-retry.js'

export interface SourcePackage { name: string; version: string; filename: string; sha256: string }
export interface BuiltSourceWheel {
  name: string; version: string; url: string; hash: string
  sourceArchiveSha256: string; sourceFilename: string; sourceBuildId: string; sourceUrl: string
}
const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function digestFile(path: string): Promise<string> { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex') }
const safeFilename = (name: string) => /^[A-Za-z0-9_.+-]+\.(?:tar\.gz|zip)$/u.test(name)
const validRequirement = (value: string) => /^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:[=<>!~]=?[A-Za-z0-9.*+!<>=~,.-]+)?$/u.test(value)

/** Keep the complete version range in pip's failure; never broaden it to a name. */
export function missingSourceRequirement(message: string): string | undefined {
  const line = /No matching distribution found for ([^\r\n]+)/u.exec(message)?.[1]
  if (!line) return undefined
  const requirement = line.replace(/\s+\(from\s.*$/u, '').replace(/\s+/gu, '')
  return validRequirement(requirement) ? requirement : undefined
}
function checkedHttps(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('源码依赖下载必须使用 HTTPS。')
  return url
}

async function fetchHttps(url: string, fetcher: typeof fetch): Promise<Response> {
  let current = checkedHttps(url).href
  for (let redirects = 0; redirects < 5; redirects++) {
    const response = await fetcher(current, { redirect: 'manual', signal: AbortSignal.timeout(60_000) })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('源码依赖镜像返回无效重定向。')
      current = checkedHttps(new URL(location, current).href).href; continue
    }
    if (!response.ok) throw new Error(`源码依赖下载失败：HTTP ${response.status}`)
    return response
  }
  throw new Error('源码依赖镜像重定向过多。')
}

async function boundedBytes(response: Response, maximum: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > maximum) throw new Error('源码依赖下载超过大小限制。')
  if (!response.body) throw new Error('源码依赖下载内容为空。')
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let total = 0
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maximum) throw new Error('源码依赖下载超过大小限制。')
      parts.push(chunk.value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  return Buffer.concat(parts)
}

/** Read index and verify bytes before running any source-package metadata or build hook. */
export async function downloadSourceArchive(pkg: SourcePackage, mirror: MirrorConfig, directory: string, fetcher: typeof fetch = fetch): Promise<{ archivePath: string; sourceUrl: string }> {
  if (!safeFilename(pkg.filename) || !/^[a-f0-9]{64}$/u.test(pkg.sha256)) throw new Error('源码依赖文件名或 SHA-256 无效。')
  const indexUrl = checkedHttps(mirror.indexUrl.replace(/\/?$/u, '/') + `${normalize(pkg.name)}/`).href
  const html = new TextDecoder().decode(await boundedBytes(await fetchHttps(indexUrl, fetcher), 16 * 1024 * 1024))
  let selected: URL | undefined
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/giu)) {
    const candidate = new URL(match[1]!.replaceAll('&amp;', '&'), indexUrl)
    if (decodeURIComponent(candidate.pathname.split('/').at(-1) ?? '') !== pkg.filename) continue
    checkedHttps(candidate.href)
    const indexHash = new URLSearchParams(candidate.hash.slice(1)).get('sha256')
    if (indexHash && indexHash !== pkg.sha256) throw new Error(`依赖 ${pkg.name} 镜像中的源码 SHA-256 与锁定清单不一致。`)
    candidate.hash = ''; selected = candidate; break
  }
  if (!selected) throw new Error(`当前镜像未提供锁定的源码归档：${pkg.filename}`)
  await mkdir(directory, { recursive: true })
  const archivePath = join(directory, pkg.filename)
  await withPackageDownloadRetries({ packageName: pkg.name, mirrorUrl: mirror.indexUrl, run: async () => {
    const bytes = await boundedBytes(await fetchHttps(selected.href, fetcher), 512 * 1024 * 1024)
    if (digest(bytes) !== pkg.sha256) throw new Error(`依赖 ${pkg.name} 源码 SHA-256 校验失败。`)
    await writeFile(archivePath, bytes, { flag: 'wx' })
    return archivePath
  }, validate: async path => {
    const before = await stat(path); const sha256 = await digestFile(path); const after = await stat(path)
    if (!before.isFile() || !before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || sha256 !== pkg.sha256) throw new Error(`依赖 ${pkg.name} 源码长度或 SHA-256 校验失败。`)
  }, clear: async () => { await rm(archivePath, { force: true }) } })
  return { archivePath, sourceUrl: selected.href }
}

async function assertWithin(path: string, root: string): Promise<string> {
  const actual = await realpath(path); const base = await realpath(root)
  const rel = relative(base, actual)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('源码依赖缓存路径越界。')
  return actual
}

async function inspectMetadata(executable: string, wheelPath: string): Promise<{ name: string; version: string }> {
  const code = `import zipfile,email.parser,json,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n names=[n for n in z.namelist() if n.endswith('.dist-info/METADATA')]\n if len(names)!=1: raise ValueError('wheel metadata must be unique')\n m=email.parser.Parser().parsestr(z.read(names[0]).decode('utf-8'))\n print(json.dumps({'name':m['Name'],'version':m['Version']}))`
  return executeJson(executable, code, [wheelPath])
}

async function executeJson<T>(executable: string, code: string, args: string[], input?: string): Promise<T> {
  return new Promise((accept, reject) => {
    const child = spawn(executable, ['-I', '-B', '-c', code, ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: sanitizePythonTlsEnvironment() })
    let stdout = ''; let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('源码依赖元数据检查超时。')) }, 30_000)
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-8000) }); child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); if (code !== 0) return reject(new Error(stderr || '源码依赖元数据检查失败。')); try { accept(JSON.parse(stdout)) } catch { reject(new Error('源码依赖元数据无效。')) } })
    child.stdin.on('error', () => undefined)
    child.stdin.end(input)
  })
}

export async function prepareSourceWheel(root: string, context: { executable: string; sitePackages: string }, pkg: SourcePackage, mirror: MirrorConfig): Promise<BuiltSourceWheel> {
  const sourceBuildId = randomUUID()
  const buildRoot = join(root, 'plans', 'source-builds', sourceBuildId)
  const { archivePath, sourceUrl } = await downloadSourceArchive(pkg, mirror, join(buildRoot, 'source'))
  const outputDirectory = join(buildRoot, 'wheels'); await mkdir(outputDirectory)
  const { wheelPath } = await buildPythonSourceWheel({ ...context, archivePath, archiveSha256: pkg.sha256, outputDirectory, mirror })
  await assertWithin(wheelPath, outputDirectory)
  if (!/^[A-Za-z0-9_.+-]+\.whl$/u.test(basename(wheelPath)) || resolve(dirname(wheelPath)) !== resolve(outputDirectory)) throw new Error('源码构建产物路径无效。')
  const metadata = await inspectMetadata(context.executable, wheelPath)
  if (normalize(metadata.name) !== normalize(pkg.name) || metadata.version !== pkg.version) throw new Error(`源码构建产物 ${pkg.name} 的包名或版本不匹配。`)
  const record: BuiltSourceWheel = { name: pkg.name, version: pkg.version, url: pathToFileURL(wheelPath).href, hash: digest(await readFile(wheelPath)), sourceArchiveSha256: pkg.sha256, sourceFilename: pkg.filename, sourceBuildId, sourceUrl }
  await writeFile(join(buildRoot, 'receipt.json'), JSON.stringify(record))
  return record
}

/** Resolve a user dependency with standard PEP 440 and Python-version rules. */
export async function prepareRequestedSourceWheel(root: string, context: { executable: string; sitePackages: string }, requirement: string, mirror: MirrorConfig): Promise<BuiltSourceWheel> {
  const name = requirement.match(/^[A-Za-z0-9][A-Za-z0-9_.-]*/u)?.[0]
  if (!name || !validRequirement(requirement)) throw new Error('源码依赖版本约束无效。')
  const indexUrl = checkedHttps(mirror.indexUrl.replace(/\/?$/u, '/') + `${normalize(name)}/`).href
  const html = new TextDecoder().decode(await boundedBytes(await fetchHttps(indexUrl, fetch), 16 * 1024 * 1024))
  const candidates: Array<{ filename: string; sha256: string; requiresPython: string }> = []
  const entities = (s: string) => s.replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')
  // Requires-Python often contains a literal '>' inside quoted attributes.
  for (const anchor of html.matchAll(/<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>/giu)) {
    const attrs = anchor[1]!; const href = /\bhref\s*=\s*["']([^"']+)["']/iu.exec(attrs)?.[1]
    if (!href || /\bdata-yanked\b/iu.test(attrs)) continue
    const url = new URL(entities(href), indexUrl)
    const filename = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
    if (!safeFilename(filename)) continue
    const sha256 = new URLSearchParams(url.hash.slice(1)).get('sha256')
    if (!sha256 || !/^[a-f0-9]{64}$/u.test(sha256)) continue
    checkedHttps(url.href)
    candidates.push({ filename, sha256, requiresPython: entities(/\bdata-requires-python\s*=\s*["']([^"']*)["']/iu.exec(attrs)?.[1] ?? '') })
  }
  const code = `import json,sys\nsys.path.insert(0,sys.argv[1])\nfrom packaging.requirements import Requirement\nfrom packaging.utils import parse_sdist_filename,canonicalize_name\nfrom packaging.specifiers import SpecifierSet\nr=Requirement(sys.argv[2]); valid=[]\nfor c in json.load(sys.stdin):\n try:\n  n,v=parse_sdist_filename(c['filename'])\n  if canonicalize_name(n)!=canonicalize_name(r.name) or v not in r.specifier: continue\n  if c['requiresPython'] and '.'.join(map(str,sys.version_info[:3])) not in SpecifierSet(c['requiresPython']): continue\n  valid.append((v,c))\n except (ValueError,TypeError): continue\nif not valid: raise ValueError('No compatible source distribution with SHA-256 available')\nv,c=max(valid,key=lambda p:p[0]); c['version']=str(v)\nprint(json.dumps(c))`
  // Release-rich projects can exceed Windows' command-line length limit.
  const selected = await executeJson<{ filename: string; sha256: string; version: string }>(context.executable, code, [context.sitePackages, requirement], JSON.stringify(candidates))
  return prepareSourceWheel(root, context, { name, version: selected.version, filename: selected.filename, sha256: selected.sha256 }, mirror)
}

/** Repeat source, wheel and receipt checks before touching an installation candidate. */
export async function verifySourceWheel(root: string, wheel: Partial<BuiltSourceWheel>): Promise<void> {
  if (!wheel.url?.startsWith('file:') || !wheel.sourceBuildId || !/^[a-f0-9-]{36}$/u.test(wheel.sourceBuildId) || !wheel.sourceFilename || !safeFilename(wheel.sourceFilename) || !wheel.sourceArchiveSha256 || !wheel.hash) throw new Error('安装计划包含未经授权的本地依赖路径。')
  checkedHttps(wheel.sourceUrl ?? '')
  const builds = join(root, 'plans', 'source-builds')
  const buildRoot = await assertWithin(join(builds, wheel.sourceBuildId), builds)
  const source = await assertWithin(join(buildRoot, 'source', wheel.sourceFilename), buildRoot)
  const path = await assertWithin(fileURLToPath(wheel.url), buildRoot)
  if (resolve(dirname(path)) !== resolve(buildRoot, 'wheels')) throw new Error('源码依赖 wheel 路径越界。')
  const receipt = JSON.parse(await readFile(join(buildRoot, 'receipt.json'), 'utf8')) as BuiltSourceWheel
  for (const key of ['name', 'version', 'url', 'hash', 'sourceArchiveSha256', 'sourceFilename', 'sourceBuildId', 'sourceUrl'] as const) if (receipt[key] !== wheel[key]) throw new Error('源码依赖构建记录与安装计划不符。')
  if (digest(await readFile(source)) !== wheel.sourceArchiveSha256 || digest(await readFile(path)) !== wheel.hash) throw new Error('源码依赖或构建 wheel 的 SHA-256 校验失败。')
}
