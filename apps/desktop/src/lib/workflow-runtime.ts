import {
  AcpHostClient,
  type AcpHostInvoke,
  type AcpHostLaunchRequest,
  type AgentEvent,
  type WorkflowExecutionContext,
  type WorkflowExecutor,
  type WorkflowPersistence,
  type WorkflowRun,
  type WorkflowScheduler,
} from "@zerowall/sdk";
import {
  listIncompleteWorkflowRuns,
  loadWorkflowRun,
  saveWorkflowRun,
} from "./tauri";

export interface WorkflowRuntimeOptions {
  invoke: AcpHostInvoke;
  resolveLaunch: (context: WorkflowExecutionContext) => AcpHostLaunchRequest;
  resolveSnapshot: (context: { nodeId: string }) => {
    bindingSnapshot: unknown;
    mcpAllowList: string[];
    skillsSnapshot: unknown;
  };
  /** Control-plane implementation for tool/run/artifact nodes. */
  executeControl?: (context: WorkflowExecutionContext) => Promise<unknown>;
}

export class TauriWorkflowPersistence implements WorkflowPersistence {
  async load(runId: string): Promise<WorkflowRun | null> {
    return loadWorkflowRun<WorkflowRun>(runId);
  }

  async save(run: WorkflowRun): Promise<void> {
    await saveWorkflowRun(run.id, run);
  }

  async listIncomplete(): Promise<WorkflowRun[]> {
    return listIncompleteWorkflowRuns<WorkflowRun>();
  }
}

/** Executes workflow agent/review nodes through the same ACP Host client as
 * the conversation runtime. No vendor protocol or OpenCode URL is exposed. */
export class AcpWorkflowExecutor implements WorkflowExecutor {
  private readonly clients = new Map<string, AcpHostClient>();
  private readonly sessions = new Map<string, string>();

  constructor(private readonly options: WorkflowRuntimeOptions) {}

  async execute(context: WorkflowExecutionContext): Promise<unknown> {
    if (context.node.kind !== "agent" && context.node.kind !== "review") {
      if (!this.options.executeControl) {
        return {
          kind: context.node.kind,
          input: context.node.input ?? null,
          dependencyOutputs: context.dependencyOutputs,
          status: "control-plane-pending",
        };
      }
      return this.options.executeControl(context);
    }

    const launch = this.options.resolveLaunch(context);
    const client = new AcpHostClient({ invoke: this.options.invoke, pollIntervalMs: 50 });
    await client.initialize(launch.engine);
    const session = await client.newSession({
      ...launch,
      sessionId: `workflow:${context.run.id}:${context.node.id}`,
      mcpAllowList: [...(context.node.mcpAllowList ?? [])],
    });
    const sessionKey = `${context.run.id}:${context.node.id}`;
    this.clients.set(sessionKey, client);
    this.sessions.set(sessionKey, session.id);

    const text: string[] = [];
    const thought: string[] = [];
    const tools: AgentEvent[] = [];
    const result = new Promise<void>((resolve, reject) => {
      const unsubscribe = client.subscribe(session.id, (event) => {
        if (event.type === "text.delta") text.push(event.delta);
        if (event.type === "thought.delta") thought.push(event.delta);
        if (event.type === "tool.updated" || event.type === "artifact.created") tools.push(event);
        if (event.type === "permission.requested") {
          // Workflow mutation permissions are represented by the scheduler's
          // lane; an unexpected direct request is denied instead of hanging.
          void client.respondPermission(session.id, event.requestId, null).catch(() => undefined);
        }
        if (event.type === "session.idle") {
          unsubscribe();
          resolve();
        }
        if (event.type === "error") {
          unsubscribe();
          reject(new Error(event.message));
        }
      });
    });

    try {
      const prompt = [
        typeof context.node.input === "string"
          ? context.node.input
          : JSON.stringify(context.node.input ?? {}, null, 2),
        Object.keys(context.dependencyOutputs).length > 0
          ? `Dependency outputs:\n${JSON.stringify(context.dependencyOutputs, null, 2)}`
          : "",
      ].filter(Boolean).join("\n\n");
      await client.prompt(session.id, prompt);
      await result;
      return {
        text: text.join(""),
        thought: thought.join(""),
        events: tools,
        sessionId: session.id,
      };
    } finally {
      await client.close(session.id).catch(() => undefined);
      this.clients.delete(sessionKey);
      this.sessions.delete(sessionKey);
    }
  }

  async cancel(context: WorkflowExecutionContext): Promise<void> {
    const key = `${context.run.id}:${context.node.id}`;
    const client = this.clients.get(key);
    const sessionId = this.sessions.get(key);
    if (client && sessionId) await client.cancel(sessionId).catch(() => undefined);
  }
}

export interface WorkflowRuntime {
  scheduler: WorkflowScheduler;
  executor: AcpWorkflowExecutor;
  persistence: TauriWorkflowPersistence;
}

export function createWorkflowPersistence(): WorkflowPersistence {
  return new TauriWorkflowPersistence();
}
