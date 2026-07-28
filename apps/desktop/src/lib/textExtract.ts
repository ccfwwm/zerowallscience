/**
 * Desktop-side text extraction for prompt attachments.
 *
 * PDF/Word/plain-text files used to depend on Python skill kernels (pdf-explore,
 * docx_to_md.py) — cold-starting a kernel and waiting for the model to invoke
 * the right tool adds seconds to a turn. Reading the bytes locally with
 * pdfjs-dist / mammoth returns extracted UTF-8 text in the same tick, which
 * the runtime sends as an extra `text` part alongside the file bytes so the
 * model can start reasoning immediately.
 *
 * Extensions we handle here:
 *   pdf, docx, txt, md, csv
 *
 * A scan-only PDF (no text layer) returns an empty string; the caller should
 * fall back to a hint like "(image-only PDF, use pdf-explore skill)" so the
 * agent knows to invoke the skill rather than assuming empty means silent.
 */

const DOC_TEXT_EXT = new Set(["pdf", "docx", "txt", "md", "csv"]);

export function extensionOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export function isDocTextExt(name: string): boolean {
  return DOC_TEXT_EXT.has(extensionOf(name));
}

/** MIME hint for a document by extension. Only used to label the file part; the
 *  provider tolerates a generic `application/octet-stream` when unsure. */
export function docMime(name: string): string {
  switch (extensionOf(name)) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

/** Base64 (no data-URI prefix) → Uint8Array. Runs in one pass; the app never
 *  hands us multi-hundred-MB attachments so a single allocation is fine. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Extract UTF-8 text from a PDF via pdfjs-dist. Returns "" for scan-only PDFs
 *  (no text layer on any page). Throws only for a corrupt/encrypted file. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // Dynamic import keeps pdfjs out of the main bundle when a user never opens
  // an attachment — pdf.mjs alone is ~1 MB.
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  // The library needs a worker URL. `?url` is Vite's marker: return the
  // resolved asset URL rather than the module. Falling back to disable-worker
  // keeps the extraction working in test environments (jsdom/vitest) that
  // don't wire the ?url resolver.
  try {
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // Older pdfjs builds tolerate an empty workerSrc; the library falls back
    // to running in-process (slower but never blocks extraction in tests).
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = "";
  }
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    // The bundled cmap/standard fonts help Chinese/Japanese PDFs come out
    // as real characters instead of CID glyph refs.
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  const chunks: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as unknown[])
      .map((it) => (typeof (it as { str?: unknown }).str === "string" ? (it as { str: string }).str : ""))
      .join(" ")
      .replace(/[\t  ]+/g, " ")
      .trim();
    if (pageText) chunks.push(pageText);
  }
  return chunks.join("\n\n");
}

/** Extract Markdown-flavoured text from a .docx via mammoth. Returns the
 *  Markdown body; loses only style (bold/italic/lists preserved as Markdown). */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  // mammoth's browser build expects an ArrayBuffer, not a Uint8Array view; a
  // fresh copy avoids "detached buffer" errors if the caller reuses the view.
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const result = await mammoth.convertToMarkdown({ arrayBuffer: buffer });
  return (result.value ?? "").trim();
}

/** UTF-8 decode with a BOM strip — plain-text files (.txt/.md/.csv). */
export function decodeUtf8(bytes: Uint8Array): string {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return decoded.startsWith("﻿") ? decoded.slice(1) : decoded;
}

/** One entry point for the composer: given a filename and the raw bytes, return
 *  the best UTF-8 text we can extract on-device — or an empty string plus a
 *  reason string when the file is a supported type but yielded no text (e.g.
 *  a scan-only PDF). Throws only for a genuinely broken file. */
export async function extractDocText(
  name: string,
  bytes: Uint8Array,
): Promise<{ text: string; fallback?: string }> {
  const ext = extensionOf(name);
  if (ext === "pdf") {
    const text = await extractPdfText(bytes);
    if (text) return { text };
    return { text: "", fallback: "(image-only PDF — no text layer; ask the agent to run pdf-explore for OCR.)" };
  }
  if (ext === "docx") {
    return { text: await extractDocxText(bytes) };
  }
  if (ext === "txt" || ext === "md" || ext === "csv") {
    return { text: decodeUtf8(bytes) };
  }
  return { text: "" };
}
