import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotebookInspector as NotebookInspectorT } from "@zerowall/shared";
import { NotebookInspector } from "./NotebookInspector";

const mocks = vi.hoisted(() => ({ kernelExecute: vi.fn() }));
vi.mock("@/lib/kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kernel")>();
  return { ...actual, kernelExecute: (...args: unknown[]) => mocks.kernelExecute(...args) };
});

// A 1x1 transparent PNG.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAwMDAwAEsQBaHzOZgAAAABJRU5ErkJggg==";

const data: NotebookInspectorT = {
  variant: "notebook",
  name: "analysis.ipynb",
  live: false,
  kernelLabel: "Python 3",
  kernelNote: "local",
  cells: [],
};

const evaluate = async (expression: string) => {
  render(<NotebookInspector data={data} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText("Notebook expression"), expression);
  await userEvent.click(screen.getByLabelText("Run expression"));
};

describe("NotebookInspector", () => {
  beforeEach(() => mocks.kernelExecute.mockReset());

  it("renders a figure the expression produced", async () => {
    mocks.kernelExecute.mockResolvedValue({
      ok: true,
      stdout: "",
      result: null,
      error: null,
      image: PNG,
    });
    await evaluate("plt.plot(x)");

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", `data:image/png;base64,${PNG}`);
    // The plot IS the output: "(no output)" beneath a chart reads as failure.
    expect(screen.queryByText("(no output)")).not.toBeInTheDocument();
  });

  it("still shows text output when there is no figure", async () => {
    mocks.kernelExecute.mockResolvedValue({
      ok: true,
      stdout: "",
      result: "42",
      error: null,
      image: null,
    });
    await evaluate("6*7");

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
