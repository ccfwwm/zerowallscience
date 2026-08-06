import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  snapshot: null as null | {
    phase: "available" | "restart-required";
    currentVersion: string | null;
    previousVersion: string | null;
    targetVersion: string | null;
    message: string | null;
  },
  error: null as string | null,
  refresh: vi.fn<() => Promise<void>>(),
  check: vi.fn(),
  install: vi.fn(),
  bootstrap: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/tauri", () => ({ isTauri: true }));
vi.mock("@/lib/webMode", () => ({ isGatewayWeb: false }));
vi.mock("@/lib/environment-update", () => ({
  useEnvironmentUpdateStore: (selector: (state: typeof mocks) => unknown) => selector(mocks),
}));
vi.mock("@/lib/runtime", () => ({
  useRuntimeStore: Object.assign(
    (selector: (state: { runningSessions: Record<string, true>; workflowRuns: Record<string, never> }) => unknown) =>
      selector({ runningSessions: {}, workflowRuns: {} }),
    { getState: () => ({ bootstrap: mocks.bootstrap }) },
  ),
}));

import { DesktopEnvironmentGate } from "./DesktopEnvironmentGate";

describe("DesktopEnvironmentGate", () => {
  beforeEach(() => {
    mocks.snapshot = null;
    mocks.error = null;
    mocks.refresh.mockReset().mockResolvedValue(undefined);
    mocks.check.mockReset().mockResolvedValue({
      phase: "available",
      currentVersion: null,
      previousVersion: null,
      targetVersion: "v1-env.1",
      message: null,
    });
    mocks.install.mockReset().mockResolvedValue({
      phase: "restart-required",
      currentVersion: "v1-env.1",
      previousVersion: null,
      targetVersion: "v1-env.1",
      message: null,
    });
    mocks.bootstrap.mockReset().mockResolvedValue(undefined);
  });

  it("offers one-click environment installation when no version is active", async () => {
    render(<DesktopEnvironmentGate><div>Workbench</div></DesktopEnvironmentGate>);

    expect(await screen.findByRole("heading", { name: "Set up your research environment" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download and install" }));

    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(mocks.install).toHaveBeenCalledWith({
      agentTurns: 0,
      workflowRuns: 0,
      mcpMutations: 0,
      runActivities: 0,
    });
    await waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Workbench")).toBeInTheDocument();
  });

  it("allows entering the workbench without installing in the current launch", async () => {
    render(<DesktopEnvironmentGate><div>Workbench</div></DesktopEnvironmentGate>);
    await screen.findByRole("heading", { name: "Set up your research environment" });
    await userEvent.click(screen.getByRole("button", { name: "Continue without environment" }));
    expect(screen.getByText("Workbench")).toBeInTheDocument();
    expect(mocks.install).not.toHaveBeenCalled();
  });
});
