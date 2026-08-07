import { describe, expect, it } from "vitest";
import { workflowActionsForState } from "./workflow-controls";

describe("workflow control affordances", () => {
  it("offers pause and cancel while a run is active", () => {
    expect(workflowActionsForState("running")).toEqual(["pause", "cancel"]);
    expect(workflowActionsForState("pending")).toEqual(["pause", "cancel"]);
  });

  it("offers resume and cancel for a paused run", () => {
    expect(workflowActionsForState("paused")).toEqual(["resume", "cancel"]);
  });

  it("offers retry and cancel for a failed run", () => {
    expect(workflowActionsForState("failed")).toEqual(["retry", "cancel"]);
  });

  it("does not expose controls after a terminal run", () => {
    expect(workflowActionsForState("completed")).toEqual([]);
    expect(workflowActionsForState("cancelled")).toEqual([]);
  });
});
