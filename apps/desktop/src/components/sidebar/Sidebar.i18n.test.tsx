import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/lib/store";
import { renderAt } from "@/test/render";

// COPYCAT RULE: useUiStore is module-global; reset the locale after each test
// so this suite never bleeds a non-English locale into other test files.
afterEach(() => useUiStore.getState().setLocale("en"));

describe("Sidebar i18n", () => {
  it("renders migrated nav labels and section heading in English", async () => {
    renderAt("/files");

    const nav = await screen.findByRole("navigation");
    expect(within(nav).getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Workflows" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Files" })).toBeNull();
    await userEvent.click(within(nav).getByRole("button", { name: "Research tools" }));
    expect(within(nav).getByRole("button", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });
});
