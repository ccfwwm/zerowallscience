import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { contract, root } from './paths.mjs'

export const resourceLayout = JSON.parse(await readFile(resolve(root, 'config/layout/resource-layout.json'), 'utf8'))
export const packageLayout = JSON.parse(await readFile(resolve(root, 'config/layout/package-layout.json'), 'utf8'))

async function firstExisting(paths) {
  for (const path of paths) {
    try { await access(path); return path } catch {}
  }
  return paths.at(-1)
}

/** Resolve a package by its legacy directory name without changing package identity. */
export async function packageSource(name) {
  const rootName = name.startsWith('@') ? name.split('/').at(-1) : name
  const group = Object.entries(packageLayout.roots).find(([, names]) => names.includes(rootName))?.[0]
  const candidates = group
    ? [join(contract.packageRoots[group], rootName), join(contract.packageRoots.legacy, rootName)]
    : [join(contract.packageRoots.legacy, rootName)]
  return firstExisting(candidates)
}

/** Resolve a logical resource directory, preferring the 8.0.7 layout. */
export async function resourceSource(kind, ...parts) {
  const aliases = {
    skills: ['extensions', 'skills'],
    mcp: ['extensions', 'mcp'],
    python: ['extensions', 'python'],
    runtimes: ['extensions', 'runtimes'],
    r: ['extensions', 'engines', 'r'],
    biogenie: ['extensions', 'capabilities', 'biogenie'],
    researchCases: ['cases', 'research'],
    brand: ['branding'],
  }
  const preferred = join(contract.source, ...(aliases[kind] ?? [kind]), ...parts)
  const legacyKind = {
    researchCases: 'research-cases',
  }[kind] ?? kind
  const legacy = join(contract.source, legacyKind, ...parts)
  return firstExisting([preferred, legacy])
}
