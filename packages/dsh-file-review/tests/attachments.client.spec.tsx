// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewUserMessage } from "../src/client/ReviewUserMessage.tsx";

// The Harness browser bundle uses a ModuleLoader that is not present in this
// source-level plugin test. Its own attachment-actions test exercises the real
// card; here we verify the plugin's renderer passes the required scope to it.
const { bubbles } = vi.hoisted(() => ({ bubbles: vi.fn() }));
vi.mock("@deepseek-ai/dsh-client-ui-chat/client", () => ({
  UserStyleBubble: (props: { actions?: (text: string) => unknown }) => {
    bubbles(props);
    return createElement("div", null, props.actions?.("review fixture"));
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  bubbles.mockClear();
});

const file = {
  attachmentId: `sha256:${"a".repeat(64)}`,
  name: "paper.pdf",
  bytes: 1024,
  mediaType: "application/pdf",
};

function message(content: readonly unknown[]) {
  return {
    node: { data: { content, time: 1 } },
    sessionId: "session",
    cwd: "C:/workspace",
    renderMessageImages: () => null,
    openFile: vi.fn(),
    openSkill: vi.fn(),
    t: (key: string) => key,
    reviewT: (key: string) => key,
  } as unknown as Parameters<typeof ReviewUserMessage>[0];
}

it("passes current session and workspace to the shared attachment card in ordinary messages", () => {
  const content = [
    { type: "file", attachment: file },
    { type: "text", text: "Read this paper" },
  ];
  render(<ReviewUserMessage {...message(content)} />);
  expect(bubbles).toHaveBeenCalledOnce();
  expect(bubbles.mock.calls[0]![0]).toMatchObject({
    content,
    fileActionScope: { sessionId: "session", cwd: "C:/workspace" },
  });
});

it("keeps file attachments actionable alongside projected review comments", () => {
  const text =
    '<file_review_comments><file path="a.md"><comment kind="add" old_line="" new_line="1"><feedback>Keep this</feedback></comment></file></file_review_comments>\n\nPlease review.';
  const block = { type: "file", attachment: file };
  const view = render(<ReviewUserMessage {...message([{ type: "text", text }, block])} />);
  expect(view.getByText("Please review.")).toBeTruthy();
  expect(bubbles).toHaveBeenCalledOnce();
  expect(bubbles.mock.calls[0]![0]).toMatchObject({
    content: [block],
    fileActionScope: { sessionId: "session", cwd: "C:/workspace" },
  });
  expect(view.queryByText("message.extraBlock")).toBeNull();
});
