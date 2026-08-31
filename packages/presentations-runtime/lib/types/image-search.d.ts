import { type SourceAssetRecord } from './artifacts.ts';
export type ImageOrientation = 'landscape' | 'portrait' | 'square' | 'any';
export type ImageProvider = 'openverse' | 'wikimedia-commons';
export interface ImageCandidate {
    image_url: string;
    source_page: string;
    provider: ImageProvider;
    title: string;
    license: string;
    license_verified: false;
    thumbnail_url?: string;
    width?: number;
    height?: number;
    mime_type?: string;
    author?: string;
    license_url?: string;
    attribution?: string;
}
export interface ImageSearchResult {
    query: string;
    count: number;
    orientation: ImageOrientation;
    cache_hit: boolean;
    providers_used: ImageProvider[];
    warnings: string[];
    results: ImageCandidate[];
}
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type UrlValidator = (input: string) => Promise<URL>;
export declare class ImageSearchRuntime {
    private readonly fetcher;
    private readonly validateUrl;
    private readonly cache;
    constructor(fetcher?: FetchLike, validateUrl?: UrlValidator);
    search(queryInput: string, countInput?: number, orientation?: ImageOrientation, signal?: AbortSignal): Promise<ImageSearchResult>;
    private request;
    private openverse;
    private commons;
}
export interface FrozenImageAsset {
    path: string;
    width: number;
    height: number;
    mime_type: string;
    size: number;
    manifest: SourceAssetRecord;
}
export declare function freezeImageAsset(workspace: string, artifactRoot: string, candidate: ImageCandidate, fetcher?: FetchLike, signal?: AbortSignal): Promise<FrozenImageAsset>;
export {};
