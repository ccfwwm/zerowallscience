import { describe, expect, it } from "vitest";
import { buildAutoFixPrompt, buildReviewPrompt, reviewableThreadOutput, splitReview } from "./review";
import type { ReviewFinding } from "@zerowall/shared";

describe("splitReview", () => {
  it("extracts a review fence into a reviewer block and cleans the text", () => {
    const md =
      "I reviewed the figure.\n\n```review\n" +
      JSON.stringify({
        findings: [
          { level: "ok", title: "Data traces to code", evidence: "make_fig.py L10", check: "figure" },
          { level: "bogus-level", title: "Missing seed", check: "bogus-check" },
        ],
        note: "Overall solid.",
      }) +
      "\n```\n\nLet me know.";
    const { clean, review } = splitReview(md);
    expect(review).not.toBeNull();
    expect(review!.findings).toHaveLength(2);
    expect(review!.findings[0]).toMatchObject({
      level: "ok",
      title: "Data traces to code",
      check: "figure",
    });
    expect(review!.findings[1].level).toBe("warn"); // unknown level coerced
    expect(review!.findings[1].check).toBeUndefined(); // unknown check dropped
    expect(review!.note).toBe("Overall solid.");
    expect(clean).not.toContain("```review");
    expect(clean).toContain("I reviewed the figure.");
  });

  it("parses a domain-correctness finding with its tag", () => {
    const md =
      "```review\n" +
      JSON.stringify({
        findings: [
          {
            level: "error",
            check: "domain",
            tag: "earth · crs",
            title: "Euclidean distance on latitude/longitude",
            evidence: "analysis.py:9",
          },
        ],
        note: "Domain-correctness gate — no guarantee of correctness.",
      }) +
      "\n```";
    const { review } = splitReview(md);
    expect(review!.findings[0]).toMatchObject({
      level: "error",
      check: "domain",
      tag: "earth · crs",
      title: "Euclidean distance on latitude/longitude",
    });
  });

  it("parses an analysis-integrity finding with its tag", () => {
    const md =
      "```review\n" +
      JSON.stringify({
        findings: [
          {
            level: "warn",
            check: "integrity",
            tag: "stats · prereg",
            title: "Predictor not in the preregistration",
            evidence: "analysis.py:2",
          },
        ],
      }) +
      "\n```";
    const { review } = splitReview(md);
    expect(review!.findings[0]).toMatchObject({ check: "integrity", tag: "stats · prereg" });
  });

  it("leaves text untouched when there is no fence or the JSON is malformed", () => {
    expect(splitReview("plain answer").review).toBeNull();
    const malformed = "```review\n{not json}\n```";
    const r = splitReview(malformed);
    expect(r.review).toBeNull();
    expect(r.clean).toBe(malformed);
  });
});

describe("reviewableThreadOutput", () => {
  it("keeps inspectable agent, tool, and artifact output but excludes user prompts", () => {
    const raw = reviewableThreadOutput([
      { kind: "user", text: "secret question" },
      { kind: "agent", markdown: "supported claim" },
      { kind: "tool-call", title: "Read results.csv", status: "success", output: "42" },
      { kind: "artifact", path: "report.md", filename: "report.md", artifact: "report", tool: "write" },
    ]);

    expect(raw).toContain("supported claim");
    expect(raw).toContain("Read results.csv");
    expect(raw).toContain("report.md");
    expect(raw).not.toContain("secret question");
  });
});

describe("buildReviewPrompt", () => {
  it("asks for a read-only audit and a ```review block splitReview can parse", () => {
    const prompt = buildReviewPrompt();
    expect(prompt).toContain("READ-ONLY");
    expect(prompt).toMatch(/claims, methods, statistics, code, figures, and results/);
    // Advertises the exact three levels and the fence tag.
    expect(prompt).toContain('"level": "ok" | "warn" | "error"');
    expect(prompt).toContain("```review");
    // What it instructs the agent to emit must round-trip through splitReview.
    const emitted =
      "Here is my review.\n\n```review\n" +
      JSON.stringify({
        findings: [{ level: "warn", title: "No random seed set", check: "integrity" }],
        note: "Otherwise sound.",
      }) +
      "\n```";
    const { review } = splitReview(emitted);
    expect(review!.findings[0]).toMatchObject({ level: "warn", check: "integrity" });
  });
});

describe("buildAutoFixPrompt", () => {
  const finding: ReviewFinding = {
    level: "error",
    title: "Euclidean distance on latitude/longitude",
    evidence: "analysis.py:9",
    check: "domain",
    tag: "earth · crs",
    artifactPath: "src/analysis.py",
  };

  it("scopes the fix to one finding and carries its title and evidence", () => {
    const prompt = buildAutoFixPrompt(finding);
    expect(prompt).toContain("only this finding");
    expect(prompt).toContain(finding.title);
    expect(prompt).toContain(finding.evidence!);
    expect(prompt).toContain(finding.artifactPath!);
    expect(prompt).toContain(finding.tag!);
    expect(prompt).toContain(finding.check!);
    expect(prompt).toContain(finding.level);
    // Not a read-only audit: it edits through the normal approval flow.
    expect(prompt).toContain("normal approval flow");
  });

  it("omits optional lines when the finding carries only a title", () => {
    const prompt = buildAutoFixPrompt({ level: "warn", title: "Vague claim" });
    expect(prompt).toContain("Vague claim");
    expect(prompt).not.toContain("- Artifact:");
    expect(prompt).not.toContain("- Evidence:");
    expect(prompt).not.toContain("- Tag:");
    expect(prompt).not.toContain("- Check:");
  });
});
