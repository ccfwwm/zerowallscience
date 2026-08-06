import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_STARTERS, WorkflowStarters } from "./WorkflowStarters";

describe("WorkflowStarters", () => {
  it("ships the four built-in research workflow starters", () => {
    expect(WORKFLOW_STARTERS.map((starter) => [starter.id, starter.workflowId])).toEqual([
      ["literature", "literature-evidence-review"],
      ["search", "paper-search-deduplication"],
      ["reproducible", "reproducible-experiment"],
      ["report", "report-generation"],
    ]);
  });

  it("renders each workflow as a compact, clickable starter", () => {
    render(<WorkflowStarters onPick={() => {}} />);
    expect(screen.getByText("What should we look into?")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByText("Review the literature with citations")).toBeInTheDocument();
    expect(screen.getByText("Search and deduplicate papers")).toBeInTheDocument();
    expect(screen.getByText("Run a reproducible analysis")).toBeInTheDocument();
    expect(screen.getByText("Generate a research report")).toBeInTheDocument();
  });

  it("passes the selected workflow binding to the host entry point", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<WorkflowStarters onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: /Search and deduplicate papers/i }));

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({
      id: "search",
      workflowId: "paper-search-deduplication",
    }));
  });
});
