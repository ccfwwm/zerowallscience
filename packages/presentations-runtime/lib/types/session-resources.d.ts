export interface SessionOwner {
    agentId: string;
    sessionId: string;
}
export interface OwnedResource {
    label: string;
    dispose(): void | Promise<void>;
}
export interface SessionResourceState {
    readonly owner: SessionOwner;
    readonly workspace: string;
    readonly temporaryPaths: ReadonlySet<string>;
    readonly resourceCount: number;
}
export declare class SessionResourceRegistry {
    private readonly sessions;
    private disposed;
    open(owner: SessionOwner, workspace: string): SessionResourceState;
    track(owner: SessionOwner, resource: OwnedResource): () => void;
    trackTemporaryPath(owner: SessionOwner, path: string): () => void;
    state(owner: SessionOwner): SessionResourceState | undefined;
    release(owner: SessionOwner): Promise<void>;
    dispose(): Promise<void>;
    private require;
    private snapshot;
}
