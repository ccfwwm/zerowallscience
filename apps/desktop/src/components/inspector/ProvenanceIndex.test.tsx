import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactSummary } from "@/lib/provenance";
import { ProvenanceIndex } from "./ProvenanceIndex";

const provenanceSummary = vi.fn();
const listProvenance = vi.fn();
vi.mock("@/lib/provenance", () => ({
  provenanceSummary: () => provenanceSummary(),
  listProvenance: (path: string) => listProvenance(path),
  readEnvLockfile: vi.fn(),
}));

vi.mock("@/lib/runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/runs")>()),
  listRuns: () => Promise.resolve([]),
}));

function summary(over: Partial<ArtifactSummary> = {}): ArtifactSummary {
  return {
    path: "report.md",
    versions: 1,
    latestVersion: 1,
    lastTs: 1751500000,
    tools: ["write"],
    sessionIds: ["ses_1"],
    fromRun: false,
    envComplete: true,
    ...over,
  };
}

const renderIndex = () =>
  render(
    <MemoryRouter>
      <ProvenanceIndex />
    </MemoryRouter>,
  );

beforeEach(() => {
  provenanceSummary.mockReset();
  listProvenance.mockReset();
  listProvenance.mockResolvedValue([]);
});

describe("ProvenanceIndex", () => {
  it("says nothing is recorded rather than showing an empty list", async () => {
    provenanceSummary.mockResolvedValue([]);
    renderIndex();
    expect(await screen.findByText(/no artifact in this workspace has recorded provenance/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists each artifact once with its version count and producing tools", async () => {
    provenanceSummary.mockResolvedValue([
      summary({ path: "fig/plot.py", versions: 3, latestVersion: 3, tools: ["edit", "write"] }),
      summary({ path: "report.md" }),
    ]);
    renderIndex();
    expect(await screen.findByText("fig/plot.py")).toBeInTheDocument();
    expect(screen.getByText("report.md")).toBeInTheDocument();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    expect(screen.getByText("edit · write")).toBeInTheDocument();
    // Singular and plural come from real plural keys, not a hardcoded "(s)".
    expect(screen.getByText("1 version")).toBeInTheDocument();
  });

  it("flags an artifact whose versions did not all record an environment", async () => {
    provenanceSummary.mockResolvedValue([
      summary({ path: "traceable.md", envComplete: true }),
      summary({ path: "gap.md", envComplete: false }),
    ]);
    renderIndex();
    await screen.findByText("gap.md");
    // One row is flagged, and — the part that matters — only one. A warning on
    // every row would carry no information.
    expect(screen.getAllByText("environment gap")).toHaveLength(1);
  });

  it("marks which artifacts have a re-runnable recipe behind them", async () => {
    provenanceSummary.mockResolvedValue([
      summary({ path: "computed.csv", fromRun: true }),
      summary({ path: "authored.md", fromRun: false }),
    ]);
    renderIndex();
    await screen.findByText("computed.csv");
    expect(screen.getAllByText("run-backed")).toHaveLength(1);
  });

  it("loads one artifact's full history only when it is expanded", async () => {
    provenanceSummary.mockResolvedValue([summary({ path: "fig/plot.py" })]);
    listProvenance.mockResolvedValue([
      { path: "fig/plot.py", version: 1, ts: 1751500000, tool: "write", content: "print(1)" },
    ]);
    renderIndex();
    const row = await screen.findByRole("button", { name: /fig\/plot\.py/ });
    // Collapsed: the per-artifact store read has not happened. This is why the
    // index is cheap on a project with hundreds of artifacts.
    expect(listProvenance).not.toHaveBeenCalled();

    await userEvent.click(row);
    expect(listProvenance).toHaveBeenCalledWith("fig/plot.py");
    expect(row).toHaveAttribute("aria-expanded", "true");
  });

  it("filters by path once the list is long enough to need it", async () => {
    // The search box appears above 6 rows; below that it would cost space
    // without earning it.
    provenanceSummary.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => summary({ path: i === 0 ? "figures/plot.py" : `notes/n${i}.md` })),
    );
    renderIndex();
    const box = await screen.findByLabelText("Filter by path");
    await userEvent.type(box, "figures");
    expect(screen.getByText("figures/plot.py")).toBeInTheDocument();
    expect(screen.queryByText("notes/n1.md")).toBeNull();

    await userEvent.clear(box);
    await userEvent.type(box, "nothing-matches-this");
    expect(screen.getByText(/no artifact path matches/i)).toBeInTheDocument();
  });

  it("omits the filter box for a list short enough to read at a glance", async () => {
    provenanceSummary.mockResolvedValue([summary()]);
    renderIndex();
    await screen.findByText("report.md");
    expect(screen.queryByLabelText("Filter by path")).toBeNull();
  });
});
