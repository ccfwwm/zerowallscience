import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_STARTERS, WorkflowStarters } from "./WorkflowStarters";

// The skills the starter prompts ask for by name. A prompt naming a skill the
// app does not ship would send the agent looking for instructions that are not
// there, so the last test checks these against the shipped pack manifests.
const REQUIRED_SKILLS = [
  "publication-figures",
  "stats-integrity",
  "literature-review",
  "traceability-review",
];

describe("WorkflowStarters", () => {
  it("renders one card per capability", () => {
    render(<WorkflowStarters onPick={() => {}} />);
    // Titles are i18n-translated (session:starters.<id>.title); WORKFLOW_STARTERS
    // itself carries no display copy, only ids/prompts — assert the rendered
    // English text directly.
    expect(screen.getByText("Run a reproducible analysis")).toBeInTheDocument();
    expect(screen.getByText("Analyze my data")).toBeInTheDocument();
    expect(screen.getByText("Review the literature with citations")).toBeInTheDocument();
    expect(screen.getByText("Audit a report for traceability")).toBeInTheDocument();
    expect(WORKFLOW_STARTERS).toHaveLength(4);
  });

  it("sends the starter's prompt on click", async () => {
    const onPick = vi.fn();
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Run a reproducible analysis"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toContain("figure1.png");
    expect(onPick.mock.calls[0][0]).toContain("report.md");
  });

  it("names no bundled example project", () => {
    // The starters used to lead with five bundled examples. They are gone, and a
    // prompt still naming one would point the agent at files nothing unpacks.
    const prompts = WORKFLOW_STARTERS.map((s) => s.prompt).join("\n");
    for (const dir of [
      "climate-trends",
      "crispr-screen",
      "enzyme-engineering",
      "extremophile-growth",
      "immunotherapy",
    ]) {
      expect(prompts).not.toContain(dir);
    }
  });

  it("only asks for skills that actually ship", async () => {
    // Read the manifests rather than trusting a hardcoded list, so removing a
    // skill from a pack turns this red instead of leaving a starter that asks
    // the agent for a skill it cannot load.
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const packsDir = join(__dirname, "..", "..", "..", "..", "..", "runtime", "packs");
    const manifests = readdirSync(packsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => readFileSync(join(packsDir, e.name, "manifest.yaml"), "utf-8"))
      .join("\n");

    const prompts = WORKFLOW_STARTERS.map((s) => s.prompt).join("\n");
    for (const skill of REQUIRED_SKILLS) {
      expect(prompts).toContain(skill);
      expect(manifests).toContain(skill);
    }
  });
});
