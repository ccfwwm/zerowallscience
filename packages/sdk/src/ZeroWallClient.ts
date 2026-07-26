import type { OpenCodeClient } from "./OpenCodeClient";
import type { AgentRuntime } from "./runtime";
import type {
  AgentDefinition,
  AgentHandoff,
  isToolAllowed,
} from "../../shared/src/agents";
import type {
  AgentRole,
  RoleModelBinding,
  SessionModelSnapshot,
  DEFAULT_ROLE_BINDINGS,
  resolveRoleModel,
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
  private readonly opencode: OpenCodeClient;
  private readonly platform: any | null; // SciencePlatformClient placeholder (P2)
  private readonly agents: Map<string, AgentDefinition>;
  private readonly roleBindings: Record<AgentRole, RoleModelBinding>;
  private readonly handoffLog: AgentHandoff[] = [];
  private readonly sessionSnapshots: Map<string, SessionModelSnapshot> = new Map();
  private availableProviders: Set<string> = new Set();

  constructor(opts: {
    opencode: OpenCodeClient;
    platform?: any; // SciencePlatformClient
    agents: Map<string, AgentDefinition>;
    roleBindings?: Record<AgentRole, RoleModelBinding>;
  }) {
    this.opencode = opts.opencode;
    this.platform = opts.platform ?? null;
    this.agents = opts.agents;
    this.roleBindings = opts.roleBindings ?? ({} as any); // DEFAULT_ROLE_BINDINGS will be imported
  }

  /**
   * Refresh available providers (called after provider config changes).
   */
  async refreshProviders(): Promise<void> {
    const providers = await this.opencode.getProviders();
    this.availableProviders = new Set(providers.map((p: any) => p.id));
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

  connect(onEvent: (event: any) => void): void {
    return this.opencode.connect(onEvent);
  }

  close(): void {
    return this.opencode.close();
  }

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

    // Call underlying OpenCode client
    const result = await this.opencode.prompt(sessionId, parts, enhancedOpts);

    // Capture snapshot on session creation
    if (!sessionId) {
      this.captureSnapshot(result.sessionId, role, resolvedModel);
      this.logHandoff({
        timestamp: new Date().toISOString(),
        fromAgent: null,
        toAgent: agent.id,
        sessionId: result.sessionId,
        reason: "user-selected",
        model: resolvedModel,
      });
    }

    return result;
  }

  async cancel(sessionId: string): Promise<void> {
    return this.opencode.cancel(sessionId);
  }

  async getMessages(sessionId: string): Promise<any[]> {
    return this.opencode.getMessages(sessionId);
  }

  async getSessions(): Promise<any[]> {
    return this.opencode.getSessions();
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.opencode.deleteSession(sessionId);
  }

  async reply(permission: any): Promise<void> {
    return this.opencode.reply(permission);
  }

  async answer(questionId: string, answer: string): Promise<void> {
    return this.opencode.answer(questionId, answer);
  }

  async getProviders(): Promise<any[]> {
    return this.opencode.getProviders();
  }

  async getMcpConfig(): Promise<any> {
    return this.opencode.getMcpConfig();
  }

  async getSkills(): Promise<any[]> {
    return this.opencode.getSkills();
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
