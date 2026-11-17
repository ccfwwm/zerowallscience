/** Bounded remote catalog reads; invalid replacements never replace the last valid listings. */
import { z } from 'zod'
import semver from 'semver'
import type { MarketSkill } from './skill-catalog-types.ts'

const localized = z.record(z.string(), z.string()).refine(value => Boolean(value.en))
/** Public HTTPS URL without credentials, redirect handling, or a fragment. */
export const httpsUrl = z.url({ protocol: /^https$/u }).refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password && !url.hash
})
/** Skill catalog format accepted independently of any desktop release. */
export const skillCatalogSchema = z.object({ schemaVersion: z.literal(1), skills: z.array(z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u), version: z.string().refine(value => semver.valid(value) === value),
  title: localized, description: localized, url: httpsUrl, bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), names: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)).min(1),
})) }).superRefine((value, context) => {
  if (new Set(value.skills.map(row => row.id)).size !== value.skills.length) context.addIssue({ code: 'custom', message: 'Repeated skill id' })
  for (const row of value.skills) if (new Set(row.names).size !== row.names.length) context.addIssue({ code: 'custom', message: 'Repeated skill name' })
  const names = value.skills.flatMap(row => row.names)
  if (new Set(names).size !== names.length) context.addIssue({ code: 'custom', message: 'Skill names overlap across entries' })
})

/**
 * Read one public object without redirects or unbounded buffering.
 * @param url - Configured catalog URL or a catalog-declared skill URL.
 * @param limit - Maximum accepted bytes.
 * @param signal - Owning operation's lifetime and deadline.
 * @param fetcher - Transport; tests supply an instance-local fixture.
 * @returns Complete bytes after enforcing the budget.
 */
export async function readObject(url: string, limit: number, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const response = await fetcher(url, { signal, redirect: 'error', cache: 'no-store' })
  if (!response.ok || response.body === null) { await response.body?.cancel(); throw new Error(`Catalog object HTTP ${response.status}`) }
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = response.body.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('Catalog object exceeds its size limit') }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

/**
 * Parse a complete catalog as strict UTF-8 JSON.
 * @param bytes - Complete JSON document.
 * @returns Validated skill entries.
 */
export function parseSkills(bytes: Uint8Array): MarketSkill[] {
  return skillCatalogSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))).skills
}
