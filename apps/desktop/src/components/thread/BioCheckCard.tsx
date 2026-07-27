import { memo, useEffect, useMemo, useState } from "react";
import type { BioClaimsBlock, ReviewerBlock } from "@zerowall/shared";
import { checkBio } from "@/lib/bioCheck";
import { ReviewerCard } from "./ReviewerCard";

/**
 * Renders a bio-claims block the agent emitted. The verdict is not the model's:
 * this runs the deterministic Rust engine (`bio_check_evaluate`), which resolves
 * each claim against a live, license-clear registry (UniProt / QuickGO /
 * Reactome), then hands the resulting findings to the ordinary ReviewerCard so
 * persistence (via `review_sync`, `check_kind = "bio_plausibility"`) and the
 * resolve/reopen UI are reused untouched.
 *
 * Desktop-only: `checkBio` returns null in the gateway web client (no Rust
 * engine, no network client, no science DB), and this renders nothing rather
 * than a broken card.
 */
export const BioCheckCard = memo(function BioCheckCard({
  block,
  sessionId,
}: {
  block: BioClaimsBlock;
  sessionId?: string | null;
}) {
  const [findings, setFindings] = useState<ReviewerBlock["findings"] | null>(null);

  // The claims array identity churns as a message streams; its content is what
  // determines the verdict, so key the effect on that.
  const body = useMemo(() => JSON.stringify(block.claims), [block.claims]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await checkBio(JSON.parse(body));
        if (!cancelled) setFindings(result);
      } catch {
        // The engine degrades every failure to a warn finding internally; a
        // throw here means the bridge is unavailable, so leave the card empty
        // rather than surfacing an error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [body]);

  if (!findings || findings.length === 0) return null;
  const derived: ReviewerBlock = { kind: "reviewer", findings, note: block.note };
  return <ReviewerCard block={derived} sessionId={sessionId} />;
});
