import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRuntimeStore } from "@/lib/runtime";
import { renderAt } from "@/test/render";

const PROJECT = {
  id: "p1",
  name: "BCI Trends",
  createdAt: 1,
  path: "/base/BCI-Trends",
  imported: false,
  pinned: false,
};

afterEach(() =>
  useRuntimeStore.setState({ projects: [], sessions: [], workspace: null }),
);

describe("Sidebar projects", () => {
  it("groups sessions into their project and keeps the rest loose", async () => {
    useRuntimeStore.setState({
      projects: [PROJECT],
      sessions: [
        { id: "in", title: "paper search", directory: PROJECT.path },
        { id: "out", title: "quick question", directory: "/base/2026-07-01-0900" },
        // Subagent sessions never get a row, project or not.
        { id: "child", title: "subtask", directory: PROJECT.path, parentId: "in" },
      ],
    });
    renderAt("/files");

    expect(await screen.findByText("BCI Trends")).toBeInTheDocument();
    // Both groups render their sessions; the child session does not appear.
    expect(screen.getByText("paper search")).toBeInTheDocument();
    expect(screen.getByText("quick question")).toBeInTheDocument();
    expect(screen.queryByText("subtask")).not.toBeInTheDocument();
    // The project offers its own "new session" entry point.
    expect(
      screen.getByRole("button", { name: "New session in BCI Trends" }),
    ).toBeInTheDocument();
  });

  it("offers a new-project entry when no projects exist yet", async () => {
    renderAt("/files");
    // Header [+] (the add-project menu trigger) plus the ghost row.
    expect((await screen.findAllByRole("button", { name: "New project" })).length).toBeGreaterThan(0);
  });

  it("badges an imported project (referenced in place, not auto-committed)", async () => {
    useRuntimeStore.setState({
      projects: [{ ...PROJECT, id: "p2", name: "My Repo", path: "/home/me/my-repo", imported: true }],
    });
    renderAt("/files");
    expect(await screen.findByText("My Repo")).toBeInTheDocument();
    expect(screen.getByText("imported")).toBeInTheDocument();
  });
});
