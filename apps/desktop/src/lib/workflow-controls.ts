import type { WorkflowRunState } from "@zerowall/sdk";

export type WorkflowAction = "pause" | "resume" | "retry" | "cancel";

export function workflowActionsForState(state: WorkflowRunState): WorkflowAction[] {
  if (state === "pending" || state === "running") return ["pause", "cancel"];
  if (state === "paused") return ["resume", "cancel"];
  if (state === "failed") return ["retry", "cancel"];
  return [];
}
