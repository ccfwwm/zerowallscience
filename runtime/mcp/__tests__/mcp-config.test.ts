import { describe, expect, it } from "vitest";
import {
  MCP_SERVER_CONFIGS,
  getAllMCPServerIds,
  getMCPServerConfig,
  pythonModule,
  resolveMcpCommand,
  secretPlaceholders,
  secretRequirements,
  toMcpConfig,
  validateMCPServerConfig,
  type MCPServerConfig,
} from "../../../packages/shared/src/mcp-config";
import { DOMAIN_GROUPS } from "../../connectors/schema";

describe("MCP server templates", () => {
  it("covers exactly the 23 registry domain groups", () => {
    expect(MCP_SERVER_CONFIGS).toHaveLength(23);
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

  it("launches each domain as its python module", () => {
    for (const config of MCP_SERVER_CONFIGS) {
      // `python`, not `python3`: resolved to the managed interpreter, which on
      // Windows is <env>\Scripts\python.exe.
      expect(config.command).toBe("python");
      expect(config.args).toEqual(["-m", pythonModule(config.id)]);
    }
    expect(pythonModule("single-cell")).toBe("mcp_single_cell.server");
    expect(pythonModule("clinical-trials")).toBe("mcp_clinical_trials.server");
  });

  it("declares a status health check and a restart policy", () => {
    for (const config of MCP_SERVER_CONFIGS) {
      expect(config.healthCheck).toBe("status");
      expect(config.restartPolicy).toBe("on-failure");
    }
  });

  it("declares secret names only where a key is actually required", () => {
    expect(getMCPServerConfig("literature")?.secrets).toContain("NCBI_API_KEY");
    expect(getMCPServerConfig("drug-discovery")?.secrets).toContain("DRUGBANK_API_KEY");
    // Open APIs must not invent credentials.
    expect(getMCPServerConfig("clinical-trials")?.secrets).toEqual([]);
    expect(getMCPServerConfig("chemistry")?.secrets).toEqual([]);
  });

  it("returns undefined for an unknown id", () => {
    expect(getMCPServerConfig("nope")).toBeUndefined();
  });
});

describe("resolveMcpCommand", () => {
  it("substitutes the managed interpreter (unix)", () => {
    expect(resolveMcpCommand(getMCPServerConfig("literature")!, "/env/bin/python")).toEqual([
      "/env/bin/python",
      "-m",
      "mcp_literature.server",
    ]);
  });

  it("substitutes the managed interpreter (windows)", () => {
    expect(
      resolveMcpCommand(getMCPServerConfig("genomics")!, "C:\\env\\Scripts\\python.exe"),
    ).toEqual(["C:\\env\\Scripts\\python.exe", "-m", "mcp_genomics.server"]);
  });

  it("leaves a non-python command untouched", () => {
    const config: MCPServerConfig = { id: "x", name: "X", command: "node", args: ["s.js"] };
    expect(resolveMcpCommand(config, "/env/bin/python")).toEqual(["node", "s.js"]);
  });
});

describe("toMcpConfig", () => {
  it("produces an enabled local entry", () => {
    expect(toMcpConfig(getMCPServerConfig("variants")!, "/env/bin/python")).toEqual({
      type: "local",
      command: ["/env/bin/python", "-m", "mcp_variants.server"],
      enabled: true,
    });
  });

  it("produces a disabled entry when stopping", () => {
    expect(toMcpConfig(getMCPServerConfig("variants")!, "/p", false).enabled).toBe(false);
  });

  it("never serializes a secret name or value by default", () => {
    const config = getMCPServerConfig("drug-discovery")!;
    const entry = toMcpConfig(config, "/env/bin/python");
    expect(entry.environment).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain("DRUGBANK_API_KEY");
  });

  it("emits {env:NAME} placeholders on request — references, never values", () => {
    const config = getMCPServerConfig("literature")!;
    const entry = toMcpConfig(config, "/p", true, { placeholders: true });
    expect(entry.environment).toEqual({
      NCBI_API_KEY: "{env:NCBI_API_KEY}",
      SEMANTIC_SCHOLAR_API_KEY: "{env:SEMANTIC_SCHOLAR_API_KEY}",
    });
  });

  it("carries non-secret env through", () => {
    const config: MCPServerConfig = {
      id: "x",
      name: "X",
      command: "python",
      args: ["-m", "x"],
      env: { MCP_LOG_LEVEL: "info" },
    };
    expect(toMcpConfig(config, "/p").environment).toEqual({ MCP_LOG_LEVEL: "info" });
  });
});

describe("secret helpers", () => {
  it("maps secret names onto P1B connector keychain entries", () => {
    expect(secretRequirements(getMCPServerConfig("literature")!)).toEqual([
      { connectorId: "literature", environment: "NCBI_API_KEY" },
      { connectorId: "literature", environment: "SEMANTIC_SCHOLAR_API_KEY" },
    ]);
  });

  it("is empty for keyless servers", () => {
    expect(secretRequirements(getMCPServerConfig("proteomics")!)).toEqual([]);
    expect(secretPlaceholders(getMCPServerConfig("proteomics")!)).toEqual({});
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
