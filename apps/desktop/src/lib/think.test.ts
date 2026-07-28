import { describe, expect, it } from "vitest";
import { splitThink } from "./think";

describe("splitThink", () => {
  it("returns the text unchanged when there is no think tag", () => {
    expect(splitThink("just an answer")).toEqual({ clean: "just an answer", reasoning: "" });
  });

  it("pulls a single <think> span out of the prose", () => {
    const { clean, reasoning } = splitThink("<think>weigh options</think>The answer is 42.");
    expect(clean).toBe("The answer is 42.");
    expect(reasoning).toBe("weigh options");
  });

  it("accepts the <thinking> spelling too", () => {
    const { clean, reasoning } = splitThink("<thinking>hmm</thinking>done");
    expect(clean).toBe("done");
    expect(reasoning).toBe("hmm");
  });

  it("keeps prose that surrounds the think span", () => {
    const { clean, reasoning } = splitThink("Intro. <think>aside</think> Outro.");
    expect(clean).toBe("Intro.  Outro.".trim());
    expect(reasoning).toBe("aside");
  });

  it("concatenates multiple think spans", () => {
    const { clean, reasoning } = splitThink("<think>a</think>X<think>b</think>Y");
    expect(clean).toBe("XY");
    expect(reasoning).toBe("a\n\nb");
  });

  it("treats an unterminated <think> as pure reasoning (mid-stream)", () => {
    const { clean, reasoning } = splitThink("<think>still thinking");
    expect(clean).toBe("");
    expect(reasoning).toBe("still thinking");
  });

  it("is case-insensitive on the tag", () => {
    const { clean, reasoning } = splitThink("<THINK>up</THINK>down");
    expect(clean).toBe("down");
    expect(reasoning).toBe("up");
  });
});
