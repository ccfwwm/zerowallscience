import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
export declare const name = "ppt-headless-runner";
export declare const inject: string[];
export interface Config {
    task: string;
    presetId: string;
}
export declare const Config: z<Schemastery.ObjectS<{
    task: z<string, string>;
    presetId: z<string, string>;
}>, Schemastery.ObjectT<{
    task: z<string, string>;
    presetId: z<string, string>;
}>>;
export declare function apply(ctx: Context, config: Config): void;
