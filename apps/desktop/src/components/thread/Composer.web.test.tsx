import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

// `isGatewayWeb` is a load-time constant (see webMode.test.ts for how it is
// derived from the gateway's injected flag). Swap it for a switch so both modes
// can be asserted side by side.
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

const props = { onSend: () => {}, approvalMode: "approve" as const, onApprovalModeChange: () => {} };

describe("Composer in the gateway web client", () => {
  it("lets the desktop user change how agent actions get approved", () => {
    render(<Composer {...props} />);
    expect(screen.getByLabelText("Approval mode")).toHaveTextContent("Approve for me");
  });

  it("does not let a browser client loosen approvals — that stays on the host machine", () => {
    mode.web = true;
    render(<Composer {...props} />);
    expect(screen.queryByLabelText("Approval mode")).toBeNull();
    // Everything else the composer does still works over the gateway.
    expect(screen.getByLabelText("Ask anything")).toBeInTheDocument();
    expect(screen.getByLabelText("Send")).toBeInTheDocument();
  });
});
