export interface ResolveWorkspacePathOptions {
    mustExist?: boolean;
    kind?: 'file' | 'directory' | 'either';
    createParent?: boolean;
}
export declare function isPathInside(root: string, target: string): boolean;
export declare function workspaceRelative(root: string, target: string): string;
export declare function resolveWorkspacePath(workspaceRoot: string, input: string, options?: ResolveWorkspacePathOptions): Promise<string>;
