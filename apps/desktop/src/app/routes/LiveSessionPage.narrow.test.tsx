import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "@/test/render";
import { setGatewayToken, clearGatewayToken } from "@/lib/webMode";
import { PHONE_WIDTH, setViewportWidth } from "@/test/viewport";

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

/** Controls that only exist when panes can be tiled. `group.splitRight` /
 *  `group.splitDown` carry a long "— open a new session …" tail. */
const SPLIT_RIGHT = /^Split right/;
const SPLIT_DOWN = /^Split down/;

describe("Live session surface where tiling cannot work", () => {
  it("gives a desktop window the screen tabs and the split controls", async () => {
    renderAt("/live");
    expect(await screen.findByLabelText(SPLIT_RIGHT)).toBeInTheDocument();
    expect(screen.getByLabelText(SPLIT_DOWN)).toBeInTheDocument();
    expect(screen.getByLabelText("New screen")).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom this pane")).toBeInTheDocument();
  });

  it("shows a phone one session at a time, with no way to tile it", async () => {
    setViewportWidth(PHONE_WIDTH);
    renderAt("/live");

    // The session itself is fully usable — it is only the tiling chrome that goes.
    expect(await screen.findByLabelText("Ask anything")).toBeInTheDocument();
    expect(screen.queryByLabelText(SPLIT_RIGHT)).toBeNull();
    expect(screen.queryByLabelText(SPLIT_DOWN)).toBeNull();
    expect(screen.queryByLabelText("New screen")).toBeNull();
    expect(screen.queryByLabelText("Zoom this pane")).toBeNull();
  });

  it("shows the browser client one session at a time too, whatever the window size", async () => {
    mode.web = true;
    setGatewayToken("test-token");
    renderAt("/live");

    expect(await screen.findByLabelText("Ask anything")).toBeInTheDocument();
    expect(screen.queryByLabelText(SPLIT_RIGHT)).toBeNull();
    expect(screen.queryByLabelText("New screen")).toBeNull();
  });
});

describe("App shell at phone width", () => {
  it("keeps the sidebar out of the way behind a hamburger on a phone", async () => {
    setViewportWidth(PHONE_WIDTH);
    renderAt("/files");
    // The drawer starts closed and the only way in is the top-bar toggle.
    expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("lays the sidebar into the page on a desktop window", async () => {
    // Collapsing is a persisted user choice, so the expand button is not what
    // separates the two. The layout is: a phone floats the sidebar over the
    // content as a drawer (`fixed`), a desktop window gives it its own column
    // in the flex row (`shrink-0`), so content is never covered.
    renderAt("/files");
    const shell = (await screen.findByRole("complementary")).parentElement!;
    expect(shell.className).toContain("shrink-0");
    expect(shell.className).not.toContain("fixed");
  });

  it("floats the sidebar over the content as a drawer on a phone", async () => {
    setViewportWidth(PHONE_WIDTH);
    renderAt("/files");
    const shell = (await screen.findByRole("complementary")).parentElement!;
    expect(shell.className).toContain("fixed");
    expect(shell.className).not.toContain("shrink-0");
  });
});
