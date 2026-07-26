/**
 * Science MCP Connector Schema
 *
 * Defines the structure for life-science MCP connectors organized into
 * 23 domain groups with 247 tools total.
 *
 * The domain partition below is not a taxonomy we choose — it mirrors the
 * vendored implementation in `runtime/connectors/bio-tools/`, whose
 * `lib/mcp_bio/domains.json` maps each slug to its tool names and whose
 * `lib/mcp_<slug with _>/server.py` is the server that serves them. Changing a
 * slug here without renaming the Python package produces a connector that
 * cannot start. Regenerate `runtime/connectors/manifests/` from domains.json
 * rather than hand-editing either side.
 */

export interface ConnectorSchema {
  /** Schema version for compatibility tracking */
  version: string;
  /** Connector group ID (e.g., "literature", "genomics") */
  groupId: string;
  /** Human-readable group name */
  groupName: string;
  /** Brief description of the domain */
  description: string;
  /** Tools available in this connector group */
  tools: ToolDefinition[];
  /** Provider information */
  provider: ConnectorProvider;
  /** Authentication requirements */
  auth?: ConnectorAuth;
  /** Usage limits and constraints */
  limits?: ConnectorLimits;
}

/**
 * One tool as the registry knows it.
 *
 * `name` and `description` are all a manifest carries, because that is all
 * `domains.json` plus the server source can state without running anything. The
 * authoritative `inputSchema` lives with the server — verbatim `schemas.json`
 * for the Tier1 packages, the function signature for the FastMCP ones — and is
 * only known for certain once the server is connected and `tools/list` answers.
 * The optional fields are therefore absent in manifest-loaded tools rather than
 * filled with plausible defaults.
 */
export interface ToolDefinition {
  /** Unique tool name (must be unique across all 247 tools) */
  name: string;
  /** Tool description */
  description: string;
  /** Human-readable label, when one is defined separately from the name */
  label?: string;
  /** Input schema (JSON Schema), once known from the server */
  inputSchema?: Record<string, unknown>;
  /** Whether this tool needs no credential. Unknown from a manifest alone. */
  isPublic?: boolean;
  /** Rate limit info */
  rateLimit?: RateLimit;
  /** Examples */
  examples?: ToolExample[];
}

export interface ConnectorProvider {
  /** Provider type */
  type: "mcp" | "rest-api" | "graphql";
  /** Provider name */
  name: string;
  /** Base URL or endpoint */
  endpoint?: string;
  /** Package name (for MCP servers) */
  package?: string;
  /** Module or binary to run */
  command?: string[];
  /** Source repository */
  source?: string;
}

export interface ConnectorAuth {
  /** Auth type */
  type: "api-key" | "oauth" | "none";
  /** Environment variable name for API key */
  envVar?: string;
  /** URL to obtain key */
  keyUrl?: string;
  /** OAuth configuration */
  oauth?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
}

export interface ConnectorLimits {
  /** Requests per minute */
  requestsPerMinute?: number;
  /** Max concurrent requests */
  maxConcurrent?: number;
  /** Response size limit (bytes) */
  maxResponseSize?: number;
  /** Query result limit */
  maxResults?: number;
}

export interface RateLimit {
  /** Requests per time window */
  requests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

export interface ToolExample {
  /** Example name */
  name: string;
  /** Input parameters */
  input: Record<string, unknown>;
  /** Expected output structure */
  output?: Record<string, unknown>;
}

/**
 * Domain group IDs for the 23 life-science connector groups.
 *
 * Verbatim keys of `bio-tools/lib/mcp_bio/domains.json`. Each maps to the
 * package `mcp_<slug with "-" replaced by "_">`.
 */
export const DOMAIN_GROUPS = [
  "biomart",
  "biorxiv",
  "cancer-models",
  "cellguide",
  "chembl",
  "chemistry",
  "clinical-genomics",
  "clinical-trials",
  "drug-regulatory",
  "expression",
  "genes-ontologies",
  "genomes",
  "human-genetics",
  "literature",
  "omics-archives",
  "protein-annotation",
  "pubmed",
  "regulation",
  "research-resources",
  "rna",
  "structures-interactions",
  "variants",
  "zinc",
] as const;

export type DomainGroup = (typeof DOMAIN_GROUPS)[number];

/** The Python package implementing a domain group's server. */
export function packageForDomain(group: DomainGroup): string {
  return `mcp_${group.replace(/-/g, "_")}`;
}

/** Expected total tool count across all groups, license-restricted included. */
export const EXPECTED_TOOL_COUNT = 247;

/**
 * Tools whose upstream LICENSE forbids or restricts commercial use, and which
 * must therefore not be offered by default.
 *
 * This mirrors `license_tools` in `bio-tools/lib/mcp_bio/deferred.json`, which
 * is the authoritative gate the Python side enforces at startup. That file also
 * carries `domains` and `tools` — a separate deferral for net-new upstream
 * resources pending legal review, released by emptying those two lists. The
 * license gate is deliberately NOT on that switch: it is lifted per upstream,
 * only once legal clears that specific license.
 *
 * Keep this array in sync with deferred.json; `registry.ts` asserts the two
 * agree and fails closed, matching the Python `load_deferred()` behaviour where
 * a typo would otherwise silently fail open.
 */
export const LICENSE_RESTRICTED_TOOLS = [
  // DepMap — non-commercial terms.
  "get_model",
  "list_models",
  "search_models",
  "search_genes",
  "gene_dependencies",
  // KEGG — academic use only.
  "get_kegg_entries",
  "search_kegg",
  "link_kegg_ids",
  // CADD — non-commercial licence.
  "cadd_variant_score",
  "cadd_position_scores",
  "cadd_range_scores",
  // PanglaoDB — restricted redistribution.
  "panglaodb_marker_genes",
  "panglaodb_cell_types_for_gene",
  "panglaodb_options",
] as const;

/** Tools served by default, i.e. everything the licence gate does not withhold. */
export const DEFAULT_AVAILABLE_TOOL_COUNT =
  EXPECTED_TOOL_COUNT - LICENSE_RESTRICTED_TOOLS.length;
