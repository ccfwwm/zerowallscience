import { describe, expect, it } from "vitest";
import { splitBioClaims, toReviewFinding, type BioFinding } from "./bioCheck";

describe("toReviewFinding", () => {
  it("maps an engine finding onto a bio_plausibility reviewer finding", () => {
    const f: BioFinding = {
      level: "error",
      rule: "bio_entity_not_found",
      title: "Protein symbol not found in UniProt",
      evidence: "No reviewed human entry for symbol TPP53 (likely a typo).",
    };
    expect(toReviewFinding(f)).toEqual({
      level: "error",
      title: "Protein symbol not found in UniProt",
      evidence: "No reviewed human entry for symbol TPP53 (likely a typo).",
      check: "bio_plausibility",
    });
  });

  it("drops empty evidence to undefined so the card omits the body", () => {
    const f: BioFinding = { level: "ok", rule: "bio_entity_found", title: "TP53 confirmed", evidence: "" };
    const r = toReviewFinding(f);
    expect(r.evidence).toBeUndefined();
    expect(r.check).toBe("bio_plausibility");
    expect(r.level).toBe("ok");
  });
});

describe("splitBioClaims", () => {
  it("extracts a nested claims + note and strips the fence", () => {
    const md =
      "Here are the claims I found.\n\n```bio\n" +
      JSON.stringify({
        claims: [{ kind: "protein", symbol: "TP53", organismId: 9606, statement: "We measured TP53." }],
        note: "Read from the Results section.",
      }) +
      "\n```\n\nRunning the check.";
    const { clean, bio } = splitBioClaims(md);
    expect(bio).not.toBeNull();
    expect(bio!.claims).toEqual([
      { kind: "protein", symbol: "TP53", organismId: 9606, statement: "We measured TP53." },
    ]);
    expect(bio!.note).toBe("Read from the Results section.");
    expect(clean).not.toContain("```bio");
    expect(clean).toContain("Here are the claims I found.");
  });

  it("accepts a bare array of claims and drops junk keys", () => {
    const md =
      "```bio\n" +
      JSON.stringify([{ kind: "go_term", goId: "GO:0006915", bogus: 1 }]) +
      "\n```";
    const { bio } = splitBioClaims(md);
    expect(bio!.claims).toHaveLength(1);
    expect(bio!.claims[0].kind).toBe("go_term");
    expect(bio!.claims[0].goId).toBe("GO:0006915");
    expect(bio!.claims[0]).not.toHaveProperty("bogus");
    expect(bio!.note).toBeUndefined();
  });

  it("returns bio: null and leaves the text when there is no fence", () => {
    const { clean, bio } = splitBioClaims("no fences here");
    expect(bio).toBeNull();
    expect(clean).toBe("no fences here");
  });

  it("returns bio: null for malformed JSON", () => {
    const md = "```bio\n{ not json ]\n```";
    expect(splitBioClaims(md).bio).toBeNull();
  });

  it("returns bio: null when no claim survives coercion (all lack kind)", () => {
    const md = "```bio\n" + JSON.stringify([{ symbol: "TP53" }, { goId: "GO:0006915" }]) + "\n```";
    expect(splitBioClaims(md).bio).toBeNull();
  });
});
