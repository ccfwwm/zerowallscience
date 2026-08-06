import { describe, expect, it } from "vitest";
import { ACP_PRESETS, acpPresetById } from "./acp-presets";

describe("ACP presets", () => {
  it("ships Codex and Claude Code with stable ids", () => {
    expect(ACP_PRESETS.map((p) => p.id)).toEqual(["codex", "claude-code"]);
  });

  it("keeps command and secret material owned by the native host", () => {
    for (const p of ACP_PRESETS) {
      expect(p.adapterVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(p).not.toHaveProperty("command");
      expect(p).not.toHaveProperty("secrets");
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(acpPresetById("nope")).toBeUndefined();
  });
});
