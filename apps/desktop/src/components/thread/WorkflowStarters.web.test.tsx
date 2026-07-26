import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKFLOW_STARTERS, WorkflowStarters } from "./WorkflowStarters";

// `isGatewayWeb` is a load-time constant; swap it for a switch so both modes can
// be asserted side by side. See FilePreviewInspector.web.test.tsx for the same
// pattern.
const mode = vi.hoisted(() => ({ web: false }));
vi.mock("@/lib/webMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webMode")>()),
  get isGatewayWeb() {
    return mode.web;
  },
}));

afterEach(() => {
  mode.web = false;
});

describe("Workflow starters in the gateway web client", () => {
  // This file used to assert that the example-project row was hidden over the
  // web, because installing one needed a native command. The row is gone, and
  // what replaced it is deliberately shell-independent: every starter is a
  // prompt the agent runs inside the workspace, so the web client gets the same
  // on-ramp as the desktop rather than a shorter one.
  it("offers every starter in web mode, unchanged from the desktop", () => {
    const { unmount } = render(<WorkflowStarters onPick={() => {}} />);
    const onDesktop = screen.getAllByRole("button").map((b) => b.textContent);
    unmount();

    mode.web = true;
    render(<WorkflowStarters onPick={() => {}} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(onDesktop);
    expect(onDesktop).toHaveLength(WORKFLOW_STARTERS.length);
  });

  it("keeps the cards reachable at phone width", () => {
    mode.web = true;
    // The card list is a single column with no fixed width, so the assertion
    // that matters at 390px is that nothing is hidden behind a hover-only or
    // pointer-only affordance: each starter stays a plain button.
    window.innerWidth = 390;
    render(<WorkflowStarters onPick={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(WORKFLOW_STARTERS.length);
    for (const button of buttons) {
      expect(button).toBeEnabled();
    }
  });
});
