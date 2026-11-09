import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { CreatePaperInput, PaperRecord, JsonObject } from './domain.ts'

export interface LiteratureNode extends JsonObject { id: string; type: string; label: string }
export interface LiteratureEdge extends JsonObject { source: string; target: string; kind: string }
export interface LiteratureGraph { nodes: LiteratureNode[]; edges: LiteratureEdge[] }
export interface LiteratureIdentifier { paperId: string; namespace: string; value: string }
export interface LiteratureSnapshot extends LiteratureGraph { identifiers: LiteratureIdentifier[] }
export const LITERATURE_SQL = `
  CREATE TABLE literature_identifiers (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, namespace TEXT NOT NULL, value TEXT NOT NULL, paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE, PRIMARY KEY(project_id, namespace, value));
  CREATE TABLE literature_nodes (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, id TEXT NOT NULL, paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE, data_json TEXT NOT NULL, PRIMARY KEY(project_id, id));
  CREATE TABLE literature_edges (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, id TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, data_json TEXT NOT NULL, PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,source) REFERENCES literature_nodes(project_id,id) ON DELETE CASCADE, FOREIGN KEY(project_id,target) REFERENCES literature_nodes(project_id,id) ON DELETE CASCADE);
  CREATE TABLE literature_evidence (project_id TEXT NOT NULL, edge_id TEXT NOT NULL, namespace TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(project_id,edge_id,namespace,value), FOREIGN KEY(project_id,edge_id) REFERENCES literature_edges(project_id,id) ON DELETE CASCADE);
`
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function paperIdentifiers(article: JsonObject): { namespace: string; value: string }[] {
  const result: { namespace: string; value: string }[] = []
  for (const [namespace, raw] of Object.entries({ pmid: article.pmid, pmcid: article.pmcid ?? article.pmcId, doi: article.doi, s2: article.s2Id, openalex: article.openalexId })) {
    if (typeof raw !== 'string' && typeof raw !== 'number') continue
    let value = String(raw).trim()
    if (namespace === 'doi') value = value.replace(/^https?:\/\/(?:dx\.)?doi.org\//i, '').replace(/^doi:/i, '').toLowerCase()
    if (namespace === 'pmcid') value = value.toUpperCase().replace(/^(?!PMC)(\d+)$/, 'PMC$1')
    if (value) result.push({ namespace, value })
  }
  const rawId = article.sourceId ?? article.epmcId ?? article.id
  if (article.source && rawId) result.push({ namespace: 'source:' + String(article.source), value: String(rawId) })
  if (!result.length) result.push({ namespace: 'record', value: digest(article) })
  return result
}
export function mergeLiteratureData(old: JsonObject, fresh: JsonObject): JsonObject {
  const merged = { ...old, ...fresh }
  for (const key of ['sources', 'evidencePmids', 'articleIds']) {
    if (Array.isArray(old[key]) || Array.isArray(fresh[key])) merged[key] = [...new Set([...(Array.isArray(old[key]) ? old[key] : []), ...(Array.isArray(fresh[key]) ? fresh[key] : [])])]
  }
  if (old.detail && fresh.detail && typeof old.detail === 'object' && typeof fresh.detail === 'object' && !Array.isArray(old.detail) && !Array.isArray(fresh.detail)) merged.detail = mergeLiteratureData(old.detail, fresh.detail)
  for (const key of ['count', 'weight', 'reportedPublications']) if (typeof old[key] === 'number' && typeof fresh[key] === 'number') merged[key] = Math.max(old[key], fresh[key])
  return merged
}
export class LiteratureStore {
  constructor(private readonly db: DatabaseSync, private readonly createPaper: (input: CreatePaperInput) => PaperRecord, private readonly papers: (projectId: string) => PaperRecord[]) {}
  savePapers(projectId: string, articles: JsonObject[]): PaperRecord[] {
    if (!Array.isArray(articles) || articles.length > 1000) throw new Error('Expected at most 1000 literature records.')
    const ids: string[] = []
    for (const article of articles) {
      if (!article || typeof article.title !== 'string' || !article.title.trim()) throw new Error('Literature record requires a title.')
      const identifiers = paperIdentifiers(article)
      const found = new Set<string>()
      for (const { namespace, value } of identifiers) {
        const row = this.db.prepare('SELECT paper_id FROM literature_identifiers WHERE project_id=? AND namespace=? AND value=?').get(projectId, namespace, value)
        if (row) found.add(String(row.paper_id))
        // Also match manually created Papers whose DOI predates the identifier index.
        if (namespace === 'doi') for (const paper of this.papers(projectId)) if (paper.doi && paperIdentifiers({ doi: paper.doi }).some(id => id.namespace === 'doi' && id.value === value)) found.add(paper.id)
      }
      if (found.size > 1) throw new Error('Conflicting literature identifiers refer to different papers.')
      const current = this.papers(projectId).find(p => found.has(p.id))
      if (current) {
        const existing = this.db.prepare('SELECT namespace,value FROM literature_identifiers WHERE project_id=? AND paper_id=?').all(projectId, current.id)
        for (const item of identifiers) if (['pmid', 'doi', 'pmcid', 's2', 'openalex'].includes(item.namespace) && existing.some(row => row.namespace === item.namespace && row.value !== item.value)) throw new Error('Conflicting identifier for an existing paper.')
      }
      const now = new Date().toISOString()
      const previous = current?.citation ?? {}
      const records = Array.isArray(previous.sourceRecords) ? [...previous.sourceRecords] : []
      if (!records.some(r => r && typeof r === 'object' && !Array.isArray(r) && r.digest === digest(article))) records.push({ digest: digest(article), retrievedAt: now, record: article })
      const citation: JsonObject = { ...previous, ...article, sourceRecords: records }
      const doi = identifiers.find(id => id.namespace === 'doi')?.value
      const paper = current ?? this.createPaper({ projectId, title: article.title, ...(doi ? { doi } : {}), ...(typeof article.url === 'string' ? { uri: article.url } : {}), citation })
      if (current && JSON.stringify(current.citation) !== JSON.stringify(citation)) this.db.prepare('UPDATE papers SET citation_json=?, version=version+1, updated_at=? WHERE id=? AND project_id=?').run(JSON.stringify(citation), now, paper.id, projectId)
      for (const item of identifiers) this.db.prepare('INSERT OR IGNORE INTO literature_identifiers(project_id,namespace,value,paper_id) VALUES(?,?,?,?)').run(projectId, item.namespace, item.value, paper.id)
      ids.push(paper.id)
    }
    return this.papers(projectId).filter(p => ids.includes(p.id))
  }
  graph(projectId: string): LiteratureSnapshot {
    const parse = (table: string) => this.db.prepare(`SELECT data_json FROM ${table} WHERE project_id=? ORDER BY id`).all(projectId).map(row => JSON.parse(String(row.data_json)))
    return { nodes: parse('literature_nodes'), edges: parse('literature_edges'), identifiers: this.db.prepare('SELECT paper_id AS paperId,namespace,value FROM literature_identifiers WHERE project_id=? ORDER BY namespace,value').all(projectId) as unknown as LiteratureIdentifier[] }
  }
  merge(projectId: string, graph: LiteratureGraph): { addedNodes: number; addedEdges: number } {
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > 50000 || graph.edges.length > 200000) throw new Error('Invalid literature graph size.')
    let addedNodes = 0; let addedEdges = 0
    for (const node of graph.nodes) {
      if (!node.id || !['article', 'keyword', 'concept'].includes(node.type) || typeof node.label !== 'string') throw new Error('Invalid literature node.')
      let paperId: string | null = null
      if (node.type === 'article') {
        const detail = node.detail && typeof node.detail === 'object' && !Array.isArray(node.detail) ? node.detail : {}
        paperId = this.savePapers(projectId, [{ ...detail, title: detail.title ?? node.label }])[0]!.id
      }
      const row = this.db.prepare('SELECT data_json FROM literature_nodes WHERE project_id=? AND id=?').get(projectId, node.id)
      if (!row) addedNodes++
      const data = row ? mergeLiteratureData(JSON.parse(String(row.data_json)), node) : node
      this.db.prepare('INSERT INTO literature_nodes(project_id,id,paper_id,data_json) VALUES(?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET data_json=excluded.data_json,paper_id=COALESCE(excluded.paper_id,literature_nodes.paper_id)').run(projectId, node.id, paperId, JSON.stringify(data))
    }
    for (const edge of graph.edges) {
      if (!edge.source || !edge.target || !edge.kind) throw new Error('Invalid literature edge.')
      const id = digest([edge.source, edge.target, edge.kind, edge.label ?? '', edge.method ?? 'cooccurrence'])
      const row = this.db.prepare('SELECT data_json FROM literature_edges WHERE project_id=? AND id=?').get(projectId, id)
      if (!row) addedEdges++
      const data = row ? mergeLiteratureData(JSON.parse(String(row.data_json)), edge) : edge
      this.db.prepare('INSERT INTO literature_edges(project_id,id,source,target,data_json) VALUES(?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET data_json=excluded.data_json').run(projectId, id, edge.source, edge.target, JSON.stringify(data))
      const detail = data.detail && typeof data.detail === 'object' && !Array.isArray(data.detail) ? data.detail : {}
      for (const [namespace, values] of Object.entries({ pmid: detail.evidencePmids, article: detail.articleIds })) if (Array.isArray(values)) for (const value of values) this.db.prepare('INSERT OR IGNORE INTO literature_evidence(project_id,edge_id,namespace,value) VALUES(?,?,?,?)').run(projectId, id, namespace, String(value))
    }
    return { addedNodes, addedEdges }
  }
  reset(projectId: string): void { this.db.prepare('DELETE FROM literature_nodes WHERE project_id=?').run(projectId) }
  restore(projectId: string, snapshot: LiteratureSnapshot, ids: Map<string, string>): void {
    for (const identifier of snapshot.identifiers) {
      const paperId = ids.get(identifier.paperId)
      if (!paperId) throw new Error('Orphan literature identifier.')
      this.db.prepare('INSERT INTO literature_identifiers(project_id,namespace,value,paper_id) VALUES(?,?,?,?)').run(projectId, identifier.namespace, identifier.value, paperId)
    }
    this.merge(projectId, snapshot)
  }
}
