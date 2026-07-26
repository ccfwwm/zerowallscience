import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunRecord } from "@zerowall/shared";
import type { RunPage, RunQuery } from "@/lib/runs";
import { PHONE_WIDTH, setViewportWidth } from "@/test/viewport";
import { RunsPage } from "./RunsPage";

const queryRuns = vi.fn();
vi.mock("@/lib/runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/runs")>()),
  queryRuns: (q: RunQuery) => queryRuns(q),
  readRunLog: () => Promise.resolve(""),
}));

vi.mock("@/lib/artifactFile", () => ({
  openArtifactExternally: vi.fn(),
}));

/** A run with every optional field populated — the widest row the ledger draws. */
const run: RunRecord = {
  runId: "run_ab12cd34",
  ts: 1751500000,
  sessionId: "ses_1",
  command: "python train.py --lr 3e-4 --epochs 200 --batch-size 512 --checkpoint-dir out/ckpt",
  status: "ok",
  wallMs: 8000,
  logHash: "cafe1234",
  code: [{ path: "train.py", hash: "aaaa", size: 512 }],
  outputs: [{ path: "output/metrics.json", hash: "bbbb", size: 64 }],
  env: {
    python: "3.11.4",
    platform: "linux-x86_64",
    app: "0.1.6",
    packages: { count: 51, hash: "deadbeef" },
    hardware: {
      cpu: "AMD EPYC 7742",
      cores: 64,
      memGb: 512,
      gpu: ["NVIDIA A100-SXM4-40GB"],
      accelerator: "cuda",
    },
  },
};

beforeEach(() => {
  queryRuns.mockReset();
  queryRuns.mockImplementation(
    (): Promise<RunPage> =>
      Promise.resolve({
        rows: [run, { ...run, runId: "run_failed", status: "failed", command: "python eval.py" }],
        total: 2,
        facets: {
          status: [
            { value: "ok", count: 1 },
            { value: "failed", count: 1 },
          ],
          surface: [{ value: "modal", count: 1 }],
        },
      }),
  );
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/runs"]}>
      <RunsPage />
    </MemoryRouter>,
  );

// The viewport width is reset to the desktop default by src/test/setup.ts.

describe("Runs ledger at phone width", () => {
  it("keeps the ledger usable on a phone: rows, filters, and search all present", async () => {
    setViewportWidth(PHONE_WIDTH);
    renderPage();

    // The ledger is the densest route in the app — a long command, a facet bar,
    // and a search box competing for 390px. Nothing may be dropped: this is not
    // a desktop-only surface, so the phone gets the whole thing.
    expect(await screen.findByText(/python train\.py --lr 3e-4/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^OK/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Failed/ })).toBeInTheDocument();
  });

  it("wraps the filter bar rather than pushing it off-screen", async () => {
    setViewportWidth(PHONE_WIDTH);
    renderPage();
    const search = await screen.findByPlaceholderText(/search/i);
    // The bar holds a flexible search field plus one chip per facet. It must
    // wrap: a nowrap row would push the last chips past the right edge with no
    // way to reach them, since the bar itself does not scroll.
    const bar = search.closest("div")!.parentElement!;
    expect(bar.className).toContain("flex-wrap");
  });

  it("filters from a phone the same way it does from a desktop", async () => {
    setViewportWidth(PHONE_WIDTH);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Failed/ }));
    // The tap reaches the backend as a status filter — the control is not merely
    // rendered at this width, it works.
    expect(queryRuns).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
