import { describe, expect, it } from "vitest";
import settings from "./settings.json";

describe("Simplified Chinese account copy", () => {
  it("uses the AI 云平台 product label", () => {
    expect(settings.providers.hintAcp).toContain("AI 云平台");
    expect(settings.sub2api.title).toBe("AI 云平台");
    expect(settings.sub2api.providerName).toBe("AI 云平台");
  });

  it("does not expose the internal gateway name in visible copy", () => {
    const visibleValues = JSON.stringify(Object.values(settings).flatMap((section) =>
      typeof section === "object" && section !== null ? Object.values(section) : [section],
    ));
    expect(visibleValues).not.toMatch(/Sub2API/i);
  });
});
