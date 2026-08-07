import { describe, expect, it } from "vitest";
import {
  BUILTIN_WORKFLOWS,
  WorkflowScheduler,
  type AcpHostInvoke,
  type WorkflowExecutionContext,
  type WorkflowPersistence,
  type WorkflowRun,
} from "@zerowall/sdk";
import {
  AcpWorkflowExecutor,
  createWorkflowControlExecutor,
  createWorkflowRunAdapter,
} from "./workflow-runtime";

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

  it("rejects a run node without an explicit local code recipe", async () => {
    const invoke = vi.fn();
    const adapter = createWorkflowRunAdapter({
      invoke,
      requestApproval: async () => true,
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: { prepare: { text: "run `pip install numpy` and execute the experiment" } },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).rejects.toThrow("explicit Python or R recipe");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks shell, dependency install, remote access, and destructive code before approval", async () => {
    const invoke = vi.fn();
    const requestApproval = vi.fn(async () => true);
    const adapter = createWorkflowRunAdapter({ invoke, requestApproval });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: {
        prepare: { text: JSON.stringify({
          language: "python",
          code: "import subprocess\nsubprocess.run(['pip', 'install', 'numpy'])\nrequests.get('https://example.com')\nos.remove('data.csv')",
        }) },
      },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).rejects.toThrow(
      "workflow run recipe requests blocked capabilities: shell, dependency-install, remote-access, destructive",
    );
    expect(requestApproval).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks aliased and dynamic capability access instead of trusting call spelling", async () => {
    const requestApproval = vi.fn(async () => true);
    const adapter = createWorkflowRunAdapter({
      invoke: vi.fn(),
      requestApproval,
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: {
        prepare: { text: JSON.stringify({
          language: "python",
          code: "from os import system as run\nfrom pathlib import Path as P\nrun('echo unsafe')\nP('outside').unlink()\n__import__('socket')",
        }) },
      },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).rejects.toThrow(
      "workflow run recipe requests blocked capabilities: shell, remote-access, destructive",
    );
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("blocks dynamic and privileged R APIs before approval", async () => {
    const requestApproval = vi.fn(async () => true);
    const adapter = createWorkflowRunAdapter({ invoke: vi.fn(), requestApproval });
    const context = {
      run: { id: "run-r", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: {
        prepare: { text: JSON.stringify({
          language: "r",
          code: "runner <- get('system')\nlibrary(httr)\nrunner('echo unsafe')\nunlink('data.csv')",
        }) },
      },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).rejects.toThrow(
      "workflow run recipe requests blocked capabilities: shell, remote-access, destructive",
    );
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("rejects Python imports outside the local scientific allow-list", async () => {
    const requestApproval = vi.fn(async () => true);
    const adapter = createWorkflowRunAdapter({ invoke: vi.fn(), requestApproval });
    const context = {
      run: { id: "run-http", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: {
        prepare: { text: JSON.stringify({
          language: "python",
          code: "import http.client\nhttp.client.HTTPSConnection('example.com')",
        }) },
      },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).rejects.toThrow(
      "workflow run recipe requests blocked capabilities: untrusted-import",
    );
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("blocks R package installers and dynamic function lookup variants", async () => {
    const requestApproval = vi.fn(async () => true);
    const adapter = createWorkflowRunAdapter({ invoke: vi.fn(), requestApproval });
    const context = {
      run: { id: "run-pak", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: {
        prepare: { text: JSON.stringify({
          language: "r",
          code: "runner <- match.fun('system')\npak::pkg_install('digest')\nrunner('echo unsafe')",
        }) },
      },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).rejects.toThrow(
      "workflow run recipe requests blocked capabilities: shell, dependency-install",
    );
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("requires approval before invoking the workspace kernel", async () => {
    const invoke = vi.fn();
    const requestApproval = vi.fn(async () => false);
    const adapter = createWorkflowRunAdapter({ invoke, requestApproval });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: { prepare: { text: JSON.stringify({ language: "python", code: "print(42)" }) } },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).rejects.toThrow("workflow run approval was denied");
    expect(requestApproval).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects notebook paths that escape the active workspace", async () => {
    const invoke = vi.fn();
    const adapter = createWorkflowRunAdapter({ invoke, requestApproval: async () => true });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: { prepare: { text: JSON.stringify({ language: "python", code: "print(42)", notebook: "../outside.ipynb" }) } },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).rejects.toThrow("inside the current workspace");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("resets the local kernel when an approved recipe times out", async () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const invoke: AcpHostInvoke = async <T>(command: string) => {
        calls.push(command);
        if (command === "kernel_execute") return new Promise<T>(() => {});
        return undefined as T;
      };
      const adapter = createWorkflowRunAdapter({ invoke, requestApproval: async () => true });
      const context = {
        run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
        node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
        dependencyOutputs: { prepare: { text: JSON.stringify({ language: "python", code: "while True: pass", timeoutMs: 1_000 }) } },
      } as WorkflowExecutionContext;

      const execution = adapter.execute(context);
      const rejection = expect(execution).rejects.toThrow("timed out after 1000 ms");
      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;
      expect(calls).toEqual(["kernel_execute", "kernel_reset"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("executes an approved recipe in the workspace and resets it on cancel", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const invoke: AcpHostInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return { ok: true, stdout: "42\n", result: null, error: null } as T;
    };
    const adapter = createWorkflowRunAdapter({
      invoke,
      requestApproval: async () => true,
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: { prepare: { text: JSON.stringify({ language: "python", code: "print(42)", notebook: "analysis.ipynb" }) } },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).resolves.toMatchObject({ ok: true, stdout: "42\n" });
    await adapter.cancel(context);
    expect(calls).toEqual([
      ["kernel_execute", { code: "print(42)", language: "python", notebook: "analysis.ipynb", root: "workspace" }],
      ["kernel_reset", { language: "python", notebook: "analysis.ipynb", root: "workspace" }],
    ]);
  });

  it("rejects a failed kernel result so the workflow cannot complete", async () => {
    const adapter = createWorkflowRunAdapter({
      invoke: async <T>() => ({
        ok: false,
        stdout: "loaded input\n",
        result: null,
        error: "ValueError: invalid sample",
      }) as T,
      requestApproval: async () => true,
    });
    const context = {
      run: { id: "run-1", workflowId: "wf", name: "Workflow", state: "running", nodes: {}, createdAt: "", updatedAt: "" },
      node: { id: "run", kind: "run", dependsOn: ["prepare"], state: "running", attempts: 1, input: { operation: "run" } },
      dependencyOutputs: { prepare: { text: JSON.stringify({ language: "python", code: "raise ValueError('invalid sample')" }) } },
    } as WorkflowExecutionContext;

    await expect(adapter.execute(context)).rejects.toMatchObject({
      message: expect.stringContaining("ValueError: invalid sample"),
      stdout: "loaded input\n",
      kernelError: "ValueError: invalid sample",
    });
  });

  it("completes the built-in reproducible experiment DAG with a reviewed run node", async () => {
    const stored = new Map<string, WorkflowRun>();
    const persistence: WorkflowPersistence = {
      load: async (id) => stored.get(id) ?? null,
      save: async (run) => { stored.set(run.id, run); },
    };
    const invoke: AcpHostInvoke = async <T>(command: string) => {
      if (command === "kernel_execute") return { ok: true, stdout: "42\n", result: null, error: null } as T;
      return undefined as T;
    };
    const runAdapter = createWorkflowRunAdapter({ invoke, requestApproval: async () => true });
    const control = createWorkflowControlExecutor({
      writeText: async (filename) => `workflow/${filename}`,
      executeRun: runAdapter.execute,
    });
    const executor = {
      execute: async (context: WorkflowExecutionContext) => {
        if (context.node.kind === "agent") {
          return { text: JSON.stringify({ language: "python", code: "print(42)" }) };
        }
        return control(context);
      },
      cancel: runAdapter.cancel,
    };
    const scheduler = new WorkflowScheduler(executor, persistence);
    const definition = BUILTIN_WORKFLOWS.find((workflow) => workflow.id === "reproducible-experiment")!;
    const run = await scheduler.createRun(definition, "experiment-run");

    const completed = await scheduler.start(run.id);

    expect(completed.state).toBe("completed");
    expect(Object.values(completed.nodes).every((node) => node.state === "completed")).toBe(true);
    expect(completed.nodes["run-experiment"].output).toMatchObject({ ok: true, stdout: "42\n" });
    expect(completed.nodes["capture-results"].output).toMatchObject({
      artifactType: "experiment-results",
      path: "workflow/experiment-results.json",
    });
  });

  it("fails the reproducible experiment DAG when the kernel reports an error", async () => {
    const stored = new Map<string, WorkflowRun>();
    const persistence: WorkflowPersistence = {
      load: async (id) => stored.get(id) ?? null,
      save: async (run) => { stored.set(run.id, run); },
    };
    const invoke: AcpHostInvoke = async <T>(command: string) => {
      if (command === "kernel_execute") {
        return { ok: false, stdout: "partial output\n", result: null, error: "RuntimeError: failed" } as T;
      }
      return undefined as T;
    };
    const runAdapter = createWorkflowRunAdapter({ invoke, requestApproval: async () => true });
    const control = createWorkflowControlExecutor({
      writeText: async (filename) => `workflow/${filename}`,
      executeRun: runAdapter.execute,
    });
    const executor = {
      execute: async (context: WorkflowExecutionContext) => {
        if (context.node.kind === "agent") {
          return { text: JSON.stringify({ language: "python", code: "raise RuntimeError('failed')" }) };
        }
        return control(context);
      },
      cancel: runAdapter.cancel,
    };
    const scheduler = new WorkflowScheduler(executor, persistence);
    const definition = BUILTIN_WORKFLOWS.find((workflow) => workflow.id === "reproducible-experiment")!;
    const run = await scheduler.createRun(definition, "experiment-failed-run");

    const failed = await scheduler.start(run.id);

    expect(failed.state).toBe("failed");
    expect(failed.nodes["run-experiment"].state).toBe("failed");
    expect(failed.nodes["run-experiment"].error).toContain("RuntimeError: failed");
    expect(failed.nodes["capture-results"].state).toBe("blocked");
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
