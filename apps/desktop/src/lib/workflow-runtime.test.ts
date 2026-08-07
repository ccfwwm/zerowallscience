import { describe, expect, it } from "vitest";
import type { WorkflowExecutionContext } from "@zerowall/sdk";
import { AcpWorkflowExecutor, createWorkflowControlExecutor } from "./workflow-runtime";

describe("AcpWorkflowExecutor", () => {
  it("fails closed when a control node has no real control-plane executor", async () => {
    const executor = new AcpWorkflowExecutor({
      invoke: async <T>() => undefined as T,
      resolveLaunch: () => {
        throw new Error("not used");
      },
      resolveSnapshot: () => ({ bindingSnapshot: {}, mcpAllowList: [], skillsSnapshot: [] }),
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: [], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: {},
    } as WorkflowExecutionContext;

    await expect(executor.execute(context)).rejects.toThrow(
      "workflow control node run has no executor",
    );
  });

  it("delegates control nodes to the configured control plane", async () => {
    const executor = new AcpWorkflowExecutor({
      invoke: async <T>() => undefined as T,
      resolveLaunch: () => {
        throw new Error("not used");
      },
      resolveSnapshot: () => ({ bindingSnapshot: {}, mcpAllowList: [], skillsSnapshot: [] }),
      executeControl: async (context) => ({ nodeId: context.node.id, persisted: true }),
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "artifact", kind: "artifact", dependsOn: [], state: "running", attempts: 1 },
      dependencyOutputs: {},
    } as WorkflowExecutionContext;

    await expect(executor.execute(context)).resolves.toEqual({ nodeId: "artifact", persisted: true });
  });

  it("deduplicates structured paper outputs in a real tool control node", async () => {
    const execute = createWorkflowControlExecutor({
      writeText: async (filename) => filename,
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "dedupe", kind: "tool", dependsOn: ["search"], state: "running", attempts: 1, input: { operation: "deduplicate" } },
      dependencyOutputs: {
        search: {
          text: JSON.stringify({ papers: [
            { doi: "10.1000/ABC", title: "First" },
            { doi: "10.1000/abc", title: "Duplicate" },
            { title: "Second paper" },
          ] }),
        },
      },
    } as WorkflowExecutionContext;

    await expect(execute(context)).resolves.toEqual({
      operation: "deduplicate",
      items: [
        { doi: "10.1000/ABC", title: "First" },
        { title: "Second paper" },
      ],
      inputCount: 3,
      removedCount: 1,
    });
  });

  it("writes artifact control-node output into the workspace", async () => {
    const writes: Array<[string, string]> = [];
    const execute = createWorkflowControlExecutor({
      writeText: async (filename, content) => {
        writes.push([filename, content]);
        return `workflow/${filename}`;
      },
    });
    const context = {
      run: { id: "run-1", workflowId: "report-generation", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "export", kind: "artifact", dependsOn: ["draft"], state: "running", attempts: 1, input: { artifactType: "report" } },
      dependencyOutputs: { draft: { text: "# Final report\n\nEvidence." } },
    } as WorkflowExecutionContext;

    await expect(execute(context)).resolves.toEqual({
      artifactId: "workflow/report.md",
      path: "workflow/report.md",
      artifactType: "report",
    });
    expect(writes).toEqual([["report.md", "# Final report\n\nEvidence."]]);
  });

  it("refuses run control nodes until an approved execution adapter is supplied", async () => {
    const execute = createWorkflowControlExecutor({
      writeText: async (filename) => filename,
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: [], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: {},
    } as WorkflowExecutionContext;

    await expect(execute(context)).rejects.toThrow("approved execution adapter");
  });

  it("runs agent nodes through the normalized ACP Host and forwards the node MCP allow-list", async () => {
    let prompted = false;
    let emitted = false;
    let promptArgs: Record<string, unknown> | undefined;
    let newArgs: Record<string, unknown> | undefined;
    const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      if (command === "acp_host_initialize") return { capabilities: { prompt: true } } as T;
      if (command === "acp_host_new") {
        newArgs = args;
        const request = (args?.request ?? {}) as Record<string, unknown>;
        const binding = request as Record<string, unknown>;
        return {
          id: "workflow-session",
          binding: {
            engine: request.engine,
            profile: request.profileId,
            model: request.model,
            provider: request.providerId,
            variant: null,
            projectRoot: request.projectRoot,
            profileFingerprint: "fingerprint",
            resolvedAt: "now",
            mcpAllowList: request.mcpAllowList,
            skillsSnapshot: request.skillsSnapshot,
          },
          resumable: true,
          bindingEcho: binding,
        } as T;
      }
      if (command === "acp_host_prompt") {
        prompted = true;
        promptArgs = args;
        return undefined as T;
      }
      if (command === "acp_host_events") {
        if (prompted && !emitted) {
          emitted = true;
          return [
            { type: "text.delta", data: { session_id: "workflow-session", delta: "result" } },
            { type: "session.idle", data: { session_id: "workflow-session" } },
          ] as T;
        }
        return [] as T;
      }
      if (command === "acp_host_close") return undefined as T;
      throw new Error(`unexpected command ${command}`);
    };
    const executor = new AcpWorkflowExecutor({
      invoke,
      resolveLaunch: () => ({
        engine: "codex",
        profileId: "codex",
        sessionId: "workflow-source",
        model: "gpt-5",
        providerId: "ai-cloud",
        baseUrl: "https://example.invalid",
        projectRoot: "C:/science",
        profileFingerprint: "fingerprint",
        credentialRef: "keychain-ref",
      }),
      resolveSnapshot: () => ({ bindingSnapshot: {}, mcpAllowList: [], skillsSnapshot: [] }),
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: {
        id: "agent",
        kind: "agent",
        dependsOn: [],
        state: "running",
        attempts: 1,
        input: { task: "test" },
        mcpAllowList: ["paper-search"],
        skillsSnapshot: [{
          id: "citation-review",
          version: "installed",
          scope: "workflow-node",
          sha256: "abc123",
        }],
      },
      dependencyOutputs: {},
    } as WorkflowExecutionContext;

    const output = await executor.execute(context) as { text: string };
    expect(output.text).toBe("result");
    expect((promptArgs?.sessionId as string)).toBe("workflow-session");
    expect(((promptArgs?.prompt as string) ?? "")).toContain('"task": "test"');
    expect((newArgs?.request as Record<string, unknown>).mcpAllowList).toEqual(["paper-search"]);
    expect((newArgs?.request as Record<string, unknown>).skillsSnapshot).toEqual([{
      id: "citation-review",
      version: "installed",
      scope: "workflow-node",
      sha256: "abc123",
    }]);
  });
});
