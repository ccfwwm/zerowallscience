import { create } from "zustand";
import {
  environmentUpdateCheck,
  environmentUpdateCancel,
  environmentUpdateInstall,
  environmentUpdateManifest,
  environmentUpdateRollback,
  environmentUpdateStatus,
  type EnvironmentUpdateSnapshot,
} from "./tauri";

export type EnvironmentUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "verifying"
  | "installing"
  | "restart-required"
  | "failed"
  | "rolled-back";

export interface EnvironmentActivitySnapshot {
  agentTurns: number;
  workflowRuns: number;
  mcpMutations: number;
  runActivities: number;
}

export type EnvironmentUpdateBlockReason =
  | "agent-turn"
  | "workflow-run"
  | "mcp-mutation"
  | "run-activity";

export function environmentUpdateBlockedReason(
  activity: EnvironmentActivitySnapshot,
): EnvironmentUpdateBlockReason | null {
  if (activity.agentTurns > 0) return "agent-turn";
  if (activity.workflowRuns > 0) return "workflow-run";
  if (activity.mcpMutations > 0) return "mcp-mutation";
  if (activity.runActivities > 0) return "run-activity";
  return null;
}

const PHASE_LABELS: Record<EnvironmentUpdatePhase, string> = {
  idle: "Ready",
  checking: "Checking",
  available: "Available",
  downloading: "Downloading",
  verifying: "Verifying",
  installing: "Installing",
  "restart-required": "Restart required",
  failed: "Failed",
  "rolled-back": "Rolled back",
};

export function environmentUpdateStatusLabel(phase: EnvironmentUpdatePhase): string {
  return PHASE_LABELS[phase];
}

export interface EnvironmentUpdateState {
  snapshot: EnvironmentUpdateSnapshot | null;
  envelopeJson: string | null;
  error: string | null;
  refresh: () => Promise<void>;
  check: () => Promise<EnvironmentUpdateSnapshot | null>;
  install: (activity?: EnvironmentActivitySnapshot) => Promise<EnvironmentUpdateSnapshot | null>;
  cancel: () => Promise<EnvironmentUpdateSnapshot | null>;
  rollback: (activity?: EnvironmentActivitySnapshot) => Promise<EnvironmentUpdateSnapshot | null>;
}

const EMPTY_ACTIVITY: EnvironmentActivitySnapshot = {
  agentTurns: 0,
  workflowRuns: 0,
  mcpMutations: 0,
  runActivities: 0,
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertUpdateAllowed(activity: EnvironmentActivitySnapshot = EMPTY_ACTIVITY): void {
  const reason = environmentUpdateBlockedReason(activity);
  if (reason) throw new Error(`environment update blocked by ${reason}`);
}

let activeInstallOperation = 0;

export const useEnvironmentUpdateStore = create<EnvironmentUpdateState>((set, get) => ({
  snapshot: null,
  envelopeJson: null,
  error: null,
  refresh: async () => {
    try {
      const snapshot = await environmentUpdateStatus();
      set({ snapshot, error: null });
    } catch (error) {
      set({ error: errorText(error) });
    }
  },
  check: async () => {
    try {
      const envelopeJson = await environmentUpdateManifest();
      const snapshot = await environmentUpdateCheck(envelopeJson);
      set({ snapshot, envelopeJson, error: null });
      return snapshot;
    } catch (error) {
      set({ envelopeJson: null, error: errorText(error) });
      return null;
    }
  },
  install: async (activity = EMPTY_ACTIVITY) => {
    let polling: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let operation = 0;
    try {
      assertUpdateAllowed(activity);
      const envelopeJson = get().envelopeJson;
      if (!envelopeJson) throw new Error("Check for environment updates first.");
      operation = ++activeInstallOperation;
      const poll = async () => {
        if (stopped || operation !== activeInstallOperation) return;
        try {
          const snapshot = await environmentUpdateStatus();
          if (!stopped && operation === activeInstallOperation && snapshot) set({ snapshot });
        } catch {
          // Status polling is best effort; the install command remains authoritative.
        } finally {
          if (!stopped && operation === activeInstallOperation) {
            polling = setTimeout(() => {
              polling = null;
              void poll();
            }, 250);
          }
        }
      };
      void poll();
      const snapshot = await environmentUpdateInstall(envelopeJson);
      set({ snapshot, error: null });
      return snapshot;
    } catch (error) {
      set({ error: errorText(error) });
      return null;
    } finally {
      stopped = true;
      if (polling) clearTimeout(polling);
      polling = null;
    }
  },
  cancel: async () => {
    try {
      const snapshot = await environmentUpdateCancel();
      set({ snapshot, error: null });
      return snapshot;
    } catch (error) {
      set({ error: errorText(error) });
      return null;
    }
  },
  rollback: async (activity = EMPTY_ACTIVITY) => {
    try {
      assertUpdateAllowed(activity);
      const snapshot = await environmentUpdateRollback();
      set({ snapshot, error: null });
      return snapshot;
    } catch (error) {
      set({ error: errorText(error) });
      return null;
    }
  },
}));
