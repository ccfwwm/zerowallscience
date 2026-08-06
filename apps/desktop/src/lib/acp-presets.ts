// Stable identifiers for the ACP runtimes bundled with ZeroWall Science.
// Commands, arguments, environment variables, and secret references are owned
// by Rust and cannot be supplied by the renderer.

export interface AcpPreset {
  id: "codex" | "claude-code";
  label: string;
  adapterVersion: string;
}

export const ACP_PRESETS: readonly AcpPreset[] = [
  { id: "codex", label: "Codex", adapterVersion: "1.1.9" },
  { id: "claude-code", label: "Claude Code", adapterVersion: "0.16.1" },
] as const;

export function acpPresetById(id: string): AcpPreset | undefined {
  return ACP_PRESETS.find((preset) => preset.id === id);
}
