import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderAt } from "@/test/render";
import { useRuntimeStore } from "@/lib/runtime";

const original = {
  status: useRuntimeStore.getState().status,
  workflowRuns: useRuntimeStore.getState().workflowRuns,
  startWorkflow: useRuntimeStore.getState().startWorkflow,
  pauseWorkflow: useRuntimeStore.getState().pauseWorkflow,
  resumeWorkflow: useRuntimeStore.getState().resumeWorkflow,
  retryWorkflow: useRuntimeStore.getState().retryWorkflow,
  cancelWorkflow: useRuntimeStore.getState().cancelWorkflow,
  webReadOnly: useRuntimeStore.getState().webReadOnly,
};

afterEach(() => {
  useRuntimeStore.setState(original);
  vi.restoreAllMocks();
});

describe("WorkflowsPage", () => {
  it("lists the shipped workflows with concise launch actions", async () => {
    renderAt("/workflows");

    expect(await screen.findByRole("heading", { level: 1, name: "Workflows" })).toBeInTheDocument();
    expect(screen.getByText("Literature evidence review")).toBeInTheDocument();
    expect(screen.getByText("Paper search and deduplication")).toBeInTheDocument();
    expect(screen.getByText("Reproducible experiment")).toBeInTheDocument();
    expect(screen.getByText("Report generation")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Run workflow" })).toHaveLength(4);
  });

  it("shows node progress and exposes controls for a running workflow", async () => {
    const user = userEvent.setup();
    const pauseWorkflow = vi.fn(async () => {});
    const cancelWorkflow = vi.fn(async () => {});
    useRuntimeStore.setState({
      status: "ready",
      webReadOnly: false,
      workflowRuns: {
        run_1: {
          id: "run_1",
          workflowId: "literature-evidence-review",
          name: "Literature evidence review",
          state: "running",
          createdAt: "2026-08-07T00:00:00.000Z",
          updatedAt: "2026-08-07T00:00:00.000Z",
          nodes: {
            "collect-sources": {
              id: "collect-sources",
              kind: "agent",
              dependsOn: [],
              state: "completed",
              attempts: 1,
              bindingSnapshot: null,
              mcpAllowList: [],
              skillsSnapshot: [],
            },
            "check-evidence": {
              id: "check-evidence",
              kind: "review",
              dependsOn: ["collect-sources"],
              state: "running",
              attempts: 1,
              bindingSnapshot: null,
              mcpAllowList: [],
              skillsSnapshot: [],
            },
            "review-report": {
              id: "review-report",
              kind: "artifact",
              dependsOn: ["check-evidence"],
              state: "pending",
              attempts: 0,
              bindingSnapshot: null,
              mcpAllowList: [],
              skillsSnapshot: [],
            },
          },
        },
      },
      pauseWorkflow,
      cancelWorkflow,
    });

    renderAt("/workflows");

    expect(await screen.findByText("1/3 completed")).toBeInTheDocument();
    expect(screen.getByText("collect-sources")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause workflow" }));
    await vi.waitFor(() => expect(pauseWorkflow).toHaveBeenCalledWith("run_1"));
    await user.click(screen.getByRole("button", { name: "Cancel workflow" }));
    await vi.waitFor(() => expect(cancelWorkflow).toHaveBeenCalledWith("run_1"));
  });
});
