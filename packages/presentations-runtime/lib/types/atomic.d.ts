export interface AtomicWriteOptions {
    overwrite?: boolean;
    mode?: number;
    signal?: AbortSignal;
}
export declare function atomicWriteFile(target: string, data: string | Uint8Array, options?: AtomicWriteOptions): Promise<void>;
export declare function atomicWriteText(target: string, text: string, options?: AtomicWriteOptions): Promise<void>;
export declare function atomicWriteJson(target: string, value: unknown, options?: AtomicWriteOptions): Promise<void>;
