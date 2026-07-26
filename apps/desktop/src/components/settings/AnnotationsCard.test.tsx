import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@/lib/annotations";
import { PHONE_WIDTH, setViewportWidth } from "@/test/viewport";
import { AnnotationsCard } from "./AnnotationsCard";

const bridge = {
  listAnnotations: vi.fn<() => Promise<Annotation[]>>(),
  updateAnnotation: vi.fn<(id: string, kind: string, body: string) => Promise<void>>(),
  deleteAnnotation: vi.fn<(id: string) => Promise<void>>(),
};

vi.mock("@/lib/annotations", () => ({
  listAnnotations: () => bridge.listAnnotations(),
  updateAnnotation: (...a: [string, string, string]) => bridge.updateAnnotation(...a),
  deleteAnnotation: (...a: [string]) => bridge.deleteAnnotation(...a),
}));

vi.mock("@/lib/tauri", () => ({ isTauri: true }));

// Read at module init by the card, so each web-mode test needs its own module
// registry (see the web suite below).
vi.mock("@/lib/webMode", () => ({ isGatewayWeb: false }));

const annotation = (over: Partial<Annotation> = {}): Annotation => ({
  id: "ann_1",
  annotationKind: "key_finding",
  body: "The effect holds after the Bonferroni correction.",
  anchor: { startLine: 12, endLine: 12, quote: "p = 0.003 after correction" },
  artifactVersionId: "ver_1",
  artifactPath: "analysis/report.md",
  versionNumber: 3,
  authorSubject: "local",
  createdAt: "2026-07-20T10:30:00.000Z",
  updatedAt: "2026-07-20T10:30:00.000Z",
  ...over,
});

describe("AnnotationsCard", () => {
  beforeEach(() => {
    bridge.listAnnotations.mockReset();
    bridge.updateAnnotation.mockReset();
    bridge.deleteAnnotation.mockReset();
  });

  it("shows the note together with what it points at", async () => {
    bridge.listAnnotations.mockResolvedValue([annotation()]);
    render(<AnnotationsCard />);

    expect(
      await screen.findByText("The effect holds after the Bonferroni correction."),
    ).toBeInTheDocument();
    expect(screen.getByText("key_finding")).toBeInTheDocument();
    // The anchor target: without path, version, and span the note cannot be
    // checked against the text it describes.
    expect(screen.getByText("analysis/report.md")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("line 12")).toBeInTheDocument();
    expect(screen.getByText("p = 0.003 after correction")).toBeInTheDocument();
    // A locale-formatted timestamp, not the raw ISO string.
    expect(screen.queryByText("2026-07-20T10:30:00.000Z")).not.toBeInTheDocument();
  });

  it("names a multi-line span and a whole-file note distinctly", async () => {
    bridge.listAnnotations.mockResolvedValue([
      annotation({ id: "ann_span", anchor: { startLine: 4, endLine: 9, quote: "" } }),
      annotation({ id: "ann_whole", anchor: undefined }),
    ]);
    render(<AnnotationsCard />);

    expect(await screen.findByText("lines 4–9")).toBeInTheDocument();
    expect(screen.getByText("whole file")).toBeInTheDocument();
  });

  it("distinguishes an agent author from the person at this desktop", async () => {
    bridge.listAnnotations.mockResolvedValue([
      annotation({ id: "ann_agent", authorSubject: "agent:bookmarker" }),
    ]);
    render(<AnnotationsCard />);

    expect(await screen.findByText("agent:bookmarker")).toBeInTheDocument();
    expect(screen.queryByText("You")).not.toBeInTheDocument();
  });

  it("edits the category and note, leaving the anchor alone", async () => {
    bridge.listAnnotations.mockResolvedValue([annotation()]);
    bridge.updateAnnotation.mockResolvedValue(undefined);
    render(<AnnotationsCard />);

    await userEvent.click(await screen.findByRole("button", { name: "Edit this annotation" }));
    const body = screen.getByRole("textbox", { name: "Note" });
    await userEvent.clear(body);
    await userEvent.type(body, "Revised after re-running the test.");
    const kind = screen.getByRole("textbox", { name: "Category" });
    await userEvent.clear(kind);
    await userEvent.type(kind, "limitation");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(bridge.updateAnnotation).toHaveBeenCalledWith(
      "ann_1",
      "limitation",
      "Revised after re-running the test.",
    );
    // No refetch — the edited row is what the list shows.
    expect(await screen.findByText("Revised after re-running the test.")).toBeInTheDocument();
    expect(screen.getByText("limitation")).toBeInTheDocument();
    expect(bridge.listAnnotations).toHaveBeenCalledTimes(1);
    // The anchor is not editable and must survive the edit intact.
    expect(screen.getByText("line 12")).toBeInTheDocument();
    expect(screen.getByText("p = 0.003 after correction")).toBeInTheDocument();
  });

  it("abandons an edit on cancel", async () => {
    bridge.listAnnotations.mockResolvedValue([annotation()]);
    render(<AnnotationsCard />);

    await userEvent.click(await screen.findByRole("button", { name: "Edit this annotation" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Note" }), " and more");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(bridge.updateAnnotation).not.toHaveBeenCalled();
    expect(
      screen.getByText("The effect holds after the Bonferroni correction."),
    ).toBeInTheDocument();
  });

  it("deletes only after the confirmation is accepted", async () => {
    bridge.listAnnotations.mockResolvedValue([annotation()]);
    bridge.deleteAnnotation.mockResolvedValue(undefined);
    render(<AnnotationsCard />);

    await userEvent.click(await screen.findByRole("button", { name: "Delete this annotation" }));
    // Deletion is destructive, so nothing has happened yet.
    expect(bridge.deleteAnnotation).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Delete this annotation?" });
    expect(dialog).toHaveTextContent(/file it points at is untouched/i);

    // A plain string name matches exactly, so this is the dialog's Delete
    // button, not the row's "Delete this annotation".
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(bridge.deleteAnnotation).toHaveBeenCalledWith("ann_1");
    await waitFor(() =>
      expect(
        screen.queryByText("The effect holds after the Bonferroni correction."),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps the annotation when the confirmation is canceled", async () => {
    bridge.listAnnotations.mockResolvedValue([annotation()]);
    render(<AnnotationsCard />);

    await userEvent.click(await screen.findByRole("button", { name: "Delete this annotation" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(bridge.deleteAnnotation).not.toHaveBeenCalled();
    expect(
      screen.getByText("The effect holds after the Bonferroni correction."),
    ).toBeInTheDocument();
  });

  it("explains the empty state", async () => {
    bridge.listAnnotations.mockResolvedValue([]);
    render(<AnnotationsCard />);
    expect(await screen.findByText(/Nothing annotated yet/)).toBeInTheDocument();
  });

  it("renders every control at phone width", async () => {
    setViewportWidth(PHONE_WIDTH);
    bridge.listAnnotations.mockResolvedValue([annotation()]);
    render(<AnnotationsCard />);

    expect(
      await screen.findByText("The effect holds after the Bonferroni correction."),
    ).toBeInTheDocument();
    expect(screen.getByText("analysis/report.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit this annotation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete this annotation" })).toBeInTheDocument();

    // The edit form is reachable and usable at this width too.
    await userEvent.click(screen.getByRole("button", { name: "Edit this annotation" }));
    expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("AnnotationsCard in the gateway web client", () => {
  it("hides itself — the science DB is inside the workspace, out of the web client's reach", async () => {
    vi.resetModules();
    vi.doMock("@/lib/webMode", () => ({ isGatewayWeb: true }));
    const { AnnotationsCard: WebCard } = await import("./AnnotationsCard");
    // The spies are file-scoped, so clear the desktop suite's calls before
    // asserting that this render makes none.
    bridge.listAnnotations.mockReset();

    const { container } = render(<WebCard />);
    expect(container).toBeEmptyDOMElement();
    // Nothing is even queried — a failing invoke must not be attempted.
    expect(bridge.listAnnotations).not.toHaveBeenCalled();
  });
});
