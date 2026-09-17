import type { Paper, SaveMode, SaveResult } from '../types.ts';
import type { LitConfig } from '../config.ts';
export declare function downloadPdf(p: Paper, timeout: number): Promise<Uint8Array | undefined>;
export interface SavePapersOptions {
    papers: Paper[];
    mode?: SaveMode;
    collection?: string;
    cfg: LitConfig;
}
export declare function savePapers(opts: SavePapersOptions): Promise<SaveResult>;
