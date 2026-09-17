import type { LitConfig } from '../config.ts';
import type { Paper } from '../types.ts';
type Row = {
    key: string;
    data: Record<string, any>;
};
export declare const titleKey: (text: string) => string;
export declare const doiKey: (text: string) => string;
/** Writes target Zotero's authenticated Local API, never the SQLite file. */
export declare class LocalZoteroWriter {
    private cfg;
    private serverId;
    constructor(cfg: LitConfig);
    private get grantId();
    private get credential();
    connect(): Promise<void>;
    read(path: string): Promise<any>;
    private storedGrant;
    authorizationStatus(): Promise<{
        authorized: boolean;
        remember: boolean;
    }>;
    requestAuthorization(force?: boolean): Promise<{
        authorized: boolean;
        remember: boolean;
    }>;
    private authorize;
    private acquireGrant;
    private invalidate;
    write(path: string, body: unknown, form?: boolean, headers?: Record<string, string>): Promise<any>;
    private created;
    find(paper: Paper): Promise<Row | undefined>;
    collection(name?: string): Promise<string | undefined>;
    ref(key: string): string;
    add(p: Paper, collection?: string): Promise<Row>;
    attach(parentKey: string, bytes: Uint8Array): Promise<string>;
}
export {};
