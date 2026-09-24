import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureGlobalPipConfig, MIRROR_INI_MARKER, mirrorArgs, projectJsonCandidates, projectJsonUrl, resolveMirror, PYPI_INDEX_URL, TUNA_INDEX_URL, sanitizePythonTlsEnvironment } from '../src/main/python-mirror.js'
import { DEFAULT_MIRROR_PRESET, MIRROR_PRESETS, USTC_INDEX_URL, jsonCandidates } from '../src/main/python-mirrors.js'

const roots: string[] = []
async function directory() { const root = await mkdtemp(join(tmpdir(), 'python-mirror-')); roots.push(root); return root }
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('PyPI mirror policy', () => {
  it('prefers the signed manifest over the environment and the built-in default', () => {
    const env = { ZEROWALL_PYPI_INDEX_URL: 'https://env.example/simple' }
    expect(resolveMirror('https://manifest.example/simple', env)).toEqual({ indexUrl: 'https://manifest.example/simple/', trustedHost: 'manifest.example' })
    expect(resolveMirror({ indexUrl: 'https://nested.example/simple' }, env)).toEqual({ indexUrl: 'https://nested.example/simple/', trustedHost: 'nested.example' })
    expect(resolveMirror(undefined, env)).toEqual({ indexUrl: 'https://env.example/simple/', trustedHost: 'env.example' })
    expect(resolveMirror(undefined, {})).toEqual({ indexUrl: USTC_INDEX_URL, trustedHost: 'mirrors.ustc.edu.cn' })
  })

  it('ignores insecure or malformed index values rather than weakening TLS', () => {
    expect(resolveMirror('http://plain.example/simple', {})).toEqual({ indexUrl: USTC_INDEX_URL, trustedHost: 'mirrors.ustc.edu.cn' })
    expect(resolveMirror('not a url', { ZEROWALL_PYPI_INDEX_URL: 'also not a url' })).toEqual({ indexUrl: USTC_INDEX_URL, trustedHost: 'mirrors.ustc.edu.cn' })
  })

  it('omits the trusted-host flag for pypi.org, which needs no exception', () => {
    expect(resolveMirror(PYPI_INDEX_URL, {})).toEqual({ indexUrl: 'https://pypi.org/simple/' })
    expect(mirrorArgs(resolveMirror(PYPI_INDEX_URL, {}))).toEqual(['--index-url', 'https://pypi.org/simple/'])
  })

  it('emits explicit pip arguments because isolated pip ignores pip.ini and the environment', () => {
    expect(mirrorArgs(resolveMirror(undefined, {}))).toEqual(['--index-url', USTC_INDEX_URL])
  })

  it('tries the mirror project endpoint before the public one', () => {
    // Every mirror publishes the same simple index but a different JSON API, so
    // the catalogue supplies the layout instead of one shared URL shape.
    const mirror = resolveMirror(undefined, {})
    expect(projectJsonCandidates(mirror, 'numpy')).toEqual(['https://mirrors.ustc.edu.cn/pypi/numpy/json', 'https://mirrors.ustc.edu.cn/pypi/web/json/numpy'])
    expect(projectJsonUrl(mirror, 'scikit-learn')).toBe('https://mirrors.ustc.edu.cn/pypi/scikit-learn/json')
    expect(projectJsonCandidates(resolveMirror(TUNA_INDEX_URL, {}), 'numpy')).toEqual(['https://pypi.tuna.tsinghua.edu.cn/pypi/numpy/json'])
    expect(projectJsonCandidates(resolveMirror(PYPI_INDEX_URL, {}), 'numpy')).toEqual(['https://pypi.org/pypi/numpy/json'])
  })

  it('keeps the catalogue selectable and every preset a valid HTTPS index', () => {
    expect(MIRROR_PRESETS.length).toBeGreaterThanOrEqual(5)
    expect(DEFAULT_MIRROR_PRESET.indexUrl).toBe(USTC_INDEX_URL)
    for (const preset of MIRROR_PRESETS) {
      expect(preset.indexUrl.startsWith('https://')).toBe(true)
      expect(preset.jsonTemplates.length).toBeGreaterThan(0)
      // A preset without its own JSON layout would 404 on the panel's version check.
      expect(jsonCandidates(preset.indexUrl, 'numpy').length).toBeGreaterThan(0)
    }
  })

  it('never rewrites a pip.ini it did not write', async () => {
    const path = join(await directory(), 'pip', 'pip.ini')
    const foreign = '[global]\nindex-url = https://internal.example/simple\n'
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, foreign)
    expect(await ensureGlobalPipConfig(resolveMirror(undefined, {}), path)).toBe(false)
    expect(await readFile(path, 'utf8')).toBe(foreign)
  })

  it('writes a marked pip.ini and stays idempotent on the second call', async () => {
    const path = join(await directory(), 'pip', 'pip.ini')
    const mirror = resolveMirror(undefined, {})
    expect(await ensureGlobalPipConfig(mirror, path)).toBe(true)
    expect(await readFile(path, 'utf8')).toBe(`${MIRROR_INI_MARKER}\n[global]\nindex-url = ${USTC_INDEX_URL}\n`)
    expect(await ensureGlobalPipConfig(mirror, path)).toBe(false)
  })

  it('rewrites a file it owns when the mirror changes', async () => {
    const path = join(await directory(), 'pip', 'pip.ini')
    await ensureGlobalPipConfig(resolveMirror(undefined, {}), path)
    expect(await ensureGlobalPipConfig(resolveMirror('https://manifest.example/simple', {}), path)).toBe(true)
    expect(await readFile(path, 'utf8')).toContain('index-url = https://manifest.example/simple/')
  })

  it('removes invalid inherited CA overrides without weakening TLS', () => {
    const env = sanitizePythonTlsEnvironment({
      SSL_CERT_FILE: 'C:\\\\Users\\\\ccf\\\\missing\\\\cacert.pem',
      REQUESTS_CA_BUNDLE: 'C:\\\\Users\\\\ccf\\\\missing\\\\cacert.pem',
      CURL_CA_BUNDLE: '',
      PIP_CERT: 'not-a-file',
      PATH: 'x',
    })
    expect(env.SSL_CERT_FILE).toBeUndefined()
    expect(env.REQUESTS_CA_BUNDLE).toBeUndefined()
    expect(env.CURL_CA_BUNDLE).toBeUndefined()
    expect(env.PIP_CERT).toBeUndefined()
    expect(env.__zerowallCaDiagnostic).toContain('SSL_CERT_FILE')
    expect(env.PATH).toBe('x')
  })
})
