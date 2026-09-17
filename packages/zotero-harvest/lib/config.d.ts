/**
 * lit-harvest — configuration.
 *
 * Resolution precedence (highest wins), mirroring zotero-wave-rag's pattern:
 *   1. runtime config file `~/.config/lit-harvest/config.json`
 *   2. env `LIT_*` (and `ZWR_DATA_DIR` / zotero-wave-rag runtime config for
 *      the shared Zotero data dir)
 *   3. built-in defaults
 *
 * The Zotero data dir is deliberately shared with zotero-wave-rag so that
 * papers saved by lit-harvest are picked up by the same reindex path.
 */
import type { LitSource } from './types.ts';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
export declare const withConfig: <T>(config: Partial<LitConfig>, run: () => Promise<T>) => Promise<T>;
export interface LitConfig {
    credentials?: CredentialProvider;
    /** Zotero data dir (contains zotero.sqlite + storage/). '' = none. */
    dataDir: string;
    /** Where inbox saves land when Zotero is unreachable/offline. */
    inboxDir: string;
    /** Zotero local HTTP API base (desktop running). */
    zoteroApiBase: string;
    /** Sufficiency targets. */
    minCorePapers: number;
    minTotalPapers: number;
    /** Review loop budget. */
    maxRounds: number;
    perRoundFetch: number;
    /** HTTP timeouts (ms). */
    httpTimeoutMs: number;
    /** Semantic Scholar API key (optional; stricter rate limits without). */
    s2ApiKey: string;
    /** Unpaywall polite-pool email (any valid email; used in the API URL). */
    unpaywallEmail: string;
    /** Resolve OA download links for fetch results by default. */
    resolveDownloads: boolean;
    /** HTTP(S) proxy for the optional 'scholar' source (Google Scholar HTML). */
    scholarProxy: string;
    /** Default sources, in preference order. */
    sources: LitSource[];
    /** Whether to auto-run the zotero-wave-rag reindex after a save. */
    autoReindex: boolean;
}
export declare const DEFAULT_SOURCES: LitSource[];
/** Resolve the shared Zotero data dir exactly like zotero-wave-rag does. */
export declare function resolveZoteroDataDir(): string;
/** Effective config for one tool call. */
export declare function resolveConfig(overrides?: Partial<LitConfig>): LitConfig;
/** Ensure the inbox directory exists. */
export declare function ensureDir(p: string): void;
