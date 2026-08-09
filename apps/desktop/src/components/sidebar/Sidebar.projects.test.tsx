import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRuntimeStore } from "@/lib/runtime";
import { useLayoutStore } from "@/lib/layout";
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
  it("groups every conversation under its registered or directory-derived project", async () => {
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
    // Both project groups render their sessions; the child session does not appear.
    expect(screen.getByText("paper search")).toBeInTheDocument();
    const derivedProject = screen.getAllByRole("button", { name: /2026-07-01-0900/ })[0];
    expect(within(derivedProject.parentElement?.parentElement ?? derivedProject).getByText("quick question")).toBeInTheDocument();
    expect(screen.queryByText("subtask")).not.toBeInTheDocument();
    // The project offers its own "new session" entry point.
    expect(
      screen.getByRole("button", { name: "New session in BCI Trends" }),
    ).toBeInTheDocument();
  });

  it("uses a friendly title when legacy metadata is an engine name or opaque id", async () => {
    useRuntimeStore.setState({
      projects: [PROJECT],
      sessions: [
        { id: "550e8400-e29b-41d4-a716-446655440000", title: "550e8400-e29b-41d4-a716-446655440000", directory: PROJECT.path },
        { id: "ses_old", title: "opencode", directory: PROJECT.path },
      ],
    });
    renderAt("/files");

    expect(await screen.findAllByText("New conversation")).toHaveLength(2);
    expect(screen.queryByText("opencode")).toBeNull();
    expect(screen.queryByText("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
  });

  it("opens a conversation directly without invoking legacy split or preview behavior", async () => {
    const split = vi.fn();
    const openSessionEphemeral = vi.fn();
    useLayoutStore.setState({ split, openSessionEphemeral });
    useRuntimeStore.setState({
      projects: [PROJECT],
      sessions: [{ id: "conversation-1", title: "Paper review", directory: PROJECT.path }],
    });
    renderAt("/files");

    const link = await screen.findByRole("link", { name: /Paper review/ });
    expect(link).toHaveAttribute("href", "/live/conversation-1");
    expect(split).not.toHaveBeenCalled();
    expect(openSessionEphemeral).not.toHaveBeenCalled();
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
