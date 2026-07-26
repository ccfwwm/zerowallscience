/**
 * P2 agent definitions: schema validation, loading, permissions, handoff rules.
 *
 * Covers the four workflow agents (onboarding → operon → reviewer/bookmarker)
 * alongside the four general agents.
 */

import { describe, it, expect } from "vitest";
import {
  validateAgentDefinition,
  loadAgentDefinitions,
  isToolAllowed,
  validateHandoffRules,
  getHandoffGraph,
  canHandoff,
  BUILT_IN_AGENTS,
  type AgentDefinition,
} from "@zerowall/shared";

import onboarding from "../../../../runtime/agents/onboarding.json";
import operon from "../../../../runtime/agents/operon.json";
import reviewer from "../../../../runtime/agents/reviewer.json";
import bookmarker from "../../../../runtime/agents/bookmarker.json";
import generalPurpose from "../../../../runtime/agents/general-purpose.json";
import researchAssistant from "../../../../runtime/agents/research-assistant.json";
import codeSpecialist from "../../../../runtime/agents/code-specialist.json";
import dataAnalyst from "../../../../runtime/agents/data-analyst.json";

const WORKFLOW_AGENTS = { onboarding, operon, reviewer, bookmarker };
const ALL_AGENTS = {
  ...WORKFLOW_AGENTS,
  "general-purpose": generalPurpose,
  "research-assistant": researchAssistant,
  "code-specialist": codeSpecialist,
  "data-analyst": dataAnalyst,
};

function agent(overrides: Partial<AgentDefinition> = {}): any {
  return {
    version: "1",
    id: "test-agent",
    name: "Test Agent",
    role: "general",
    capabilities: { tools: true, reasoning: true, multimodal: true },
    permissions: { mode: "approve", allowedTools: ["*"] },
    ...overrides,
  };
}

describe("validateAgentDefinition", () => {
  it("accepts a well-formed definition", () => {
    expect(validateAgentDefinition(agent())).toBe(true);
  });

  it("rejects a non-v1 version", () => {
    expect(() => validateAgentDefinition(agent({ version: "2" }))).toThrow(
      /Invalid agent version/,
    );
  });

  it("rejects a non-kebab-case id", () => {
    expect(() => validateAgentDefinition(agent({ id: "Test_Agent" }))).toThrow(
      /Invalid agent id/,
    );
  });

  it("rejects an unknown role", () => {
    expect(() => validateAgentDefinition(agent({ role: "wizard" as any }))).toThrow(
      /Invalid agent role/,
    );
  });

  it("rejects an unknown permission mode", () => {
    expect(() =>
      validateAgentDefinition(agent({ permissions: { mode: "auto", allowedTools: [] } as any })),
    ).toThrow(/Invalid permission mode/);
  });

  it("rejects a definition with no capabilities", () => {
    const def = agent();
    delete def.capabilities;
    expect(() => validateAgentDefinition(def)).toThrow(/Missing or invalid capabilities/);
  });
});

describe("shipped agent definitions", () => {
  it.each(Object.entries(ALL_AGENTS))("%s passes schema validation", (_id, def) => {
    expect(validateAgentDefinition(def)).toBe(true);
  });

  it("loads all eight built-in agents", () => {
    const loaded = loadAgentDefinitions(ALL_AGENTS);
    expect(loaded.size).toBe(8);
    for (const id of BUILT_IN_AGENTS) {
      expect(loaded.has(id)).toBe(true);
    }
  });

  it("declares a file id matching its map key", () => {
    for (const [key, def] of Object.entries(ALL_AGENTS)) {
      expect(def.id).toBe(key);
    }
  });

  it("gives every workflow agent a substantive system prompt", () => {
    for (const def of Object.values(WORKFLOW_AGENTS)) {
      expect(def.systemPrompt.length).toBeGreaterThan(200);
    }
  });

  it("keeps onboarding tool-free", () => {
    expect(onboarding.permissions.mode).toBe("off");
    expect(onboarding.permissions.allowedTools).toEqual([]);
    expect(onboarding.capabilities.tools).toBe(false);
    expect(isToolAllowed("anything", onboarding.permissions.allowedTools, onboarding.permissions.blockedTools)).toBe(false);
  });

  it("keeps reviewer read-only over artifacts and compute", () => {
    const { allowedTools, blockedTools } = reviewer.permissions;
    expect(isToolAllowed("artifact/read", allowedTools, blockedTools)).toBe(true);
    expect(isToolAllowed("artifact/write", allowedTools, blockedTools)).toBe(false);
    expect(isToolAllowed("artifact/delete", allowedTools, blockedTools)).toBe(false);
    expect(isToolAllowed("compute/slurm", allowedTools, blockedTools)).toBe(false);
    expect(isToolAllowed("kernel/exec", allowedTools, blockedTools)).toBe(false);
    expect(reviewer.capabilities.codeExecution).toBe(false);
  });

  it("limits bookmarker to reads plus annotation writes", () => {
    const { allowedTools, blockedTools } = bookmarker.permissions;
    expect(isToolAllowed("annotation/create", allowedTools, blockedTools)).toBe(true);
    expect(isToolAllowed("annotation/link", allowedTools, blockedTools)).toBe(true);
    expect(isToolAllowed("artifact/write", allowedTools, blockedTools)).toBe(false);
    expect(isToolAllowed("compute/local", allowedTools, blockedTools)).toBe(false);
  });

  it("never ships a permission mode of full", () => {
    for (const def of Object.values(ALL_AGENTS)) {
      expect(def.permissions.mode).not.toBe("full");
    }
  });

  // AGENTS.md: project files are pure English. Localized strings belong under
  // metadata.locale.<tag>, which is exempt.
  it("keeps every string outside metadata.locale in English", () => {
    const offenders: string[] = [];

    const walk = (node: unknown, path: string[]) => {
      if (typeof node === "string") {
        if (!/^[\x00-\x7F]*$/.test(node)) offenders.push(path.join("."));
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, [...path, String(i)]));
        return;
      }
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          if (key === "locale" && path[path.length - 1] === "metadata") continue;
          walk(value, [...path, key]);
        }
      }
    };

    for (const [id, def] of Object.entries(ALL_AGENTS)) walk(def, [id]);
    expect(offenders).toEqual([]);
  });

  it("still carries the zh-CN locale text it was migrated from", () => {
    for (const def of Object.values(ALL_AGENTS)) {
      const zh = (def as any).metadata?.locale?.["zh-CN"];
      expect(zh?.name).toBeTruthy();
      expect(zh?.description).toBeTruthy();
    }
  });
});

describe("isToolAllowed", () => {
  it("matches the wildcard", () => {
    expect(isToolAllowed("any-tool", ["*"])).toBe(true);
  });

  it("matches exactly", () => {
    expect(isToolAllowed("pubmed/search", ["pubmed/search"])).toBe(true);
  });

  it("matches a prefix pattern", () => {
    expect(isToolAllowed("pubmed/search", ["pubmed/*"])).toBe(true);
    expect(isToolAllowed("pubmed", ["pubmed/*"])).toBe(true);
  });

  it("rejects a non-matching tool", () => {
    expect(isToolAllowed("chembl/search", ["pubmed/*"])).toBe(false);
  });

  it("lets the blocked list win over the allowed list", () => {
    expect(isToolAllowed("pubmed/search", ["*"], ["pubmed/*"])).toBe(false);
  });
});

describe("validateHandoffRules", () => {
  it("accepts the shipped workflow handoff graph", () => {
    const loaded = loadAgentDefinitions(ALL_AGENTS);
    expect(validateHandoffRules(loaded)).toBe(true);
  });

  it("rejects a dangling handoff target", () => {
    const loaded = loadAgentDefinitions({
      onboarding: agent({
        id: "onboarding",
        metadata: { handoff: { to: ["ghost"] } },
      }),
    });
    expect(() => validateHandoffRules(loaded)).toThrow(
      /handoff references unknown target agent "ghost"/,
    );
  });

  it("rejects a dangling handoff source", () => {
    const loaded = loadAgentDefinitions({
      operon: agent({ id: "operon", metadata: { handoff: { from: ["ghost"] } } }),
    });
    expect(() => validateHandoffRules(loaded)).toThrow(
      /handoff references unknown source agent "ghost"/,
    );
  });
});

describe("getHandoffGraph", () => {
  it("reflects the shipped edges", () => {
    const graph = getHandoffGraph(loadAgentDefinitions(ALL_AGENTS));
    expect(graph.get("onboarding")).toEqual(["operon"]);
    expect(graph.get("operon")).toEqual(["reviewer", "bookmarker"]);
    expect(graph.get("reviewer")).toEqual(["operon"]);
    expect(graph.get("bookmarker")).toEqual(["operon"]);
  });

  it("returns an empty edge list for agents without handoff metadata", () => {
    const graph = getHandoffGraph(loadAgentDefinitions({ "general-purpose": generalPurpose }));
    expect(graph.get("general-purpose")).toEqual([]);
  });
});

describe("canHandoff", () => {
  const loaded = loadAgentDefinitions(ALL_AGENTS);

  it("finds direct edges", () => {
    expect(canHandoff(loaded, "onboarding", "operon")).toBe(true);
    expect(canHandoff(loaded, "operon", "reviewer")).toBe(true);
    expect(canHandoff(loaded, "operon", "bookmarker")).toBe(true);
  });

  it("finds multi-hop paths", () => {
    expect(canHandoff(loaded, "onboarding", "reviewer")).toBe(true);
    expect(canHandoff(loaded, "onboarding", "bookmarker")).toBe(true);
  });

  it("terminates on the operon/reviewer cycle", () => {
    expect(canHandoff(loaded, "reviewer", "operon")).toBe(true);
    expect(canHandoff(loaded, "operon", "operon")).toBe(true);
  });

  it("refuses to route back into onboarding", () => {
    expect(canHandoff(loaded, "operon", "onboarding")).toBe(false);
    expect(canHandoff(loaded, "reviewer", "onboarding")).toBe(false);
    expect(canHandoff(loaded, "bookmarker", "onboarding")).toBe(false);
  });

  it("returns false for an unknown source", () => {
    expect(canHandoff(loaded, "ghost", "operon")).toBe(false);
  });

  it("returns false for a leaf general agent", () => {
    expect(canHandoff(loaded, "general-purpose", "operon")).toBe(false);
  });
});
