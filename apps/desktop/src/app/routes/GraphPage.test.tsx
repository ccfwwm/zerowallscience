import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PHONE_WIDTH, setViewportWidth } from "@/test/viewport";
import { GraphPage } from "./GraphPage";

// `isGatewayWeb` is a load-time constant; swap it for a switch so one render can
// be compared against the other mode's.
const mode = vi.hoisted(() => ({ web: false }));
vi.mock("@/lib/webMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webMode")>()),
  get isGatewayWeb() {
    return mode.web;
  },
}));

const graph = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/researchGraph", () => ({
  loadResearchGraph: () => {
    graph.calls += 1;
    return Promise.resolve({ nodes: [], edges: [], truncated: false });
  },
}));

const provenance = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/provenance", () => ({
  provenanceSummary: () => {
    provenance.calls += 1;
    return Promise.resolve([
      {
        path: "report.md",
        versions: 2,
        latestVersion: 2,
        lastTs: 1751500000,
        tools: ["write"],
        sessionIds: ["ses_1"],
        fromRun: false,
        envComplete: true,
      },
    ]);
  },
  listProvenance: () => Promise.resolve([]),
  readEnvLockfile: vi.fn(),
}));

vi.mock("@/lib/runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/runs")>()),
  listRuns: () => Promise.resolve([]),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <GraphPage />
    </MemoryRouter>,
  );

// The viewport width is reset to the desktop default by src/test/setup.ts.
afterEach(() => {
  mode.web = false;
  graph.calls = 0;
  provenance.calls = 0;
});

describe("GraphPage", () => {
  it("shows both project-level views on the desktop", async () => {
    renderPage();
    expect(await screen.findByText("report.md")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Artifact provenance" })).toBeInTheDocument();
    expect(graph.calls).toBe(1);
  });

  it("explains why the page is unavailable in the web client instead of looking empty", async () => {
    mode.web = true;
    renderPage();
    // The distinction that matters: the page must not assert the project has no
    // provenance when the real reason is that this client cannot read it.
    expect(await screen.findByText(/the web client has no route to/i)).toBeInTheDocument();
    expect(screen.queryByText(/no artifact in this workspace has recorded provenance/i)).toBeNull();
    // Neither backend is even reached — the route is hidden in the sidebar, so a
    // web visitor arriving here by URL should cost nothing.
    expect(graph.calls).toBe(0);
    expect(provenance.calls).toBe(0);
  });

  it("still renders both views at phone width", async () => {
    setViewportWidth(PHONE_WIDTH);
    renderPage();
    expect(await screen.findByText("report.md")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Artifact provenance" })).toBeInTheDocument();
  });
});
