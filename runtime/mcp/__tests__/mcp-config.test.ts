import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
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
  type MCPServerConfig,
} from "../../../packages/shared/src/mcp-config";
import { DOMAIN_GROUPS, packageForDomain } from "../../connectors/schema";

const here = dirname(fileURLToPath(import.meta.url));
/** Where the assets live in the checked-out tree: the parent of `bio-tools/`. */
const SERVERS_DIR = join(here, "..", "..", "connectors");

describe("MCP server templates", () => {
  it("covers exactly the 23 registry domain groups", () => {
    expect(MCP_SERVER_CONFIGS).toHaveLength(DOMAIN_GROUPS.length);
    expect(getAllMCPServerIds().sort()).toEqual([...DOMAIN_GROUPS].sort());
  });

  it("has unique ids", () => {
    const ids = MCP_SERVER_CONFIGS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template validates", () => {
    for (const config of MCP_SERVER_CONFIGS) {
      expect(validateMCPServerConfig(config)).toEqual([]);
    }
  });

  it("launches each domain through the documented launcher", () => {
    for (const config of MCP_SERVER_CONFIGS) {
      // `python`, not `python3`: resolved to the managed interpreter, which on
      // Windows is <env>\Scripts\python.exe.
      expect(config.command).toBe("python");
      expect(config.args).toEqual([
        `${MCP_SERVERS_DIR_TOKEN}/bio-tools/run_server.py`,
        packageForDomain(config.id as (typeof DOMAIN_GROUPS)[number]),
      ]);
    }
    expect(serverPackage("clinical-trials")).toBe("mcp_clinical_trials");
    expect(launcherArgs("zinc")).toEqual([
      "${MCP_SERVERS_DIR}/bio-tools/run_server.py",
      "mcp_zinc",
    ]);
  });

  it("never launches a domain as a python module", () => {
    // `python -m <pkg>.server` cannot start these servers: no package defines
    // __main__, `lib/` is not on sys.path, and the TLS posture step is skipped.
    for (const config of MCP_SERVER_CONFIGS) {
      expect(config.args, config.id).not.toContain("-m");
    }
  });

  it("resolves to a launcher and a package that exist on disk", () => {
    for (const config of MCP_SERVER_CONFIGS) {
      const [, launcher, pkg] = resolveMcpCommand(config, "python", SERVERS_DIR);
      expect(existsSync(launcher), launcher).toBe(true);
      const server = join(SERVERS_DIR, "bio-tools", "lib", pkg, "server.py");
      expect(existsSync(server), server).toBe(true);
    }
  });

  it("declares a status health check and a restart policy", () => {
    for (const config of MCP_SERVER_CONFIGS) {
      expect(config.healthCheck).toBe("status");
      expect(config.restartPolicy).toBe("on-failure");
    }
  });

  it("declares only the secret names the server code reads", () => {
    // OpenAlex has no anonymous access; only `openalex_works` reads the key and
    // only `mcp_literature` serves it.
    expect(getMCPServerConfig("literature")?.secrets).toEqual(["OPENALEX_API_KEY"]);
    // NCBI E-utilities: optional key, raises the rate limit.
    expect(getMCPServerConfig("pubmed")?.secrets).toEqual(["NCBI_API_KEY"]);
    expect(getMCPServerConfig("variants")?.secrets).toEqual(["NCBI_API_KEY"]);
    // `geo_meta` reaches E-utilities but has no api_key plumbing.
    expect(getMCPServerConfig("omics-archives")?.secrets).toEqual([]);
    expect(getMCPServerConfig("chemistry")?.secrets).toEqual([]);
  });

  it("declares no credential the servers never read", () => {
    const declared = new Set(MCP_SERVER_CONFIGS.flatMap((c) => c.secrets ?? []));
    expect([...declared].sort()).toEqual(["NCBI_API_KEY", "OPENALEX_API_KEY"]);
  });

  it("returns undefined for an unknown id", () => {
    expect(getMCPServerConfig("nope")).toBeUndefined();
    // A slug from the old fabricated taxonomy must not resolve.
    expect(getMCPServerConfig("drug-discovery")).toBeUndefined();
    expect(getMCPServerConfig("genomics")).toBeUndefined();
  });
});

describe("resolveMcpCommand", () => {
  it("substitutes the interpreter and the servers dir (unix)", () => {
    expect(
      resolveMcpCommand(getMCPServerConfig("literature")!, "/env/bin/python", "/opt/zw/mcp"),
    ).toEqual(["/env/bin/python", "/opt/zw/mcp/bio-tools/run_server.py", "mcp_literature"]);
  });

  it("substitutes the interpreter and the servers dir (windows)", () => {
    expect(
      resolveMcpCommand(
        getMCPServerConfig("pubmed")!,
        "C:\\env\\Scripts\\python.exe",
        "C:\\ProgramData\\zw\\mcp",
      ),
    ).toEqual([
      "C:\\env\\Scripts\\python.exe",
      "C:\\ProgramData\\zw\\mcp/bio-tools/run_server.py",
      "mcp_pubmed",
    ]);
  });

  it("fails closed when the servers dir is missing", () => {
    const config = getMCPServerConfig("zinc")!;
    expect(() => resolveMcpCommand(config, "/env/bin/python")).toThrow(
      /needs the servers directory/,
    );
    expect(() => resolveMcpCommand(config, "/env/bin/python", "   ")).toThrow(
      /needs the servers directory/,
    );
  });

  it("leaves a command with no placeholder untouched", () => {
    const config: MCPServerConfig = { id: "x", name: "X", command: "node", args: ["s.js"] };
    expect(resolveMcpCommand(config, "/env/bin/python")).toEqual(["node", "s.js"]);
  });
});

describe("toMcpConfig", () => {
  const opts = { serversDir: "/opt/zw/mcp" };

  it("produces an enabled local entry", () => {
    expect(toMcpConfig(getMCPServerConfig("variants")!, "/env/bin/python", true, opts)).toEqual({
      type: "local",
      command: ["/env/bin/python", "/opt/zw/mcp/bio-tools/run_server.py", "mcp_variants"],
      enabled: true,
    });
  });

  it("produces a disabled entry when stopping", () => {
    expect(toMcpConfig(getMCPServerConfig("variants")!, "/p", false, opts).enabled).toBe(false);
  });

  it("never serializes a secret name or value by default", () => {
    const entry = toMcpConfig(getMCPServerConfig("literature")!, "/env/bin/python", true, opts);
    expect(entry.environment).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain("OPENALEX_API_KEY");
  });

  it("emits {env:NAME} placeholders on request — references, never values", () => {
    const entry = toMcpConfig(getMCPServerConfig("literature")!, "/p", true, {
      ...opts,
      placeholders: true,
    });
    expect(entry.environment).toEqual({ OPENALEX_API_KEY: "{env:OPENALEX_API_KEY}" });
  });

  it("carries non-secret env through", () => {
    const config: MCPServerConfig = {
      id: "x",
      name: "X",
      command: "python",
      args: ["x.py"],
      env: { MCP_LOG_LEVEL: "info" },
    };
    expect(toMcpConfig(config, "/p").environment).toEqual({ MCP_LOG_LEVEL: "info" });
  });
});

describe("secret helpers", () => {
  it("maps secret names onto P1B connector keychain entries", () => {
    expect(secretRequirements(getMCPServerConfig("literature")!)).toEqual([
      { connectorId: "literature", environment: "OPENALEX_API_KEY" },
    ]);
  });

  it("is empty for keyless servers", () => {
    expect(secretRequirements(getMCPServerConfig("chembl")!)).toEqual([]);
    expect(secretPlaceholders(getMCPServerConfig("chembl")!)).toEqual({});
  });
});

describe("validateMCPServerConfig", () => {
  const base: MCPServerConfig = { id: "ok", name: "Ok", command: "python" };

  it("rejects a missing id, name, and command", () => {
    const errors = validateMCPServerConfig({ id: "", name: "", command: "" });
    expect(errors).toContain("Server ID is required");
    expect(errors).toContain("Server name is required");
    expect(errors).toContain("Command is required");
  });

  it("rejects a malformed id", () => {
    expect(validateMCPServerConfig({ ...base, id: "Bad_Id" })).toContain(
      "Invalid server ID: Bad_Id",
    );
  });

  it("rejects an unknown restart policy", () => {
    expect(
      validateMCPServerConfig({
        ...base,
        restartPolicy: "sometimes" as MCPServerConfig["restartPolicy"],
      }),
    ).toContain("Invalid restart policy: sometimes");
  });

  it("rejects a lowercase secret name", () => {
    expect(validateMCPServerConfig({ ...base, secrets: ["api_key"] })).toContain(
      "Invalid secret name: api_key",
    );
  });

  it("rejects a secret smuggled into env", () => {
    expect(
      validateMCPServerConfig({
        ...base,
        secrets: ["NCBI_API_KEY"],
        env: { NCBI_API_KEY: "leaked" },
      }),
    ).toContain("Secret NCBI_API_KEY must not be set in env");
  });
});
