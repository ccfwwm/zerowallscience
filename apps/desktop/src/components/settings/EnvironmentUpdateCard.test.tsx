import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvironmentUpdateSnapshot } from "@/lib/tauri";

const store = vi.hoisted(() => ({
  snapshot: null as EnvironmentUpdateSnapshot | null,
  error: null as string | null,
  refresh: vi.fn<() => Promise<void>>(),
  check: vi.fn<(envelopeJson: string) => Promise<EnvironmentUpdateSnapshot | null>>(),
  install: vi.fn<(envelopeJson: string) => Promise<EnvironmentUpdateSnapshot | null>>(),
  rollback: vi.fn<() => Promise<EnvironmentUpdateSnapshot | null>>(),
}));

vi.mock("@/lib/environment-update", () => ({
  useEnvironmentUpdateStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

import { EnvironmentUpdateCard } from "./EnvironmentUpdateCard";

describe("EnvironmentUpdateCard", () => {
  beforeEach(() => {
    store.snapshot = null;
    store.error = null;
    store.refresh.mockReset().mockResolvedValue(undefined);
    store.check.mockReset().mockResolvedValue(null);
    store.install.mockReset().mockResolvedValue(null);
    store.rollback.mockReset().mockResolvedValue(null);
  });

  it("shows configured versions and starts check, install, and rollback actions", async () => {
    store.snapshot = {
      phase: "available",
      currentVersion: "2026.8.1",
      previousVersion: "2026.7.4",
      targetVersion: "2026.8.2",
      message: "Restart ZeroWall Science to activate the environment.",
    };
    render(<EnvironmentUpdateCard envelopeJson="signed-envelope" />);

    expect(await screen.findByText("Current: 2026.8.1")).toBeInTheDocument();
    expect(screen.getByText("Target: 2026.8.2")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText(/Restart ZeroWall Science/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Check now" }));
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    await userEvent.click(screen.getByRole("button", { name: "Roll back" }));

    expect(store.check).toHaveBeenCalledWith("signed-envelope");
    expect(store.install).toHaveBeenCalledWith("signed-envelope");
    expect(store.rollback).toHaveBeenCalledTimes(1);
  });

  it("explains that check and install need an environment update configuration", async () => {
    render(<EnvironmentUpdateCard />);

    expect(await screen.findByText("No environment update configuration is available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();
    await waitFor(() => expect(store.refresh).toHaveBeenCalledTimes(1));
  });

  it("surfaces a failed status and message", () => {
    store.snapshot = {
      phase: "failed",
      currentVersion: "2026.8.1",
      previousVersion: "2026.7.4",
      targetVersion: "2026.8.2",
      message: "SHA-256 verification failed.",
    };
    render(<EnvironmentUpdateCard envelopeJson="signed-envelope" />);

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("SHA-256 verification failed.")).toBeInTheDocument();
  });

  it("shows a restart-required status and its message", () => {
    store.snapshot = {
      phase: "restart-required",
      currentVersion: "2026.8.2",
      previousVersion: "2026.8.1",
      targetVersion: "2026.8.2",
      message: "Restart ZeroWall Science to activate the environment.",
    };
    render(<EnvironmentUpdateCard envelopeJson="signed-envelope" />);

    expect(screen.getByText("Restart required")).toBeInTheDocument();
    expect(screen.getByText(/Restart ZeroWall Science/)).toBeInTheDocument();
  });
});
