import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchStore } from '@zerowallscience/research-store'
import { writePublicationBundle } from '../src/host/export.js'
import { writePresentation } from '../../presentations/src/host/export.js'
import { PresentationWorker } from '../../presentations/src/host/worker.js'

const roots: string[] = []
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-publication-')); roots.push(root)
  const store = new ResearchStore(join(root, 'research.sqlite'))
  const project = store.createProject({ name: 'Export study', rootPath: join(root, 'project') })
  return { root, store, project }
}

describe('Publication and presentation workers', () => {
  it('writes a checksummed reproducible publication ZIP', async () => {
    const { root, store, project } = fixture()
    const run = store.createRun({ projectId: project.id, name: 'Experiment', command: 'true', workingDirectory: '.', status: 'succeeded', progress: 1 })
    store.createArtifact({ projectId: project.id, runId: run.id, name: 'Result', uri: 'file:///result.csv', mediaType: 'text/csv' })
    const created = store.createPublication({ projectId: project.id, title: 'Result bundle', manifest: { license: 'CC-BY-4.0' } })
    const ready = store.validatePublication(store.freezePublication(created.id).id)
    const path = join(root, 'publication.zip')
    await writePublicationBundle(ready, fileUri(path))
    const zip = await JSZip.loadAsync(readFileSync(path))
    expect(Object.keys(zip.files).sort()).toEqual(['README.txt', 'checksums.json', 'publication.json', 'research-snapshot.json'])
    expect(JSON.parse(await zip.file('checksums.json')!.async('string'))).toMatchObject({ algorithm: 'sha256', files: { 'publication.json': expect.stringMatching(/^[a-f0-9]{64}$/) } })
    store.close()
  })

  it('persists generation stages, pause/resume, recovery, and real PPTX/PDF files', async () => {
    vi.useFakeTimers()
    const { root, store, project } = fixture()
    const presentation = store.createPresentation({ projectId: project.id, title: '科研结果', outline: [{ title: '主要发现', points: ['证据一', 'Evidence two'] }], style: { accent: '315B7D' } })
    const worker = new PresentationWorker(store, 10)
    worker.generate(presentation.id)
    await vi.advanceTimersByTimeAsync(11)
    expect(store.getPresentation(presentation.id)?.status).toBe('designing')
    expect(worker.pause(presentation.id).status).toBe('paused')
    await vi.advanceTimersByTimeAsync(50)
    expect(store.getPresentation(presentation.id)?.status).toBe('paused')
    vi.useRealTimers()
    worker.resume(presentation.id)
    await waitForStatus(store, presentation.id, 'ready')
    const generated = store.getPresentation(presentation.id)!
    expect(generated.status).toBe('ready')
    expect(generated.slides).toHaveLength(6)
    expect(generated.slides.map(slide => slide.title)).toContain('主要发现')

    const interrupted = store.createPresentation({ projectId: project.id, title: 'Recovered', outline: [{ title: 'Recovery', points: ['Persisted'] }] })
    worker.generate(interrupted.id)
    worker.dispose()
    const recovered = new PresentationWorker(store, 10)
    expect(recovered.recover().map(item => item.id)).toContain(interrupted.id)
    expect(store.getPresentation(interrupted.id)).toMatchObject({
      status: 'failed',
      generation: { stage: 'failed' },
    })

    const ready = store.getPresentation(presentation.id)!
    const pptxPath = join(root, 'results.pptx'); const pdfPath = join(root, 'results.pdf')
    await writePresentation(ready, 'pptx', fileUri(pptxPath))
    await writePresentation(ready, 'pdf', fileUri(pdfPath))
    expect(readFileSync(pptxPath).subarray(0, 2).toString()).toBe('PK')
    expect(readFileSync(pdfPath).subarray(0, 4).toString()).toBe('%PDF')
    recovered.dispose(); store.close()
  }, 20_000)
})

function fileUri(path: string): string { return `file:///${path.replaceAll('\\', '/')}` }

async function waitForStatus(store: ResearchStore, id: string, status: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (store.getPresentation(id)?.status !== status) {
    if (Date.now() >= deadline) throw new Error(`Presentation ${id} did not reach ${status}.`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
