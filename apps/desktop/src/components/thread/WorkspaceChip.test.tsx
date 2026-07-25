import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRuntimeStore } from "@/lib/runtime";
import { WorkspaceChip } from "./WorkspaceChip";

// workspacePath reflects the folder setWorkspace last persisted, like the real bridge.
const mocks = vi.hoisted(() => ({ pickedFolder: null as string | null, activePath: "/ws/base" }));

vi.mock("@/lib/tauri", () => ({
  isTauri: true,
  logDebug: async () => {},
  detectTools: async () => [],
  startRuntime: async () => "http://127.0.0.1:1",
  workspacePath: async () => mocks.activePath,
  setWorkspace: async (path: string) => {
    mocks.activePath = path;
    return path;
  },
  newDatedWorkspace: async (name: string) => `/ws/${name}`,
  pickFolder: async () => mocks.pickedFolder,
  getApprovalMode: async () => "approve",
  setApprovalMode: async () => {},
}));
vi.mock("@/lib/kernel", () => ({ kernelReset: async () => {} }));
// switchWorkspace reconnects after a pick — give it a client that connects instantly.
vi.mock("@zerowall/sdk", () => {
  class OpenCodeClient {
    private statusCb: (s: string) => void = () => {};
    onStatus(cb: (s: string) => void) {
      this.statusCb = cb;
    }
    onEvent() {}
    async connect() {
      this.statusCb("ready");
    }
    async listSessions() {
      return [];
    }
    async listSkills() {
      return [{ name: "stub" }];
    }
    async listAgents() {
      return [];
    }
    async getDefaultModel() {
      return null;
    }
    close() {}
  }
  return { OpenCodeClient, DEFAULT_OPENCODE_URL: "http://127.0.0.1:4096" };
});

describe("WorkspaceChip", () => {
  beforeEach(() => {
    mocks.pickedFolder = null;
    mocks.activePath = "/ws/base";
    useRuntimeStore.setState({ currentId: null, workspacePinned: false, workspace: "/ws/base" });
  });

  it("is a bare folder icon for a fresh draft (dated folder is the default)", () => {
    render(<WorkspaceChip />);
    const btn = screen.getByRole("button", { name: "Choose session folder" });
    expect(btn.title).toContain("new dated folder");
    // No folder name shown until the user actually picks one.
    expect(screen.queryByText("base")).not.toBeInTheDocument();
  });

  it("picking a folder pins it and shows its name", async () => {
    mocks.pickedFolder = "/ws/mine";
    render(<WorkspaceChip />);
    await userEvent.click(screen.getByRole("button", { name: "Choose session folder" }));
    await waitFor(() => expect(useRuntimeStore.getState().workspacePinned).toBe(true));
    expect(await screen.findByText("mine")).toBeInTheDocument();
  });

  it("cancelling the picker changes nothing", async () => {
    render(<WorkspaceChip />);
    await userEvent.click(screen.getByRole("button", { name: "Choose session folder" }));
    expect(useRuntimeStore.getState().workspacePinned).toBe(false);
  });

  it("disappears for an open session (the Files toggle names the folder instead)", () => {
    useRuntimeStore.setState({ currentId: "ses_1", workspace: "/ws/2026-07-04-0900" });
    const { container } = render(<WorkspaceChip />);
    expect(container).toBeEmptyDOMElement();
  });
});
