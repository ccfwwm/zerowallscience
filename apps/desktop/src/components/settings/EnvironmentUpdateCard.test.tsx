import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvironmentUpdateSnapshot } from "@/lib/tauri";

const store = vi.hoisted(() => ({
  snapshot: null as EnvironmentUpdateSnapshot | null,
  envelopeJson: null as string | null,
  error: null as string | null,
  refresh: vi.fn<() => Promise<void>>(),
  check: vi.fn<() => Promise<EnvironmentUpdateSnapshot | null>>(),
  install: vi.fn<() => Promise<EnvironmentUpdateSnapshot | null>>(),
  cancel: vi.fn<() => Promise<EnvironmentUpdateSnapshot | null>>(),
  rollback: vi.fn<() => Promise<EnvironmentUpdateSnapshot | null>>(),
}));

vi.mock("@/lib/environment-update", () => ({
  useEnvironmentUpdateStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

import { EnvironmentUpdateCard } from "./EnvironmentUpdateCard";

describe("EnvironmentUpdateCard", () => {
  beforeEach(() => {
    store.snapshot = null;
    store.envelopeJson = null;
    store.error = null;
    store.refresh.mockReset().mockResolvedValue(undefined);
    store.check.mockReset().mockResolvedValue(null);
    store.install.mockReset().mockResolvedValue(null);
    store.cancel.mockReset().mockResolvedValue(null);
    store.rollback.mockReset().mockResolvedValue(null);
  });

  it("shows configured versions and starts check, install, and rollback actions", async () => {
    store.snapshot = {
      phase: "available",
      currentVersion: "2026.8.1",
      previousVersion: "2026.7.4",
      targetVersion: "2026.8.2",
      message: "Restart ZeroWall Science to activate the environment.",
      downloadedBytes: 0,
      totalBytes: null,
      currentComponent: null,
    };
    store.envelopeJson = "signed-envelope";
    render(<EnvironmentUpdateCard />);

    expect(await screen.findByText("Current: 2026.8.1")).toBeInTheDocument();
    expect(screen.getByText("Target: 2026.8.2")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText(/Restart ZeroWall Science/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Check now" }));
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    await userEvent.click(screen.getByRole("button", { name: "Roll back" }));

    expect(store.check).toHaveBeenCalledTimes(1);
    expect(store.install).toHaveBeenCalledTimes(1);
    expect(store.rollback).toHaveBeenCalledTimes(1);
  });

  it("allows checking before a manifest has been downloaded", async () => {
    render(<EnvironmentUpdateCard />);

    expect(screen.getByRole("button", { name: "Check now" })).toBeEnabled();
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
      downloadedBytes: 0,
      totalBytes: null,
      currentComponent: null,
    };
    render(<EnvironmentUpdateCard />);

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
      downloadedBytes: 0,
      totalBytes: null,
      currentComponent: null,
    };
    render(<EnvironmentUpdateCard />);

    expect(screen.getByText("Restart required")).toBeInTheDocument();
    expect(screen.getByText(/Restart ZeroWall Science/)).toBeInTheDocument();
  });

  it("shows live download progress and allows cancellation", async () => {
    store.snapshot = {
      phase: "downloading",
      currentVersion: "2026.8.1",
      previousVersion: null,
      targetVersion: "2026.8.2",
      message: null,
      downloadedBytes: 50,
      totalBytes: 100,
      currentComponent: "codex-acp",
    };
    store.envelopeJson = "signed-envelope";
    store.cancel.mockImplementation(async () => store.snapshot);
    render(<EnvironmentUpdateCard />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("50 B / 100 B")).toBeInTheDocument();
    expect(screen.getByText("codex-acp")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it.each(["verifying", "installing"] as const)(
    "allows cancellation while the update is %s",
    (phase) => {
      store.snapshot = {
        phase,
        currentVersion: "2026.8.1",
        previousVersion: null,
        targetVersion: "2026.8.2",
        message: null,
        downloadedBytes: 100,
        totalBytes: 100,
        currentComponent: "codex-acp",
      };
      render(<EnvironmentUpdateCard />);

      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    },
  );

  it("labels a cancelled update as continue install", () => {
    store.snapshot = {
      phase: "available",
      currentVersion: "2026.8.1",
      previousVersion: null,
      targetVersion: "2026.8.2",
      message: "Environment update cancelled.",
      downloadedBytes: 50,
      totalBytes: 100,
      currentComponent: "codex-acp",
    };
    store.envelopeJson = "signed-envelope";
    render(<EnvironmentUpdateCard />);

    expect(screen.getByRole("button", { name: "Continue install" })).toBeEnabled();
  });
});
