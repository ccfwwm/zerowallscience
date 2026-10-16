/**
 * lit-harvest — inbox writer (Zotero desktop unavailable).
 *
 * Drops each paper into `inbox/<slug>/` as:
 *   - paper.json  (machine-readable metadata)
 *   - citation.ris  (importable into Zotero via File → Import)
 *   - citation.bib  (BibTeX)
 *   - paper.pdf   (when the PDF was downloaded)
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Paper } from '../types.ts'

export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'paper'
  )
}

function bibKey(p: Paper): string {
  const first = (p.authors[0] ?? '').split(/\s+/).pop() ?? 'anon'
  return `${first}${p.year ?? 'nd'}${slug(p.title).slice(0, 12)}`
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function toRis(p: Paper): string {
  const lines = ['TY  - JOUR']
  for (const a of p.authors) lines.push(`AU  - ${a}`)
  lines.push(`TI  - ${p.title}`)
  if (p.year) lines.push(`PY  - ${p.year}`)
  if (p.venue) lines.push(`JO  - ${p.venue}`)
  if (p.abstract) lines.push(`AB  - ${p.abstract.replace(/\s+/g, ' ')}`)
  if (p.doi) lines.push(`DO  - ${p.doi}`)
  if (p.url) lines.push(`UR  - ${p.url}`)
  if (p.keywords) for (const k of p.keywords) lines.push(`KW  - ${k}`)
  lines.push('ER  - ')
  return lines.join('\n') + '\n'
}

function toBib(p: Paper): string {
  const k = bibKey(p)
  const esc = (s: string): string => s.replace(/[&%$#_{}~^\\]/g, '\\$&')
  const lines = [`@article{${k},`, `  title = {${esc(p.title)}},`]
  lines.push(`  author = {${p.authors.map(esc).join(' and ')}},`)
  if (p.year) lines.push(`  year = {${p.year}},`)
  if (p.venue) lines.push(`  journal = {${esc(p.venue)}},`)
  if (p.doi) lines.push(`  doi = {${p.doi}},`)
  if (p.abstract) lines.push(`  abstract = {${esc(p.abstract.replace(/\s+/g, ' '))}},`)
  lines.push('}')
  return lines.join('\n') + '\n'
}

export function writeInbox(inboxDir: string, p: Paper, pdfBytes?: Uint8Array): string {
  const dir = join(inboxDir, slug(p.title) + '-' + createHash('sha256').update(p.doi?.toLowerCase() || p.title.normalize('NFKC')).digest('hex').slice(0, 12))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'paper.json'), JSON.stringify(p, null, 2))
  writeFileSync(join(dir, 'citation.ris'), toRis(p))
  writeFileSync(join(dir, 'citation.bib'), toBib(p))
  if (pdfBytes && pdfBytes.length > 0) {
    writeFileSync(join(dir, 'paper.pdf'), pdfBytes)
  }
  return dir
}
