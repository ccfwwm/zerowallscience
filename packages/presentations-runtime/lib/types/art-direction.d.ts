import { z } from 'zod';
export declare const ART_COMPOSITIONS: readonly ["hero", "editorial-split", "asymmetric-split", "process", "layered", "data-focus", "quote", "full-bleed", "closing"];
export declare const ART_DENSITIES: readonly ["low", "medium", "high"];
export declare const ART_BACKGROUNDS: readonly ["base", "inverse", "accent", "image"];
export declare const ART_TITLE_TREATMENTS: readonly ["statement", "question", "label", "number-led"];
export declare const ART_ANCHOR_KINDS: readonly ["none", "typography", "image", "data", "code", "diagram"];
export declare const ART_FRAME_POLICIES: readonly ["none", "single", "grouped"];
export declare const ART_ROLES: readonly ["title", "subtitle", "body", "metric", "code", "diagram", "visual-anchor", "supporting", "frame"];
export declare const ArtDirectionSchema: z.ZodObject<{
    version: z.ZodDefault<z.ZodLiteral<1>>;
    concept: z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodString>;
    audience_effect: z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodString>;
    palette: z.ZodObject<{
        background: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>;
        surface: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>;
        accent: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        text: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>;
    }, z.core.$strict>;
    typography: z.ZodObject<{
        display: z.ZodObject<{
            family: z.ZodEnum<{
                [x: string]: string;
            }>;
            weight: z.ZodNumber;
        }, z.core.$strict>;
        body: z.ZodObject<{
            family: z.ZodEnum<{
                [x: string]: string;
            }>;
            weight: z.ZodNumber;
        }, z.core.$strict>;
        latin: z.ZodObject<{
            family: z.ZodEnum<{
                [x: string]: string;
            }>;
            weight: z.ZodNumber;
        }, z.core.$strict>;
        code: z.ZodObject<{
            family: z.ZodEnum<{
                [x: string]: string;
            }>;
            weight: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>;
    rhythm: z.ZodObject<{
        background_sequence: z.ZodArray<z.ZodEnum<{
            base: "base";
            inverse: "inverse";
            accent: "accent";
            image: "image";
        }>>;
        max_grouped_frame_slides: z.ZodDefault<z.ZodNumber>;
        max_same_composition_run: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    slides: z.ZodArray<z.ZodObject<{
        page: z.ZodNumber;
        job: z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodString>;
        takeaway: z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodString>;
        composition: z.ZodEnum<{
            hero: "hero";
            "editorial-split": "editorial-split";
            "asymmetric-split": "asymmetric-split";
            process: "process";
            layered: "layered";
            "data-focus": "data-focus";
            quote: "quote";
            "full-bleed": "full-bleed";
            closing: "closing";
        }>;
        density: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
        background_role: z.ZodEnum<{
            base: "base";
            inverse: "inverse";
            accent: "accent";
            image: "image";
        }>;
        title_treatment: z.ZodEnum<{
            statement: "statement";
            question: "question";
            label: "label";
            "number-led": "number-led";
        }>;
        visual_anchor: z.ZodObject<{
            kind: z.ZodEnum<{
                code: "code";
                image: "image";
                none: "none";
                typography: "typography";
                data: "data";
                diagram: "diagram";
            }>;
            role: z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodString>;
            min_area_ratio: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        frame_policy: z.ZodEnum<{
            none: "none";
            single: "single";
            grouped: "grouped";
        }>;
        allow_intentional_repeat: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ArtDirection = z.infer<typeof ArtDirectionSchema>;
export interface DesignFinding {
    code: string;
    severity: 'warning' | 'error';
    message: string;
    page?: number;
}
export declare function validateArtDirection(value: unknown, expectedPages?: number): ArtDirection;
export declare function artDirectionFindings(plan: ArtDirection): DesignFinding[];
export declare function artDirectionReviewChecklist(plan: ArtDirection): string[];
