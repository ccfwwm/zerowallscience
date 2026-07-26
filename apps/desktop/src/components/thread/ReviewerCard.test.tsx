import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHONE_WIDTH, setViewportWidth } from "@/test/viewport";
import { ReviewerCard } from "./ReviewerCard";

// `canPersistReview` is a load-time constant (isTauri && !isGatewayWeb), and the
// three bridge calls invoke Rust. Swap them for a switch plus an in-memory store
// so the desktop path and the web/browser read-only path can both be asserted.
const bridge = vi.hoisted(() => ({
  persistable: false,
  findings: [] as { claimId: string; status: string; resolution: string | null; resolvedAt: string | null }[],
  calls: [] as string[],
}));

vi.mock("@/lib/review", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/review")>();
  const snapshot = () => ({ runId: "rrun_test", findings: bridge.findings.map((f) => ({ ...f })) });
  return {
    ...mod,
    get canPersistReview() {
      return bridge.persistable;
    },
    syncReview: vi.fn(async () => {
      bridge.calls.push("sync");
      return bridge.persistable ? snapshot() : null;
    }),
    resolveClaim: vi.fn(async (claimId: string, action: string) => {
      bridge.calls.push(`resolve:${claimId}:${action}`);
      const target = bridge.findings.find((f) => f.claimId === claimId);
      if (target) {
        target.status = "resolved";
        target.resolution = action;
        target.resolvedAt = "2026-07-26T00:00:00.000Z";
      }
      return snapshot();
    }),
    reopenClaim: vi.fn(async (claimId: string) => {
      bridge.calls.push(`reopen:${claimId}`);
      const target = bridge.findings.find((f) => f.claimId === claimId);
      // Reopen keeps the resolution history — only the status moves.
      if (target) target.status = "open";
      return snapshot();
    }),
  };
});

const block = {
  kind: "reviewer" as const,
  findings: [
    {
      level: "warn" as const,
      title: "Duplicate PMID in plan",
      evidence: "same PMID for two papers",
      check: "citation" as const,
    },
    { level: "error" as const, title: "Figure older than its code", check: "figure" as const },
  ],
};

/** Two open claims, as the store returns them for `block`. */
function openClaims() {
  return [
    { claimId: "claim_a", status: "open", resolution: null, resolvedAt: null },
    { claimId: "claim_b", status: "open", resolution: null, resolvedAt: null },
  ];
}

/** Render and let the mount effect's load settle, so assertions see the card in
 *  the state a user would. */
async function renderCard(sessionId?: string | null) {
  render(<ReviewerCard block={block} sessionId={sessionId} />);
  await settle();
}

/** Flush the pending bridge promises. The resolve/reopen handlers await a round
 *  trip before setting state, which lands after userEvent's own act scope. */
async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  bridge.persistable = false;
  bridge.findings = [];
  bridge.calls = [];
});

describe("ReviewerCard", () => {
  it("shows finding badges, check tags, and titles, expanded by default", () => {
    render(<ReviewerCard block={block} />);
    expect(screen.getByText("Warn")).toBeInTheDocument();
    expect(screen.getByText("Duplicate PMID in plan")).toBeInTheDocument();
    expect(screen.getByText("same PMID for two papers")).toBeInTheDocument();
    expect(screen.getByText("citation")).toBeInTheDocument();
    expect(screen.getByText("figure ↔ code")).toBeInTheDocument();
    expect(screen.getByText("· 2 findings")).toBeInTheDocument();
  });

  it("collapses when the header is clicked", async () => {
    render(<ReviewerCard block={block} />);
    await userEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByText("same PMID for two papers")).not.toBeInTheDocument();
  });

  it("dismisses findings one by one", async () => {
    render(<ReviewerCard block={block} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss finding: Duplicate PMID in plan" }),
    );
    expect(screen.queryByText("Duplicate PMID in plan")).not.toBeInTheDocument();
    expect(screen.getByText("· 1 finding · 1 dismissed")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss finding: Figure older than its code" }),
    );
    expect(screen.getByText("All findings dismissed.")).toBeInTheDocument();
  });
});

describe("ReviewerCard persistence", () => {
  it("renders read-only, with no resolve control, when the science DB is out of reach", async () => {
    // The gateway web client (and browser dev): the DB is a file inside the
    // workspace, so a resolve control would be a button that cannot work.
    await renderCard("ses_1");

    expect(screen.getByText("Duplicate PMID in plan")).toBeInTheDocument();
    expect(screen.getByText("same PMID for two papers")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(bridge.calls).toEqual([]);
  });

  it("resolves a persisted finding and keeps the other one open", async () => {
    bridge.persistable = true;
    bridge.findings = openClaims();
    await renderCard("ses_1");

    const select = screen.getByLabelText("Resolve finding: Duplicate PMID in plan");
    await userEvent.selectOptions(select, "verified");
    await settle();

    expect(screen.getByText("Resolved · Verified")).toBeInTheDocument();
    expect(bridge.calls).toContain("resolve:claim_a:verified");
    // Positional mapping: only the first claim moved.
    expect(
      screen.getByLabelText("Resolve finding: Figure older than its code"),
    ).toBeInTheDocument();
  });

  it("reopens a resolved finding and still shows the last verdict", async () => {
    bridge.persistable = true;
    bridge.findings = openClaims();
    await renderCard("ses_1");

    await userEvent.selectOptions(
      screen.getByLabelText("Resolve finding: Duplicate PMID in plan"),
      "refuted",
    );
    await settle();
    expect(screen.getByText("Resolved · Refuted")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Reopen finding: Duplicate PMID in plan"));
    await settle();

    expect(screen.getByLabelText("Resolve finding: Duplicate PMID in plan")).toBeInTheDocument();
    expect(bridge.calls).toContain("reopen:claim_a");
    // The resolution row survives the reopen, so the card can say what it was.
    expect(screen.getByText("Previously Refuted")).toBeInTheDocument();
  });

  it("does not persist without a session to hang the claims off", async () => {
    bridge.persistable = true;
    bridge.findings = openClaims();
    await renderCard(); // no sessionId prop
    expect(screen.getByText("Duplicate PMID in plan")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(bridge.calls).toEqual([]);
  });

  it("keeps the resolve control usable at phone width", async () => {
    setViewportWidth(PHONE_WIDTH);
    bridge.persistable = true;
    bridge.findings = openClaims();
    await renderCard("ses_1");

    const select = screen.getByLabelText("Resolve finding: Duplicate PMID in plan");
    await userEvent.selectOptions(select, "conditional");
    await settle();
    expect(screen.getByText("Resolved · Conditional")).toBeInTheDocument();
    expect(screen.getByLabelText("Reopen finding: Duplicate PMID in plan")).toBeInTheDocument();
  });
});
