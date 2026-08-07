import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRuntimeStore } from "@/lib/runtime";
import { WorkflowRunApprovalDialog } from "./WorkflowRunApprovalDialog";

const original = {
  workflowRunApproval: useRuntimeStore.getState().workflowRunApproval,
  replyWorkflowRunApproval: useRuntimeStore.getState().replyWorkflowRunApproval,
};

afterEach(() => {
  act(() => useRuntimeStore.setState(original));
  vi.restoreAllMocks();
});

describe("WorkflowRunApprovalDialog", () => {
  it("shows the pending local recipe and resolves an explicit approval", async () => {
    const replyWorkflowRunApproval = vi.fn();
    useRuntimeStore.setState({
      workflowRunApproval: {
        runId: "run-1",
        runName: "Reproducible experiment",
        language: "python",
        notebook: "analysis.ipynb",
        code: "print(42)",
      },
      replyWorkflowRunApproval,
    });
    const user = userEvent.setup();

    render(<WorkflowRunApprovalDialog />);

    expect(screen.getByRole("alertdialog", { name: "Approve workflow run" })).toBeInTheDocument();
    expect(screen.getByText(/python.*analysis\.ipynb/i)).toBeInTheDocument();
    expect(screen.getByText("print(42)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run code" }));
    expect(replyWorkflowRunApproval).toHaveBeenCalledWith(true);
  });

  it("rejects the pending recipe from the safe default button", async () => {
    const replyWorkflowRunApproval = vi.fn();
    useRuntimeStore.setState({
      workflowRunApproval: {
        runId: "run-2",
        runName: "Reproducible experiment",
        language: "r",
        code: "print(42)",
      },
      replyWorkflowRunApproval,
    });
    const user = userEvent.setup();

    render(<WorkflowRunApprovalDialog />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(replyWorkflowRunApproval).toHaveBeenCalledWith(false);
  });
});
