import { describe, expect, it } from "vitest";
import type { WorkflowExecutionContext } from "@zerowall/sdk";
import { AcpWorkflowExecutor } from "./workflow-runtime";

describe("AcpWorkflowExecutor", () => {
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
            projectRoot: "C:/workspace",
            profileFingerprint: "fingerprint",
            resolvedAt: "now",
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
        profileFingerprint: "fingerprint",
        credentialRef: "keychain-ref",
      }),
      resolveSnapshot: () => ({ bindingSnapshot: {}, mcpAllowList: [], skillsSnapshot: [] }),
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "agent", kind: "agent", dependsOn: [], state: "running", attempts: 1, input: { task: "test" }, mcpAllowList: ["paper-search"] },
      dependencyOutputs: {},
    } as WorkflowExecutionContext;

    const output = await executor.execute(context) as { text: string };
    expect(output.text).toBe("result");
    expect((promptArgs?.sessionId as string)).toBe("workflow-session");
    expect(((promptArgs?.prompt as string) ?? "")).toContain('"task": "test"');
    expect((newArgs?.request as Record<string, unknown>).mcpAllowList).toEqual(["paper-search"]);
  });
});
