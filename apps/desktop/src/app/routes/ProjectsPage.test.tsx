import { screen, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRuntimeStore } from "@/lib/runtime";
import { renderAt } from "@/test/render";

const base = {
  createdAt: 1_000,
  imported: false,
  pinned: false,
};

afterEach(() => useRuntimeStore.setState({ projects: [], sessions: [] }));

describe("ProjectsPage", () => {
  it("lists projects, filters by search, and expands sessions", async () => {
    useRuntimeStore.setState({
      projects: [
        { ...base, id: "p1", name: "Alpha", path: "/base/alpha-dir" },
        { ...base, id: "p2", name: "Beta", path: "/home/me/beta-repo", imported: true },
      ],
      sessions: [
        { id: "s1", title: "first pass", directory: "/base/alpha-dir", updated: 2_000 },
        { id: "s2", title: "second pass", directory: "/base/alpha-dir", updated: 3_000 },
      ],
    });
    renderAt("/projects");
    // Scope to the page's main region — the sidebar also lists project names.
    await screen.findByPlaceholderText("Search projects");
    const page = within(screen.getByRole("main"));

    // Both projects render; the imported one carries the source folder name.
    expect(page.getByText("Alpha")).toBeInTheDocument();
    expect(page.getByText("Beta")).toBeInTheDocument();
    expect(page.getByText("beta-repo")).toBeInTheDocument(); // Sources chip = folder basename

    // Sessions are hidden until the project row is expanded.
    expect(page.queryByText("first pass")).not.toBeInTheDocument();
    fireEvent.click(page.getByRole("button", { name: "Alpha" }));
    expect(page.getByText("second pass")).toBeInTheDocument();
    expect(page.getByText("first pass")).toBeInTheDocument();

    // Search filters the list by name.
    fireEvent.change(screen.getByPlaceholderText("Search projects"), {
      target: { value: "bet" },
    });
    expect(page.queryByText("Alpha")).not.toBeInTheDocument();
    expect(page.getByText("Beta")).toBeInTheDocument();
  });

  it("shows an empty state when the search matches nothing", async () => {
    useRuntimeStore.setState({
      projects: [{ ...base, id: "p1", name: "Alpha", path: "/base/Alpha" }],
    });
    renderAt("/projects");
    fireEvent.change(await screen.findByPlaceholderText("Search projects"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No projects match.")).toBeInTheDocument();
  });
});
