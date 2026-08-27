import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import sharp from 'sharp'
import type { ImageDupOptions, ImageDupPair, ImageDupReport } from '../shared/types.js'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.avif', '.bmp'])
const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_FILES = 300

interface Digest { name: string; path: string; hash: bigint; width: number; height: number }
const hamming = (a: bigint, b: bigint): number => { let x = a ^ b; let n = 0; while (x !== 0n) { x &= x - 1n; n++ } return n }

async function digest(path: string, name: string): Promise<Digest> {
  const image = sharp(await readFile(path), { failOn: 'none' })
  const { data, info } = await image.resize(8, 8, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true })
  let sum = 0
  for (const value of data) sum += value
  const mean = sum / data.length
  let hash = 0n
  for (let i = 0; i < data.length; i++) if (data[i]! >= mean) hash |= 1n << BigInt(i)
  return { name, path, hash, width: info.width, height: info.height }
}

async function collect(root: string, recursive: boolean, limit: number, skipped: Array<{ path: string; reason: string }>): Promise<string[]> {
  const output: string[] = []
  async function visit(dir: string): Promise<void> {
    if (output.length >= limit) return
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (output.length >= limit) break
      const candidate = join(dir, entry.name)
      if (entry.isDirectory() && recursive && !entry.isSymbolicLink()) await visit(candidate)
      else if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        try {
          const info = await stat(candidate)
          if (info.size > MAX_FILE_BYTES) skipped.push({ path: candidate, reason: 'file exceeds 50 MiB limit' })
          else output.push(candidate)
        } catch (error) { skipped.push({ path: candidate, reason: String(error) }) }
      }
    }
  }
  await visit(root)
  return output
}

export async function scanPaths(paths: string[], options: ImageDupOptions, root = process.cwd()): Promise<ImageDupReport> {
  const threshold = Math.max(0, Math.min(64, Math.floor(options.threshold ?? 8)))
  const skipped: Array<{ path: string; reason: string }> = []
  const digests: Digest[] = []
  for (const path of paths.slice(0, Math.min(MAX_FILES, options.limit ?? MAX_FILES))) {
    try { digests.push(await digest(path, relative(root, path) || path)) }
    catch (error) { skipped.push({ path, reason: error instanceof Error ? error.message : String(error) }) }
  }
  const pairs: ImageDupPair[] = []
  for (let i = 0; i < digests.length; i++) for (let j = i + 1; j < digests.length; j++) {
    const a = digests[i]!, b = digests[j]!
    const distance = hamming(a.hash, b.hash)
    if (distance <= threshold) pairs.push({ a: a.name, b: b.name, distance, similarity: Math.round((1 - distance / 64) * 1000) / 1000, transform: distance === 0 ? 'duplicate' : 'near-duplicate' })
  }
  return { ok: true, total: digests.length, threshold, pairs, copyMove: [], skipped, algorithm: 'average-hash fallback', algorithmVersion: '7051eb55f611a46db3d9cfa1768e56c7d1a91553', generatedAt: new Date().toISOString() }
}

export async function scanDirectory(directory: string, options: ImageDupOptions): Promise<ImageDupReport> {
  const root = resolve(directory)
  const info = await stat(root)
  if (!info.isDirectory()) throw new Error('Scan target is not a directory.')
  const skipped: Array<{ path: string; reason: string }> = []
  const paths = await collect(root, options.recursive !== false, Math.min(MAX_FILES, options.limit ?? MAX_FILES), skipped)
  const report = await scanPaths(paths, options, root)
  return { ...report, skipped: [...skipped, ...report.skipped] }
}

export function reportArtifact(report: ImageDupReport, format: 'html' | 'md' | 'json'): string {
  if (format === 'json') return JSON.stringify(report, null, 2)
  const rows = report.pairs.map(pair => `<tr><td>${escape(pair.a)}</td><td>${escape(pair.b)}</td><td>${pair.transform}</td><td>${Math.round(pair.similarity * 100)}%</td></tr>`).join('')
  if (format === 'html') return `<!doctype html><meta charset="utf-8"><title>Image duplicate report</title><h1>Image duplicate report</h1><p>${report.total} images, ${report.pairs.length} suspicious pairs.</p><table><tr><th>A</th><th>B</th><th>Transform</th><th>Similarity</th></tr>${rows}</table>`
  return [`# Image duplicate report`, ``, `- Images: ${report.total}`, `- Suspicious pairs: ${report.pairs.length}`, ``, ...report.pairs.map(pair => `- ${pair.a} vs ${pair.b}: ${pair.transform}, ${Math.round(pair.similarity * 100)}%`)].join('\n')
}
function escape(value: string): string { return value.replace(/[&<>"]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char)) }
export function reportChecksum(value: string): string { return createHash('sha256').update(value).digest('hex') }
