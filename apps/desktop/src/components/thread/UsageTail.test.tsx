import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsageTail } from "./atoms";

describe("UsageTail", () => {
  it("does not present unavailable ACP counters as zero tokens", () => {
    render(
      <UsageTail
        block={{
          kind: "usage",
          input: 0,
          output: 0,
          reasoning: 0,
          cacheRead: 0,
          cacheWrite: 0,
          inputUnavailable: true,
          outputUnavailable: true,
        }}
      />,
    );

    expect(screen.getByText(/— in/)).toBeInTheDocument();
    expect(screen.getByText(/— out/)).toBeInTheDocument();
    expect(screen.queryByText(/0 in/)).toBeNull();
    expect(screen.queryByText(/0 out/)).toBeNull();
  });
});
