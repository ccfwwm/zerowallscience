import { describe, expect, it } from "vitest";
import { contextPercent, formatCost, formatCount } from "./usageFormat";

describe("formatCount", () => {
  it("groups large integers with the given locale's thousands separator", () => {
    expect(formatCount(1234567, "en-US")).toBe("1,234,567");
    expect(formatCount(1234567, "de-DE")).toBe("1.234.567");
  });

  it("rounds and floors at zero — never a negative or fractional count", () => {
    expect(formatCount(41.6, "en-US")).toBe("42");
    expect(formatCount(-5, "en-US")).toBe("0");
    expect(formatCount(0, "en-US")).toBe("0");
  });
});

describe("formatCost", () => {
  it("renders USD to four decimals for a priced reply", () => {
    expect(formatCost(0.0021)).toBe("$0.0021");
    expect(formatCost(1.5)).toBe("$1.5000");
  });

  it("shows an em dash for an unpriced reply (null / undefined), never $0", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("keeps a real, priced-but-free $0 distinct from unpriced", () => {
    expect(formatCost(0)).toBe("$0.0000");
  });
});

describe("contextPercent", () => {
  it("is the whole-number input/window fill", () => {
    expect(contextPercent(64000, 128000)).toBe(50);
    expect(contextPercent(1, 1000)).toBe(0);
  });

  it("clamps to [0, 100] when the input exceeds the window", () => {
    expect(contextPercent(200000, 128000)).toBe(100);
  });

  it("returns null when the window is unknown (0 / undefined) — caller drops ctx", () => {
    expect(contextPercent(1000, undefined)).toBeNull();
    expect(contextPercent(1000, 0)).toBeNull();
  });
});
