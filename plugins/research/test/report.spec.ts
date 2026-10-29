import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { ResearchStore } from '../../research-store/src/index.js'
import { ReportService } from '../src/host/report.js'

it('exports drafts and formal reports without gate approval while marking unverified material', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-report-'))
  const store = new ResearchStore(join(root, 'research.sqlite'))
  try {
    const project = store.createProject({ name: 'Reconnaissance', rootPath: root })
    const study = store.createResearchStudy({ projectId: project.id, title: 'Unverified question' })
    store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'observation', payload: { status: 'no-phenotype-match', resultScope: 'Catalog only; not absence of a phenotype in every official cycle.' } })
    const service = new ReportService(store)
    const draft = await service.generate(project, study.id, 'draft')
    expect(draft.needsReview).toBe(true)
    expect(draft.blockers).toEqual([])
    expect(draft.warnings).toEqual(expect.arrayContaining(['Gate 1 状态未批准；此状态不阻止报告生成', 'Gate 2 状态未批准；此状态不阻止报告生成', '没有登记研究主张']))
    const markdown = await readFile(fileURLToPath(draft.report.uri), 'utf8')
    expect(markdown).toContain('科学核验状态：含未核验项目')
    expect(markdown).toContain('报告生成不会批准 Gate')
    expect(markdown).toContain('Catalog only')
    const manifest = JSON.parse(await readFile(fileURLToPath(draft.manifest.uri), 'utf8'))
    expect(manifest).toMatchObject({ mode: 'draft', blockers: [], warnings: draft.warnings, verificationStatus: 'not-certified-by-report-generation', needsReview: true })
    const final = await service.generate(project, study.id, 'final')
    expect(final).toMatchObject({ mode: 'final', needsReview: true, blockers: [], warnings: draft.warnings })
    expect(store.listArtifacts(project.id)).toHaveLength(4)
    expect(store.getResearchStudy(study.id)?.gate1).toBe('pending')
  } finally { store.close(); await rm(root, { recursive: true, force: true }) }
})
