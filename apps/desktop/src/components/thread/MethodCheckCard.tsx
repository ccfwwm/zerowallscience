import { memo, useEffect, useMemo, useState } from "react";
import type { MethodContextBlock, ReviewerBlock } from "@zerowall/shared";
import { checkMethod } from "@/lib/methodCheck";
import { ReviewerCard } from "./ReviewerCard";

/**
 * Renders a method-context block the agent emitted. The verdict is not the
 * model's: this runs the deterministic Rust engine (`method_check_evaluate`)
 * over the extracted context, then hands the resulting findings to the ordinary
 * ReviewerCard so persistence (via `review_sync`, `check_kind = "method_choice"`)
 * and the resolve/reopen UI are reused untouched.
 *
 * Desktop-only: `checkMethod` returns null in the gateway web client (no Rust
 * engine, no science DB), and this renders nothing rather than a broken card.
 */
export const MethodCheckCard = memo(function MethodCheckCard({
  block,
  sessionId,
}: {
  block: MethodContextBlock;
  sessionId?: string | null;
}) {
  const [findings, setFindings] = useState<ReviewerBlock["findings"] | null>(null);

  // The context object identity churns as a message streams; its content is what
  // determines the verdict, so key the effect on that.
  const body = useMemo(() => JSON.stringify(block.context), [block.context]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await checkMethod(JSON.parse(body));
        if (!cancelled) setFindings(result);
      } catch {
        // The engine is deterministic and total; a failure here means the bridge
        // is unavailable, so leave the card empty rather than surfacing an error.
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
