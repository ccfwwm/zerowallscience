import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import { EnginePicker, contextFromBlocks } from "./EnginePicker";

describe("EnginePicker", () => {
  const runtimeInitial = useRuntimeStore.getState();
  const uiInitial = useUiStore.getState();
  let switchRuntime: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    switchRuntime = vi.fn(async () => {});
    act(() => {
      useRuntimeStore.setState({
        acpProfileId: null,
        switchRuntime,
        currentId: null,
        threads: {},
        switching: false,
        sending: false,
        runningSessions: {},
      });
      useUiStore.setState({ composerDraft: null });
    });
  });

  afterEach(() => {
    act(() => {
      useRuntimeStore.setState(runtimeInitial, true);
      useUiStore.setState(uiInitial, true);
    });
  });

  it("switches an empty draft from OpenCode to Codex", async () => {
    const user = userEvent.setup();
    render(<EnginePicker />);

    await user.click(screen.getByRole("button", { name: "Switch engine" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Codex" }));

    expect(switchRuntime).toHaveBeenCalledWith("codex");
    expect(screen.queryByRole("menuitem", { name: "New conversation" })).not.toBeInTheDocument();
  });

  it("switches back to OpenCode through the unified Host profile", async () => {
    const user = userEvent.setup();
    useRuntimeStore.setState({ acpProfileId: "codex" });
    render(<EnginePicker />);

    await user.click(screen.getByRole("button", { name: "Switch engine" }));
    await user.click(screen.getByRole("menuitemradio", { name: "OpenCode" }));

    expect(switchRuntime).toHaveBeenCalledWith("opencode");
  });

  it("switches directly while preserving the current conversation context", async () => {
    const user = userEvent.setup();
    useRuntimeStore.setState({
      currentId: "session-1",
      threads: {
        "session-1": {
          loaded: true,
          index: {},
          blocks: [
            { kind: "user", text: "Question" },
            { kind: "agent", markdown: "Answer" },
          ],
        },
      },
    });
    render(<EnginePicker sessionId="session-1" />);

    await user.click(screen.getByRole("button", { name: "Switch engine" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Claude Code" }));

    expect(switchRuntime).toHaveBeenCalledWith("claude-code");
  });

  it("extracts concise conversation context and omits reasoning", () => {
    expect(
      contextFromBlocks([
        { kind: "user", text: "Question" },
        { kind: "reasoning", text: "hidden" },
        { kind: "tool-call", title: "Search", status: "success" },
        { kind: "agent", markdown: "Answer" },
      ]),
    ).toBe("User: Question\n\nTool: Search\n\nAssistant: Answer");
  });

  it("disables engine switching while the conversation is running", async () => {
    const user = userEvent.setup();
    useRuntimeStore.setState({
      currentId: "session-1",
      threads: {
        "session-1": {
          loaded: true,
          index: {},
          blocks: [{ kind: "user", text: "Question" }],
        },
      },
    });
    render(<EnginePicker sessionId="session-1" />);

    act(() => {
      useRuntimeStore.setState({ runningSessions: { "session-1": true } });
    });
    await user.click(screen.getByRole("button", { name: "Switch engine" }));
    expect(switchRuntime).not.toHaveBeenCalled();
  });
});
