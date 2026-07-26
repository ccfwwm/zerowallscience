import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilePreviewInspector as FilePreviewInspectorT } from "@zerowall/shared";
import { FilePreviewInspector } from "./FilePreviewInspector";

// `isGatewayWeb` is a load-time constant (see webMode.test.ts for how it is
// derived from the gateway's injected flag). Swap it for a switch so both modes
// can be asserted side by side. `@/lib/artifactFile` reads the same flag, so
// this also switches how the preview resolves the file.
const mode = vi.hoisted(() => ({ web: false }));
vi.mock("@/lib/webMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webMode")>()),
  get isGatewayWeb() {
    return mode.web;
  },
}));

afterEach(() => {
  mode.web = false;
  vi.restoreAllMocks();
});

// Inline content, so the preview never has to read the file to render.
const md: FilePreviewInspectorT = {
  variant: "file",
  path: "notes/report.md",
  filename: "report.md",
  artifact: "report",
  content: "# Findings",
};

describe("File preview in the gateway web client", () => {
  it("hands the file to the OS app on the desktop", async () => {
    render(<FilePreviewInspector data={md} onClose={() => {}} />);
    expect(await screen.findByLabelText("Open externally")).toBeInTheDocument();
    expect(screen.queryByLabelText("Download")).toBeNull();
  });

  it("downloads the file in the browser, which has no OS app to hand it to", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    mode.web = true;
    render(<FilePreviewInspector data={md} onClose={() => {}} />);

    expect(await screen.findByLabelText("Download")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open externally")).toBeNull();

    // Let the effect resolve the file's gateway URL, then take the action.
    await act(async () => {});
    await userEvent.click(screen.getByLabelText("Download"));
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("/v1/fs/read?path=notes%2Freport.md"),
      "_blank",
      "noopener",
    );
  });
});
