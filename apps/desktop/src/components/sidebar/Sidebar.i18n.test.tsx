import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/lib/store";
import { renderAt } from "@/test/render";

// COPYCAT RULE: useUiStore is module-global; reset the locale after each test
// so this suite never bleeds a non-English locale into other test files.
afterEach(() => useUiStore.getState().setLocale("en"));

describe("Sidebar i18n", () => {
  it("renders the compact primary navigation in English", async () => {
    renderAt("/files");

    const nav = await screen.findByRole("navigation");
    expect(within(nav).getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Workflows" })).toBeInTheDocument();
    for (const label of ["Research tools", "Notebooks", "Files", "Runs", "Research Graph", "Review", "Skills"]) {
      expect(within(nav).queryByRole("button", { name: label })).toBeNull();
    }
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });
});
