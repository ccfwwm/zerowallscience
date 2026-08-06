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
  let startDraft: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    switchRuntime = vi.fn(async () => {});
    startDraft = vi.fn();
    act(() => {
      useRuntimeStore.setState({
        acpProfileId: null,
        switchRuntime,
        startDraft,
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
    expect(startDraft).not.toHaveBeenCalled();
  });

  it("switches back to OpenCode through the unified Host profile", async () => {
    const user = userEvent.setup();
    useRuntimeStore.setState({ acpProfileId: "codex" });
    render(<EnginePicker />);

    await user.click(screen.getByRole("button", { name: "Switch engine" }));
    await user.click(screen.getByRole("menuitemradio", { name: "OpenCode" }));

    expect(switchRuntime).toHaveBeenCalledWith("opencode");
  });

  it("requires a new immutable session when the current conversation has content", async () => {
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

    expect(screen.getByRole("menuitem", { name: "New conversation" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy context" })).toBeInTheDocument();
    expect(switchRuntime).not.toHaveBeenCalled();

    await user.click(screen.getByRole("menuitem", { name: "Copy context" }));
    expect(startDraft).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().composerDraft).toContain("User: Question");
    expect(useUiStore.getState().composerDraft).toContain("Assistant: Answer");
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

  it("disables confirmation actions if the conversation starts running", async () => {
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

    await user.click(screen.getByRole("button", { name: "Switch engine" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Codex" }));
    act(() => {
      useRuntimeStore.setState({ runningSessions: { "session-1": true } });
    });

    expect(screen.getByRole("menuitem", { name: "New conversation" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Copy context" })).toBeDisabled();
    await user.click(screen.getByRole("menuitem", { name: "Copy context" }));
    expect(switchRuntime).not.toHaveBeenCalled();
    expect(startDraft).not.toHaveBeenCalled();
  });
});
