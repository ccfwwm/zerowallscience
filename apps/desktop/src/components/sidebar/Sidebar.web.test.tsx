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
  it("keeps research capabilities out of the desktop primary navigation", async () => {
    renderAt("/files");
    const nav = await screen.findByRole("navigation");
    for (const label of ["Research tools", "Notebooks", "Files", "Runs", "Research Graph", "Review", "Skills"]) {
      expect(within(nav).queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("keeps research capabilities out of the web primary navigation", async () => {
    signedInWebClient();
    renderAt("/files");
    const nav = await screen.findByRole("navigation");
    for (const label of ["Research tools", "Notebooks", "Files", "Runs", "Research Graph", "Review", "Skills"]) {
      expect(within(nav).queryByRole("button", { name: label })).toBeNull();
    }
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
