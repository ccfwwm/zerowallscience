/** Conversation-local literature graph; no independent persistent research store is required. */
export interface LiteratureGraph { nodes: { id: string; label?: string }[]; edges: { source: string; target: string; label?: string; kind?: string }[] }
