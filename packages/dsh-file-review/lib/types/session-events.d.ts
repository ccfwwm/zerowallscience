import type { SessionEvent } from '@deepseek-ai/dsh-session';
interface CompatibleSession {
    readonly events?: readonly SessionEvent[];
    readonly snapshotEvents?: () => readonly SessionEvent[];
}
/** Read session events across DSH alpha.3 and alpha.4+. */
export declare function sessionEvents(session: CompatibleSession): readonly SessionEvent[];
export {};
//# sourceMappingURL=session-events.d.ts.map