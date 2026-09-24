/**
 * PyPI mirror catalogue.
 *
 * Each mirror publishes the same PEP 503 simple index, but the JSON API that
 * answers "what is this project's newest version" lives at a different path on
 * every host: Tsinghua serves it under the simple prefix, Aliyun under
 * `/pypi/web/json`, and pypi.org under `/pypi`. Resolving a project therefore
 * needs the mirror's own layout, not one shared URL shape.
 *
 * USTC is the user-selected default. Aliyun remains available as an explicit
 * preset, with per-package retry and artifact verification in the installer.
 */

export interface MirrorPreset {
  id: string
  /** Shown in the panel; the host is what the user recognises. */
  label: string
  indexUrl: string
  trustedHost: string
  /** Project JSON endpoint templates, tried in order. `{name}` is URL-encoded. */
  jsonTemplates: string[]
}

export const ALIYUN_INDEX_URL = 'https://mirrors.aliyun.com/pypi/simple'
export const TUNA_INDEX_URL = 'https://pypi.tuna.tsinghua.edu.cn/simple'
export const USTC_INDEX_URL = 'https://mirrors.ustc.edu.cn/pypi/simple'
export const TENCENT_INDEX_URL = 'https://mirrors.cloud.tencent.com/pypi/simple'
export const HUAWEI_INDEX_URL = 'https://repo.huaweicloud.com/repository/pypi/simple'
export const PYPI_INDEX_URL = 'https://pypi.org/simple'

export const MIRROR_PRESETS: readonly MirrorPreset[] = [
  {
    id: 'aliyun',
    label: '阿里云 · mirrors.aliyun.com',
    indexUrl: ALIYUN_INDEX_URL,
    trustedHost: 'mirrors.aliyun.com',
    // The documented JSON path sits under /pypi/web; the simple prefix answers a
    // project page but not the JSON API.
    jsonTemplates: ['https://mirrors.aliyun.com/pypi/web/json/{name}', 'https://mirrors.aliyun.com/pypi/{name}/json'],
  },
  {
    id: 'tuna',
    label: '清华大学 · pypi.tuna.tsinghua.edu.cn',
    indexUrl: TUNA_INDEX_URL,
    trustedHost: 'pypi.tuna.tsinghua.edu.cn',
    jsonTemplates: ['https://pypi.tuna.tsinghua.edu.cn/pypi/{name}/json'],
  },
  {
    id: 'ustc',
    label: '中科大 · mirrors.ustc.edu.cn',
    indexUrl: USTC_INDEX_URL,
    trustedHost: 'mirrors.ustc.edu.cn',
    jsonTemplates: ['https://mirrors.ustc.edu.cn/pypi/{name}/json', 'https://mirrors.ustc.edu.cn/pypi/web/json/{name}'],
  },
  {
    id: 'tencent',
    label: '腾讯云 · mirrors.cloud.tencent.com',
    indexUrl: TENCENT_INDEX_URL,
    trustedHost: 'mirrors.cloud.tencent.com',
    jsonTemplates: ['https://mirrors.cloud.tencent.com/pypi/{name}/json', 'https://mirrors.cloud.tencent.com/pypi/web/json/{name}'],
  },
  {
    id: 'huawei',
    label: '华为云 · repo.huaweicloud.com',
    indexUrl: HUAWEI_INDEX_URL,
    trustedHost: 'repo.huaweicloud.com',
    jsonTemplates: ['https://repo.huaweicloud.com/repository/pypi/{name}/json'],
  },
  {
    id: 'pypi',
    label: '官方 PyPI · pypi.org',
    indexUrl: PYPI_INDEX_URL,
    trustedHost: 'pypi.org',
    jsonTemplates: ['https://pypi.org/pypi/{name}/json'],
  },
]

export const DEFAULT_MIRROR_PRESET = MIRROR_PRESETS.find(preset => preset.id === 'ustc') ?? MIRROR_PRESETS[0]!

/** Serialisable form for the renderer; keeps the panel and the main process in step. */
export interface MirrorPresetInfo { id: string; label: string; indexUrl: string; custom: boolean }

export function mirrorPresets(withCurrent?: string): MirrorPresetInfo[] {
  const list: MirrorPresetInfo[] = MIRROR_PRESETS.map(preset => ({ id: preset.id, label: preset.label, indexUrl: preset.indexUrl, custom: false }))
  // An index that is not in the catalogue (an enterprise mirror, or a URL saved
  // by an older build) still has to appear, or saving it would silently move the
  // user back to a default they did not choose.
  if (withCurrent) {
    const known = list.some(entry => sameIndex(entry.indexUrl, withCurrent))
    if (!known) list.push({ id: 'custom', label: withCurrent, indexUrl: withCurrent, custom: true })
  }
  return list
}

function stripTrailingSlash(value: string): string { return value.replace(/\/+$/u, '') }

export function sameIndex(a: string, b: string): boolean { return stripTrailingSlash(a).toLowerCase() === stripTrailingSlash(b).toLowerCase() }

/** The catalogue entry an index URL belongs to, when it is one we ship. */
export function presetForIndex(indexUrl: string): MirrorPreset | undefined {
  return MIRROR_PRESETS.find(preset => sameIndex(preset.indexUrl, indexUrl))
}

/** Host that must be trusted for pip to talk to this index. */
export function trustedHostForIndex(indexUrl: string): string {
  const preset = presetForIndex(indexUrl)
  if (preset) return preset.trustedHost
  try { return new URL(indexUrl).hostname } catch { return DEFAULT_MIRROR_PRESET.trustedHost }
}

/**
 * Project JSON endpoints for a mirror. Known presets use their own layout; an
 * unknown index falls back to the plain-PyPI shape and, when its simple prefix
 * is a `/simple` path, to the `/pypi/web/json` shape Aliyun-style hosts use.
 */
export function jsonCandidates(indexUrl: string, name: string): string[] {
  const encoded = encodeURIComponent(name)
  const preset = presetForIndex(indexUrl)
  const templates = preset?.jsonTemplates ?? derivedTemplates(indexUrl)
  return templates.map(template => template.replace('{name}', encoded))
}

function derivedTemplates(indexUrl: string): string[] {
  const base = stripTrailingSlash(indexUrl)
  const origin = base.replace(/\/simple$/u, '')
  if (origin === 'https://pypi.org') return ['https://pypi.org/pypi/{name}/json']
  return [`${origin}/pypi/{name}/json`, `${origin}/pypi/web/json/{name}`, `https://pypi.org/pypi/{name}/json`]
}
