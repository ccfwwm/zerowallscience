/**
 * ⚠️ VERIFIED AGAINST REAL rc.8 CLIENT API.
 *
 * Types + small helpers for the 能力管理 (Capability Management) settings
 * section. The component reads/writes the Host `ctx.capabilityPolicy` through
 * the generated `remote.capabilityPolicy` face (see `./remote.ts`), mirroring
 * how `dsh-client-ui-settings-plugin-inventory` consumes
 * `ctx.remote.pluginInventory`.
 */
export type { CapabilityRow, CatalogDocs, SkillFileEntry, ToolDetail, } from './remote.ts';
import type { CapabilityRow, CatalogDocs, SkillFileEntry, ToolDetail } from './remote.ts';
/** Snapshot of the management surface. */
export interface CapabilitySnapshot {
    readonly rows: readonly CapabilityRow[];
}
/** The Host `capabilityPolicy` remote face (generated contribution). */
export interface CapabilityPolicyRemote {
    getConfig(): Promise<{
        ok: true;
        value: Record<string, unknown>;
    } | {
        ok: false;
        error: {
            code: string;
            message: string;
        };
    }>;
    updateConfig(partial: Record<string, unknown>): Promise<{
        ok: true;
        value: void;
    } | {
        ok: false;
        error: {
            code: string;
            message: string;
        };
    }>;
    resetDefaults(): Promise<{
        ok: true;
        value: CapabilityRow[];
    } | {
        ok: false;
        error: {
            code: string;
            message: string;
        };
    }>;
    classifyAll(): Promise<{
        ok: true;
        value: CapabilityRow[];
    } | {
        ok: false;
        error: {
            code: string;
            message: string;
        };
    }>;
    listSkillDir(id: string, relPath?: string): Promise<{
        ok: true;
        value: SkillFileEntry[] | undefined;
    } | {
        ok: false;
        error: {
            code: string;
            message: string;
        };
    }>;
    readSkillFile(id: string, relPath: string): Promise<{
        ok: true;
        value: string | undefined;
    } | {
        ok: false;
        error: {
            code: string;
            message: string;
        };
    }>;
    getDetail(id: string): Promise<{
        ok: true;
        value: ToolDetail | undefined;
    } | {
        ok: false;
        error: {
            code: string;
            message: string;
        };
    }>;
    getCatalogDocs(): Promise<{
        ok: true;
        value: CatalogDocs;
    } | {
        ok: false;
        error: {
            code: string;
            message: string;
        };
    }>;
}
/** Unwrap a RemoteResult-like, throwing a readable error on failure. */
export declare function unwrap<T>(result: {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
    };
}, what: string): T;
/** Load the classification list from the remote. */
export declare function loadSnapshot(remote: CapabilityPolicyRemote): Promise<CapabilitySnapshot>;
//# sourceMappingURL=store.d.ts.map