import { describe, expect, it } from "vitest";
import { resolveSection, visibleSections } from "./sections";

const keys = (isWeb: boolean) => visibleSections(isWeb).map((s) => s.key);

/** Sections that drive local hardware/IPC the gateway cannot expose. */
const DESKTOP_ONLY = ["runtime", "connectors", "packs", "browser", "compute", "remote"];

describe("Settings navigation", () => {
  it("offers every section in the desktop app", () => {
    expect(keys(false)).toEqual([
      "account",
      "general",
      "appearance",
      "models",
      "usage",
      "runtime",
      "connectors",
      "packs",
      "browser",
      "compute",
      "remote",
      "privacy",
    ]);
  });

  it("drops the sections a browser cannot act on, and keeps the rest usable", () => {
    // Usage is pure display (no local IPC), so it stays in the web client.
    expect(keys(true)).toEqual(["account", "general", "appearance", "models", "usage", "privacy"]);
    for (const key of DESKTOP_ONLY) expect(keys(true)).not.toContain(key);
    // Every desktop-only key really exists on desktop — so this test fails if a
    // section is renamed on one side only.
    for (const key of DESKTOP_ONLY) expect(keys(false)).toContain(key);
  });

  it("lands on General when the URL names no section, or one that does not exist", () => {
    expect(resolveSection(undefined)).toBe("general");
    expect(resolveSection("")).toBe("general");
    expect(resolveSection("nope")).toBe("general");
    expect(resolveSection("privacy")).toBe("privacy");
  });
});
