/**
 * Science MCP Connector Schema
 *
 * Defines the structure for life-science MCP connectors organized into
 * 23 domain groups with 247 tools total.
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

export interface ToolDefinition {
  /** Unique tool name (must be unique across all 247 tools) */
  name: string;
  /** Human-readable label */
  label: string;
  /** Tool description */
  description: string;
  /** Input schema (JSON Schema) */
  inputSchema: Record<string, unknown>;
  /** Whether this is a public tool (no key required) */
  isPublic: boolean;
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

/** Domain group IDs for the 23 life-science connector groups */
export const DOMAIN_GROUPS = [
  "literature",
  "clinical-trials",
  "genomics",
  "variants",
  "gene-expression",
  "proteomics",
  "protein-structure",
  "protein-interactions",
  "chemistry",
  "drug-discovery",
  "metabolomics",
  "transcriptomics",
  "single-cell",
  "imaging",
  "pathways",
  "ontology",
  "taxonomy",
  "epidemiology",
  "regulatory",
  "biobanks",
  "cell-lines",
  "antibodies",
  "assays",
] as const;

export type DomainGroup = (typeof DOMAIN_GROUPS)[number];

/** Expected total tool count across all groups */
export const EXPECTED_TOOL_COUNT = 247;
