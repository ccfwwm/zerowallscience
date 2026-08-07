import {
  AcpHostClient,
  type AcpHostInvoke,
  type AcpHostLaunchRequest,
  type AgentEvent,
  type SkillSnapshot,
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
    skillsSnapshot: SkillSnapshot[];
  };
  /** Control-plane implementation for tool/run/artifact nodes. */
  executeControl?: (context: WorkflowExecutionContext) => Promise<unknown>;
}

export interface WorkflowControlPlaneDeps {
  writeText: (filename: string, content: string) => Promise<string>;
  executeRun?: (context: WorkflowExecutionContext) => Promise<unknown>;
}

function parseStructuredOutput(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const text = (value as { text?: unknown }).text;
  if (typeof text !== "string") return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function dependencyItems(outputs: Record<string, unknown>): unknown[] {
  const items: unknown[] = [];
  for (const raw of Object.values(outputs)) {
    const value = parseStructuredOutput(raw);
    if (Array.isArray(value)) items.push(...value);
    else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const collection = Array.isArray(record.papers)
        ? record.papers
        : Array.isArray(record.items)
          ? record.items
          : null;
      if (collection) items.push(...collection);
    }
  }
  return items;
}

function itemKey(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const item = value as Record<string, unknown>;
  for (const field of ["doi", "url", "id", "title"]) {
    const candidate = item[field];
    if (typeof candidate === "string" && candidate.trim()) {
      return `${field}:${candidate.trim().toLowerCase()}`;
    }
  }
  return JSON.stringify(value);
}

function artifactContent(context: WorkflowExecutionContext): string {
  const text = Object.values(context.dependencyOutputs)
    .map((value) => value && typeof value === "object" ? (value as { text?: unknown }).text : null)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return text.length > 0
    ? text.join("\n\n")
    : JSON.stringify(context.dependencyOutputs, null, 2);
}

function artifactFilename(artifactType: string): string {
  switch (artifactType) {
    case "evidence-report":
      return "evidence-report.md";
    case "paper-catalog":
      return "paper-catalog.json";
    case "experiment-results":
      return "experiment-results.json";
    case "report":
      return "report.md";
    default:
      return `${artifactType.replace(/[^a-z0-9_-]+/gi, "-") || "workflow-artifact"}.json`;
  }
}

export function createWorkflowControlExecutor(
  deps: WorkflowControlPlaneDeps,
): (context: WorkflowExecutionContext) => Promise<unknown> {
  return async (context) => {
    if (context.node.kind === "tool") {
      const operation = (context.node.input as { operation?: unknown } | undefined)?.operation;
      if (operation !== "deduplicate") {
        throw new Error(`unsupported workflow tool operation: ${String(operation ?? "missing")}`);
      }
      const items = dependencyItems(context.dependencyOutputs);
      if (items.length === 0) throw new Error("deduplicate requires a structured papers or items array");
      const seen = new Set<string>();
      const deduplicated = items.filter((item) => {
        const key = itemKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        operation,
        items: deduplicated,
        inputCount: items.length,
        removedCount: items.length - deduplicated.length,
      };
    }
    if (context.node.kind === "artifact") {
      const artifactType = String(
        (context.node.input as { artifactType?: unknown } | undefined)?.artifactType
          ?? "workflow-artifact",
      );
      const path = await deps.writeText(
        artifactFilename(artifactType),
        artifactContent(context),
      );
      return { artifactId: path, path, artifactType };
    }
    if (context.node.kind === "run") {
      if (!deps.executeRun) {
        throw new Error("workflow run node requires an approved execution adapter");
      }
      return deps.executeRun(context);
    }
    throw new Error(`unsupported workflow control node: ${context.node.kind}`);
  };
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
        throw new Error(`workflow control node ${context.node.kind} has no executor`);
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
      skillsSnapshot: [...(context.node.skillsSnapshot ?? [])],
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
