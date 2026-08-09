import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderAt } from "@/test/render";
import { useUiStore } from "@/lib/store";
import { Composer } from "./Composer";
import { WorkflowStarters } from "./WorkflowStarters";

// COPYCAT RULE: useUiStore is module-global; reset the locale after each test
// so this suite never bleeds a non-English locale into other test files.
afterEach(() => useUiStore.getState().setLocale("en"));

describe("Composer strings (i18n)", () => {
  it("renders the default placeholder and the approval-mode switch in English", () => {
    render(<Composer onSend={() => {}} approvalMode="approve" onApprovalModeChange={() => {}} />);
    expect(screen.getByPlaceholderText("Ask anything")).toBeInTheDocument();
    expect(screen.getByLabelText("Approval mode")).toHaveTextContent("Request approval");
  });
});

describe("WorkflowStarters strings (i18n)", () => {
  it("renders the welcome copy in English", () => {
    render(<WorkflowStarters onPick={() => {}} />);
    expect(screen.getByText("What should we look into?")).toBeInTheDocument();
    expect(screen.getByText("Describe your analysis below to get started.")).toBeInTheDocument();
  });
});

describe("LiveSessionPage strings (i18n)", () => {
  it("renders the neutral runtime loading state in English (no Tauri sidecar in tests)", async () => {
    renderAt("/live");
    expect(await screen.findByText("Connecting to the runtime…")).toBeInTheDocument();
    expect(screen.queryByText("OpenCode runtime")).not.toBeInTheDocument();
    expect(screen.queryByText(/OpenCode ·/)).not.toBeInTheDocument();
  });

  it("uses a spacious desktop input and groups message capabilities behind the add menu", async () => {
    render(
      <MemoryRouter>
        <Composer onSend={() => {}} onRunCommand={() => {}} showModelPicker />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText("Ask anything")).toHaveClass("min-h-[96px]");
    await userEvent.click(screen.getByRole("button", { name: "Add files" }));
    expect(screen.getByRole("menuitem", { name: "MCP" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Workflow" })).toBeInTheDocument();
  });
});
