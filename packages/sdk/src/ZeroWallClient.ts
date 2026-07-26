import type { OpenCodeClient } from "./OpenCodeClient";
import type { AgentRuntime } from "./runtime";
import type {
  AgentDefinition,
  AgentHandoff,
} from "../../shared/src/agents";
import type {
  AgentRole,
  RoleModelBinding,
  SessionModelSnapshot,
} from "../../shared/src/models";

/**
 * ZeroWallClient — the single entry point for all agent interactions in
 * ZeroWall Science. Wraps OpenCodeClient (the bundled sidecar runtime) and
 * future SciencePlatformClient (remote ZeroWall Cloud gateway) behind a
 * uniform interface. The UI layer talks only to ZeroWallClient, never to
 * the underlying transports directly.
 *
 * P2 Architecture:
 * - Maintains four Agent definitions (General, Research, Code, Data).
 * - Routes prompts to the appropriate Agent based on role bindings.
 * - Implements model slot fallback (primary → backup gateway).
 * - Captures model snapshots at session creation for reproducibility.
 * - Enforces permission policies per Agent type.
 * - Logs all handoffs for replay and provenance.
 */
export class ZeroWallClient implements AgentRuntime {
  // Config, refreshed by configure() as the catalog reloads. The history below
  // (handoff log, snapshots) deliberately outlives it — see configure().
  private opencode: OpenCodeClient;
  private agents: Map<string, AgentDefinition>;
  private roleBindings: Record<AgentRole, RoleModelBinding>;
  private readonly handoffLog: AgentHandoff[] = [];
  private readonly sessionSnapshots: Map<string, SessionModelSnapshot> = new Map();
  private availableProviders: Set<string> = new Set();

  constructor(opts: {
    opencode: OpenCodeClient;
    agents: Map<string, AgentDefinition>;
    roleBindings?: Record<AgentRole, RoleModelBinding>;
  }) {
    this.opencode = opts.opencode;
    this.agents = opts.agents;
    this.roleBindings = opts.roleBindings ?? ({} as any);
  }

  /**
   * Refresh available providers (called after provider config changes).
   */
  async refreshProviders(): Promise<void> {
    const providers = await this.opencode.listProviders();
    this.availableProviders = new Set(providers.map((p) => p.id));
  }

  /**
   * Refresh the routing config from a reloaded catalog. Only the fields given
   * are replaced.
   *
   * The client is long-lived on purpose: the catalog reloads on every connect
   * (and a reconnect follows every model or workspace switch), and rebuilding
   * the client each time would drop the handoff log and the session snapshots.
   * That is not just lost history — recordTurn() reads the log to tell an
   * opening turn from a continuing one, so a rebuilt client would record a
   * second "user-selected" opening for a session that was already running.
   *
   * `opencode` must be re-supplied whenever the caller reconnects: a reconnect
   * builds a fresh OpenCodeClient and closes the old one, so a client left
   * holding the previous transport would send into a dead connection.
   *
   * Providers are passed in rather than fetched because the caller already has
   * a fresh list, which saves a round-trip through refreshProviders().
   */
  configure(opts: {
    opencode?: OpenCodeClient;
    agents?: Map<string, AgentDefinition>;
    roleBindings?: Record<AgentRole, RoleModelBinding>;
    providers?: Iterable<string>;
  }): void {
    if (opts.opencode) this.opencode = opts.opencode;
    if (opts.agents) this.agents = opts.agents;
    if (opts.roleBindings) this.roleBindings = opts.roleBindings;
    if (opts.providers) this.availableProviders = new Set(opts.providers);
  }

  /**
   * Resolve the active model for a given role.
   */
  private resolveModel(role: AgentRole): string | undefined {
    const binding = this.roleBindings[role];
    if (!binding) return undefined;

    const primaryProvider = binding.primary?.split("/")[0];
    if (primaryProvider && this.availableProviders.has(primaryProvider)) {
      return binding.primary;
    }

    const fallbackProvider = binding.fallback?.split("/")[0];
    if (fallbackProvider && this.availableProviders.has(fallbackProvider)) {
      return binding.fallback;
    }

    return undefined;
  }

  /**
   * Log an agent handoff.
   */
  private logHandoff(handoff: AgentHandoff): void {
    this.handoffLog.push(handoff);
  }

  /**
   * Capture a session model snapshot at creation time.
   */
  private captureSnapshot(
    sessionId: string,
    role: AgentRole,
    model: string,
  ): SessionModelSnapshot {
    const snapshot: SessionModelSnapshot = {
      sessionId,
      createdAt: new Date().toISOString(),
      role,
      model,
      reasoning: this.roleBindings[role]?.reasoning,
    };
    this.sessionSnapshots.set(sessionId, snapshot);
    return snapshot;
  }

  /** The agent that serves a role, if one is loaded. */
  private agentForRole(role: AgentRole): AgentDefinition | undefined {
    for (const agent of this.agents.values()) {
      if (agent.role === role) return agent;
    }
    return undefined;
  }

  /** The agent currently owning a session, per the handoff log. */
  private currentAgent(sessionId: string): string | null {
    for (let i = this.handoffLog.length - 1; i >= 0; i--) {
      if (this.handoffLog[i].sessionId === sessionId) return this.handoffLog[i].toAgent;
    }
    return null;
  }

  /**
   * Record a turn for `sessionId` under `role`, returning the handoff it logged
   * (or undefined when nothing changed).
   *
   * Called on every send, so it must be idempotent: a turn that stays with the
   * same agent logs nothing. The first turn opens the session — it pins the
   * model snapshot for reproducibility and logs a user-initiated handoff
   * (`fromAgent: null`); a later turn under a different role logs the agent →
   * agent handoff but leaves the snapshot alone, since the snapshot records
   * what the session was *created* with.
   *
   * `model` is the model the caller is actually sending with; it wins over the
   * role binding so the log records what ran, not what was configured. Falls
   * back to the binding (primary if its provider is available, else fallback).
   */
  recordTurn(
    sessionId: string,
    role: AgentRole,
    model?: string | null,
  ): AgentHandoff | undefined {
    const agent = this.agentForRole(role);
    if (!agent) return undefined;

    const from = this.currentAgent(sessionId);
    if (from === agent.id) return undefined;

    const resolved = model ?? this.resolveModel(role) ?? this.roleBindings[role]?.primary;
    if (!resolved) return undefined;

    const handoff: AgentHandoff = {
      timestamp: new Date().toISOString(),
      fromAgent: from,
      toAgent: agent.id,
      sessionId,
      reason: from ? "role-routing" : "user-selected",
      model: resolved,
    };
    if (!from) this.captureSnapshot(sessionId, role, resolved);
    this.logHandoff(handoff);
    return handoff;
  }

  /**
   * Get all handoff logs (for replay and provenance).
   */
  getHandoffLog(): AgentHandoff[] {
    return [...this.handoffLog];
  }

  /**
   * Get session model snapshot.
   */
  getSessionSnapshot(sessionId: string): SessionModelSnapshot | undefined {
    return this.sessionSnapshots.get(sessionId);
  }

  /**
   * Forward all AgentRuntime methods to the active backend (OpenCode for now).
   * In P2, this will route based on the agent role and model binding.
   */

  async connect(): Promise<void> {
    // OpenCodeClient.connect is not async, but AgentRuntime requires it
    // We'll call refreshProviders here to initialize the provider set
    await this.refreshProviders();
  }

  close(): void {
    return this.opencode.close();
  }

  getStatus(): any {
    return this.opencode.getStatus();
  }

  onStatus(listener: (status: any) => void): () => void {
    return this.opencode.onStatus(listener);
  }

  onEvent(listener: (event: any) => void): () => void {
    return this.opencode.onEvent(listener);
  }

  async createSession(): Promise<string> {
    return this.opencode.createSession();
  }

  async listSessions(): Promise<any[]> {
    return this.opencode.listSessions();
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.opencode.deleteSession(sessionId);
  }

  async getMessages(sessionId: string): Promise<any[]> {
    return this.opencode.getMessages(sessionId);
  }

  async sendPrompt(
    sessionId: string,
    text: string,
    agent?: string,
    model?: string | null,
    variant?: string | null,
  ): Promise<void> {
    return this.opencode.sendPrompt(sessionId, text, agent, model, variant);
  }

  async abortSession(sessionId: string): Promise<void> {
    return this.opencode.abortSession(sessionId);
  }

  async revert(sessionId: string, messageID: string, partID?: string): Promise<void> {
    return this.opencode.revert(sessionId, messageID, partID);
  }

  async unrevert(sessionId: string): Promise<void> {
    return this.opencode.unrevert(sessionId);
  }

  async listSkills(): Promise<any[]> {
    return this.opencode.listSkills();
  }

  async listAgents(): Promise<any[]> {
    return this.opencode.listAgents();
  }

  async listCommands(): Promise<any[]> {
    return this.opencode.listCommands();
  }

  async getDefaultModel(): Promise<string | null> {
    return this.opencode.getDefaultModel();
  }

  async setDefaultModel(model: string): Promise<void> {
    return this.opencode.setDefaultModel(model);
  }

  async runShell(sessionId: string, command: string, agent?: string): Promise<void> {
    return this.opencode.runShell(sessionId, command, agent);
  }

  async runCommand(sessionId: string, command: string, args?: string): Promise<void> {
    return this.opencode.runCommand(sessionId, command, args);
  }

  async listQuestions(sessionId?: string): Promise<any[]> {
    return this.opencode.listQuestions(sessionId);
  }

  async listPermissions(sessionId?: string): Promise<any[]> {
    return this.opencode.listPermissions(sessionId);
  }

  async answerQuestion(requestId: string, answers: string[][]): Promise<void> {
    return this.opencode.answerQuestion(requestId, answers);
  }

  async rejectQuestion(requestId: string): Promise<void> {
    return this.opencode.rejectQuestion(requestId);
  }

  async replyPermission(requestId: string, reply: any): Promise<void> {
    return this.opencode.replyPermission(requestId, reply);
  }

  // P2-specific methods (not part of AgentRuntime interface)

  async prompt(
    sessionId: string | null,
    parts: any[],
    opts?: any,
  ): Promise<{ sessionId: string }> {
    // P2 routing: resolve model based on agent role
    const role = (opts?.role as AgentRole) ?? "general";
    const agent = Array.from(this.agents.values()).find((a) => a.role === role);

    if (!agent) {
      throw new Error(`No agent found for role: ${role}`);
    }

    // Resolve model with fallback
    const resolvedModel = this.resolveModel(role);
    if (!resolvedModel) {
      throw new Error(`No available model for role: ${role}`);
    }

    // Apply model binding to opts
    const enhancedOpts = {
      ...opts,
      model: resolvedModel,
      reasoning: this.roleBindings[role]?.reasoning,
    };

    // Call underlying OpenCode client sendPrompt
    const sid = sessionId ?? await this.createSession();
    await this.opencode.sendPrompt(sid, parts.join('\n'), enhancedOpts.agent, enhancedOpts.model, enhancedOpts.reasoning);

    // Capture snapshot on session creation
    if (!sessionId) {
      this.captureSnapshot(sid, role, resolvedModel);
      this.logHandoff({
        timestamp: new Date().toISOString(),
        fromAgent: null,
        toAgent: agent.id,
        sessionId: sid,
        reason: "user-selected",
        model: resolvedModel,
      });
    }

    return { sessionId: sid };
  }

  async cancel(sessionId: string): Promise<void> {
    return this.opencode.abortSession(sessionId);
  }

  async getSessions(): Promise<any[]> {
    return this.opencode.listSessions();
  }

  async reply(permission: any): Promise<void> {
    return this.opencode.replyPermission(permission.requestId, permission);
  }

  async answer(questionId: string, answers: string[][]): Promise<void> {
    return this.opencode.answerQuestion(questionId, answers);
  }

  async getProviders(): Promise<any[]> {
    return this.opencode.listProviders();
  }

  async getMcpConfig(): Promise<any> {
    return this.opencode.listMcpServers();
  }

  async getSkills(): Promise<any[]> {
    return this.opencode.listSkills();
  }

  async addCustomProvider(id: string, opts: any): Promise<void> {
    return this.opencode.addCustomProvider(id, opts);
  }

  async clearDefaultCustomModelContextLimits(): Promise<void> {
    return this.opencode.clearDefaultCustomModelContextLimits();
  }

  // P2 extension methods (agent routing, model bindings, fallback)
  // TODO: implement in subsequent commits
}
