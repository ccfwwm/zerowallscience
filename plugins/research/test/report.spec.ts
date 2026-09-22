import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { ReportService } from '../src/host/report.js'

it('exports a useful reconnaissance draft while retaining all unapproved release gates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-report-'))
  const store = new ResearchStore(join(root, 'research.sqlite'))
  try {
    const project = store.createProject({ name: 'Reconnaissance', rootPath: root })
    const study = store.createResearchStudy({ projectId: project.id, title: 'Unverified question' })
    store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'observation', payload: { status: 'no-phenotype-match', resultScope: 'Catalog only; not absence of a phenotype in every official cycle.' } })
    const service = new ReportService(store)
    const draft = await service.generate(project, study.id, 'draft')
    expect(draft.needsReview).toBe(true)
    expect(draft.blockers).toEqual(['Gate 1 尚未批准', '研究方案尚未冻结', 'Gate 2 尚未批准', '没有主张记录'])
    const markdown = await readFile(fileURLToPath(draft.report.uri), 'utf8')
    expect(markdown).toContain('当前阻断：Gate 1 尚未批准')
    expect(markdown).not.toContain('没有待处理的门禁阻断')
    expect(markdown).toContain('Catalog only')
    const manifest = JSON.parse(await readFile(fileURLToPath(draft.manifest.uri), 'utf8'))
    expect(manifest.blockers).toEqual(draft.blockers)
    await expect(service.generate(project, study.id, 'final')).rejects.toThrow('不能生成正式 IMRAD 报告')
    expect(store.listArtifacts(project.id)).toHaveLength(2)
    expect(store.getResearchStudy(study.id)?.gate1).toBe('pending')
  } finally { store.close(); await rm(root, { recursive: true, force: true }) }
})
