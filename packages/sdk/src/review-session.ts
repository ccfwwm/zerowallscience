import type {
  AcpHostLaunchRequest,
  AgentEvent,
  AgentSession,
} from "./AcpHostClient";

export interface ReviewHost {
  newSession(request: AcpHostLaunchRequest): Promise<AgentSession>;
  subscribe(sessionId: string, listener: (event: AgentEvent) => void): () => void;
  prompt(sessionId: string, prompt: string): Promise<void>;
  respondPermission(sessionId: string, requestId: string, optionId: string | null): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  close(sessionId: string): Promise<void>;
}

export interface ReviewRunRequest {
  launch: AcpHostLaunchRequest;
  prompt: string;
  /** Raw, inspectable artifact or agent output. Empty input is never reviewable. */
  rawOutput: string;
  evidenceReferences?: string[];
  timeoutMs?: number;
}

export type ReviewRunStatus = "completed" | "unreviewable" | "timed-out" | "error";

export interface ReviewRunResult {
  status: ReviewRunStatus;
  verdict: "Reviewable" | "Unreviewable";
  sessionId: string | null;
  engine: AcpHostLaunchRequest["engine"];
  model: string;
  output: string;
  evidenceReferences: string[];
  coverage: number;
  timeoutMs: number;
  diagnostic?: string;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const MUTATION_PERMISSION = /(?:write|edit|delete|remove|shell|exec|command|remote|network|connect|mutation|install)/i;
const DENY_OPTION = /(?:deny|reject|decline|不允许|拒绝)/i;

function reviewSessionId(): string {
  return `review_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function denyOption(event: Extract<AgentEvent, { type: "permission.requested" }>): string | null {
  const denied = event.options.find((option) =>
    DENY_OPTION.test(`${option.id} ${option.label ?? ""}`),
  );
  return denied?.id ?? null;
}

function isMutationPermission(event: Extract<AgentEvent, { type: "permission.requested" }>): boolean {
  return MUTATION_PERMISSION.test(`${event.action} ${event.resources.join(" ")}`);
}

export class ReviewSessionRunner {
  constructor(private readonly host: ReviewHost) {}

  async run(request: ReviewRunRequest): Promise<ReviewRunResult> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const base = {
      engine: request.launch.engine,
      model: request.launch.model,
      evidenceReferences: [...(request.evidenceReferences ?? [])],
      timeoutMs,
    };
    if (!request.rawOutput.trim()) {
      return {
        ...base,
        status: "unreviewable",
        verdict: "Unreviewable",
        sessionId: null,
        output: "",
        coverage: 0,
        diagnostic: "No raw inspectable output was provided.",
      };
    }

    const session = await this.host.newSession({
      ...request.launch,
      sessionId: reviewSessionId(),
    });
    const chunks: string[] = [];
    const pendingPermissions: Promise<void>[] = [];
    let unsubscribe: () => void = () => undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const result = await new Promise<ReviewRunResult>((resolve) => {
      let settled = false;
      const finish = async (
        status: Exclude<ReviewRunStatus, "unreviewable">,
        diagnostic?: string,
      ) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        unsubscribe();
        await Promise.allSettled(pendingPermissions);
        resolve({
          ...base,
          status,
          verdict: "Reviewable",
          sessionId: session.id,
          output: chunks.join(""),
          coverage: request.evidenceReferences?.length ?? 1,
          ...(diagnostic ? { diagnostic } : {}),
        });
      };

      unsubscribe = this.host.subscribe(session.id, (event) => {
        if (event.sessionId !== session.id) return;
        if (event.type === "text.delta") chunks.push(event.delta);
        if (event.type === "permission.requested" && isMutationPermission(event)) {
          pendingPermissions.push(
            this.host.respondPermission(session.id, event.requestId, denyOption(event)),
          );
        }
        if (event.type === "session.idle") void finish("completed");
        if (event.type === "error") void finish("error", event.message);
      });

      timer = setTimeout(() => {
        void this.host.cancel(session.id).finally(() => finish("timed-out", "Review timed out."));
      }, timeoutMs);

      const prompt = `${request.prompt}\n\nRaw inspectable output:\n${request.rawOutput}`;
      void this.host.prompt(session.id, prompt).catch((error) => {
        void finish("error", error instanceof Error ? error.message : String(error));
      });
    });

    await this.host.close(session.id).catch(() => undefined);
    return result;
  }
}
