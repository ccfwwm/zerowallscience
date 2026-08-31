export declare const DEFAULT_LIMITS: Readonly<{
    maxSlides: 60;
    maxElementsPerSlide: 200;
    maxRedirects: 5;
    maxResponseBytes: number;
    maxImageBytes: number;
    maxImagePixels: 40000000;
    maxPythonMs: 120000;
    maxPythonOutputChars: 20000;
    maxBrowserTextChars: 20000;
    maxGeneratedFiles: 100;
    maxGeneratedFileBytes: number;
    maxToolResultChars: 30000;
    maxImageSearchResults: 20;
}>;
export type PptLimits = typeof DEFAULT_LIMITS;
export declare function boundedInteger(value: number, name: string, min: number, max: number): number;
