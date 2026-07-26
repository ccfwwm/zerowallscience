import { afterEach, describe, expect, it, vi } from "vitest";

// `isGatewayWeb` is decided ONCE, when the module loads, from the flag the
// Remote Access gateway injects into index.html. So each case needs its own
// fresh module instance — hence resetModules + a dynamic import.
type WebFlag = { __OS_WEB__?: unknown };

async function loadWith(flag: unknown) {
  if (flag === undefined) delete (window as WebFlag).__OS_WEB__;
  else (window as WebFlag).__OS_WEB__ = flag;
  vi.resetModules();
  return import("./webMode");
}

afterEach(() => {
  delete (window as WebFlag).__OS_WEB__;
  localStorage.clear();
  vi.resetModules();
});

describe("gateway web mode detection", () => {
  it("runs as the full desktop app when nothing injected the web flag", async () => {
    expect((await loadWith(undefined)).isGatewayWeb).toBe(false);
  });

  it("switches to the web client when the gateway injected its flag", async () => {
    expect((await loadWith(true)).isGatewayWeb).toBe(true);
  });

  it("stays the desktop app for a flag that is merely truthy, not the real one", async () => {
    // Detection is strict `=== true`: a stray string/number from a mangled or
    // hand-edited page must not strip the desktop-only features and silently
    // downgrade the app.
    expect((await loadWith("true")).isGatewayWeb).toBe(false);
    expect((await loadWith(1)).isGatewayWeb).toBe(false);
  });
});

describe("shared link with a token", () => {
  it("signs the web client in from a copied link and scrubs the token from the address bar", async () => {
    const mod = await loadWith(true);
    window.location.hash = "#token=s3cret";
    mod.consumeUrlToken();

    expect(mod.gatewayToken()).toBe("s3cret");
    // The token must not stay in the URL — that URL gets shared, screenshotted,
    // and lands in history.
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("s3cret");
  });

  it("ignores a token in the URL on the desktop, where there is no gateway to authenticate to", async () => {
    const mod = await loadWith(undefined);
    window.location.hash = "#token=s3cret";
    mod.consumeUrlToken();

    expect(mod.gatewayToken()).toBeNull();
    window.location.hash = "";
  });
});
