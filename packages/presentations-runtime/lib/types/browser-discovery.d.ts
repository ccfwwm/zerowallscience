export interface BrowserDiscoveryResult {
    executable?: string;
    source?: 'configured' | 'playwright' | 'system';
    checked: string[];
}
export declare function discoverBrowserExecutable(configured?: string): Promise<BrowserDiscoveryResult>;
