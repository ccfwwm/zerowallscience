import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  isTauri: true,
  sub2apiAccount: mocks.account,
  sub2apiRestoreSession: mocks.restore,
}));

vi.mock("@/lib/webMode", () => ({ isGatewayWeb: false }));
vi.mock("@/components/settings/Sub2ApiCard", () => ({
  Sub2ApiCard: () => <div>Login form</div>,
}));

import { DesktopLoginGate } from "./DesktopLoginGate";

describe("DesktopLoginGate", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.account.mockReset();
    mocks.restore.mockReset();
  });

  it("restores a Keychain session before showing the first-launch gate", async () => {
    mocks.account.mockResolvedValue(null);
    mocks.restore.mockResolvedValue({ email: "researcher@example.test" });

    render(
      <DesktopLoginGate>
        <div>Workbench</div>
      </DesktopLoginGate>,
    );

    expect(await screen.findByText("Workbench")).toBeInTheDocument();
    expect(mocks.restore).toHaveBeenCalledOnce();
    expect(screen.queryByText("Login form")).not.toBeInTheDocument();
  });

  it("shows the optional login gate when no live or stored session exists", async () => {
    mocks.account.mockResolvedValue(null);
    mocks.restore.mockResolvedValue(null);

    render(
      <DesktopLoginGate>
        <div>Workbench</div>
      </DesktopLoginGate>,
    );

    await waitFor(() => expect(screen.getByText("Login form")).toBeInTheDocument());
    expect(screen.queryByText("Workbench")).not.toBeInTheDocument();
  });
});
