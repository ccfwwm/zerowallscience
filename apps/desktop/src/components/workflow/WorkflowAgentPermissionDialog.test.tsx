import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRuntimeStore } from "@/lib/runtime";
import { WorkflowAgentPermissionDialog } from "./WorkflowAgentPermissionDialog";

const original = {
  workflowAgentPermission: useRuntimeStore.getState().workflowAgentPermission,
  replyWorkflowAgentPermission: useRuntimeStore.getState().replyWorkflowAgentPermission,
};

afterEach(() => {
  act(() => useRuntimeStore.setState(original));
  vi.restoreAllMocks();
});

describe("WorkflowAgentPermissionDialog", () => {
  it("shows the requested capability and preserves the real allow option id", async () => {
    const replyWorkflowAgentPermission = vi.fn();
    useRuntimeStore.setState({
      workflowAgentPermission: {
        runId: "run-1",
        runName: "Evidence review",
        nodeId: "review-agent",
        action: "papers_save_note",
        resources: ["mcp:papers:save_note"],
        options: [
          { id: "allow_once", label: "Allow once" },
          { id: "deny", label: "Deny" },
        ],
      },
      replyWorkflowAgentPermission,
    });
    const user = userEvent.setup();

    render(<WorkflowAgentPermissionDialog />);

    expect(screen.getByRole("alertdialog", { name: "Workflow permission" })).toBeInTheDocument();
    expect(screen.getByText(/Evidence review.*review-agent.*papers save note/i)).toBeInTheDocument();
    expect(screen.getByText("mcp:papers:save_note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Allow once" }));
    expect(replyWorkflowAgentPermission).toHaveBeenCalledWith("allow_once");
  });

  it("rejects on escape and when the backdrop is clicked", async () => {
    const replyWorkflowAgentPermission = vi.fn();
    useRuntimeStore.setState({
      workflowAgentPermission: {
        runId: "run-2",
        runName: "Review",
        nodeId: "agent",
        action: "filesystem_write",
        resources: [],
        options: [{ id: "allow", label: "Allow" }],
      },
      replyWorkflowAgentPermission,
    });
    const user = userEvent.setup();

    const { rerender } = render(<WorkflowAgentPermissionDialog />);
    await user.keyboard("{Escape}");
    expect(replyWorkflowAgentPermission).toHaveBeenCalledWith(null);

    replyWorkflowAgentPermission.mockClear();
    rerender(<WorkflowAgentPermissionDialog />);
    await user.click(screen.getByRole("presentation"));
    expect(replyWorkflowAgentPermission).toHaveBeenCalledWith(null);
  });
});
