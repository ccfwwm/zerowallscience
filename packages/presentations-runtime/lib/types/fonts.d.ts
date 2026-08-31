export interface FontDescriptor {
    name: string;
    aliases?: readonly string[];
    language: string;
    style: string;
    characteristics: string;
    layer: FontLayer;
    platforms: readonly SupportedFontPlatform[];
    roles: readonly FontRole[];
}
export type FontLayer = 'portable' | 'system' | 'custom';
export type SupportedFontPlatform = 'darwin' | 'win32' | 'linux';
export type FontRole = 'latin-sans' | 'latin-serif' | 'cjk-sans' | 'cjk-serif' | 'display' | 'code';
export declare const FONT_LAYERS: readonly FontLayer[];
export declare const FONT_ROLES: readonly FontRole[];
export declare const FONT_REGISTRY: readonly FontDescriptor[];
export interface DiscoveredFont {
    name: string;
    file: string;
    sha256: string;
    familyName: string;
    postscriptName: string | null;
    weight: string;
    glyphCount: number;
    supportsLatin: boolean;
    supportsCjk: boolean;
    codePoints: ReadonlySet<number>;
}
export declare function discoverRegisteredFonts(extraDirs?: readonly string[], platform?: SupportedFontPlatform): Promise<DiscoveredFont[]>;
export declare const FONT_FALLBACKS: Readonly<Record<string, readonly string[]>>;
export declare function registeredFont(name: string): FontDescriptor | undefined;
export declare function fontFallbackCandidates(name: string, text: string, platform?: NodeJS.Platform): readonly string[];
export declare function supportsText(font: DiscoveredFont, text: string): boolean;
export interface ResolvedFont {
    requested: string;
    resolved: DiscoveredFont;
    fallback: boolean;
    warning?: string;
}
export declare function resolveRegisteredFont(name: string, text: string, discovered: readonly DiscoveredFont[], platform?: NodeJS.Platform): ResolvedFont;
export interface FontAvailabilitySummary {
    scope: 'approved_registry';
    platform: SupportedFontPlatform;
    registryFamilies: number;
    availableFamilies: number;
    availableFaces: number;
    layers: Record<FontLayer, {
        registered: number;
        available: number;
        families: string[];
    }>;
    roles: Record<FontRole, {
        available: boolean;
        families: string[];
    }>;
}
export declare function summarizeFontAvailability(discovered: readonly DiscoveredFont[], platform?: NodeJS.Platform): FontAvailabilitySummary;
export interface FontCatalogOptions {
    text?: string;
    role?: FontRole | 'all';
    layer?: FontLayer | 'all';
    includeUnavailable?: boolean;
    platform?: NodeJS.Platform;
}
export interface FontCatalogEntry {
    name: string;
    layer: FontLayer;
    platforms: SupportedFontPlatform[];
    roles: FontRole[];
    recommended_for: FontRole[];
    language: string;
    style: string;
    characteristics: string;
    installed: boolean;
    weights: string[];
    supports_latin: boolean;
    supports_cjk: boolean;
    covers_text?: boolean;
}
export interface FontCatalog {
    scope: 'approved_registry';
    scope_note: string;
    platform: SupportedFontPlatform;
    registry_families: number;
    available_families: number;
    available_faces: number;
    returned_families: number;
    filters: {
        role: FontRole | 'all';
        layer: FontLayer | 'all';
        include_unavailable: boolean;
        text?: string;
    };
    recommendations: Record<FontRole, string[]>;
    fonts: FontCatalogEntry[];
    warnings: string[];
}
export declare function fontRecommendations(discovered: readonly DiscoveredFont[], platform?: NodeJS.Platform, text?: string): Record<FontRole, string[]>;
export declare function buildFontCatalog(discovered: readonly DiscoveredFont[], options?: FontCatalogOptions): FontCatalog;
