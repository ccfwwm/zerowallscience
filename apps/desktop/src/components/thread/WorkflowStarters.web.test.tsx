import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowStarters } from "./WorkflowStarters";

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

vi.mock("@/lib/tauri", () => ({
  isTauri: false,
  installExample: async () => {
    throw new Error("install_example is not reachable from the web client");
  },
}));

afterEach(() => {
  mode.web = false;
});

describe("Workflow starters in the gateway web client", () => {
  it("offers the example picker on the desktop, where files can be unpacked", () => {
    render(<WorkflowStarters onPick={() => {}} />);
    expect(screen.getByText("Explore an example project")).toBeInTheDocument();
  });

  // Without this the row would still render, install nothing, and send a prompt
  // naming files that were never unpacked — the agent would hunt for a README
  // that does not exist.
  it("hides the example picker in web mode instead of sending an unusable prompt", () => {
    mode.web = true;
    render(<WorkflowStarters onPick={() => {}} />);
    expect(screen.queryByText("Explore an example project")).toBeNull();
    // The starters that do work over the web are untouched.
    expect(screen.getByText("Analyze my data")).toBeInTheDocument();
    expect(screen.getByText("Run a demo analysis, end to end")).toBeInTheDocument();
  });
});
