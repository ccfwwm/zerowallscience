// MCP server definitions for the 23 life-science domain groups (P3).
//
// A definition is DATA ONLY: what to launch and which secret NAMES the server
// needs. Secret VALUES never appear here — they live in the OS keychain and are
// materialized into the sidecar's process environment by the Rust side
// (`secret_store::sidecar_environment`); local MCP servers inherit them from
// the sidecar. Nothing in this file is ever written to disk with a value in it.

/** One MCP server definition. */
export interface MCPServerConfig {
  /** Unique id — also the name the server is registered under in OpenCode. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Executable. `"python"` is a placeholder resolved to the managed
   *  interpreter of the shared science-MCP env (Windows: `Scripts/python.exe`). */
  command: string;
  /** Arguments, e.g. `["-m", "mcp_literature.server"]`. */
  args?: string[];
  /** Non-secret environment variables. Must never carry credentials. */
  env?: Record<string, string>;
  /** Names of environment variables the server reads its credentials from.
   *  Values are stored per connector in the OS keychain and injected by Rust. */
  secrets?: string[];
  /** Health probe. `"status"` = ask OpenCode for the server's live status. */
  healthCheck?: string;
  /** What to do when the server stops reporting healthy. */
  restartPolicy?: "always" | "on-failure" | "never";
  /** How long to wait for the server to report connected (ms). */
  startupTimeout?: number;
  /** Health poll interval (ms). */
  healthCheckInterval?: number;
  /** Restart attempts before the server is left failed. */
  maxRestartAttempts?: number;
}

/** Lifecycle state tracked per server by the manager. */
export interface MCPServerStatus {
  id: string;
  state: "stopped" | "starting" | "running" | "unhealthy" | "failed";
  /** Live status string reported by OpenCode ("connected", "failed", …). */
  reported?: string;
  startedAt?: number;
  lastHealthCheck?: number;
  restartCount: number;
  lastError?: string;
}

/** Result of one health probe. */
export interface MCPServerHealth {
  id: string;
  healthy: boolean;
  /** Probe round-trip in ms. */
  latency?: number;
  lastCheck: number;
  /** Set when the probe exceeded its deadline. */
  timedOut?: boolean;
  error?: string;
}

/** The local-MCP shape OpenCode's config expects (structurally `McpConfig`). */
export interface LocalMcpConfig {
  type: "local";
  command: string[];
  enabled: boolean;
  environment?: Record<string, string>;
}

/** One keychain entry a server needs, in P1B's connector-secret layout
 *  (`set_connector_secret({ connectorId, environment, value })`). */
export interface SecretRequirement {
  connectorId: string;
  environment: string;
}

export const MCP_DEFAULTS = {
  startupTimeout: 30_000,
  healthCheckInterval: 60_000,
  maxRestartAttempts: 3,
  restartPolicy: "on-failure" as const,
};

/** Python module for a domain id: `variants` → `mcp_variants.server`. */
export function pythonModule(id: string): string {
  return `mcp_${id.replace(/-/g, "_")}.server`;
}

function server(
  id: string,
  name: string,
  secrets: string[] = [],
): MCPServerConfig {
  return {
    id,
    name,
    command: "python",
    args: ["-m", pythonModule(id)],
    secrets,
    healthCheck: "status",
    restartPolicy: "on-failure",
  };
}

/**
 * The 23 life-science domain servers. Secret names are only listed where the
 * upstream API actually requires (or rate-limit-rewards) a key; the rest are
 * open APIs and declare none.
 */
export const MCP_SERVER_CONFIGS: MCPServerConfig[] = [
  server("literature", "Literature", ["NCBI_API_KEY", "SEMANTIC_SCHOLAR_API_KEY"]),
  server("clinical-trials", "Clinical Trials"),
  server("genomics", "Genomics", ["NCBI_API_KEY"]),
  server("variants", "Genetic Variants", ["NCBI_API_KEY"]),
  server("gene-expression", "Gene Expression", ["NCBI_API_KEY"]),
  server("proteomics", "Proteomics"),
  server("protein-structure", "Protein Structure"),
  server("protein-interactions", "Protein Interactions", ["BIOGRID_ACCESS_KEY"]),
  server("chemistry", "Chemistry"),
  server("drug-discovery", "Drug Discovery", ["DRUGBANK_API_KEY"]),
  server("metabolomics", "Metabolomics"),
  server("transcriptomics", "Transcriptomics", ["NCBI_API_KEY"]),
  server("single-cell", "Single Cell"),
  server("imaging", "Imaging"),
  server("pathways", "Pathways"),
  server("ontology", "Ontology", ["BIOPORTAL_API_KEY"]),
  server("taxonomy", "Taxonomy", ["NCBI_API_KEY"]),
  server("epidemiology", "Epidemiology"),
  server("regulatory", "Regulatory", ["OPENFDA_API_KEY"]),
  server("biobanks", "Biobanks"),
  server("cell-lines", "Cell Lines"),
  server("antibodies", "Antibodies"),
  server("assays", "Assays"),
];

export function getMCPServerConfig(id: string): MCPServerConfig | undefined {
  return MCP_SERVER_CONFIGS.find((c) => c.id === id);
}

export function getAllMCPServerIds(): string[] {
  return MCP_SERVER_CONFIGS.map((c) => c.id);
}

/** Resolve a launch command. `"python"` becomes the managed interpreter so the
 *  user's own Python is never used (Windows path form is preserved as given). */
export function resolveMcpCommand(config: MCPServerConfig, python: string): string[] {
  const exe = config.command === "python" ? python : config.command;
  return [exe, ...(config.args ?? [])];
}

/** `{env:NAME}` references for a server's secrets — placeholders, never values.
 *  OpenCode resolves them from the sidecar environment at launch. */
export function secretPlaceholders(config: MCPServerConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of config.secrets ?? []) out[name] = `{env:${name}}`;
  return out;
}

/**
 * The OpenCode local-MCP entry for a definition. Secret VALUES are never placed
 * in `environment`: this config is written to disk, and P1B keeps credentials in
 * the keychain only. Rust injects them into the sidecar environment
 * (`secret_store::sidecar_environment`) and the MCP child — spawned by the
 * sidecar — inherits them. Pass `placeholders` to additionally emit `{env:NAME}`
 * references for servers that need them declared explicitly.
 */
export function toMcpConfig(
  config: MCPServerConfig,
  python: string,
  enabled = true,
  options: { placeholders?: boolean } = {},
): LocalMcpConfig {
  const entry: LocalMcpConfig = {
    type: "local",
    command: resolveMcpCommand(config, python),
    enabled,
  };
  const environment = {
    ...config.env,
    ...(options.placeholders ? secretPlaceholders(config) : {}),
  };
  if (Object.keys(environment).length > 0) entry.environment = environment;
  return entry;
}

/** Keychain entries this server needs, in P1B's connector-secret layout. */
export function secretRequirements(config: MCPServerConfig): SecretRequirement[] {
  return (config.secrets ?? []).map((environment) => ({
    connectorId: config.id,
    environment,
  }));
}

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

/** Validate a definition. Returns an empty array when it is well-formed. */
export function validateMCPServerConfig(config: MCPServerConfig): string[] {
  const errors: string[] = [];

  if (!config.id?.trim()) errors.push("Server ID is required");
  else if (!/^[a-z][a-z0-9-]*$/.test(config.id))
    errors.push(`Invalid server ID: ${config.id}`);

  if (!config.name?.trim()) errors.push("Server name is required");
  if (!config.command?.trim()) errors.push("Command is required");

  if (config.restartPolicy && !["always", "on-failure", "never"].includes(config.restartPolicy))
    errors.push(`Invalid restart policy: ${config.restartPolicy}`);

  for (const name of config.secrets ?? []) {
    if (!ENV_NAME.test(name)) errors.push(`Invalid secret name: ${name}`);
  }

  // A secret name appearing in `env` would serialize a credential into
  // OpenCode's on-disk config — reject it at the schema boundary.
  for (const name of Object.keys(config.env ?? {})) {
    if ((config.secrets ?? []).includes(name))
      errors.push(`Secret ${name} must not be set in env`);
  }

  return errors;
}
