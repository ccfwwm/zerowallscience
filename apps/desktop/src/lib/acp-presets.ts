// Built-in ACP agent presets (Part C, Phase 6 groundwork; consumed by the
// Phase 5 runtime factory). An ACP agent is a generic `{id, label, command,
// args}` profile — ZeroWall ships no per-vendor adapter, only these two ready
// profiles plus whatever a user adds later via the config surface.
//
// The command strings are the agents' own published entry points:
//   Codex        → `codex-acp` (OpenAI's ACP bridge, on PATH after install).
//   Claude Code  → `npx @zed-industries/claude-code-acp` (Zed's ACP bridge).
//
// Secrets are injected by REFERENCE only: each preset names the env var the
// agent reads and the provider whose keychain-stored key supplies it. The key
// itself is materialized server-side at spawn (see acp_consumer.rs / AGENTS.md
// "API keys go to the OS keychain ... never into logs / git / exported
// projects"). Nothing here carries a secret value.
import type { AcpLaunchRequest } from "./acp";

/** A shippable ACP profile: a launch request the runtime can start as-is. */
export type AcpPreset = AcpLaunchRequest;

/** The two agents ZeroWall ships ready to launch. Order is display order. */
export const ACP_PRESETS: readonly AcpPreset[] = [
  {
    id: "codex",
    label: "Codex",
    command: "codex-acp",
    args: [],
    secrets: [{ envVar: "OPENAI_API_KEY", providerId: "openai" }],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    command: "npx",
    args: ["--yes", "@zed-industries/claude-code-acp"],
    secrets: [{ envVar: "ANTHROPIC_API_KEY", providerId: "anthropic" }],
  },
] as const;

/** Look up a preset by its stable id; undefined for an unknown id. */
export function acpPresetById(id: string): AcpPreset | undefined {
  return ACP_PRESETS.find((p) => p.id === id);
}
