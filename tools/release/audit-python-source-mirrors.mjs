/** Inspect exact releases on common mirrors; persist upstream hashes and URLs. */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '../..')
const output = join(root, '.build', 'python-source-audit')
await mkdir(output, { recursive: true })
const packages = { flowio: '1.4.0', bibtexparser: '1.4.4', 'autograd-gamma': '0.5.0', docopt: '0.6.2', nglview: '4.0.1' }
const mirrors = {
  tsinghua: 'https://pypi.tuna.tsinghua.edu.cn/simple/',
  aliyun: 'https://mirrors.aliyun.com/pypi/simple/',
  douban: 'https://pypi.doubanio.com/simple/',
  ustc: 'https://pypi.mirrors.ustc.edu.cn/simple/',
  bfsu: 'https://mirrors.bfsu.edu.cn/pypi/web/simple/',
  tencent: 'https://mirrors.cloud.tencent.com/pypi/simple/',
}
const results = []
for (const [name, version] of Object.entries(packages)) {
  const response = await fetch(`https://pypi.org/pypi/${name}/${version}/json`, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`${name}: PyPI HTTP ${response.status}`)
  const metadata = await response.json()
  const upstream = metadata.urls.map(file => ({ filename: file.filename, sha256: file.digests.sha256, type: file.packagetype }))
  const observations = await Promise.all(Object.entries(mirrors).map(async ([mirror, base]) => {
    try {
      const page = await fetch(`${base}${name}/`, { signal: AbortSignal.timeout(30000) })
      if (!page.ok) throw new Error(`HTTP ${page.status}`)
      const html = await page.text()
      const files = [...html.matchAll(/href="([^"]+)"[^>]*>([^<]+)<\/a>/gu)].flatMap(match => {
        const file = upstream.find(row => row.filename === match[2])
        return file ? [{ ...file, url: new URL(match[1], page.url).href, indexHashMatches: match[1].includes(`sha256=${file.sha256}`) }] : []
      })
      return { mirror, status: page.status, files }
    } catch (error) { return { mirror, error: String(error) } }
  }))
  const source = observations.find(row => row.mirror === 'tsinghua')?.files?.find(file => file.type === 'sdist')
  if (!source || !source.indexHashMatches) throw new Error(`${name}: verified Tsinghua source missing`)
  const download = await fetch(source.url, { signal: AbortSignal.timeout(120000) })
  if (!download.ok) throw new Error(`${name}: source download HTTP ${download.status}`)
  const bytes = Buffer.from(await download.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`${name}: source hash mismatch`)
  await writeFile(join(output, source.filename), bytes)
  results.push({ name, version, license: metadata.info.license, upstream, observations, verifiedSource: { filename: source.filename, sha256: source.sha256, url: source.url, size: bytes.length } })
  console.log(`${name}==${version}: ${upstream.filter(file => file.type === 'bdist_wheel').length} upstream wheels; ${observations.filter(row => row.files?.some(file => file.type === 'sdist')).length} mirrors have source; downloaded source hash verified`)
}
await writeFile(join(output, 'mirror-audit.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2) + '\n')
