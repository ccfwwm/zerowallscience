import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_PROJECTS, WORKFLOW_STARTERS, WorkflowStarters } from "./WorkflowStarters";

// Plain closures instead of vi.fn: tinyspy's result tracking derives an extra
// promise from a rejecting spy, which vitest then reports as unhandled.
const installCalls: string[] = [];
let failInstall = false;
vi.mock("@/lib/tauri", () => ({
  isTauri: true,
  installExample: async (name: string) => {
    installCalls.push(name);
    if (failInstall) throw new Error("resource missing");
    return name;
  },
}));

describe("WorkflowStarters", () => {
  beforeEach(() => {
    installCalls.length = 0;
    failInstall = false;
  });

  it("renders one card per starter workflow, including the examples row", () => {
    render(<WorkflowStarters onPick={() => {}} />);
    // Titles are i18n-translated (session:starters.<id>.title); WORKFLOW_STARTERS
    // itself no longer carries display copy, only ids/prompts — assert the
    // rendered English text directly.
    expect(screen.getByText("Run a demo analysis, end to end")).toBeInTheDocument();
    expect(screen.getByText("Analyze my data")).toBeInTheDocument();
    expect(screen.getByText("Audit a report for traceability")).toBeInTheDocument();
    expect(screen.getByText("Explore an example project")).toBeInTheDocument();
    expect(WORKFLOW_STARTERS).toHaveLength(4);
  });

  it("sends the full-workflow prompt on click", async () => {
    const onPick = vi.fn();
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Run a demo analysis, end to end"));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.stringContaining("figure1.png")));
    expect(onPick.mock.calls[0][0]).toContain("report.md");
    expect(installCalls).toHaveLength(0);
  });

  it("opens the example picker instead of sending a prompt", async () => {
    const onPick = vi.fn();
    render(<WorkflowStarters onPick={onPick} />);

    // The examples row carries no prompt of its own — it swaps the list. Nothing
    // may be sent on the way in, or the user would be committed to an example
    // before choosing one.
    await userEvent.click(screen.getByText("Explore an example project"));
    expect(onPick).not.toHaveBeenCalled();
    expect(installCalls).toHaveLength(0);

    // Every bundled example is reachable, and the starters are gone until the
    // user comes back.
    for (const title of [
      "Climate trends",
      "CRISPR screen",
      "Enzyme engineering",
      "Extremophile growth",
      "Immunotherapy biomarkers",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.queryByText("Analyze my data")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Back to starters"));
    expect(screen.getByText("Analyze my data")).toBeInTheDocument();
  });

  it("installs an example's files before sending its prompt", async () => {
    const onPick = vi.fn();
    render(<WorkflowStarters onPick={onPick} />);

    await userEvent.click(screen.getByText("Explore an example project"));
    await userEvent.click(screen.getByText("CRISPR screen"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    // The install names the directory the prompt then tells the agent to read;
    // a mismatch would point the agent at files that were never unpacked.
    expect(installCalls).toEqual(["crispr-screen"]);
    expect(onPick.mock.calls[0][0]).toContain("crispr-screen/README.md");
  });

  it("does not send the prompt when the example install fails", async () => {
    failInstall = true;
    const onPick = vi.fn();
    render(<WorkflowStarters onPick={onPick} />);

    await userEvent.click(screen.getByText("Explore an example project"));
    await userEvent.click(screen.getByText("Climate trends"));
    await waitFor(() => expect(installCalls).toHaveLength(1));
    expect(onPick).not.toHaveBeenCalled();
  });

  it("points every example prompt at its own installed directory", () => {
    // Each prompt must name the directory that `installExample(dir)` unpacks,
    // otherwise the agent hunts for files under a path that does not exist.
    for (const e of EXAMPLE_PROJECTS) {
      expect(e.prompt).toContain(`${e.dir}/`);
    }
  });
});
