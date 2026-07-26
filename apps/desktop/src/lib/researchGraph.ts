// Bridge to the research graph read-model (desktop only). The graph is derived
// from the workspace's local science database, which the gateway web client has
// no route to, so this returns null there and the view hides itself.
import { isTauri } from "./tauri";

export type GraphNodeKind = "artifactVersion" | "claim" | "annotation" | "memory";

export type GraphEdgeKind = "derives" | "assesses" | "annotates";

export interface GraphNode {
  /** Namespaced `{kind}:{rowId}` — unique across the whole graph. */
  id: string;
  kind: GraphNodeKind;
  /** Primary key in the underlying table. */
  rowId: string;
  label: string;
  detail?: string;
  createdAt: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  label?: string;
}

export interface ResearchGraph {
  projectId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** True when a node kind hit the per-kind cap, so the view is partial. */
  truncated: boolean;
}

/** Load the active workspace's research graph. Returns null off-desktop. */
export async function loadResearchGraph(): Promise<ResearchGraph | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ResearchGraph>("research_graph_cmd");
}
