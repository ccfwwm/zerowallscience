import { describe, expect, it } from "vitest";
import { trafficLightsPresent } from "./tauri";

// The macOS traffic lights sit OVER our content in overlay-titlebar mode, so
// several headers add a ~78px left inset to clear them. In native fullscreen
// the lights hide — the inset then leaves a weird empty gap (the collapsed
// expand button and the sidebar's collapse button both floated indented).
describe("trafficLightsPresent (macOS overlay-titlebar inset)", () => {
  it("true only in the packaged macOS webview AND not fullscreen", () => {
    expect(trafficLightsPresent(true, true, false)).toBe(true);
  });

  it("false in fullscreen — the lights hide, so the inset would be a gap", () => {
    expect(trafficLightsPresent(true, true, true)).toBe(false);
  });

  it("false in a plain browser (pnpm dev) and on non-mac platforms", () => {
    expect(trafficLightsPresent(false, true, false)).toBe(false);
    expect(trafficLightsPresent(true, false, false)).toBe(false);
  });
});
