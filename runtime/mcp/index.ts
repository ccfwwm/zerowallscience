// Public surface of the MCP server management module (P3).

export {
  MCPServerManager,
  McpTimeoutError,
  type McpLogLevel,
  type McpLogger,
  type McpRuntime,
  type McpServerReport,
  type MCPServerManagerOptions,
} from "./manager";

export {
  TauriConnectorSecrets,
  InMemoryConnectorSecrets,
  missingSecretNames,
  requiredSecrets,
  secretSummary,
  type ConnectorSecretWriter,
  type Invoke,
} from "./keychain-integration";

export {
  MCP_DEFAULTS,
  MCP_SERVER_CONFIGS,
  MCP_SERVERS_DIR_TOKEN,
  getAllMCPServerIds,
  getMCPServerConfig,
  launcherArgs,
  resolveMcpCommand,
  secretPlaceholders,
  secretRequirements,
  serverPackage,
  toMcpConfig,
  validateMCPServerConfig,
  type LocalMcpConfig,
  type MCPServerConfig,
  type MCPServerHealth,
  type MCPServerStatus,
  type SecretRequirement,
} from "../../packages/shared/src/mcp-config";
