import { describe, expect, it } from "vitest";
import { splitMethodContext, toReviewFinding, type MethodFinding } from "./methodCheck";

describe("toReviewFinding", () => {
  it("maps an engine finding onto a method_choice reviewer finding", () => {
    const f: MethodFinding = {
      level: "error",
      rule: "paired_design_independent_test",
      title: "Paired design analyzed with an independent-samples test",
      evidence: "Design is paired but the test treats the groups as independent.",
    };
    expect(toReviewFinding(f)).toEqual({
      level: "error",
      title: "Paired design analyzed with an independent-samples test",
      evidence: "Design is paired but the test treats the groups as independent.",
      check: "method_choice",
    });
  });

  it("drops empty evidence to undefined so the card omits the body", () => {
    const f: MethodFinding = { level: "ok", rule: "method_fit", title: "Method choice consistent", evidence: "" };
    const r = toReviewFinding(f);
    expect(r.evidence).toBeUndefined();
    expect(r.check).toBe("method_choice");
    expect(r.level).toBe("ok");
  });
});

describe("splitMethodContext", () => {
  it("extracts a nested context + note and strips the fence", () => {
    const md =
      "Here is what I extracted.\n\n```method\n" +
      JSON.stringify({
        context: { design: "paired", testUsed: "independent t-test", groups: 2 },
        note: "Design read from the methods section.",
      }) +
      "\n```\n\nRunning the check.";
    const { clean, method } = splitMethodContext(md);
    expect(method).not.toBeNull();
    expect(method!.context).toEqual({
      design: "paired",
      testUsed: "independent t-test",
      groups: 2,
      outcomeType: undefined,
      sampleSize: undefined,
      normality: undefined,
      nComparisons: undefined,
      correctionApplied: undefined,
    });
    expect(method!.note).toBe("Design read from the methods section.");
    expect(clean).not.toContain("```method");
    expect(clean).toContain("Here is what I extracted.");
  });

  it("accepts context fields at the top level and drops junk keys", () => {
    const md = "```method\n" + JSON.stringify({ design: "independent", testUsed: "paired t-test", bogus: 1 }) + "\n```";
    const { method } = splitMethodContext(md);
    expect(method!.context.design).toBe("independent");
    expect(method!.context.testUsed).toBe("paired t-test");
    expect(method!.context).not.toHaveProperty("bogus");
  });

  it("returns method: null and leaves the text when there is no fence", () => {
    const { clean, method } = splitMethodContext("no fences here");
    expect(method).toBeNull();
    expect(clean).toBe("no fences here");
  });

  it("returns method: null for malformed JSON", () => {
    const md = "```method\n{ not json ]\n```";
    expect(splitMethodContext(md).method).toBeNull();
  });
});
