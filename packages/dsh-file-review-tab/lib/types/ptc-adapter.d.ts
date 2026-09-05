/** Host Adapter: project nested PTC tool presentations into their durable log copy. */
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { PtcDispatchLog as CodeDispatchLog } from '@deepseek-ai/dsh-tools';
/**
 * Await the existing log shapers, then append this plugin's invisible marker.
 * Any Adapter failure degrades to the already-shaped content.
 */
export declare function adaptPtcDispatchLog(ctx: Context, dispatch: CodeDispatchLog, next: () => Promise<ContentBlock[]>): Promise<ContentBlock[]>;
/** Register the Adapter on the awaited Code Mode log-copy seam. */
export declare function registerPtcAdapter(ctx: Context): () => boolean;
//# sourceMappingURL=ptc-adapter.d.ts.map