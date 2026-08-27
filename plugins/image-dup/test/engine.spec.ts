import { describe, expect, it } from 'vitest'
import { reportArtifact } from '../src/host/engine.js'
import type { ImageDupReport } from '../src/shared/types.js'
describe('image duplicate reports', () => { it('renders safe outputs', () => { const report: ImageDupReport = { ok: true, total: 2, threshold: 8, pairs: [{ a: '<a>.png', b: 'b.png', distance: 0, similarity: 1, transform: 'duplicate' }], copyMove: [], skipped: [], generatedAt: new Date(0).toISOString() }; expect(reportArtifact(report, 'md')).toContain('<a>.png'); expect(reportArtifact(report, 'html')).toContain('&lt;a&gt;.png'); expect(reportArtifact(report, 'json')).toContain('"total": 2') }) })
