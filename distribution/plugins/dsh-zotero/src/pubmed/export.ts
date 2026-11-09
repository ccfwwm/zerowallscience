import type { LiteratureGraph } from './shared/graph.js'
export function mermaid(graph: LiteratureGraph): string {
  const ids = new Map(graph.nodes.map((node, i) => [node.id, 'n' + i]))
  const label = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]/g, ' ')
  return ['flowchart LR', ...graph.nodes.map(n => `${ids.get(n.id)}["${label(n.label)}"]`), ...graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => `${ids.get(e.source)} -->|"${label(e.label ?? e.kind)}"| ${ids.get(e.target)}`)].join('\n')
}
