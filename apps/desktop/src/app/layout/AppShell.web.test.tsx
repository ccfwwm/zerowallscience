import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "@/test/render";
import { clearGatewayToken, setGatewayToken } from "@/lib/webMode";

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
  clearGatewayToken();
});

describe("Gateway web client sign-in", () => {
  it("shows nothing but the token prompt until the browser client is authenticated", async () => {
    mode.web = true;
    renderAt("/files");

    expect(await screen.findByRole("heading", { name: "Remote Access" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Access token")).toBeInTheDocument();
    // No workspace leaks out behind the gate.
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByText("Sessions")).toBeNull();
  });

  it("opens the workspace once the browser client has a token", async () => {
    mode.web = true;
    setGatewayToken("test-token");
    renderAt("/files");

    expect(await screen.findByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Access token")).toBeNull();
  });

  it("never asks the desktop app for a token", async () => {
    renderAt("/files");
    expect(await screen.findByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Access token")).toBeNull();
  });
});
