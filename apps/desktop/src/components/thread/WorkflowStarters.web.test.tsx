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
  // The starter grid is shell-independent: every starter is a prompt the agent
  // runs inside the workspace, so the web client renders exactly what the
  // desktop does — no native-only row is ever hidden. With the default starters
  // removed the list is currently empty, so both modes render the same cards.
  it("offers every starter in web mode, unchanged from the desktop", () => {
    const { unmount } = render(<WorkflowStarters onPick={() => {}} />);
    const onDesktop = screen.queryAllByRole("button").map((b) => b.textContent);
    unmount();

    mode.web = true;
    render(<WorkflowStarters onPick={() => {}} />);
    expect(screen.queryAllByRole("button").map((b) => b.textContent)).toEqual(onDesktop);
    expect(onDesktop).toHaveLength(WORKFLOW_STARTERS.length);
  });

  it("keeps every starter reachable at phone width", () => {
    mode.web = true;
    // The card list is a single column with no fixed width; at 390px the
    // assertion that matters is that no starter hides behind a hover-only or
    // pointer-only affordance — each stays a plain, enabled button.
    window.innerWidth = 390;
    render(<WorkflowStarters onPick={() => {}} />);
    const buttons = screen.queryAllByRole("button");
    expect(buttons).toHaveLength(WORKFLOW_STARTERS.length);
    for (const button of buttons) {
      expect(button).toBeEnabled();
    }
  });
});
