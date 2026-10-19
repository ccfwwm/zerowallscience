/**
 * Tests for the WeChat send helpers: splitText.
 * Ported from wechat-opencode (MIT) — test-enqueue-outbound.mjs style cases.
 *
 * Extended for markdown-aware segmentation: fences and GFM tables are
 * atomic, breaks prefer blank line / newline / space at `>= 55%` of the
 * budget, the budget counts code points, and multi-segment bodies are
 * prefixed `（i/n）`.
 */

import { describe, expect, it } from "vitest";
import { sanitizeWeChatText, splitText } from "../src/weixin/send.js";

/** Code points, the unit `splitText` budgets in. */
const cp = (text: string) => Array.from(text).length;
/** Segment body with the `（i/n）` prefix removed. */
const body = (segment: string) => segment.replace(/^（\d+\/\d+）\s*/, "");

describe("splitText", () => {
  it("returns the text unchanged when within the limit", () => {
    expect(splitText("hello", 10)).toEqual(["hello"]);
    expect(splitText("", 10)).toEqual([""]);
  });

  it("returns one UNPREFIXED segment just under the limit", () => {
    const text = "a".repeat(99);
    expect(splitText(text, 100)).toEqual([text]);
  });

  it("splits on line breaks when available near the limit", () => {
    const text = "line one\nline two\nline three";
    const segments = splitText(text, 10);
    expect(segments).toEqual(["line one", "line two", "line three"]);
  });

  it("hard-splits long lines without line breaks", () => {
    const text = "a".repeat(25);
    const segments = splitText(text, 10);
    expect(segments.join("")).toBe(text);
    expect(segments.length).toBeGreaterThan(1);
  });

  it("strips the leading newline after a line-break split", () => {
    const text = "1234567890\nrest";
    const segments = splitText(text, 10);
    // The newline is the break itself: it separates the messages, so it must
    // not survive as a leading blank line in the second one.
    expect(segments).toEqual(["1234567890", "rest"]);
    expect(segments.every((s) => !s.startsWith("\n"))).toBe(true);
  });

  it("handles exact-boundary content", () => {
    expect(splitText("a".repeat(10), 10)).toEqual(["a".repeat(10)]);
  });

  it("does not split a surrogate pair on a hard cut", () => {
    const wave = "👋";
    const text = `${"a".repeat(9)}${wave}${"b".repeat(20)}`;
    const segments = splitText(text, 10);
    for (const segment of segments) {
      expect(segment).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(segment).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(segments.join("").replace(/（\d+\/\d+）\s*/g, "")).toBe(text);
  });
});

describe("splitText: code-point budget", () => {
  it("counts emoji as one code point, not two UTF-16 units", () => {
    // Ten emoji are 20 UTF-16 units but 10 code points: one segment fits.
    const text = "👋".repeat(10);
    expect(splitText(text, 10)).toEqual([text]);
  });

  it("keeps emoji pairs whole across segments", () => {
    const text = "👋".repeat(30);
    const segments = splitText(text, 10);
    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      expect(segment).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(segment).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(segments.join("")).toBe(text);
  });
});

describe("splitText: indexed segments", () => {
  it("prefixes every segment once the body needs more than one", () => {
    const segments = splitText("a".repeat(60), 20);
    expect(segments.length).toBeGreaterThan(1);
    segments.forEach((segment, index) => {
      expect(segment.startsWith(`（${index + 1}/${segments.length}）`)).toBe(true);
    });
    expect(segments.join("").replace(/（\d+\/\d+）\s*/g, "")).toBe("a".repeat(60));
  });

  it("numbers a two-segment body （1/2） and （2/2）", () => {
    const text = `${"a".repeat(20)}\n${"b".repeat(20)}`;
    const segments = splitText(text, 30);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.startsWith("（1/2）")).toBe(true);
    expect(segments[1]!.startsWith("（2/2）")).toBe(true);
    expect(segments.map(body).join("\n")).toBe(text);
  });

  it("charges the prefix against the same budget", () => {
    const segments = splitText("x".repeat(120), 20);
    for (const segment of segments) expect(cp(segment)).toBeLessThanOrEqual(20);
  });
});

describe("splitText: fences are atomic", () => {
  const fence = "```ts\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```";

  it("never cuts a fence in half when it fits", () => {
    const text = `前文\n\n${fence}\n\n后文`;
    const segments = splitText(text, 4000);
    expect(segments).toEqual([text]);
  });

  it("does not cut through a fence that fits a segment of its own", () => {
    const body = `开头段落。\n\n${fence}\n\n结尾段落。`;
    const segments = splitText(body, 60);
    const fenceSegment = segments.find((s) => s.includes("```ts"));
    expect(fenceSegment).toBeDefined();
    // The fence arrives complete: both delimiters and every body line.
    expect(fenceSegment!.match(/```/g)).toHaveLength(2);
    expect(fenceSegment).toContain("const a = 1;");
    expect(fenceSegment).toContain("const c = 3;");
    expect(fenceSegment).not.toContain("结尾段落。");
  });

  it("splits an over-long fence while repeating the delimiters", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}-${"x".repeat(10)}`);
    const segments = splitText(`\`\`\`\n${lines.join("\n")}\n\`\`\``, 60);
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      expect(segment.match(/```/g)).toHaveLength(2);
      expect(body(segment).startsWith("```")).toBe(true);
      expect(body(segment).endsWith("```")).toBe(true);
      expect(cp(segment)).toBeLessThanOrEqual(60);
    }
    // Every original line survives exactly once.
    const joined = segments.join("\n");
    for (const line of lines) expect(joined).toContain(line);
  });
});

describe("splitText: tables repeat their header", () => {
  const table = [
    "| 项目 | 状态 |",
    "| --- | --- |",
    "| alpha | 完成 |",
    "| beta | 进行中 |",
  ].join("\n");

  it("keeps a small table in one piece", () => {
    const segments = splitText(`正文\n\n${table}`, 4000);
    expect(segments).toEqual([`正文\n\n${table}`]);
  });

  it("repeats header + separator in every segment of an over-long table", () => {
    const rows = Array.from({ length: 12 }, (_, i) => `| row-${i} | ${"y".repeat(20)} |`);
    const long = ["| 项目 | 状态 |", "| --- | --- |", ...rows].join("\n");
    const segments = splitText(`说明\n\n${long}`, 70);
    expect(segments.length).toBeGreaterThan(1);
    const tableSegments = segments.filter((s) => s.includes("row-"));
    expect(tableSegments.length).toBeGreaterThan(1);
    for (const segment of tableSegments) {
      expect(segment).toContain("| 项目 | 状态 |");
      expect(segment).toContain("| --- | --- |");
      expect(cp(segment)).toBeLessThanOrEqual(70);
    }
    const joined = segments.join("\n");
    for (const row of rows) expect(joined).toContain(row);
  });
});

describe("splitText: break preference", () => {
  it("prefers a blank line over a newline", () => {
    const text = `段落一\n\n${"b".repeat(30)}`;
    const segments = splitText(text, 20);
    expect(segments.length).toBeGreaterThan(1);
    // The only break in the first window is the blank line at 20% of the
    // budget; a hard cut would have split inside the run of `b`s instead.
    expect(body(segments[0]!)).toContain("段落一\n\n");
    expect(body(segments[0]!)).not.toContain("b".repeat(9));
  });

  it("keeps a short tail with the following text instead of emitting a tiny chunk", () => {
    const text = `段落一\n\n${"b".repeat(30)}`;
    for (const limit of [21, 25, 40]) {
      const segments = splitText(text, limit);
      // Nothing but the final segment may be this small.
      segments.slice(0, -1).forEach((segment) => {
        expect(cp(body(segment))).toBeGreaterThan(Math.ceil(limit * 0.55) - 8);
      });
    }
  });

  it("falls back to a space when there is no newline", () => {
    const text = `${"w".repeat(8)} ${"v".repeat(30)}`;
    const segments = splitText(text, 20);
    expect(body(segments[0]!).trimEnd().endsWith("w")).toBe(true);
  });
});

describe("splitText: segment budget", () => {
  const mixed = [
    "# 标题",
    "",
    "一段中文说明，附带一个 https://example.com/some/very/long/path?query=1 链接。",
    "",
    "```js",
    "console.log('👋'.repeat(3));",
    "```",
    "",
    "| a | b |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "结尾。",
  ].join("\n");

  it("no segment exceeds the limit for mixed content", () => {
    for (const limit of [55, 80, 4000]) {
      const segments = splitText(mixed, limit);
      for (const segment of segments) {
        expect(cp(segment)).toBeLessThanOrEqual(limit);
      }
    }
  });

  it("overruns only when a construct cannot be made to fit at all", () => {
    // A minimal valid table (`header + separator + one row`) is 22 code
    // points; at limit 30 the numbered budget leaves 22, so the table's
    // first segment is the only one allowed to exceed — and only because
    // cutting it would strip the header that makes it render as a table.
    const segments = splitText(mixed, 30);
    for (const segment of segments) {
      if (cp(segment) <= 30) continue;
      expect(segment).toContain("| --- |");
      expect(segment).toContain("| a | b |");
    }
    for (const segment of segments.filter((s) => !s.includes("| --- |"))) {
      expect(cp(segment)).toBeLessThanOrEqual(30);
    }
  });

  it("keeps every code point of the original body across the segments", () => {
    const text = `abc\n\n${"z".repeat(100)}`;
    const segments = splitText(text, 25);
    const joined = segments.join("").replace(/（\d+\/\d+）\s*/g, "").replace(/\s+/g, "");
    expect(joined).toBe(text.replace(/\s+/g, ""));
  });

  it("degrades safely for a nonsense limit instead of throwing or looping", () => {
    const text = "a".repeat(50);
    for (const limit of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const segments = splitText(text, limit);
      expect(segments.join("").replace(/（\d+\/\d+）\s*/g, "")).toBe(text);
      expect(segments.length).toBeGreaterThan(0);
    }
  });
});

describe("sanitizeWeChatText", () => {
  it("replaces a lone high surrogate left by truncation", () => {
    const poisoned = `${"x".repeat(5)}\uD83C…`;
    expect(sanitizeWeChatText(poisoned)).toBe(`${"x".repeat(5)}\uFFFD…`);
  });

  it("keeps a complete emoji pair", () => {
    expect(sanitizeWeChatText("hi 👋")).toBe("hi 👋");
  });
});
