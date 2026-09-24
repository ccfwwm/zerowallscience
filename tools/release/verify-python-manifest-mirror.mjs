import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
const manifest = JSON.parse(await readFile(join(root, 'resources/python/dependency-manifest.json'), 'utf8'))
const sourceLock = await readFile(join(root, 'resources/python/requirements-research.lock'), 'utf8')
const output = resolve(process.env.ZEROWALL_PYTHON_DEPENDENCY_OUTPUT ?? join(root, 'desktop/dist/python-dependencies'))
await mkdir(output, { recursive: true })
// Locally built wheels have hashes absent from the upstream source lock.
const candidates = manifest.packages.filter(pkg => !sourceLock.includes(pkg.sha256))
console.log(`Auditing ${candidates.length} likely locally-built wheel hashes first; ${manifest.packages.length} packages total.`)
const pending = [...candidates, ...manifest.packages.filter(pkg => sourceLock.includes(pkg.sha256))]
const results = []
await Promise.all(Array.from({ length: 8 }, async () => {
  while (pending.length) {
    const pkg = pending.shift()
    const name = pkg.name.toLowerCase().replace(/[-_.]+/gu, '-')
    try {
      const response = await fetch(`https://pypi.tuna.tsinghua.edu.cn/simple/${name}/`, { signal: AbortSignal.timeout(45000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      const links = [...html.matchAll(/href="([^"]+)"/gu)].map(match => match[1])
      const exact = links.find(link => {
        const url = new URL(link, response.url)
        const filename = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
        return new URLSearchParams(url.hash.slice(1)).get('sha256') === pkg.sha256
          && (pkg.source === 'sdist' ? filename === pkg.filename : filename.endsWith('.whl'))
      })
      const sameVersionWheels = links.filter(link => { try { const file = decodeURIComponent(new URL(link, response.url).pathname.split('/').at(-1)); return file.includes(`-${pkg.version}-`) && file.endsWith('.whl') && !/manylinux|musllinux|macosx|win32|win_arm64/u.test(file) } catch { return false } }).map(link => ({ url: new URL(link, response.url).href, sha256: link.match(/sha256=([a-f0-9]{64})/u)?.[1] }))
      results.push({ name, version: pkg.version, source: pkg.source ?? 'wheel', lockedSha256: pkg.sha256, status: exact ? (pkg.source === 'sdist' ? 'matching-source' : 'matching-wheel') : 'missing-locked-artifact', locallyBuiltCandidate: !sourceLock.includes(pkg.sha256), ...(exact ? { url: new URL(exact, response.url).href } : { sameVersionWheels }) })
    } catch (error) { results.push({ name, version: pkg.version, status: 'unverified', error: String(error) }) }
    await writeFile(join(output, 'mirror-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), complete: results.length === manifest.packages.length, packageCount: manifest.packages.length, checked: results.length, missing: results.filter(row => !row.status.startsWith('matching-')), results }, null, 2))
    if (results.length % 20 === 0 || !results.at(-1).status.startsWith('matching-')) console.log(`${results.length}/${manifest.packages.length} ${name}: ${results.at(-1).status}`)
  }
}))
console.log(JSON.stringify({ verified: results.filter(row => row.status.startsWith('matching-')).length, missing: results.filter(row => !row.status.startsWith('matching-')).map(row => row.name) }))
if (results.some(row => !row.status.startsWith('matching-'))) process.exitCode = 1
