import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { registerLocalAsset } from '../src/host/local-assets.js'

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
