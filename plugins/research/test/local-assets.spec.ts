import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { importLocalAsset, registerLocalAsset } from '../src/host/local-assets.js'

it('registers local bytes in place, deduplicates unchanged assets and preserves changed source revisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'local-assets-'))
  const store = new ResearchStore(join(root, 'store.sqlite'))
  try {
    const project = store.createProject({ name: 'Files only', rootPath: root })
    const path = join(root, 'example.fa'); const data = '>example\nATG\n'; await writeFile(path, data)
    const [first, second] = await Promise.all([registerLocalAsset(store, project, 'example.fa'), registerLocalAsset(store, project, path)])
    expect(first.id).toBe(second.id)
    expect(first.checksum).toBe(createHash('sha256').update(data).digest('hex'))
    expect(first.mediaType).toBe('text/x-fasta')
    expect(await readFile(path, 'utf8')).toBe(data)
    await writeFile(path, '>changed\nTAA\n')
    const next = await registerLocalAsset(store, project, path)
    expect(next.id).not.toBe(first.id)
    expect(next.provenance.supersedesAssetIds).toEqual([first.id])
    expect(store.listResearchStudies(project.id)).toHaveLength(0)
  } finally { store.close(); await rm(root, { recursive: true, force: true }) }
})

it('rejects outside files, directory assets and junctions escaping the project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'local-asset-boundary-'))
  const workspace = join(root, 'workspace'); const outside = join(root, 'outside'); await mkdir(workspace); await mkdir(outside)
  const store = new ResearchStore(join(root, 'store.sqlite'))
  try {
    const project = store.createProject({ name: 'Inside', rootPath: workspace })
    await writeFile(join(outside, 'source.fa'), '>outside\nATG\n')
    await symlink(outside, join(workspace, 'escape'), 'junction')
    await expect(registerLocalAsset(store, project, '../outside/source.fa')).rejects.toThrow('outside')
    await expect(registerLocalAsset(store, project, 'escape/source.fa')).rejects.toThrow('outside')
    await expect(registerLocalAsset(store, project, '.')).rejects.toThrow('regular file')
    expect(store.listDataAssets(project.id)).toHaveLength(0)
  } finally { store.close(); await rm(root, { recursive: true, force: true }) }
})

it('copies an external scientific file into .zerowall/imports and registers verified bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'local-asset-import-'))
  const workspace = join(root, 'workspace'); const sourceRoot = join(root, 'external')
  await mkdir(workspace); await mkdir(sourceRoot)
  const source = join(sourceRoot, 'sample.fasta'); const content = '>sample\nATGC\n'; await writeFile(source, content)
  const store = new ResearchStore(join(root, 'store.sqlite'))
  try {
    const project = store.createProject({ name: 'Import', rootPath: workspace })
    const asset = await importLocalAsset(store, project, source)
    const importedPath = new URL(asset.uri)
    const bytes = await readFile(importedPath)
    expect(importedPath.pathname).toContain('/.zerowall/imports/')
    expect(bytes.toString()).toBe(content)
    expect(asset.checksum).toBe(createHash('sha256').update(content).digest('hex'))
    expect(asset.provenance.registration).toBe('imported-external-file')
    expect(asset.provenance.sourceName).toBe('sample.fasta')
    expect(store.listResearchStudies(project.id)).toHaveLength(0)
  } finally { store.close(); await rm(root, { recursive: true, force: true }) }
})

it('rejects unsupported external files before copying them into a project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'local-asset-import-reject-'))
  const workspace = join(root, 'workspace'); await mkdir(workspace)
  const source = join(root, 'image.exe'); await writeFile(source, 'executable')
  const store = new ResearchStore(join(root, 'store.sqlite'))
  try {
    const project = store.createProject({ name: 'Import', rootPath: workspace })
    await expect(importLocalAsset(store, project, source)).rejects.toThrow('Unsupported science file type')
    expect(store.listDataAssets(project.id)).toHaveLength(0)
  } finally { store.close(); await rm(root, { recursive: true, force: true }) }
})
