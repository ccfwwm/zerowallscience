import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Composer } from "./Composer";

// Desktop-only attach behaviors, with the Tauri bridge mocked out.
vi.mock("@/lib/tauri", () => ({
  isTauri: true,
  addFilesToWorkspace: vi.fn(async () => ["data.csv"]),
  addTextToWorkspace: vi.fn(async () => "pasted.txt"),
  addPathsToWorkspace: vi.fn(async () => ["dropped.csv"]),
  readWorkspaceFileBase64: vi.fn(async () => ({ mime: "image/png", base64: "aGVsbG8=" })),
  readLocalFileBase64: vi.fn(async () => ({ mime: "image/png", base64: "aGVsbG8=" })),
  logDebug: vi.fn(async () => {}),
}));

// Image compression — in a test environment createImageBitmap is unavailable,
// so we mock compressImage to return a predictable result.
vi.mock("@/lib/imageCompress", () => ({
  compressImage: vi.fn(async (_blob: Blob, hintName: string) => ({
    mime: "image/jpeg",
    base64: "Y29tcHJlc3NlZA==",
    filename: hintName.replace(/\.\w+$/, ".jpg"),
  })),
  blobToBase64: vi.fn(async () => "aGVsbG8="),
}));

// The composer subscribes to the webview's native drag-drop event on mount.
// Without a Tauri runtime `getCurrentWebview()` throws — stub it so the effect
// subscribes cleanly instead of leaving an unhandled rejection.
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: vi.fn(async () => () => {}) }),
}));

describe("Composer attachments (desktop)", () => {
  it("adds picked files as removable chips and sends them as real attachment parts (no workspace note)", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);

    fireEvent.click(screen.getByLabelText("Add files"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add local files to the workspace" }));
    await waitFor(() => expect(screen.getByText("data.csv")).toBeTruthy());
    // Wait for the async readWorkspaceFileBase64 + on-device text extraction
    // to settle — the chip renders an <img> once the mock's image/png mime is
    // in state, giving us a stable signal that attachments is non-empty.
    await screen.findByAltText("data.csv", {}, { timeout: 5000 });

    // Chip is outside the textarea — typing text is independent of the file.
    const input = screen.getByLabelText("Ask anything");
    fireEvent.change(input, { target: { value: "analyze this" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // No more "Files added to the workspace: …" note. The file rides as a real
    // attachment part (base64 + locally-extracted UTF-8 text).
    expect(onSend).toHaveBeenCalledWith("analyze this", [
      { filename: "data.csv", mime: "image/png", base64: "aGVsbG8=", extractedText: "hello" },
    ]);
    // Chips are cleared after sending.
    expect(screen.queryByText("data.csv")).toBeNull();
  });

  it("removes a chip via its X button without touching the text", async () => {
    render(<Composer onSend={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Add files"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add local files to the workspace" }));
    await waitFor(() => expect(screen.getByText("data.csv")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Remove data.csv"));
    expect(screen.queryByText("data.csv")).toBeNull();
  });

  it("turns an oversized paste into a workspace file chip, keeping the box clean", async () => {
    render(<Composer onSend={vi.fn()} />);
    const input = screen.getByLabelText("Ask anything") as HTMLTextAreaElement;

    fireEvent.paste(input, {
      clipboardData: { getData: () => "x".repeat(3000) },
    });
    await waitFor(() => expect(screen.getByText("pasted.txt")).toBeTruthy());
    expect(input.value).toBe("");

    // A short paste stays a normal paste (no new chip).
    fireEvent.paste(input, { clipboardData: { getData: () => "short text" } });
    expect(screen.getAllByText("pasted.txt")).toHaveLength(1);
  });

  it("pasted image does NOT call addBinaryToWorkspace — goes through compress + attach only", async () => {
    render(<Composer onSend={vi.fn()} />);
    const input = screen.getByLabelText("Ask anything") as HTMLTextAreaElement;

    fireEvent.paste(input, {
      clipboardData: {
        getData: () => "",
        items: [
          {
            type: "image/png",
            getAsFile: () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
          },
        ],
      },
    });
    // The compressed filename replaces .png → .jpg via the mock.
    await waitFor(() => expect(screen.getByText("pasted.jpg")).toBeTruthy());
    expect(input.value).toBe(""); // the image never lands as text

    // Crucially: workspace functions were NOT called for the image.
    const { addPathsToWorkspace } = await import("@/lib/tauri");
    expect(addPathsToWorkspace).not.toHaveBeenCalled();
  });

  it("forwards a pasted image to onSend as a compressed JPEG attachment", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const input = screen.getByLabelText("Ask anything") as HTMLTextAreaElement;

    fireEvent.paste(input, {
      clipboardData: {
        getData: () => "",
        items: [
          {
            type: "image/png",
            getAsFile: () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
          },
        ],
      },
    });
    await waitFor(() => expect(screen.getByText("pasted.jpg")).toBeTruthy());

    fireEvent.change(input, { target: { value: "what is in this image" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The image rides as a compressed JPEG attachment.
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith("what is in this image", [
        { filename: "pasted.jpg", mime: "image/jpeg", base64: "Y29tcHJlc3NlZA==" },
      ]),
    );
  });
});
