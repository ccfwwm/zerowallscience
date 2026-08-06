/**
 * Durable, engine-agnostic workflow control plane.
 *
 * Agent nodes delegate through the caller's AcpHostClient; this module never
 * knows about OpenCode, Codex, or Claude wire formats. The persistence and
 * executor interfaces keep restart recovery testable and let Tauri provide a
 * workspace/SQLite-backed implementation later without changing scheduling.
 */

export type WorkflowNodeKind = "agent" | "tool" | "run" | "review" | "artifact";
export type WorkflowNodeState =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";
export type WorkflowRunState = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface WorkflowNodeSpec {
  id: string;
  kind: WorkflowNodeKind;
  dependsOn: string[];
  /** Mutation nodes occupy the single serialized mutation lane. */
  mutation?: boolean;
  /** Number of retries after the first attempt. */
  maxRetries?: number;
  input?: unknown;
  bindingSnapshot?: unknown;
  mcpAllowList?: string[];
  skillsSnapshot?: unknown;
}

export interface WorkflowNodeSnapshot {
  bindingSnapshot: unknown;
  mcpAllowList: string[];
  skillsSnapshot: unknown;
}

export interface WorkflowCreateOptions {
  /** Resolve and freeze capabilities at run creation time. */
  resolveNodeSnapshot?: (node: WorkflowNodeSpec) => WorkflowNodeSnapshot;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNodeSpec[];
}

/**
 * The shipped research workflows are intentionally transport-neutral. The
 * desktop resolves the engine/model binding at run creation time and stores it
 * on each node, while these templates only describe the scientific handoff.
 */
const builtinNode = (
  id: string,
  kind: WorkflowNodeKind,
  dependsOn: string[] = [],
  options: Pick<WorkflowNodeSpec, "input" | "mutation" | "maxRetries"> = {},
): WorkflowNodeSpec => ({
  id,
  kind,
  dependsOn,
  ...options,
  bindingSnapshot: null,
  mcpAllowList: [],
  skillsSnapshot: [],
});

export const BUILTIN_WORKFLOWS: readonly WorkflowDefinition[] = [
  {
    id: "literature-evidence-review",
    name: "Literature evidence review",
    nodes: [
      builtinNode("collect-sources", "agent", [], { input: { task: "Collect relevant literature and source metadata." } }),
      builtinNode("check-evidence", "review", ["collect-sources"], { input: { task: "Check claims against the collected evidence." } }),
      builtinNode("review-report", "artifact", ["check-evidence"], { input: { artifactType: "evidence-report" } }),
    ],
  },
  {
    id: "paper-search-deduplication",
    name: "Paper search and deduplication",
    nodes: [
      builtinNode("search-papers", "agent", [], { input: { task: "Search the configured scholarly sources." } }),
      builtinNode("deduplicate-papers", "tool", ["search-papers"], { input: { operation: "deduplicate" } }),
      builtinNode("paper-catalog", "artifact", ["deduplicate-papers"], { input: { artifactType: "paper-catalog" } }),
    ],
  },
  {
    id: "reproducible-experiment",
    name: "Reproducible experiment",
    nodes: [
      builtinNode("prepare-experiment", "agent", [], { input: { task: "Prepare a reproducible experiment plan." } }),
      builtinNode("run-experiment", "run", ["prepare-experiment"], { mutation: true, input: { operation: "run" } }),
      builtinNode("capture-results", "artifact", ["run-experiment"], { input: { artifactType: "experiment-results" } }),
    ],
  },
  {
    id: "report-generation",
    name: "Report generation",
    nodes: [
      builtinNode("outline-report", "agent", [], { input: { task: "Create a report outline from the selected evidence." } }),
      builtinNode("draft-report", "agent", ["outline-report"], { input: { task: "Draft the report with linked evidence." } }),
      builtinNode("export-report", "artifact", ["draft-report"], { input: { artifactType: "report" } }),
    ],
  },
];

export interface WorkflowNodeRun extends WorkflowNodeSpec {
  state: WorkflowNodeState;
  attempts: number;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  name: string;
  state: WorkflowRunState;
  nodes: Record<string, WorkflowNodeRun>;
  createdAt: string;
  updatedAt: string;
  pauseRequested?: boolean;
}

export interface WorkflowExecutionContext {
  run: WorkflowRun;
  node: WorkflowNodeRun;
  dependencyOutputs: Record<string, unknown>;
}

export interface WorkflowExecutor {
  execute(context: WorkflowExecutionContext): Promise<unknown>;
  cancel?(context: WorkflowExecutionContext): Promise<void>;
}

export interface WorkflowPersistence {
  load(runId: string): Promise<WorkflowRun | null>;
  save(run: WorkflowRun): Promise<void>;
  listIncomplete?(): Promise<WorkflowRun[]>;
}

export type WorkflowEvent =
  | { type: "run.updated"; run: WorkflowRun }
  | { type: "node.updated"; runId: string; node: WorkflowNodeRun };

type Listener = (event: WorkflowEvent) => void;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function now(): string {
  return new Date().toISOString();
}

function runId(): string {
  return `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function validateDefinition(definition: WorkflowDefinition): void {
  if (!definition.id.trim()) throw new Error("workflow id is required");
  if (definition.nodes.length === 0) throw new Error("workflow must contain at least one node");
  const ids = new Set<string>();
  for (const node of definition.nodes) {
    if (!node.id.trim() || ids.has(node.id)) throw new Error(`duplicate workflow node: ${node.id}`);
    ids.add(node.id);
  }
  for (const node of definition.nodes) {
    for (const dependency of node.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`unknown dependency ${dependency} for ${node.id}`);
    }
  }
  // Kahn's algorithm catches cycles before a run is persisted.
  const remaining = new Map(definition.nodes.map((node) => [node.id, new Set(node.dependsOn)]));
  let resolved = 0;
  while (remaining.size) {
    const ready = [...remaining.entries()].filter(([, deps]) => deps.size === 0).map(([id]) => id);
    if (ready.length === 0) throw new Error("workflow graph contains a cycle");
    for (const id of ready) {
      remaining.delete(id);
      for (const deps of remaining.values()) deps.delete(id);
      resolved += 1;
    }
  }
  if (resolved !== definition.nodes.length) throw new Error("workflow graph is incomplete");
}

export class WorkflowScheduler {
  private readonly runs = new Map<string, WorkflowRun>();
  private readonly active = new Map<string, Map<string, WorkflowExecutionContext>>();
  private readonly pumping = new Map<string, Promise<void>>();
  private readonly listeners = new Set<Listener>();
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly executor: WorkflowExecutor,
    private readonly persistence: WorkflowPersistence,
  ) {}

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async createRun(
    definition: WorkflowDefinition,
    id = runId(),
    options: WorkflowCreateOptions = {},
  ): Promise<WorkflowRun> {
    validateDefinition(definition);
    const timestamp = now();
    const run: WorkflowRun = {
      id,
      workflowId: definition.id,
      name: definition.name,
      state: "pending",
      nodes: Object.fromEntries(
        definition.nodes.map((node) => [
          node.id,
          {
            ...clone(node),
            ...((options.resolveNodeSnapshot?.(node)) ?? {
              bindingSnapshot: clone(node.bindingSnapshot ?? null),
              mcpAllowList: [...(node.mcpAllowList ?? [])],
              skillsSnapshot: clone(node.skillsSnapshot ?? []),
            }),
            dependsOn: [...node.dependsOn],
            state: "pending",
            attempts: 0,
          },
        ]),
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.runs.set(id, run);
    await this.persist(run);
    return clone(run);
  }

  async get(runIdValue: string): Promise<WorkflowRun | null> {
    const cached = this.runs.get(runIdValue);
    if (cached) return clone(cached);
    const loaded = await this.persistence.load(runIdValue);
    if (loaded) this.runs.set(runIdValue, clone(loaded));
    return loaded ? clone(loaded) : null;
  }

  /** Discover durable active runs after process restart and resume only runs
   * that were executing. Paused and failed runs stay visible for user action. */
  async recoverIncomplete(): Promise<WorkflowRun[]> {
    if (!this.persistence.listIncomplete) {
      throw new Error("workflow persistence does not support incomplete run discovery");
    }
    const persisted = await this.persistence.listIncomplete();
    for (const run of persisted) this.runs.set(run.id, clone(run));
    await Promise.all(
      persisted
        .filter((run) => run.state === "pending" || run.state === "running")
        .map((run) => this.resume(run.id)),
    );
    return Promise.all(persisted.map((run) => this.get(run.id))).then((runs) =>
      runs.filter((run): run is WorkflowRun => run !== null),
    );
  }

  async start(runIdValue: string): Promise<WorkflowRun> {
    const run = await this.require(runIdValue);
    if (run.state === "completed" || run.state === "cancelled") return clone(run);
    const alreadyPumping = this.pumping.get(run.id);
    if (alreadyPumping) {
      await alreadyPumping;
      return clone(run);
    }
    run.pauseRequested = false;
    run.state = "running";
    // Register the pump before the first asynchronous persistence call. This
    // closes the duplicate-start window when persistence is slow.
    const pumping = (async () => {
      await this.persist(run);
      await this.pump(run);
    })().finally(() => {
      if (this.pumping.get(run.id) === pumping) this.pumping.delete(run.id);
    });
    this.pumping.set(run.id, pumping);
    await pumping;
    return clone(run);
  }

  async resume(runIdValue: string): Promise<WorkflowRun> {
    await this.waitForPump(runIdValue);
    const run = await this.require(runIdValue);
    for (const node of Object.values(run.nodes)) {
      if (node.state === "running" || node.state === "paused") node.state = "pending";
    }
    return this.start(run.id);
  }

  async pause(runIdValue: string): Promise<WorkflowRun> {
    const run = await this.require(runIdValue);
    run.pauseRequested = true;
    run.state = "paused";
    await this.persist(run);
    return clone(run);
  }

  async cancel(runIdValue: string): Promise<WorkflowRun> {
    const run = await this.require(runIdValue);
    run.pauseRequested = false;
    run.state = "cancelled";
    const contexts = this.active.get(run.id);
    if (contexts && this.executor.cancel) {
      await Promise.all([...contexts.values()].map((context) => this.executor.cancel!(context).catch(() => undefined)));
    }
    for (const node of Object.values(run.nodes)) {
      if (node.state === "pending" || node.state === "running" || node.state === "paused") node.state = "cancelled";
    }
    await this.persist(run);
    return clone(run);
  }

  async retry(runIdValue: string, nodeId?: string): Promise<WorkflowRun> {
    await this.waitForPump(runIdValue);
    const run = await this.require(runIdValue);
    const nodes = nodeId ? [run.nodes[nodeId]] : Object.values(run.nodes).filter((node) => node.state === "failed");
    if (nodes.some((node) => !node)) throw new Error(`unknown workflow node: ${nodeId}`);
    for (const node of nodes) {
      if (node.state !== "failed") continue;
      node.state = "pending";
      node.error = undefined;
    }
    for (const node of Object.values(run.nodes)) {
      if (node.state === "blocked") node.state = "pending";
    }
    run.state = "running";
    run.pauseRequested = false;
    await this.persist(run);
    return this.start(run.id);
  }

  private async waitForPump(id: string): Promise<void> {
    const pumping = this.pumping.get(id);
    if (pumping) await pumping;
  }

  private async require(id: string): Promise<WorkflowRun> {
    const cached = this.runs.get(id);
    if (cached) return cached;
    const run = await this.persistence.load(id);
    if (!run) throw new Error(`workflow run not found: ${id}`);
    this.runs.set(id, run);
    return run;
  }

  private async persist(run: WorkflowRun): Promise<void> {
    run.updatedAt = now();
    const snapshot = clone(run);
    this.runs.set(run.id, run);
    await this.persistence.save(snapshot);
    const event: WorkflowEvent = { type: "run.updated", run: clone(snapshot) };
    for (const listener of this.listeners) listener(event);
  }

  private readyNodes(run: WorkflowRun): WorkflowNodeRun[] {
    return Object.values(run.nodes).filter((node) => {
      if (node.state !== "pending") return false;
      return node.dependsOn.every((dependency) => run.nodes[dependency]?.state === "completed");
    });
  }

  private blockUnreachable(run: WorkflowRun): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of Object.values(run.nodes)) {
        if (node.state !== "pending") continue;
        if (node.dependsOn.some((dependency) => ["failed", "blocked", "cancelled"].includes(run.nodes[dependency]?.state ?? ""))) {
          node.state = "blocked";
          changed = true;
        }
      }
    }
  }

  private async pump(run: WorkflowRun): Promise<void> {
    const contexts = this.active.get(run.id) ?? new Map<string, WorkflowExecutionContext>();
    this.active.set(run.id, contexts);
    try {
      while (run.state === "running" && !run.pauseRequested) {
        this.blockUnreachable(run);
        const ready = this.readyNodes(run);
        if (ready.length === 0) {
          const unfinished = Object.values(run.nodes).some((node) => ["pending", "running"].includes(node.state));
          if (!unfinished) run.state = Object.values(run.nodes).some((node) => ["failed", "blocked"].includes(node.state)) ? "failed" : "completed";
          await this.persist(run);
          break;
        }
        const readonly = ready.filter((node) => !node.mutation);
        const selected = readonly.length > 0 ? readonly : [ready[0]];
        const tasks = selected.map((node) => this.executeNode(run, node, contexts));
        await Promise.all(tasks);
      }
      if (run.state === "running" && run.pauseRequested) {
        run.state = "paused";
        await this.persist(run);
      }
    } finally {
      this.active.delete(run.id);
    }
  }

  private async executeNode(run: WorkflowRun, node: WorkflowNodeRun, contexts: Map<string, WorkflowExecutionContext>): Promise<void> {
    if (node.mutation) {
      await this.withMutationLane(() => this.executeNodeInLane(run, node, contexts));
      return;
    }
    await this.executeNodeInLane(run, node, contexts);
  }

  private async withMutationLane<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  private async executeNodeInLane(run: WorkflowRun, node: WorkflowNodeRun, contexts: Map<string, WorkflowExecutionContext>): Promise<void> {
    if (run.state !== "running" || run.pauseRequested || node.state !== "pending") return;
    node.state = "running";
    node.attempts += 1;
    node.startedAt = now();
    node.error = undefined;
    const dependencyOutputs = Object.fromEntries(node.dependsOn.map((id) => [id, run.nodes[id].output]));
    const context: WorkflowExecutionContext = { run: clone(run), node: clone(node), dependencyOutputs };
    contexts.set(node.id, context);
    await this.persist(run);
    try {
      const output = await this.executor.execute(context);
      if ((run.state as WorkflowRunState) === "cancelled") {
        node.state = "cancelled";
      } else {
        node.output = output;
        node.state = "completed";
        node.finishedAt = now();
      }
    } catch (error) {
      node.error = error instanceof Error ? error.message : String(error);
      if ((run.state as WorkflowRunState) === "cancelled") node.state = "cancelled";
      else if (node.attempts <= (node.maxRetries ?? 0)) node.state = "pending";
      else node.state = "failed";
    } finally {
      contexts.delete(node.id);
      await this.persist(run);
      const event: WorkflowEvent = { type: "node.updated", runId: run.id, node: clone(node) };
      for (const listener of this.listeners) listener(event);
    }
  }
}
