// The name-only helpers are what the settings UI and the manager are allowed to
// see, so these tests pin two things: the write commands stay inside P1B's
// registered set, and nothing here ever returns or logs a secret value.
//
// Server ids and secret names come from MCP_SERVER_CONFIGS, which mirrors the
// vendored Python tree — `literature` reads OPENALEX_API_KEY, `pubmed` reads
// NCBI_API_KEY, and most domains read no credential at all.

import { describe, expect, it, vi } from "vitest";
import {
  InMemoryConnectorSecrets,
  TauriConnectorSecrets,
  missingSecretNames,
  requiredSecrets,
  secretSummary,
} from "../keychain-integration";
import {
  getMCPServerConfig,
  type MCPServerConfig,
} from "../../../packages/shared/src/mcp-config";
import * as keychain from "../keychain-integration";

const literature = getMCPServerConfig("literature")!;
const pubmed = getMCPServerConfig("pubmed")!;
/** A domain that reaches only open endpoints — no credential at all. */
const keyless = getMCPServerConfig("chembl")!;

/** No shipped server declares two secrets today; this one exercises the
 *  counting arithmetic without pretending a real server needs both. */
const twoSecrets: MCPServerConfig = {
  ...literature,
  secrets: ["OPENALEX_API_KEY", "NCBI_API_KEY"],
};

describe("TauriConnectorSecrets", () => {
  it("writes through set_connector_secret with P1B's argument shape", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    await new TauriConnectorSecrets(invoke).set("literature", "OPENALEX_API_KEY", "k-123");
    expect(invoke).toHaveBeenCalledWith("set_connector_secret", {
      connectorId: "literature",
      environment: "OPENALEX_API_KEY",
      value: "k-123",
    });
  });

  it("removes through remove_connector_secret", async () => {
    const invoke = vi.fn().mockResolvedValue(true);
    const removed = await new TauriConnectorSecrets(invoke).remove("pubmed", "NCBI_API_KEY");
    expect(removed).toBe(true);
    expect(invoke).toHaveBeenCalledWith("remove_connector_secret", {
      connectorId: "pubmed",
      environment: "NCBI_API_KEY",
    });
  });

  it("exposes no read-back path — the keychain is write-only from the webview", () => {
    const store = new TauriConnectorSecrets(vi.fn()) as unknown as Record<string, unknown>;
    // P1B ships no getter command; re-adding one would let credentials back
    // into the webview and from there into logs, provenance and exports.
    expect(store.get).toBeUndefined();
    expect(store.getSecret).toBeUndefined();
    expect(store.list).toBeUndefined();
    expect(store.listSecrets).toBeUndefined();
    expect(Object.keys(keychain)).not.toContain("getSecret");
  });

  it("never invokes a command outside P1B's registered write set", async () => {
    const registered = [
      "set_provider_secret",
      "remove_provider_secret",
      "provider_secret_exists",
      "set_connector_secret",
      "remove_connector_secret",
    ];
    const invoke = vi.fn().mockResolvedValue(undefined);
    const store = new TauriConnectorSecrets(invoke);
    await store.set("literature", "OPENALEX_API_KEY", "k");
    await store.remove("literature", "OPENALEX_API_KEY");
    for (const [command] of invoke.mock.calls) {
      expect(registered).toContain(command);
    }
  });
});

describe("InMemoryConnectorSecrets", () => {
  it("records writes by name and forgets them on remove", async () => {
    const store = new InMemoryConnectorSecrets();
    await store.set("literature", "OPENALEX_API_KEY", "k-123");
    expect(store.has("literature", "OPENALEX_API_KEY")).toBe(true);
    expect(store.keys()).toEqual(["literature:OPENALEX_API_KEY"]);

    expect(await store.remove("literature", "OPENALEX_API_KEY")).toBe(true);
    expect(await store.remove("literature", "OPENALEX_API_KEY")).toBe(false);
    expect(store.keys()).toEqual([]);
  });

  it("does not retain the secret value", async () => {
    const store = new InMemoryConnectorSecrets();
    await store.set("literature", "OPENALEX_API_KEY", "super-secret-value");
    expect(JSON.stringify(store.keys())).not.toContain("super-secret-value");
  });
});

describe("missingSecretNames", () => {
  it("reports names absent from the inherited environment", () => {
    expect(missingSecretNames(literature, {})).toEqual(["OPENALEX_API_KEY"]);
    expect(missingSecretNames(pubmed, {})).toEqual(["NCBI_API_KEY"]);
  });

  it("treats a present value as satisfied and a blank one as missing", () => {
    expect(missingSecretNames(literature, { OPENALEX_API_KEY: "k" })).toEqual([]);
    expect(missingSecretNames(literature, { OPENALEX_API_KEY: "   " })).toEqual([
      "OPENALEX_API_KEY",
    ]);
  });

  it("reports only the names still missing when several are declared", () => {
    expect(missingSecretNames(twoSecrets, { OPENALEX_API_KEY: "k" })).toEqual(["NCBI_API_KEY"]);
  });

  it("is empty for a keyless server", () => {
    expect(missingSecretNames(keyless, {})).toEqual([]);
  });
});

describe("secretSummary", () => {
  it("reports counts only — never a secret name or value", () => {
    const summary = secretSummary(literature, { OPENALEX_API_KEY: "k-123" });
    expect(summary).toBe("1/1 secrets present");
    expect(summary).not.toContain("OPENALEX_API_KEY");
    expect(summary).not.toContain("k-123");
  });

  it("counts a partially configured server", () => {
    expect(secretSummary(twoSecrets, { OPENALEX_API_KEY: "k-123" })).toBe("1/2 secrets present");
    expect(secretSummary(literature, {})).toBe("0/1 secrets present");
  });

  it("says so when a server needs nothing", () => {
    expect(secretSummary(keyless, {})).toBe("no secrets required");
  });
});

describe("requiredSecrets", () => {
  it("returns the keychain entries the settings UI must populate", () => {
    expect(requiredSecrets(literature)).toEqual([
      { connectorId: "literature", environment: "OPENALEX_API_KEY" },
    ]);
    expect(requiredSecrets(pubmed)).toEqual([
      { connectorId: "pubmed", environment: "NCBI_API_KEY" },
    ]);
  });

  it("is empty for a keyless server", () => {
    expect(requiredSecrets(keyless)).toEqual([]);
  });
});
