import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

const hash = value => createHash('sha256').update(value).digest('hex')

export async function fingerprintInputs({ root, inputs, dshCommit = '', lockPath = 'pnpm-lock.yaml', dependencyVersions = {} }) {
  const repositoryRoot = resolve(root)
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...inputs]
  const listed = execFileSync('git', args, { cwd: repositoryRoot, encoding: 'buffer' })
  const names = listed.toString('utf8').split('\0').filter(Boolean)
  // A parent repository lists a submodule as one directory (gitlink). Include
  // its tracked and untracked source files, including local edits, in the key.
  const files = []
  for (const name of [...new Set(names)].sort()) {
    const absolute = resolve(repositoryRoot, name)
    const info = await stat(absolute).catch(() => undefined)
    if (info?.isDirectory()) {
      const nested = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: absolute, encoding: 'buffer' })
      files.push(...nested.toString('utf8').split('\0').filter(Boolean).map(file => `${name}/${file}`))
    } else files.push(name)
  }
  files.sort()
  const digest = createHash('sha256')
  const records = []
  for (const name of files) {
    const absolute = resolve(repositoryRoot, name)
    const rel = relative(repositoryRoot, absolute)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`Input escaped repository root: ${name}`)
    const info = await stat(absolute).catch(() => undefined)
    if (!info?.isFile()) continue
    const bytes = await readFile(absolute)
    const fileHash = hash(bytes)
    records.push({ path: name.replaceAll('\\', '/'), size: info.size, sha256: fileHash })
    digest.update(name.replaceAll('\\', '/')).update('\0').update(fileHash).update('\0')
  }
  const lockAbsolute = resolve(repositoryRoot, lockPath)
  const lockHash = hash(await readFile(lockAbsolute))
  digest.update(`dsh:${dshCommit}\0lock:${lockHash}\0dependencies:${JSON.stringify(dependencyVersions)}`)
  return { fingerprint: digest.digest('hex'), files: records.length, inputs: records, lockHash, dshCommit, dependencyVersions }
}

/** Select build roots without allowing extensions/* to swallow another kind. */
export function tasksForChangedFiles(files, { pythonCapabilities = [] } = {}) {
  const tasks = new Set()
  for (const file of files) {
    const parts = file.replaceAll('\\', '/').split('/')
    if (parts[0] === 'plugins' && parts.length > 1 && parts[1] !== 'wechat') tasks.add(`plugin-build:${parts[1]}`)
    else if (parts[0] === 'packages' && parts.length > 1) {
      const name = ['dsh', 'support', 'bundles'].includes(parts[1]) ? parts[2] : parts[1]
      if (name) tasks.add(`package-build:${name}`)
    } else if (parts[0] === 'resources') {
      const kind = parts[1] === 'extensions' ? parts[2] : parts[1]
      const name = parts[1] === 'extensions' ? parts[3] : parts[2]
      if (kind === 'skills' && name) tasks.add(`resource:skill:${name}`)
      else if (kind === 'mcp' && name) tasks.add(`resource:mcp:${name}`)
      else if (kind === 'python') {
        const fileName = parts.at(-1)?.toLowerCase() ?? ''
        if (fileName === 'core-dependency-manifest.json') tasks.add('resource:python:core')
        else if (fileName === 'dependency-manifest.json') tasks.add('resource:python:science')
        else if (fileName === 'requirements-base.txt' || fileName === 'science-layer-policy.json') {
          tasks.add('resource:python:core')
          tasks.add('resource:python:science')
        } else {
          tasks.add('resource:python:science')
          if (['requirements-windows.lock', 'requirements-research.lock', 'source-distributions.json', 'skill-dependencies.json', 'skill-dependency-policy.json'].includes(fileName)) {
            for (const id of pythonCapabilities) if (/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(id)) tasks.add(`resource:python:capability:${id}`)
          }
        }
      }
      else if (parts[1] === 'branding' || parts[1] === 'brand') tasks.add('desktop')
    } else if (parts[0] === 'deepseek-harness' || parts[0] === 'config' && parts[1] === 'deepseek-harness') {
      tasks.add('dsh')
      tasks.add('runtime')
    } else if (parts[0] === 'desktop') tasks.add('desktop')
    else if (['profiles', 'store'].includes(parts[0]) || parts[0] === 'config' || parts[0] === 'tools' && ['plugins', 'dsh', 'packaging'].includes(parts[1])) tasks.add('runtime')
  }
  // Runtime/desktop preparation must consume the newly built inputs.
  const order = id => id === 'dsh' ? 0 : id === 'runtime' ? 2 : id === 'desktop' ? 3 : 1
  return [...tasks].sort((a, b) => order(a) - order(b) || a.localeCompare(b))
}

export function isContained(root, target) {
  const base = resolve(root)
  const candidate = resolve(target)
  const rel = relative(base, candidate)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`)
}
