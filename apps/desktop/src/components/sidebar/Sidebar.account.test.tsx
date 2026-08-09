import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  balance: vi.fn(),
}));

vi.mock("@/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tauri")>()),
  isTauri: true,
  sub2apiAccount: mocks.account,
  sub2apiBalance: mocks.balance,
}));
vi.mock("@/lib/webMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webMode")>()),
  isGatewayWeb: false,
}));

import { Sidebar } from "./Sidebar";
import { useRuntimeStore } from "@/lib/runtime";

function LocationProbe() {
  return <output aria-label="current route">{useLocation().pathname}</output>;
}

describe("Sidebar account entry", () => {
  beforeEach(() => {
    useRuntimeStore.setState({ status: "offline" });
    mocks.account.mockResolvedValue(null);
    mocks.balance.mockResolvedValue({ balance: "0" });
  });

  it("uses a prominent sign-in card and opens the dedicated account page", async () => {
    render(
      <MemoryRouter initialEntries={["/files"]}>
        <Sidebar project={{ id: "", name: "", sessions: [] }} />
        <LocationProbe />
      </MemoryRouter>,
    );

    const signIn = await screen.findByRole("button", { name: "Sign in" });
    expect(signIn).toHaveClass("bg-accent/10");
    expect(screen.getByText("AI Platform")).toBeInTheDocument();
    await userEvent.click(signIn);
    expect(screen.getByRole("status", { name: "current route" })).toHaveTextContent("/auth");
  });

  it("refreshes the account after the runtime becomes ready", async () => {
    render(
      <MemoryRouter initialEntries={["/live"]}>
        <Sidebar project={{ id: "", name: "", sessions: [] }} />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "Sign in" });
    mocks.account.mockResolvedValue({ email: "researcher@example.com" });
    mocks.balance.mockResolvedValue({ balance: "12.50" });

    act(() => useRuntimeStore.setState({ status: "ready" }));

    expect(await screen.findByText("researcher@example.com")).toBeInTheDocument();
    expect(await screen.findByText("¥ 12.50")).toBeInTheDocument();
  });
});
