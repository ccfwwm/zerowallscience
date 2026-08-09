import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RuntimeTransitionStatus,
  RuntimeUnavailableStatus,
  shouldShowEnvironmentTransition,
} from "./RuntimeTransitionStatus";

describe("RuntimeTransitionStatus", () => {
  it.each([
    ["environment", "Preparing the agent environment"],
    ["selection", "Applying engine and model"],
  ] as const)("renders an animated %s transition", (kind, label) => {
    const { container } = render(<RuntimeTransitionStatus kind={kind} />);

    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(container.querySelector("[data-runtime-progress]")).toBeInTheDocument();
  });

  it("stops the preparation animation after the runtime leaves connecting state", () => {
    expect(shouldShowEnvironmentTransition("connecting", false)).toBe(true);
    expect(shouldShowEnvironmentTransition("error", false)).toBe(false);
    expect(shouldShowEnvironmentTransition("offline", false)).toBe(false);
    expect(shouldShowEnvironmentTransition("ready", false)).toBe(false);
  });

  it("offers an explicit retry after runtime initialization fails", () => {
    const retry = vi.fn();
    render(<RuntimeUnavailableStatus detail="OpenCode failed" onRetry={retry} />);

    screen.getByRole("button", { name: "Retry" }).click();
    expect(screen.getByText("Engine unavailable")).toBeInTheDocument();
    expect(screen.getByText("OpenCode failed")).toBeInTheDocument();
    expect(retry).toHaveBeenCalledOnce();
  });
});
