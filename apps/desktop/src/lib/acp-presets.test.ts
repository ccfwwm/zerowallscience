import { describe, expect, it } from "vitest";
import { ACP_PRESETS, acpPresetById } from "./acp-presets";

describe("ACP presets", () => {
  it("ships Codex and Claude Code with stable ids", () => {
    expect(ACP_PRESETS.map((p) => p.id)).toEqual(["codex", "claude-code"]);
  });

  it("injects each agent's key by reference, never a value", () => {
    for (const p of ACP_PRESETS) {
      // A preset carries secret REFERENCES only: {envVar, providerId}. If a
      // literal key ever leaked into env, this shape check would catch it.
      expect(p.secrets?.length).toBeGreaterThan(0);
      for (const s of p.secrets ?? []) {
        expect(s.envVar).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(s.providerId).toBeTruthy();
      }
      expect(p.env ?? []).toEqual([]);
    }
  });

  it("maps each agent to the right provider key var", () => {
    expect(acpPresetById("codex")?.secrets).toEqual([
      { envVar: "OPENAI_API_KEY", providerId: "openai" },
    ]);
    expect(acpPresetById("claude-code")?.secrets).toEqual([
      { envVar: "ANTHROPIC_API_KEY", providerId: "anthropic" },
    ]);
  });

  it("runs Claude Code via npx --yes so a fresh install self-fetches", () => {
    const cc = acpPresetById("claude-code");
    expect(cc?.command).toBe("npx");
    expect(cc?.args).toEqual(["--yes", "@zed-industries/claude-code-acp"]);
  });

  it("returns undefined for an unknown id", () => {
    expect(acpPresetById("nope")).toBeUndefined();
  });
});
