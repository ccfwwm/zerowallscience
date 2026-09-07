import type { PaperRecord, LiteratureGraph } from '@zerowallscience/research-store/types'
const escape = (value: unknown) => String(value ?? '').replace(/[{}\\]/g, ' ').replace(/[\r\n]+/g, ' ')
export function mermaid(graph: LiteratureGraph): string {
  const ids = new Map(graph.nodes.map((node, i) => [node.id, 'n' + i]))
  const label = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]/g, ' ')
  return ['flowchart LR', ...graph.nodes.map(n => `${ids.get(n.id)}["${label(n.label)}"]`), ...graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => `${ids.get(e.source)} -->|"${label(e.label ?? e.kind)}"| ${ids.get(e.target)}`)].join('\n')
}
export function citations(papers: PaperRecord[], format: 'bibtex' | 'ris'): string {
  return papers.map(paper => {
    const c = paper.citation
    const authors = Array.isArray(c.authors) ? c.authors.map(a => typeof a === 'string' ? a : a && typeof a === 'object' && !Array.isArray(a) ? a.name ?? [a.lastName, a.foreName].filter(Boolean).join(', ') : '').filter(Boolean).map(escape) : []
    const year = escape(c.pubYear ?? c.year ?? '')
    const journal = escape(c.journal && typeof c.journal === 'object' && !Array.isArray(c.journal) ? c.journal.title : c.journal)
    if (format === 'ris') return ['TY  - JOUR', 'ID  - ' + paper.id, 'TI  - ' + escape(paper.title), ...authors.map(a => 'AU  - ' + a), ...(year ? ['PY  - ' + year] : []), ...(journal ? ['JO  - ' + journal] : []), ...(paper.doi ? ['DO  - ' + escape(paper.doi)] : []), ...(paper.uri ? ['UR  - ' + escape(paper.uri)] : []), 'ER  -'].join('\n')
    return '@article{paper_' + paper.id.replaceAll('-', '') + ',\n' + Object.entries({ title: escape(paper.title), author: authors.join(' and '), year, journal, doi: escape(paper.doi), url: escape(paper.uri) }).filter(([,v]) => v).map(([k,v]) => `  ${k} = {${v}}`).join(',\n') + '\n}'
  }).join('\n\n') + '\n'
}
