import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Memory } from "@/lib/memory";
import { PHONE_WIDTH, setViewportWidth } from "@/test/viewport";
import { MemoryCard } from "./MemoryCard";

const bridge = {
  listMemories: vi.fn<(includeDisabled?: boolean) => Promise<Memory[]>>(),
  setMemoryDisabled: vi.fn<(id: string, disabled: boolean) => Promise<Memory | null>>(),
  deleteMemory: vi.fn<(id: string) => Promise<void>>(),
};

vi.mock("@/lib/memory", () => ({
  listMemories: (...a: [boolean?]) => bridge.listMemories(...a),
  setMemoryDisabled: (...a: [string, boolean]) => bridge.setMemoryDisabled(...a),
  deleteMemory: (...a: [string]) => bridge.deleteMemory(...a),
}));

vi.mock("@/lib/tauri", () => ({ isTauri: true }));

// Read at module init by the card, so each web-mode test needs its own module
// registry (see the web suite below).
vi.mock("@/lib/webMode", () => ({ isGatewayWeb: false }));

const memory = (over: Partial<Memory> = {}): Memory => ({
  id: "mem_1",
  sessionId: null,
  kind: "preference",
  content: "Prefers SI units in figure axes.",
  disabledAt: null,
  createdAt: "2026-07-20T10:30:00.000Z",
  updatedAt: "2026-07-20T10:30:00.000Z",
  ...over,
});

describe("MemoryCard", () => {
  beforeEach(() => {
    bridge.listMemories.mockReset();
    bridge.setMemoryDisabled.mockReset();
    bridge.deleteMemory.mockReset();
  });

  it("lists memories with their kind, content, and when they were learned", async () => {
    bridge.listMemories.mockResolvedValue([memory()]);
    render(<MemoryCard />);

    expect(await screen.findByText("Prefers SI units in figure axes.")).toBeInTheDocument();
    expect(screen.getByText("preference")).toBeInTheDocument();
    // The management view asks for disabled memories too — the user must be able
    // to see what was learned and undo it.
    expect(bridge.listMemories).toHaveBeenCalledWith(true);
    // A locale-formatted timestamp, not the raw ISO string.
    expect(screen.queryByText("2026-07-20T10:30:00.000Z")).not.toBeInTheDocument();
  });

  it("shows a disabled memory as still present but marked disabled", async () => {
    bridge.listMemories.mockResolvedValue([
      memory({ id: "mem_off", disabledAt: "2026-07-21T09:00:00.000Z", content: "old habit" }),
    ]);
    render(<MemoryCard />);

    expect(await screen.findByText("old habit")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    // The switch is the undo affordance: off, and offering to enable.
    const toggle = screen.getByRole("switch", { name: "Enable this memory" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("toggles a memory off and reflects the saved row", async () => {
    bridge.listMemories.mockResolvedValue([memory()]);
    bridge.setMemoryDisabled.mockResolvedValue(
      memory({ disabledAt: "2026-07-26T12:00:00.000Z" }),
    );
    render(<MemoryCard />);

    await userEvent.click(await screen.findByRole("switch", { name: "Disable this memory" }));
    expect(bridge.setMemoryDisabled).toHaveBeenCalledWith("mem_1", true);
    // No refetch — the row the command returned is what the list shows.
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
    expect(bridge.listMemories).toHaveBeenCalledTimes(1);
  });

  it("re-enables a disabled memory", async () => {
    bridge.listMemories.mockResolvedValue([memory({ disabledAt: "2026-07-21T09:00:00.000Z" })]);
    bridge.setMemoryDisabled.mockResolvedValue(memory({ disabledAt: null }));
    render(<MemoryCard />);

    await userEvent.click(await screen.findByRole("switch", { name: "Enable this memory" }));
    expect(bridge.setMemoryDisabled).toHaveBeenCalledWith("mem_1", false);
    await waitFor(() => expect(screen.queryByText("Disabled")).not.toBeInTheDocument());
  });

  it("deletes only after the confirmation is accepted", async () => {
    bridge.listMemories.mockResolvedValue([memory()]);
    bridge.deleteMemory.mockResolvedValue(undefined);
    render(<MemoryCard />);

    await userEvent.click(await screen.findByRole("button", { name: "Delete this memory" }));
    // Deletion is destructive, so nothing has happened yet.
    expect(bridge.deleteMemory).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Delete this memory?" });
    // The dialog names disabling as the non-destructive alternative.
    expect(dialog).toHaveTextContent(/disable it instead/i);

    // A plain string name matches exactly, so this is the dialog's Delete
    // button, not the row's "Delete this memory".
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(bridge.deleteMemory).toHaveBeenCalledWith("mem_1");
    await waitFor(() =>
      expect(screen.queryByText("Prefers SI units in figure axes.")).not.toBeInTheDocument(),
    );
  });

  it("keeps the memory when the confirmation is canceled", async () => {
    bridge.listMemories.mockResolvedValue([memory()]);
    render(<MemoryCard />);

    await userEvent.click(await screen.findByRole("button", { name: "Delete this memory" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(bridge.deleteMemory).not.toHaveBeenCalled();
    expect(screen.getByText("Prefers SI units in figure axes.")).toBeInTheDocument();
  });

  it("explains the empty state", async () => {
    bridge.listMemories.mockResolvedValue([]);
    render(<MemoryCard />);
    expect(await screen.findByText(/Nothing learned yet/)).toBeInTheDocument();
  });

  it("says so when a stored body could not be read", async () => {
    bridge.listMemories.mockResolvedValue([memory({ content: null })]);
    render(<MemoryCard />);
    expect(await screen.findByText("Content unavailable.")).toBeInTheDocument();
  });

  it("renders every control at phone width", async () => {
    setViewportWidth(PHONE_WIDTH);
    bridge.listMemories.mockResolvedValue([memory()]);
    render(<MemoryCard />);

    expect(await screen.findByText("Prefers SI units in figure axes.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Disable this memory" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete this memory" })).toBeInTheDocument();
  });
});

describe("MemoryCard in the gateway web client", () => {
  it("hides itself — the science DB is inside the workspace, out of the web client's reach", async () => {
    vi.resetModules();
    vi.doMock("@/lib/webMode", () => ({ isGatewayWeb: true }));
    const { MemoryCard: WebCard } = await import("./MemoryCard");
    // The spies are file-scoped, so clear the desktop suite's calls before
    // asserting that this render makes none.
    bridge.listMemories.mockReset();

    const { container } = render(<WebCard />);
    expect(container).toBeEmptyDOMElement();
    // Nothing is even queried — a failing invoke must not be attempted.
    expect(bridge.listMemories).not.toHaveBeenCalled();
  });
});
