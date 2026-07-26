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
  /** Arguments. `${MCP_SERVERS_DIR}` is a placeholder resolved to the staged
   *  assets directory, e.g.
   *  `["${MCP_SERVERS_DIR}/bio-tools/run_server.py", "mcp_literature"]`. */
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

/**
 * Placeholder for the directory the MCP assets are staged in.
 *
 * `bio-tools/run_server.py` documents this exact token as the launch form, so it
 * is resolved here rather than reinvented: `resolveMcpCommand` substitutes it,
 * symmetrically with the `"python"` command placeholder.
 */
export const MCP_SERVERS_DIR_TOKEN = "${MCP_SERVERS_DIR}";

/** Python package for a domain id: `clinical-trials` → `mcp_clinical_trials`. */
export function serverPackage(id: string): string {
  return `mcp_${id.replace(/-/g, "_")}`;
}

/**
 * Launcher arguments for a domain id.
 *
 * `run_server.py <pkg>` — not `-m <pkg>.server`: no domain package defines
 * `__main__`, that form needs `bio-tools/lib/` already on `sys.path`, and it
 * skips the launcher's `tls_policy.apply_posture()` step.
 */
export function launcherArgs(id: string): string[] {
  return [`${MCP_SERVERS_DIR_TOKEN}/bio-tools/run_server.py`, serverPackage(id)];
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
    args: launcherArgs(id),
    secrets,
    healthCheck: "status",
    restartPolicy: "on-failure",
  };
}

/**
 * The 23 life-science domain servers — the keys of
 * `runtime/connectors/bio-tools/lib/mcp_bio/domains.json`, in that file's order.
 * A slug with no `lib/mcp_<slug>/server.py` beside it is a server that cannot
 * start, so this list is not a taxonomy to edit by hand.
 *
 * Secret names come from what the server code actually reads (grepped across all
 * 23 packages), not from what an upstream API offers:
 *
 * - `OPENALEX_API_KEY` — required. `mcp_servers_common.ua.require_openalex_key()`
 *   raises without it; OpenAlex has no anonymous access. Read only by
 *   `openalex_works`, which only `mcp_literature` serves.
 * - `NCBI_API_KEY` — optional, raises the E-utilities rate limit. Read by the
 *   `clinvar_records` / `dbsnp_records` helpers (`mcp_variants`) and the
 *   `pubmed_*` / `ncbi_elink` helpers (`mcp_pubmed`). `geo_meta`
 *   (`mcp_omics_archives`) reaches E-utilities too but has no `api_key`
 *   plumbing, so it declares none.
 *
 * Not declared here, deliberately: `OPERON_CONTACT_EMAIL` / `NCBI_EMAIL` is
 * user PII gated on consent rather than a credential (NCBI mandates a contact
 * address, so `mcp_variants` and `mcp_pubmed` tools raise `contact_email_required`
 * until the consent surface exists), and `OPERON_VERSION` / `OPERON_INSTALL_ID`
 * are non-secret user-agent values.
 */
export const MCP_SERVER_CONFIGS: MCPServerConfig[] = [
  server("biomart", "BioMart"),
  server("biorxiv", "bioRxiv"),
  server("cancer-models", "Cancer Models"),
  server("cellguide", "CellGuide"),
  server("chembl", "ChEMBL"),
  server("chemistry", "Chemistry"),
  server("clinical-genomics", "Clinical Genomics"),
  server("clinical-trials", "Clinical Trials"),
  server("drug-regulatory", "Drug Regulatory"),
  server("expression", "Expression"),
  server("genes-ontologies", "Genes and Ontologies"),
  server("genomes", "Genomes"),
  server("human-genetics", "Human Genetics"),
  server("literature", "Literature", ["OPENALEX_API_KEY"]),
  server("omics-archives", "Omics Archives"),
  server("protein-annotation", "Protein Annotation"),
  server("pubmed", "PubMed", ["NCBI_API_KEY"]),
  server("regulation", "Regulation"),
  server("research-resources", "Research Resources"),
  server("rna", "RNA"),
  server("structures-interactions", "Structures and Interactions"),
  server("variants", "Variants", ["NCBI_API_KEY"]),
  server("zinc", "ZINC"),
];

export function getMCPServerConfig(id: string): MCPServerConfig | undefined {
  return MCP_SERVER_CONFIGS.find((c) => c.id === id);
}

export function getAllMCPServerIds(): string[] {
  return MCP_SERVER_CONFIGS.map((c) => c.id);
}

/**
 * Resolve a launch command.
 *
 * Two placeholders are substituted: `"python"` becomes the managed interpreter
 * so the user's own Python is never used, and `${MCP_SERVERS_DIR}` becomes
 * `serversDir` (the staged assets directory). Both path forms are passed through
 * as given, so a Windows path stays a Windows path.
 *
 * Throws when an argument carries the token and no `serversDir` was supplied:
 * handing OpenCode a half-resolved path would spawn a server that fails at
 * launch with a confusing "no such file" instead of failing here.
 */
export function resolveMcpCommand(
  config: MCPServerConfig,
  python: string,
  serversDir?: string,
): string[] {
  const exe = config.command === "python" ? python : config.command;
  const args = (config.args ?? []).map((arg) => {
    if (!arg.includes(MCP_SERVERS_DIR_TOKEN)) return arg;
    if (serversDir === undefined || serversDir.trim() === "") {
      throw new Error(
        `MCP server "${config.id}" needs the servers directory: ` +
          `"${arg}" contains ${MCP_SERVERS_DIR_TOKEN} but no serversDir was given`,
      );
    }
    return arg.split(MCP_SERVERS_DIR_TOKEN).join(serversDir);
  });
  return [exe, ...args];
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
 * references for servers that need them declared explicitly, and `serversDir` to
 * resolve the `${MCP_SERVERS_DIR}` token in the launch command.
 */
export function toMcpConfig(
  config: MCPServerConfig,
  python: string,
  enabled = true,
  options: { placeholders?: boolean; serversDir?: string } = {},
): LocalMcpConfig {
  const entry: LocalMcpConfig = {
    type: "local",
    command: resolveMcpCommand(config, python, options.serversDir),
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
