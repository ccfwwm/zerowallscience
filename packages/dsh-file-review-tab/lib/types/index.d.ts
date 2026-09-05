/**
 * File-review plugin, node half. Registers the response-format guidance that
 * lets the browser half recognize final-response file references. The browser
 * half ships via exports["./client"], discovered through the package.json
 * dsh.client declaration.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type Config as ConfigShape } from './settings-contract.ts';
export type * from './change-types.ts';
export { FileReviewService, transformFile } from './file-review-service.ts';
export { DEFAULT_WORD_WRAP, FILE_REVIEW_SETTINGS_NAMESPACE } from './settings-contract.ts';
export type Config = ConfigShape;
/** Plugin configuration and durable settings schema. */
export declare const Config: z<ConfigShape>;
/** Services required for the model guidance paired with the browser renderer. */
export declare const inject: string[];
/**
 * Register model guidance for the file-reference renderer shipped by this package.
 * @param ctx - host context carrying the system-prompt registry.
 */
export declare function apply(ctx: Context, config?: ConfigShape): void;
//# sourceMappingURL=index.d.ts.map