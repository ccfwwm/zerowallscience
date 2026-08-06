import {
  AcpHostClient,
  ReviewSessionRunner,
  type AcpHostInvoke,
  type ReviewRunResult,
} from "@zerowall/sdk";
import type { AcpLaunchRequest } from "./acp";
import { toAcpHostLaunchRequest } from "./acp-host-runtime";
import { buildReviewPrompt } from "./review";

/** Run a review through a fresh Host client/session. The active conversation's
 * runtime and subscription are never reused, so review permissions and output
 * cannot leak into the user's turn. */
export async function runAcpReview(
  launch: AcpLaunchRequest,
  rawOutput: string,
  invoke: AcpHostInvoke,
  pollIntervalMs = 50,
): Promise<ReviewRunResult> {
  const client = new AcpHostClient({ invoke, pollIntervalMs });
  const hostLaunch = toAcpHostLaunchRequest(launch, "review-source");
  await client.initialize(hostLaunch.engine);
  return new ReviewSessionRunner(client).run({
    launch: hostLaunch,
    prompt: buildReviewPrompt(),
    rawOutput,
  });
}
