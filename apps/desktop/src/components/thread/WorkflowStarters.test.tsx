import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
