import { describe, expect, it } from "vitest";
import type { UsageEvent } from "@zerowall/sdk";
import { usageByWorkspace, usageInputFromEvent } from "./usage";

const base: UsageEvent = {
  type: "usage",
  sessionId: "ses_1",
  messageID: "m1",
  input: 100,
  output: 42,
  reasoning: 8,
  cacheRead: 16,
  cacheWrite: 0,
  cost: 0.0021,
};

describe("usageInputFromEvent", () => {
  it("maps a live usage event to the record payload, cost included when priced", () => {
    expect(usageInputFromEvent(base)).toEqual({
      sessionId: "ses_1",
      messageId: "m1",
      usage: { input: 100, output: 42, reasoning: 8, cacheRead: 16, cacheWrite: 0, cost: 0.0021 },
    });
  });

  it("omits cost when the provider priced nothing (undefined), never a fabricated 0", () => {
    const { cost, ...unpriced } = base;
    void cost;
    const out = usageInputFromEvent(unpriced);
    expect(out?.usage).not.toHaveProperty("cost");
  });

  it("returns null when the event has no session or message id to key on", () => {
    expect(usageInputFromEvent({ ...base, sessionId: "" })).toBeNull();
    expect(usageInputFromEvent({ ...base, messageID: "" })).toBeNull();
  });
});

describe("usageByWorkspace", () => {
  it("returns an empty rollup outside Tauri and the gateway (browser dev)", async () => {
    const data = await usageByWorkspace();
    expect(data.sessions).toEqual([]);
    expect(data.total).toEqual({
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: null,
      replies: 0,
    });
  });
});
