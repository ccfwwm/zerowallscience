import { expect, it, vi } from 'vitest'
import { PythonPackageCatalog, packageMatches } from '../src/host/package-catalog.js'

it('matches partial words and Python separators and caches a complete listing', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('<a href="scikit-learn/">scikit-learn</a><a>numpy</a><a>numpy-financial</a>'))
  const catalog = new PythonPackageCatalog('https://catalog.example/pypi/', 1000, fetcher)
  expect(await catalog.search('https://index.example/simple', 'num')).toEqual([{ name: 'numpy' }, { name: 'numpy-financial' }])
  expect(await catalog.search('https://index.example/simple', 'SCIkit_lea')).toEqual([{ name: 'scikit-learn' }])
  expect(packageMatches('scikit-learn', 'sci lea')).toBe(true)
  expect(packageMatches('xlrd', 'xld')).toBe(true)
  expect(packageMatches('xlrd', 'dx')).toBe(false)
  expect(packageMatches('numpy', '---')).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(1)
  catalog.dispose()
})

it('retries failed name reads and rejects empty or invalid version catalogs', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('offline', { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ projects: [{ name: 'numpy' }] })))
  const catalog = new PythonPackageCatalog('https://catalog.example/pypi/', 1000, fetcher)
  await expect(catalog.search('https://index.example/simple', 'num')).rejects.toThrow('503')
  expect(await catalog.search('https://index.example/simple', 'num')).toEqual([{ name: 'numpy' }])
  await expect(catalog.versions('../bad')).rejects.toThrow('valid')
  catalog.dispose()
})

it('offers exact non-yanked versions with the current release first', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ info: { name: 'NumPy', summary: 'Arrays', version: '2.4.0' }, releases: { '2.3.0': [{ yanked: false }], '2.4.0': [{}], '2.5.0b1': [{}], '2.2.0': [{ yanked: true }] } }))
  const catalog = new PythonPackageCatalog('https://catalog.example/pypi/', 1000, fetcher)
  expect(await catalog.versions('NumPy')).toEqual({ name: 'NumPy', summary: 'Arrays', latestVersion: '2.4.0', versions: ['2.4.0', '2.5.0b1', '2.3.0'] })
  expect(fetcher.mock.calls[0]![0]).toBe('https://catalog.example/pypi/numpy/json')
  catalog.dispose()
})
