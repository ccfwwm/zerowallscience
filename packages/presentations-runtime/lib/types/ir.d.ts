export declare const SLIDE_WIDTH_PX = 1280;
export declare const SLIDE_HEIGHT_PX = 720;
export declare const SLIDE_WIDTH_IN = 13.333333;
export declare const SLIDE_HEIGHT_IN = 7.5;
export interface ElementBox {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface TextRunIR {
    text: string;
    fontFamily: string;
    fontSizePx: number;
    fontWeight: number;
    fontStyle: string;
    color: string;
    textDecoration: string;
}
export interface ElementStyleIR {
    fontFamily: string;
    fontSizePx: number;
    fontWeight: number;
    fontStyle: string;
    color: string;
    backgroundColor: string;
    backgroundImage: string;
    borderColor: string;
    borderWidthPx: number;
    borderStyle: string;
    borderRadius: string;
    textAlign: string;
    verticalAlign: string;
    lineHeightPx: number;
    opacity: number;
    objectFit: string;
    objectPosition: string;
}
export interface ElementIR {
    id: string;
    kind: 'text' | 'image' | 'shape' | 'svg' | 'table';
    z: number;
    domOrder: number;
    box: ElementBox;
    style: ElementStyleIR;
    text?: string;
    runs?: TextRunIR[];
    imagePath?: string;
    svg?: string;
    table?: string[][];
    unsupportedReason?: string;
}
export interface SlideIR {
    page: number;
    elements: ElementIR[];
    speakerNotes: string[];
}
export interface DeckIR {
    widthPx: typeof SLIDE_WIDTH_PX;
    heightPx: typeof SLIDE_HEIGHT_PX;
    slides: SlideIR[];
}
export declare function roundFixed(value: number, digits?: number): number;
export declare function pxToInches(value: number): number;
export declare function pxToPoints(value: number): number;
