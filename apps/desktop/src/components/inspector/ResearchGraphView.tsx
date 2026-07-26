import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  loadResearchGraph,
  type GraphEdge,
  type GraphNode,
  type GraphNodeKind,
  type ResearchGraph,
} from "@/lib/researchGraph";
import { isGatewayWeb } from "@/lib/webMode";

/** Column order, left to right: what produced the work, then what was said about it. */
const KIND_ORDER: GraphNodeKind[] = ["artifactVersion", "claim", "annotation", "memory"];

const KIND_COLOR: Record<GraphNodeKind, string> = {
  artifactVersion: "var(--graph-artifact, #38bdf8)",
  claim: "var(--graph-claim, #f59e0b)",
  annotation: "var(--graph-annotation, #a78bfa)",
  memory: "var(--graph-memory, #34d399)",
};

const NODE_W = 168;
const NODE_H = 44;
const COL_GAP = 88;
const ROW_GAP = 14;
const PAD = 16;

export interface Placed {
  node: GraphNode;
  x: number;
  y: number;
}

/**
 * Deterministic layered layout: one column per node kind, nodes stacked in the
 * order the read-model returned them (newest first).
 *
 * A force-directed layout would move nodes on every render and settle
 * differently each time, which makes the view impossible to assert on and
 * impossible for a user to re-find a node in. Columns cost nothing to compute
 * and put the artifact DAG next to what refers to it.
 */
export function layout(nodes: GraphNode[]): { placed: Placed[]; width: number; height: number } {
  const byKind = new Map<GraphNodeKind, GraphNode[]>();
  for (const kind of KIND_ORDER) byKind.set(kind, []);
  for (const node of nodes) byKind.get(node.kind)?.push(node);

  // Empty kinds collapse instead of leaving a blank column, so a project with
  // only artifacts does not render mostly whitespace.
  const columns = KIND_ORDER.filter((k) => (byKind.get(k)?.length ?? 0) > 0);

  const placed: Placed[] = [];
  let tallest = 0;
  columns.forEach((kind, col) => {
    const group = byKind.get(kind) ?? [];
    group.forEach((node, row) => {
      placed.push({
        node,
        x: PAD + col * (NODE_W + COL_GAP),
        y: PAD + row * (NODE_H + ROW_GAP),
      });
    });
    tallest = Math.max(tallest, group.length);
  });

  return {
    placed,
    width: PAD * 2 + Math.max(1, columns.length) * NODE_W + Math.max(0, columns.length - 1) * COL_GAP,
    height: PAD * 2 + Math.max(1, tallest) * NODE_H + Math.max(0, tallest - 1) * ROW_GAP,
  };
}

/** Straight connector between two placed nodes, right edge to left edge. */
function edgePath(from: Placed, to: Placed): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const mid = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

/**
 * The research graph: how a project's artifacts, the claims a reviewer raised
 * about them, the annotations anchored to them, and the memories kept from the
 * work all relate.
 *
 * Desktop only — it reads the workspace's local science database, which the
 * gateway web client cannot reach.
 */
export function ResearchGraphView() {
  const { t } = useTranslation(["inspector", "common"]);
  const [graph, setGraph] = useState<ResearchGraph | null>(null);
  const [loading, setLoading] = useState(!isGatewayWeb);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isGatewayWeb) return;
    let cancelled = false;
    setLoading(true);
    loadResearchGraph()
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { placed, width, height } = useMemo(() => layout(graph?.nodes ?? []), [graph?.nodes]);
  const positions = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);

  // Hidden entirely in web mode rather than shipping a control that cannot work.
  if (isGatewayWeb) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("graph.loading", "Loading research graph…")}
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-xs text-red-600 dark:text-red-400">{error}</div>;
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="p-4 text-xs text-muted">
        {t("graph.empty", "Nothing recorded yet. Artifacts, review claims, and annotations appear here as the project produces them.")}
      </div>
    );
  }

  const drawable: GraphEdge[] = graph.edges.filter(
    (e) => positions.has(e.from) && positions.has(e.to),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-[11px] text-muted">
        {KIND_ORDER.filter((k) => graph.nodes.some((n) => n.kind === k)).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: KIND_COLOR[kind] }}
              aria-hidden="true"
            />
            {t(`graph.kind.${kind}`, kind)}
          </span>
        ))}
        {graph.truncated && (
          <span className="text-amber-600 dark:text-amber-400">
            {t("graph.truncated", "Showing the most recent items only.")}
          </span>
        )}
      </div>

      {/* Horizontal scroll rather than shrink-to-fit: at phone width a scaled
          graph is unreadable, and panning keeps every label full size. */}
      <div className="flex-1 overflow-auto p-1">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t("graph.title", "Research graph")}
        >
          <g>
            {drawable.map((edge, i) => {
              const from = positions.get(edge.from);
              const to = positions.get(edge.to);
              if (!from || !to) return null;
              return (
                <path
                  key={`${edge.from}->${edge.to}-${edge.kind}-${i}`}
                  d={edgePath(from, to)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-border"
                />
              );
            })}
          </g>
          <g>
            {placed.map(({ node, x, y }) => (
              <g key={node.id} transform={`translate(${x}, ${y})`}>
                <title>{node.detail ? `${node.label} — ${node.detail}` : node.label}</title>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  className="fill-surface-2 stroke-border"
                  strokeWidth={1}
                />
                <rect width={3} height={NODE_H} rx={1.5} fill={KIND_COLOR[node.kind]} />
                <text x={12} y={18} className="fill-foreground" fontSize={11}>
                  {node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label}
                </text>
                {node.detail && (
                  <text x={12} y={32} className="fill-muted" fontSize={10}>
                    {node.detail.length > 26 ? `${node.detail.slice(0, 25)}…` : node.detail}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
