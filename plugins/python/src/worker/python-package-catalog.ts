export interface PythonPackageCatalog {
  name: string
  summary: string
  latestVersion: string
  versions: string[]
}

export function comparePythonVersions(a: string, b: string): number {
  const parse = (value: string) => value.match(/\d+/gu)?.map(Number) ?? [0]
  const left = parse(a); const right = parse(b)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0)
    if (delta) return delta
  }
  return a.localeCompare(b)
}

export function parsePythonPackageCatalog(name: string, value: unknown): PythonPackageCatalog {
  if (!value || typeof value !== 'object') throw new Error('PyPI 响应格式无效。')
  const data = value as { info?: { name?: string; summary?: string; version?: string }; releases?: Record<string, unknown> }
  const versions = Object.entries(data.releases ?? {})
    .filter(([version, files]) => version.trim() !== '' && Array.isArray(files) && files.some(file => typeof file === 'object' && file !== null && (file as { yanked?: boolean }).yanked !== true))
    .map(([version]) => version)
    .sort((a, b) => comparePythonVersions(b, a))
  const latestVersion = data.info?.version ?? versions[0]
  if (!latestVersion) throw new Error('PyPI 响应缺少版本信息。')
  return { name: data.info?.name ?? name, summary: data.info?.summary ?? '', latestVersion, versions: versions.slice(0, 100) }
}
