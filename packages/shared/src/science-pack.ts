/**
 * Science Pack manifest and lifecycle types.
 *
 * A Science Pack bundles Skills, MCP servers, Agents, and domain-specific
 * tools into a versioned, installable unit with provenance tracking.
 */

export interface SciencePackManifestV1 {
  /** Schema version identifier */
  schema: "zerowall.science/pack/v1";

  /** Unique pack identifier (kebab-case) */
  id: string;

  /** Display name */
  name: string;

  /** One-line description */
  description: string;

  /** Semantic version (semver) */
  version: string;

  /** Source provenance */
  source: {
    /** Git repository URL */
    repo: string;
    /** Commit SHA (full 40-char) */
    commit: string;
    /** Path within repo */
    path: string;
    /** Whether source has local modifications */
    modified: boolean;
  };

  /** Author/maintainer info */
  author?: {
    name: string;
    email?: string;
    url?: string;
  };

  /** License identifier (SPDX) */
  license?: string;

  /** Bundled components */
  components: {
    /** Skills (slash commands) */
    skills?: SciencePackSkill[];
    /** MCP servers */
    mcpServers?: SciencePackMCPServer[];
    /** Agent definitions */
    agents?: SciencePackAgent[];
    /** Connector definitions */
    connectors?: SciencePackConnector[];
  };

  /** Platform-specific assets */
  assets?: {
    /** Platform identifier: darwin, linux, win32 */
    platform: string;
    /** Architecture: x64, arm64 */
    arch?: string;
    /** Asset files (relative paths within pack) */
    files: string[];
  }[];

  /** Dependencies on other packs */
  dependencies?: Record<string, string>; // pack-id -> version range

  /** Minimum ZeroWall version required */
  minZeroWallVersion?: string;

  /**
   * Declared integrity of the pack payload.
   *
   * `sha256` covers every file in the pack directory EXCEPT `manifest.yaml`
   * itself (which would otherwise be self-referential). It is verified before
   * install and before upgrade; a mismatch rejects the operation.
   */
  integrity?: {
    /** Lowercase hex SHA-256 of the pack payload */
    sha256: string;
  };
}

export interface SciencePackSkill {
  /** Skill identifier (matches directory name) */
  id: string;
  /** Display name */
  name: string;
  /** One-line description */
  description: string;
  /** Relative path to SKILL.md */
  path: string;
  /** When to suggest this skill */
  whenToUse?: string;
  /** Model tier override */
  model?: string;
  /** Enabled by default */
  enabled?: boolean;
}

export interface SciencePackMCPServer {
  /** Server identifier */
  id: string;
  /** Display name */
  name: string;
  /** One-line description */
  description: string;
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Enabled by default */
  enabled?: boolean;
}

export interface SciencePackAgent {
  /** Agent identifier */
  id: string;
  /** Display name */
  name: string;
  /** Role classification */
  role: "general" | "research" | "code" | "data";
  /** One-line description */
  description: string;
  /** System prompt template path */
  promptPath: string;
  /** Default model binding */
  defaultModel?: string;
  /** Enabled by default */
  enabled?: boolean;
}

export interface SciencePackConnector {
  /** Connector identifier */
  id: string;
  /** Display name */
  name: string;
  /** Domain/category */
  domain: string;
  /** Base URL or endpoint */
  endpoint: string;
  /** Tool count */
  toolCount: number;
  /** Enabled by default */
  enabled?: boolean;
}

/** Pack installation state */
export type PackState =
  | "available"    // In catalog, not installed
  | "installing"   // Download/extraction in progress
  | "installed"    // Installed, components enabled
  | "disabled"     // Installed, components disabled
  | "upgrading"    // Upgrade in progress
  | "error";       // Installation/upgrade failed

/** How a version entry came to exist */
export type PackVersionOperation = "install" | "upgrade" | "rollback" | "adopt";

/** One entry in a pack's version history */
export interface PackVersionHistory {
  /** Semantic version */
  version: string;
  /** Timestamp this version became active (Unix ms) */
  installedAt: number;
  /**
   * Snapshot directory for this version.
   *
   * The snapshot is written lazily: it only exists on disk once the version is
   * replaced by an upgrade or rollback. Use it to restore the version.
   */
  path: string;
  /** Lowercase hex SHA-256 of the full pack directory for this version */
  sha256: string;
  /** Who performed the operation */
  operator: string;
  /** Which operation produced this entry */
  operation: PackVersionOperation;
}

/** Extended pack state with version history */
export interface PackStateRecord {
  /** Current installation state */
  state: PackState;
  /** Currently active version */
  currentVersion: string;
  /** Version history, newest first (capped at MAX_VERSION_HISTORY) */
  versions: PackVersionHistory[];
  /** Last operation timestamp (Unix ms) */
  lastModified: number;
  /** Error message if state === "error" */
  error?: string;
}

export interface InstalledPack {
  /** Manifest data */
  manifest: SciencePackManifestV1;
  /** Installation state */
  state: PackState;
  /** Installation timestamp (ISO 8601) */
  installedAt: string;
  /** Last upgrade timestamp */
  upgradedAt?: string;
  /** Error message if state === "error" */
  error?: string;
  /** Local filesystem path */
  path: string;
}

/** Pack lifecycle operations */
export interface SciencePackManager {
  /** List all installed packs */
  listInstalled(): Promise<InstalledPack[]>;

  /** Install a pack from catalog or file */
  install(source: string): Promise<InstalledPack>;

  /** Upgrade an installed pack from a source containing the new version */
  upgrade(packId: string, targetVersion?: string, source?: string): Promise<InstalledPack>;

  /** Enable all components in a pack */
  enable(packId: string): Promise<void>;

  /** Disable all components in a pack (keeps installed) */
  disable(packId: string): Promise<void>;

  /** Uninstall a pack */
  uninstall(packId: string): Promise<void>;

  /** Rollback to the previous version, or to a specific version in history */
  rollback(packId: string, targetVersion?: string): Promise<InstalledPack>;

  /** Verify pack integrity (SHA checksums) */
  verify(packId: string): Promise<boolean>;

  /** Get pack manifest without installing */
  inspect(source: string): Promise<SciencePackManifestV1>;
}

/** Validation error */
export class PackValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
  ) {
    super(message);
    this.name = "PackValidationError";
  }
}

/** Validate manifest structure and required fields */
export function validatePackManifest(data: unknown): data is SciencePackManifestV1 {
  if (typeof data !== "object" || data === null) {
    throw new PackValidationError("Manifest must be an object");
  }

  const manifest = data as Record<string, unknown>;

  // Schema version
  if (manifest.schema !== "zerowall.science/pack/v1") {
    throw new PackValidationError(
      "Invalid schema version",
      "schema",
      manifest.schema,
    );
  }

  // Required fields
  const required = ["id", "name", "description", "version", "source", "components"];
  for (const field of required) {
    if (!(field in manifest)) {
      throw new PackValidationError(`Missing required field: ${field}`, field);
    }
  }

  // ID validation (kebab-case)
  if (typeof manifest.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.id)) {
    throw new PackValidationError(
      "Pack ID must be kebab-case",
      "id",
      manifest.id,
    );
  }

  // Version validation (semver)
  if (
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(manifest.version)
  ) {
    throw new PackValidationError(
      "Version must be valid semver",
      "version",
      manifest.version,
    );
  }

  // Source validation
  const source = manifest.source as Record<string, unknown>;
  if (
    typeof source !== "object" ||
    typeof source.repo !== "string" ||
    typeof source.commit !== "string" ||
    typeof source.path !== "string" ||
    typeof source.modified !== "boolean"
  ) {
    throw new PackValidationError("Invalid source object", "source");
  }

  // Commit SHA validation (40-char hex)
  if (!/^[a-f0-9]{40}$/.test(source.commit as string)) {
    throw new PackValidationError(
      "Commit SHA must be 40-char hex",
      "source.commit",
      source.commit,
    );
  }

  // Components validation
  const components = manifest.components as Record<string, unknown>;
  if (typeof components !== "object" || components === null) {
    throw new PackValidationError("Components must be an object", "components");
  }

  // At least one component type
  if (
    !components.skills &&
    !components.mcpServers &&
    !components.agents &&
    !components.connectors
  ) {
    throw new PackValidationError(
      "Pack must contain at least one component type",
      "components",
    );
  }

  return true;
}

/** Extract pack ID collisions */
export function detectPackCollisions(packs: SciencePackManifestV1[]): string[] {
  const ids = new Set<string>();
  const collisions: string[] = [];

  for (const pack of packs) {
    if (ids.has(pack.id)) {
      collisions.push(pack.id);
    }
    ids.add(pack.id);
  }

  return collisions;
}

/** Compare versions for upgrade eligibility */
export function compareVersions(v1: string, v2: string): -1 | 0 | 1 {
  const parse = (v: string) => {
    const [core] = v.split(/[-+]/);
    return core.split(".").map(Number);
  };

  const [major1, minor1, patch1] = parse(v1);
  const [major2, minor2, patch2] = parse(v2);

  if (major1 !== major2) return major1 < major2 ? -1 : 1;
  if (minor1 !== minor2) return minor1 < minor2 ? -1 : 1;
  if (patch1 !== patch2) return patch1 < patch2 ? -1 : 1;

  return 0;
}
