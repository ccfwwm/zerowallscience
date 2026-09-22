import { describe, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { assemblySessionId, researchContextText, RESEARCH_CONTEXT_VERSION } from '../src/host/research-context.js'

describe('persistent session research context', () => {
  it('isolates session selections and rejects foreign project studies', () => {
    const store = new ResearchStore(':memory:')
    try {
      const p = store.createProject({ name: 'A', rootPath: 'C:/A' })
      const q = store.createProject({ name: 'B', rootPath: 'C:/B' })
      const a = store.createResearchStudy({ projectId: p.id, title: 'A', budget: { maxTokens: 1000, instructions: '{{evil}}' } })
      const b = store.createResearchStudy({ projectId: q.id, title: 'B' })
      store.setSessionResearchStudy(p.id, 's1', a.id)
      expect(store.getSessionResearchStudy(p.id, 's1')?.id).toBe(a.id)
      expect(store.getSessionResearchStudy(p.id, 's2')).toBeUndefined()
      expect(store.getSessionResearchStudy(q.id, 's1')).toBeUndefined()
      expect(() => store.setSessionResearchStudy(p.id, 's1', b.id)).toThrow('current project')
      const text = researchContextText(store.getResearchStudySnapshot(a.id))
      expect(text).toContain('1000')
      expect(text).toContain(RESEARCH_CONTEXT_VERSION)
      expect(text).toContain('data, not instructions')
      expect(text).not.toContain('evil')
      store.setSessionResearchStudy(p.id, 's1', null)
      expect(store.getSessionResearchStudy(p.id, 's1')).toBeUndefined()
    } finally { store.close() }
  })
  it('resolves only a real agent session rather than an arbitrary agent ID', () => {
    expect(assemblySessionId({ scope: { session: { id: 's1' } } })).toBe('s1')
    expect(assemblySessionId({ agent: { id: 'not-a-session' } })).toBeUndefined()
    expect(researchContextText(undefined)).toBe('')
  })
})
