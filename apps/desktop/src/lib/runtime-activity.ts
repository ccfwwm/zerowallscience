export interface RuntimeActivityInput {
  permissions?: readonly { action: string }[];
  threads?: Record<string, { blocks?: readonly unknown[] }>;
}

export interface RuntimeActivitySnapshot {
  mcpMutations: number;
  runActivities: number;
}

/** Derive update guards from the same normalized blocks and permission queue
 * used by the desktop runtime. Unknown block kinds are ignored deliberately. */
export function runtimeActivitySnapshot(state: RuntimeActivityInput): RuntimeActivitySnapshot {
  let mcpMutations = (state.permissions ?? []).filter((permission) => permission.action.toLowerCase().includes("mcp")).length;
  let runActivities = 0;

  for (const thread of Object.values(state.threads ?? {})) {
    for (const rawBlock of thread.blocks ?? []) {
      if (!rawBlock || typeof rawBlock !== "object") continue;
      const block = rawBlock as { kind?: unknown; tool?: unknown; status?: unknown; jobs?: unknown };
      if (block.kind === "running-jobs") {
        runActivities += Array.isArray(block.jobs) ? block.jobs.length : 0;
        continue;
      }
      if (block.kind === "tool-call" && (block.status === "running" || block.status === "pending") && typeof block.tool === "string" && block.tool.toLowerCase().includes("mcp")) {
        mcpMutations += 1;
      }
    }
  }

  return { mcpMutations, runActivities };
}
