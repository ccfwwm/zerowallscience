import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WORKFLOW_STARTERS, WorkflowStarters } from "./WorkflowStarters";

describe("WorkflowStarters", () => {
  it("ships no default starters", () => {
    // The preset prompts were removed at the user's request; the new-session
    // screen shows only the welcome until the user adds their own.
    expect(WORKFLOW_STARTERS).toHaveLength(0);
  });

  it("renders the welcome without any starter cards", () => {
    render(<WorkflowStarters onPick={() => {}} />);
    expect(screen.getByText("What should we look into?")).toBeInTheDocument();
    // With no starters there are no clickable rows.
    expect(screen.queryByRole("button")).toBeNull();
  });
});
