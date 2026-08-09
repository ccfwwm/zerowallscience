import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/settings/Sub2ApiCard", () => ({
  Sub2ApiCard: ({ onLogin }: { onLogin?: () => void }) => (
    <button type="button" onClick={onLogin}>Complete sign in</button>
  ),
}));

import { AuthPage } from "./AuthPage";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current route">{location.pathname + location.search}</output>;
}

function renderAuth() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthPage", () => {
  it("returns to the workbench after sign in", async () => {
    renderAuth();
    await userEvent.click(screen.getByRole("button", { name: "Complete sign in" }));
    expect(screen.getByRole("status", { name: "current route" })).toHaveTextContent("/live");
  });

  it("allows skipping sign in", async () => {
    renderAuth();
    await userEvent.click(screen.getByRole("button", { name: "Back to app" }));
    expect(screen.getByRole("status", { name: "current route" })).toHaveTextContent("/live");
  });

  it("opens custom providers without requiring an account", async () => {
    renderAuth();
    await userEvent.click(screen.getByRole("button", { name: "Custom endpoint" }));
    expect(screen.getByRole("status", { name: "current route" })).toHaveTextContent(
      "/settings/models?add=provider",
    );
  });
});
