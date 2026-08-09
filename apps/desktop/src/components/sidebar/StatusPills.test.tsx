import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRuntimeStore } from "@/lib/runtime";
import { StatusPills } from "./StatusPills";

afterEach(() => {
  act(() => useRuntimeStore.setState({ status: "offline", defaultModel: null }));
});

describe("StatusPills", () => {
  it("shows only engine readiness and leaves model choice to the composer", () => {
    act(() => useRuntimeStore.setState({ status: "ready", defaultModel: "cloud/gpt-5.6-sol" }));
    render(<StatusPills />);

    expect(screen.getByText("Engine")).toBeInTheDocument();
    expect(screen.queryByText("Model")).toBeNull();
    expect(screen.queryByText("gpt-5.6-sol")).toBeNull();
  });
});
