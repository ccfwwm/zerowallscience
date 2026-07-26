import { describe, expect, it } from "vitest";
import { formatExecResult, isCodeLanguage, type ExecResult } from "./kernel";

const result = (patch: Partial<ExecResult> = {}): ExecResult => ({
  ok: true,
  stdout: "",
  result: null,
  error: null,
  ...patch,
});

describe("isCodeLanguage", () => {
  it("accepts the languages with a local kernel", () => {
    expect(isCodeLanguage("python")).toBe(true);
    expect(isCodeLanguage("r")).toBe(true);
  });

  it("rejects prose cells and unsupported kernels", () => {
    for (const lang of ["markdown", "raw", "julia", ""]) {
      expect(isCodeLanguage(lang)).toBe(false);
    }
  });
});

describe("formatExecResult", () => {
  it("shows stdout and the final expression's value", () => {
    expect(formatExecResult(result({ stdout: "hi\n", result: "42" }))).toBe("hi\n42");
  });

  it("shows the error alone when the cell failed", () => {
    // The traceback is the whole story; partial stdout above it is noise.
    const r = result({ ok: false, stdout: "some progress\n", error: "ZeroDivisionError\n" });
    expect(formatExecResult(r)).toBe("ZeroDivisionError");
  });

  it("says so when a cell produced nothing at all", () => {
    expect(formatExecResult(result())).toBe("(no output)");
  });

  it("stays silent for a cell whose only output is a figure", () => {
    // The plot is the output; "(no output)" under a rendered chart reads as
    // failure.
    expect(formatExecResult(result({ image: "iVBORw0KGgo=" }))).toBe("");
  });

  it("keeps text alongside a figure", () => {
    const r = result({ stdout: "fitted\n", image: "iVBORw0KGgo=" });
    expect(formatExecResult(r)).toBe("fitted");
  });

  it("passes the kernel's truncation notice straight through", () => {
    // The bridges embed the marker in the text, so a clipped cell explains
    // itself even where the `truncated` flag is not surfaced.
    const r = result({ stdout: "0\n... [123 characters omitted] ...\n999\n", truncated: true });
    expect(formatExecResult(r)).toContain("characters omitted");
  });
});
