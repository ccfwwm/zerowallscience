import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "@/test/render";
import { clearGatewayToken, setGatewayToken } from "@/lib/webMode";

// `isGatewayWeb` is a load-time constant (see webMode.test.ts for how it is
// derived from the gateway's injected flag). Swap it for a switch so one render
// can be compared against the other mode's.
const mode = vi.hoisted(() => ({ web: false }));
vi.mock("@/lib/webMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webMode")>()),
  get isGatewayWeb() {
    return mode.web;
  },
}));

/** Web client, past the token gate — AppShell renders nothing else until then. */
function signedInWebClient() {
  mode.web = true;
  setGatewayToken("test-token");
}

afterEach(() => {
  mode.web = false;
  clearGatewayToken();
});

describe("Sidebar in the gateway web client", () => {
  it("offers Notebooks in the desktop app", async () => {
    renderAt("/files");
    expect(await screen.findByRole("button", { name: "Notebooks" })).toBeInTheDocument();
  });

  it("drops Notebooks in the browser, where there is no local kernel to run them", async () => {
    signedInWebClient();
    renderAt("/files");
    // The rest of the nav is intact — only the kernel-backed entry is gone.
    expect(await screen.findByRole("button", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Runs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notebooks" })).toBeNull();
  });

  it("offers the Research Graph in the desktop app", async () => {
    renderAt("/files");
    expect(await screen.findByRole("button", { name: "Research Graph" })).toBeInTheDocument();
  });

  it("drops the Research Graph in the browser, which has no route to the local science database", async () => {
    signedInWebClient();
    renderAt("/files");
    expect(await screen.findByRole("button", { name: "Files" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Research Graph" })).toBeNull();
  });

  it("offers the add-project control in the desktop app", async () => {
    renderAt("/files");
    // Matched by aria-label, so this is the header [+] menu trigger — not the
    // "New project" ghost row, which carries the same text but no label.
    expect(await screen.findByLabelText("New project")).not.toHaveClass("hidden");
  });

  it("puts the add-project control out of reach in the browser (no host filesystem)", async () => {
    signedInWebClient();
    renderAt("/files");
    // jsdom loads no Tailwind, so the `hidden` class is the observable signal
    // that the control is styled off-screen.
    expect(await screen.findByLabelText("New project")).toHaveClass("hidden");
  });

  it("lists every settings section in the desktop app", async () => {
    renderAt("/settings");
    const nav = await screen.findByRole("navigation");
    for (const label of ["Runtime", "Connectors", "Science Packs", "Browser", "Compute", "Remote Access"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("hides the settings sections a browser cannot act on, keeping the ones it can", async () => {
    signedInWebClient();
    renderAt("/settings");
    const nav = await screen.findByRole("navigation");
    for (const label of ["General", "Appearance", "Models", "Privacy"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    for (const label of ["Runtime", "Connectors", "Science Packs", "Browser", "Compute", "Remote Access"]) {
      expect(within(nav).queryByRole("link", { name: label })).toBeNull();
    }
  });
});
