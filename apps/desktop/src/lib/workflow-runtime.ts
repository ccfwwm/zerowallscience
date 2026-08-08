import {
  AcpHostClient,
  type AcpHostInvoke,
  type AcpHostLaunchRequest,
  type AgentEvent,
  type McpToolGrantSnapshot,
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
    mcpToolGrants?: McpToolGrantSnapshot[];
    skillsSnapshot: SkillSnapshot[];
  };
  /** Every ACP permission inside a workflow requires an explicit UI decision. */
  requestPermission?: (
    context: WorkflowExecutionContext,
    event: Extract<AgentEvent, { type: "permission.requested" }>,
  ) => Promise<string | null>;
  /** Control-plane implementation for tool/run/artifact nodes. */
  executeControl?: (context: WorkflowExecutionContext) => Promise<unknown>;
  /** Cancels a control-plane node such as a local kernel run. */
  cancelControl?: (context: WorkflowExecutionContext) => Promise<void>;
}

export interface WorkflowControlPlaneDeps {
  writeText: (filename: string, content: string) => Promise<string>;
  executeRun?: (context: WorkflowExecutionContext) => Promise<unknown>;
}

export interface WorkflowRunRecipe {
  language: "python" | "r";
  code: string;
  notebook?: string;
  timeoutMs: number;
}

export type WorkflowRunBlockedCapability =
  | "shell"
  | "dependency-install"
  | "remote-access"
  | "destructive"
  | "untrusted-import";

export interface WorkflowRunAdapter {
  execute: (context: WorkflowExecutionContext) => Promise<unknown>;
  cancel: (context: WorkflowExecutionContext) => Promise<void>;
}

export interface WorkflowRunAdapterDeps {
  invoke: AcpHostInvoke;
  requestApproval: (
    context: WorkflowExecutionContext,
    recipe: WorkflowRunRecipe,
  ) => Promise<boolean>;
}

export class WorkflowRunExecutionError extends Error {
  readonly stdout: string;
  readonly kernelError: string;

  constructor(stdout: string, kernelError: string) {
    const evidence = [kernelError || "Unknown kernel error", stdout.trim()]
      .filter(Boolean)
      .join("\n");
    super(`workflow kernel execution failed: ${evidence}`);
    this.name = "WorkflowRunExecutionError";
    this.stdout = stdout;
    this.kernelError = kernelError;
  }
}

const DEFAULT_RUN_TIMEOUT_MS = 120_000;
const MAX_RUN_TIMEOUT_MS = 600_000;
const MAX_RUN_CODE_BYTES = 1_000_000;

const PYTHON_ALLOWED_IMPORTS = new Set([
  "Bio", "PIL", "altair", "collections", "copy", "csv", "dataclasses",
  "datetime", "decimal", "enum", "fractions", "functools", "itertools",
  "jax", "json", "math", "matplotlib", "networkx", "numpy", "openpyxl",
  "operator", "pandas", "pathlib", "plotly", "polars", "random", "rdkit",
  "re", "scipy", "seaborn", "sklearn", "statistics", "statsmodels",
  "string", "sympy", "tensorflow", "time", "torch", "typing", "warnings",
  "xarray",
]);
const PYTHON_CLASSIFIED_IMPORTS = new Set([
  "child_process", "commands", "ctypes", "ftplib", "httpx",
  "importlib", "os", "requests", "shutil", "socket", "subprocess",
  "urllib", "webbrowser",
]);
const R_ALLOWED_PACKAGES = new Set([
  "base", "broom", "caret", "data.table", "datasets", "dplyr", "forcats",
  "ggplot2", "graphics", "grDevices", "lme4", "MASS", "Matrix", "methods",
  "purrr", "randomForest", "readr", "stats", "stringr", "survival", "tibble",
  "tidyr", "utils",
]);
const R_CLASSIFIED_PACKAGES = new Set([
  "BiocManager", "curl", "devtools", "httr", "pak", "remotes", "renv",
]);

function pythonImportRoots(code: string): string[] {
  const roots = new Set<string>();
  for (const match of code.matchAll(/(?:^|\n)\s*from\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s+import\b/g)) {
    roots.add(match[1].split(".")[0]);
  }
  for (const match of code.matchAll(/(?:^|\n)\s*import\s+([^\n#]+)/g)) {
    for (const item of match[1].split(",")) {
      const moduleName = item.trim().split(/\s+/)[0].split(".")[0];
      if (/^[A-Za-z_]\w*$/.test(moduleName)) roots.add(moduleName);
    }
  }
  return [...roots];
}

function rPackageNames(code: string): string[] {
  const packages = new Set<string>();
  for (const match of code.matchAll(/\b(?:library|require)\s*\(\s*["']?([A-Za-z][\w.]*)/g)) {
    packages.add(match[1]);
  }
  for (const match of code.matchAll(/\b([A-Za-z][\w.]*)\s*:{2,3}\s*[A-Za-z]/g)) {
    packages.add(match[1]);
  }
  return [...packages];
}

function hasUntrustedImport(language: "python" | "r", code: string): boolean {
  const imports = language === "python" ? pythonImportRoots(code) : rPackageNames(code);
  const allowed = language === "python" ? PYTHON_ALLOWED_IMPORTS : R_ALLOWED_PACKAGES;
  const classified = language === "python" ? PYTHON_CLASSIFIED_IMPORTS : R_CLASSIFIED_PACKAGES;
  return imports.some((name) => !allowed.has(name) && !classified.has(name));
}

function blockedWorkflowCapabilities(language: "python" | "r", code: string): WorkflowRunBlockedCapability[] {
  const checks: Array<[WorkflowRunBlockedCapability, RegExp]> = [
    [
      "shell",
      language === "python"
        ? /(?:^|\n)\s*(?:from|import)\s+(?:os|subprocess|child_process|commands|ctypes|importlib)\b|(?:^|\n)\s*[!%]\s*\w+|\b(?:__import__|eval|exec|compile|system|system2?|shell|popen)\s*\(/i
        : /\b(?:system2?|shell|do\.call|get|match\.fun|eval|parse|source|dyn\.load)\s*\(/i,
    ],
    ["dependency-install", /\b(?:pip(?:3)?|conda|mamba|uv|npm)\b[\s\S]{0,80}\binstall\b|\binstall\.packages\s*\(|\b(?:remotes|pak|renv|devtools|BiocManager)::(?:pkg_)?install(?:_github)?\s*\(/i],
    ["remote-access", /(?:^|\n)\s*(?:from|import)\s+(?:requests|httpx|urllib|socket|ftplib|webbrowser)\b|\b(?:requests|httpx|urllib|socket|fetch|httr|curl)\b|\b(?:download\.file|socketConnection|url)\s*\(|__import__\s*\(\s*["'](?:requests|httpx|urllib|socket|ftplib)["']|https?:\/\//i],
    [
      "destructive",
      language === "python"
        ? /(?:^|\n)\s*(?:from|import)\s+shutil\b|\b(?:os\.(?:remove|unlink|rmdir|removedirs|rename|replace)|shutil\.(?:rmtree|move|copytree)|Path\.(?:unlink|rmdir|rename|replace))\s*\(|\.\s*(?:unlink|rmdir|rename|rmtree|move|copytree)\s*\(/i
        : /\b(?:unlink|file\.remove|file\.delete|fs::file_delete)\s*\(/i,
    ],
  ];
  const blocked = checks.filter(([, pattern]) => pattern.test(code)).map(([capability]) => capability);
  if (hasUntrustedImport(language, code)) blocked.push("untrusted-import");
  return blocked;
}

function structuredText(text: string): unknown {
  const trimmed = text.trim();
  const candidate = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return text;
  }
}

function parseStructuredOutput(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const text = (value as { text?: unknown }).text;
  if (typeof text !== "string") return value;
  const parsed = structuredText(text);
  return parsed === text ? value : parsed;
}

function workflowRunRecipe(context: WorkflowExecutionContext): WorkflowRunRecipe {
  const candidates = Object.values(context.dependencyOutputs)
    .map(parseStructuredOutput)
    .flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const record = value as Record<string, unknown>;
      return [record.recipe && typeof record.recipe === "object" ? record.recipe : record];
    });
  const raw = candidates.find((value) => {
    const record = value as Record<string, unknown>;
    return typeof record.code === "string" && typeof record.language === "string";
  }) as Record<string, unknown> | undefined;
  if (!raw) {
    throw new Error("workflow run requires an explicit Python or R recipe from a dependency node");
  }
  const language = String(raw.language).trim().toLowerCase();
  if (language !== "python" && language !== "r") {
    throw new Error("workflow run recipe language must be python or r");
  }
  const code = String(raw.code ?? "");
  if (!code.trim()) throw new Error("workflow run recipe code is required");
  if (new TextEncoder().encode(code).byteLength > MAX_RUN_CODE_BYTES) {
    throw new Error("workflow run recipe exceeds the 1 MB code limit");
  }
  const blockedCapabilities = blockedWorkflowCapabilities(language, code);
  if (blockedCapabilities.length > 0) {
    throw new Error(
      `workflow run recipe requests blocked capabilities: ${blockedCapabilities.join(", ")}`,
    );
  }
  const notebook = typeof raw.notebook === "string" && raw.notebook.trim()
    ? raw.notebook.trim().replace(/\\/g, "/")
    : undefined;
  if (notebook && (notebook.startsWith("/") || /^[a-z]:\//i.test(notebook) || notebook.split("/").includes(".."))) {
    throw new Error("workflow run notebook must stay inside the current workspace");
  }
  const requestedTimeout = typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs)
    ? raw.timeoutMs
    : DEFAULT_RUN_TIMEOUT_MS;
  const timeoutMs = Math.max(1_000, Math.min(MAX_RUN_TIMEOUT_MS, Math.round(requestedTimeout)));
  return { language, code, notebook, timeoutMs };
}

/** Execute the deliberately narrow workflow recipe format on the existing
 * local notebook kernel. The native command derives the active workspace and
 * never accepts an arbitrary cwd; approval is required before every run. */
export function createWorkflowRunAdapter(deps: WorkflowRunAdapterDeps): WorkflowRunAdapter {
  const reset = async (recipe: WorkflowRunRecipe): Promise<void> => {
    await deps.invoke("kernel_reset", {
      language: recipe.language,
      notebook: recipe.notebook,
      root: "workspace",
    });
  };
  return {
    execute: async (context) => {
      const recipe = workflowRunRecipe(context);
      if (!(await deps.requestApproval(context, recipe))) {
        throw new Error("workflow run approval was denied");
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`workflow run timed out after ${recipe.timeoutMs} ms`)), recipe.timeoutMs);
        });
        const result = await Promise.race([
          deps.invoke("kernel_execute", {
            code: recipe.code,
            language: recipe.language,
            notebook: recipe.notebook,
            root: "workspace",
          }),
          timeout,
        ]);
        if (result && typeof result === "object" && (result as { ok?: unknown }).ok === false) {
          const failed = result as { stdout?: unknown; error?: unknown };
          throw new WorkflowRunExecutionError(
            typeof failed.stdout === "string" ? failed.stdout : "",
            typeof failed.error === "string" ? failed.error : "",
          );
        }
        return result;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("workflow run timed out")) {
          await reset(recipe).catch(() => undefined);
        }
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    cancel: async (context) => {
      const recipe = workflowRunRecipe(context);
      await reset(recipe);
    },
  };
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
      frameId: `${context.run.id}:${context.node.id}:${context.node.attempts}`,
      mcpAllowList: [...(context.node.mcpAllowList ?? [])],
      mcpToolGrants: [...(context.node.mcpToolGrants ?? [])],
      skillsSnapshot: [...(context.node.skillsSnapshot ?? [])],
    });
    const sessionKey = `${context.run.id}:${context.node.id}`;
    this.clients.set(sessionKey, client);
    this.sessions.set(sessionKey, session.id);

    const text: string[] = [];
    const thought: string[] = [];
    const tools: AgentEvent[] = [];
    const permissionRequests = new Set<string>();
    const pendingPermissionTasks = new Set<Promise<void>>();
    let idleObserved = false;
    let settled = false;
    const result = new Promise<void>((resolve, reject) => {
      const settleIdle = () => {
        if (!idleObserved || settled || pendingPermissionTasks.size > 0) return;
        settled = true;
        unsubscribe();
        resolve();
      };
      const unsubscribe = client.subscribe(session.id, (event) => {
        if (event.type === "text.delta") text.push(event.delta);
        if (event.type === "thought.delta") thought.push(event.delta);
        if (event.type === "tool.updated" || event.type === "artifact.created") tools.push(event);
        if (event.type === "permission.requested") {
          if (permissionRequests.has(event.requestId)) return;
          permissionRequests.add(event.requestId);
          const task = (async () => {
            const optionId = await this.options.requestPermission?.(context, event) ?? null;
            await client.respondPermission(session.id, event.requestId, optionId).catch(() => undefined);
          })().finally(() => {
            pendingPermissionTasks.delete(task);
            settleIdle();
          });
          pendingPermissionTasks.add(task);
        }
        if (event.type === "session.idle") {
          idleObserved = true;
          settleIdle();
        }
        if (event.type === "error") {
          settled = true;
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
    if (context.node.kind !== "agent" && context.node.kind !== "review") {
      await this.options.cancelControl?.(context);
      return;
    }
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
