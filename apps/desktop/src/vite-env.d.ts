/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// Third-party libs we load only in the browser (dynamic import) and that ship
// no first-party TypeScript declarations for their bundled entry points. The
// runtime keeps the shape it uses to a tiny surface — textExtract.ts asserts
// the return shape locally, so a module-level `any` is deliberate here.
declare module "pdfjs-dist/build/pdf.mjs";
declare module "pdfjs-dist/build/pdf.worker.mjs?url";
declare module "mammoth/mammoth.browser";
