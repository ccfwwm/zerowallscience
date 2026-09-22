import { createHash } from 'node:crypto'
import { gzipSync, deflateSync } from 'node:zlib'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { readOmeZarrMetadata, readOmeZarrPlane } from '../src/host/ome-zarr.js'

async function fixture(compressed: false | 'gzip' | 'zlib' = false): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `zerowall-ome-zarr-${Math.random().toString(16).slice(2)}`)
  await mkdir(join(root, '0'), { recursive: true })
  await writeFile(join(root, '.zattrs'), JSON.stringify({ multiscales: [{ version: '0.4', axes: [{ name: 't', type: 'time' }, { name: 'c', type: 'channel' }, { name: 'z', type: 'space', unit: 'micrometer' }, { name: 'y', type: 'space', unit: 'micrometer' }, { name: 'x', type: 'space', unit: 'micrometer' }], datasets: [{ path: '0', coordinateTransformations: [{ type: 'scale', scale: [1, 1, 2, 0.5, 0.5] }] }] }] }))
  await writeFile(join(root, '0', '.zarray'), JSON.stringify({ zarr_format: 2, shape: [1, 2, 2, 4, 4], chunks: [1, 1, 1, 4, 4], dtype: '<u2', compressor: compressed ? { id: compressed, level: 6 } : null, fill_value: 0, order: 'C', dimension_separator: '.' }))
  for (let channel = 0; channel < 2; channel++) for (let z = 0; z < 2; z++) {
    const values = Buffer.alloc(4 * 4 * 2)
    for (let index = 0; index < 16; index++) values.writeUInt16LE((channel * 2 + z + 1) * 10, index * 2)
    const encoded = compressed === 'gzip' ? gzipSync(values) : compressed === 'zlib' ? deflateSync(values) : values
    await writeFile(join(root, '0', `0.${channel}.${z}.0.0`), encoded)
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

describe('OME-Zarr adapter', () => {
  it('reads axes, pages and a plane without loading the whole store', async () => {
    const value = await fixture()
    try {
      const metadata = await readOmeZarrMetadata(value.root)
      expect(metadata).toMatchObject({ format: 'ome-zarr', order: 'TCZYX', width: 4, height: 4, pages: 4, channels: 2, depth: 'ushort', fingerprintScope: 'metadata-and-chunk-layout' })
      expect(metadata.physicalSize).toMatchObject({ x: 0.5, y: 0.5, unit: 'micrometer' })
      const plane = await readOmeZarrPlane(value.root, metadata, 1)
      expect(plane).toMatchObject({ width: 4, height: 4, depth: 'ushort' })
      expect(plane.raw.readUInt16LE(0)).toBe(20)
      expect(createHash('sha256').update(plane.raw).digest('hex')).toHaveLength(64)
    } finally { await value.cleanup() }
  })

  it('decodes gzip chunks and rejects unsupported compressors', async () => {
    const value = await fixture('gzip')
    try {
      const metadata = await readOmeZarrMetadata(value.root)
      const plane = await readOmeZarrPlane(value.root, metadata, 0)
      expect(plane.raw.readUInt16LE(0)).toBe(10)
      await writeFile(join(value.root, '0', '.zarray'), JSON.stringify({ zarr_format: 2, shape: [1, 2, 2, 4, 4], chunks: [1, 1, 1, 4, 4], dtype: '<u2', compressor: { id: 'blosc' }, fill_value: 0, order: 'C' }))
      const unsupported = await readOmeZarrMetadata(value.root)
      await expect(readOmeZarrPlane(value.root, unsupported, 0)).rejects.toThrow(/compressor blosc/i)
    } finally { await value.cleanup() }
  })

  it('decodes zlib chunks and blocks oversized planes before reading chunks', async () => {
    const value = await fixture('zlib')
    try {
      const metadata = await readOmeZarrMetadata(value.root)
      const plane = await readOmeZarrPlane(value.root, metadata, 0)
      expect(plane.raw.readUInt16LE(0)).toBe(10)
      const oversized = { ...metadata, width: 4097, height: 4097, dataset: { ...metadata.dataset, shape: [1, 1, 1, 4097, 4097], chunks: [1, 1, 1, 1, 1] } }
      await expect(readOmeZarrPlane(value.root, oversized, 0)).rejects.toThrow(/more than 4096 chunks/i)
    } finally { await value.cleanup() }
  })

  it('uses nominal edge chunk strides and explicit missing-chunk fill values', async () => {
    const value = await fixture()
    try {
      const descriptor = { zarr_format: 2, shape: [1, 1, 1, 3, 3], chunks: [1, 1, 1, 2, 2], dtype: '<u2', compressor: null, fill_value: 7, order: 'C' }
      await writeFile(join(value.root, '0', '.zarray'), JSON.stringify(descriptor))
      const values = (items: number[]) => { const bytes = Buffer.alloc(8); items.forEach((item, index) => bytes.writeUInt16LE(item, index * 2)); return bytes }
      await writeFile(join(value.root, '0', '0.0.0.0.0'), values([1, 2, 4, 5]))
      await writeFile(join(value.root, '0', '0.0.0.0.1'), values([3, 999, 6, 999]))
      await writeFile(join(value.root, '0', '0.0.0.1.0'), values([8, 9, 999, 999]))
      const plane = await readOmeZarrPlane(value.root, await readOmeZarrMetadata(value.root), 0)
      expect(Array.from({ length: 9 }, (_, index) => plane.raw.readUInt16LE(index * 2))).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 7])
    } finally { await value.cleanup() }
  })

  it('rejects unsupported layouts, lossy integers and oversized decoded chunks', async () => {
    const value = await fixture()
    try {
      const path = join(value.root, '0', '.zarray')
      const descriptor = JSON.parse(await readFile(path, 'utf8'))
      for (const [patch, error] of [
        [{ order: 'F' }, /C-order/], [{ filters: [{ id: 'delta' }] }, /filtered/],
        [{ dtype: '<u8' }, /lossless/], [{ fill_value: 1000000 }, /fill value/],
        [{ chunks: [1, 1, 1, 100000, 100000] }, /32 MiB/],
      ] as const) {
        await writeFile(path, JSON.stringify({ ...descriptor, ...patch }))
        await expect(readOmeZarrMetadata(value.root)).rejects.toThrow(error)
      }
    } finally { await value.cleanup() }
  })

  it('blocks oversized planes and compression expansion before excessive allocation', async () => {
    const value = await fixture('gzip')
    try {
      const metadata = await readOmeZarrMetadata(value.root)
      const huge = { ...metadata, width: 10000, height: 10000, dataset: { ...metadata.dataset, chunks: [1, 1, 1, 1000, 1000] } }
      await expect(readOmeZarrPlane(value.root, huge, 0)).rejects.toThrow(/128 MiB/)
      await writeFile(join(value.root, '0', '0.0.0.0.0'), gzipSync(Buffer.alloc(1024 * 1024)))
      await expect(readOmeZarrPlane(value.root, metadata, 0)).rejects.toThrow()
    } finally { await value.cleanup() }
  })

  it('rejects metadata redirected outside the dataset through a junction', async () => {
    const value = await fixture(); const outside = await fixture()
    try {
      await rm(join(value.root, '0'), { recursive: true })
      await symlink(join(outside.root, '0'), join(value.root, '0'), process.platform === 'win32' ? 'junction' : 'dir')
      await expect(readOmeZarrMetadata(value.root)).rejects.toThrow(/escapes/)
    } finally { await value.cleanup(); await outside.cleanup() }
  })
})
