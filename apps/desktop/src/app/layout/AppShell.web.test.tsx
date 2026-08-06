import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
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

vi.mock("@/components/auth/DesktopLoginGate", () => ({
  DesktopLoginGate: ({ children }: { children: ReactNode }) => (
    <div data-testid="desktop-login-gate">{children}</div>
  ),
}));

vi.mock("@/components/environment/DesktopEnvironmentGate", () => ({
  DesktopEnvironmentGate: ({ children }: { children: ReactNode }) => (
    <div data-testid="desktop-environment-gate">{children}</div>
  ),
}));

afterEach(() => {
  mode.web = false;
  clearGatewayToken();
});

describe("Gateway web client sign-in", () => {
  it("checks the managed desktop environment before the optional cloud login", async () => {
    renderAt("/files");

    const environmentGate = await screen.findByTestId("desktop-environment-gate");
    expect(environmentGate).toContainElement(screen.getByTestId("desktop-login-gate"));
  });

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
