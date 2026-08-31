export interface ArtifactPaths {
    root: string;
    outline: string;
    designPlan: string;
    html: string;
    pptx: string;
    assets: string;
    images: string;
    sourceManifest: string;
    preview: string;
    report: string;
    visualReview: string;
}
export declare function slugify(value: string): string;
export declare function allocateArtifactDirectory(workspace: string, title: string, outputRoot?: string): Promise<ArtifactPaths>;
export interface SourceAssetRecord {
    original_url: string;
    source_page: string;
    fetched_at: string;
    author: string | null;
    license: string;
    license_url: string | null;
    local_path: string;
    sha256: string;
}
export declare class SourceManifest {
    private readonly workspace;
    readonly path: string;
    private queue;
    constructor(workspace: string, path: string);
    append(record: Omit<SourceAssetRecord, 'local_path' | 'sha256'> & {
        localFile: string;
    }): Promise<SourceAssetRecord>;
}
export declare function assertFileLimit(path: string, maxBytes: number): Promise<void>;
export declare function safeAssetFilename(title: string, url: URL, fallback?: string): string;
