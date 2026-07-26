import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphNode, ResearchGraph } from "@/lib/researchGraph";
import { ResearchGraphView, layout } from "./ResearchGraphView";
import { PHONE_WIDTH, setViewportWidth } from "@/test/viewport";

// Both flags are load-time constants, so swap them for switches the tests can
// flip (the pattern FilePreviewInspector.web.test.tsx established).
const mode = vi.hoisted(() => ({ web: false }));
vi.mock("@/lib/webMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webMode")>()),
  get isGatewayWeb() {
    return mode.web;
  },
}));

const backend = vi.hoisted(() => ({ graph: null as ResearchGraph | null, calls: 0 }));
vi.mock("@/lib/researchGraph", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/researchGraph")>()),
  loadResearchGraph: () => {
    backend.calls += 1;
    return Promise.resolve(backend.graph);
  },
}));

// The viewport width is reset to the desktop default by src/test/setup.ts.
afterEach(() => {
  mode.web = false;
  backend.graph = null;
  backend.calls = 0;
  vi.restoreAllMocks();
});

/** The drawn node labels in render order (excludes the smaller detail line). */
function drawnLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('svg text[font-size="11"]')).map(
    (el) => el.textContent ?? "",
  );
}

function node(id: string, kind: GraphNode["kind"], label: string): GraphNode {
  return { id, kind, rowId: id.split(":")[1] ?? id, label, createdAt: "2026-07-26T00:00:00.000Z" };
}

const populated: ResearchGraph = {
  projectId: "proj_1",
  nodes: [
    node("artifact:av_1", "artifactVersion", "figures/trend.png"),
    node("artifact:av_2", "artifactVersion", "data/raw.csv"),
    node("claim:clm_1", "claim", "The trend is significant."),
    node("annotation:ann_1", "annotation", "Check the axis units."),
  ],
  edges: [
    { from: "artifact:av_1", to: "artifact:av_2", kind: "derives", label: "derived_from" },
    { from: "claim:clm_1", to: "artifact:av_1", kind: "assesses" },
    { from: "annotation:ann_1", to: "artifact:av_1", kind: "annotates" },
  ],
  truncated: false,
};

describe("layout", () => {
  it("gives every node a distinct slot, one column per kind", () => {
    const { placed } = layout(populated.nodes);
    expect(placed).toHaveLength(4);
    const slots = new Set(placed.map((p) => `${p.x},${p.y}`));
    expect(slots.size).toBe(4);
    // Both artifacts share a column and differ only in row.
    const artifacts = placed.filter((p) => p.node.kind === "artifactVersion");
    expect(new Set(artifacts.map((p) => p.x)).size).toBe(1);
    expect(new Set(artifacts.map((p) => p.y)).size).toBe(2);
  });

  it("collapses a kind with no nodes instead of leaving a blank column", () => {
    const onlyClaims = layout([node("claim:c1", "claim", "A claim")]);
    const onlyArtifacts = layout([node("artifact:a1", "artifactVersion", "a.csv")]);
    // A lone claim starts at the same x as a lone artifact: the empty artifact
    // column is not reserved.
    expect(onlyClaims.placed[0].x).toBe(onlyArtifacts.placed[0].x);
    expect(onlyClaims.width).toBe(onlyArtifacts.width);
  });

  it("is deterministic — the same nodes always land in the same places", () => {
    const a = layout(populated.nodes);
    const b = layout(populated.nodes);
    expect(b.placed.map((p) => [p.node.id, p.x, p.y])).toEqual(
      a.placed.map((p) => [p.node.id, p.x, p.y]),
    );
  });

  it("reports a positive canvas even with no nodes, so the svg is still valid", () => {
    const { placed, width, height } = layout([]);
    expect(placed).toEqual([]);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});

describe("ResearchGraphView", () => {
  it("renders a node per row and a legend entry per present kind", async () => {
    backend.graph = populated;
    const { container } = render(<ResearchGraphView />);
    await screen.findByRole("img", { name: "Research graph" });

    // Each node renders its label twice — once in <title> for the hover
    // tooltip, once in <text> as the drawn label — so assert on the drawn one.
    // The claim is elided because it exceeds the node's width; the full text
    // stays in the tooltip.
    expect(drawnLabels(container)).toEqual([
      "figures/trend.png",
      "data/raw.csv",
      "The trend is significan…",
      "Check the axis units.",
    ]);
    expect(screen.getByText("The trend is significant.").tagName.toLowerCase()).toBe("title");
    // No memories in this graph, so no memory legend entry.
    expect(screen.queryByText("memory")).toBeNull();
  });

  it("says so when the graph is empty rather than rendering a blank canvas", async () => {
    backend.graph = { projectId: "proj_1", nodes: [], edges: [], truncated: false };
    render(<ResearchGraphView />);
    expect(await screen.findByText(/Nothing recorded yet/)).toBeInTheDocument();
  });

  it("warns when the read-model truncated the graph", async () => {
    backend.graph = { ...populated, truncated: true };
    render(<ResearchGraphView />);
    expect(await screen.findByText(/most recent items only/)).toBeInTheDocument();
  });

  it("renders nothing and never queries the database in the gateway web client", () => {
    mode.web = true;
    backend.graph = populated;
    const { container } = render(<ResearchGraphView />);
    // The science DB is workspace-local, so the web client has no route to it.
    expect(container).toBeEmptyDOMElement();
    expect(backend.calls).toBe(0);
  });

  it("drops an edge whose endpoint is not in the graph, so no line runs to nowhere", async () => {
    backend.graph = {
      ...populated,
      edges: [
        ...populated.edges,
        { from: "claim:clm_1", to: "artifact:av_missing", kind: "assesses" },
      ],
    };
    const { container } = render(<ResearchGraphView />);
    await screen.findByRole("img", { name: "Research graph" });
    // Three drawable edges; the fourth points at a node that was never placed.
    expect(container.querySelectorAll("svg path")).toHaveLength(3);
  });

  it("keeps labels full size at phone width and pans instead of shrinking", async () => {
    setViewportWidth(PHONE_WIDTH);
    backend.graph = populated;
    const { container } = render(<ResearchGraphView />);
    await screen.findByRole("img", { name: "Research graph" });

    const scroller = container.querySelector(".overflow-auto");
    expect(scroller).not.toBeNull();
    // The svg keeps its intrinsic width rather than being squeezed to the
    // viewport, which is what makes the labels stay readable.
    const svg = container.querySelector("svg");
    expect(Number(svg?.getAttribute("width"))).toBeGreaterThan(PHONE_WIDTH / 2);
  });

  it("surfaces a backend failure instead of showing a permanent spinner", async () => {
    const boom = new Error("database is locked");
    const mod = await import("@/lib/researchGraph");
    vi.spyOn(mod, "loadResearchGraph").mockRejectedValue(boom);
    render(<ResearchGraphView />);
    await waitFor(() => expect(screen.getByText("database is locked")).toBeInTheDocument());
  });
});
