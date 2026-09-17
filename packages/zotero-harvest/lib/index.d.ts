/** Six literature tools adapted to the pinned DSH runtime and native Zotero writes. */
import type { CtxLike } from './types.ts';
/** Settings and tool calls share the same Host credential provider; never return secrets. */
export declare function localAuthorization(ctx: CtxLike, action: 'status' | 'authorize' | 'renew'): Promise<{
    authorized: boolean;
    remember: boolean;
}>;
export declare const name = "zotero-harvest";
export declare const inject: string[];
export declare function apply(ctx: CtxLike): void;
