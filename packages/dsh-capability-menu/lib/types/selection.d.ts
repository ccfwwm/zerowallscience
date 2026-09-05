import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CapabilityPolicyService } from './policy.ts';
export declare const SELECTION_EVENT = "zerowall/capabilities/selection";
export declare const MAX_ENABLED = 24;
export declare const MAX_SCHEMA_BYTES: number;
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        'zerowall/capabilities/selection': {
            tools: string[];
            disabled: string[];
            onDemand?: string[];
        };
    }
}
type Tier = 'resident' | 'on-demand' | 'disabled';
/** One durable selection per session, applied to both schema projection and execution. */
export declare function createSelections(ctx: Context, policy: CapabilityPolicyService): {
    visible: (name: string, agent?: Agent) => boolean;
    select: (agent: Agent, names: readonly string[], enable?: boolean) => {
        enabled: string[];
        disabled: string[];
        remainingTools: number;
        remainingSchemaBytes: number;
    };
    update: (agent: Agent, changes: readonly {
        name: string;
        kind: "tool" | "skill";
        tier: Tier;
    }[]) => {
        enabled: string[];
        disabled: string[];
        remainingTools: number;
        remainingSchemaBytes: number;
    };
    classify: (name: string, kind: "tool" | "skill", agent?: Agent) => Tier;
    readTool: (name: string, agent: Agent) => import("@deepseek-ai/dsh-tools").ToolDefinition | undefined;
    snapshot: (agent: Agent) => {
        tools: string[];
        disabled: string[];
        onDemand: string[];
    };
};
export {};
//# sourceMappingURL=selection.d.ts.map