import type { Config, CapabilityClass } from './policy.ts';
export declare const COMPACT_SERVERS: readonly ["rmcp", "zerowall_managed_bio_tools"];
export declare const ON_DEMAND_TOOLS: readonly ["mcp__rmcp__r_files"];
export declare function defaultTier(name: string, kind: 'tool' | 'skill'): CapabilityClass;
export declare function isManagedBulkRule(rule: string): boolean;
/** Return the shipped ZeroWall default classification while preserving user single-tool disables. */
export declare function defaultConfig(config?: Config): Config;
//# sourceMappingURL=defaults.d.ts.map