// Annotations (P6): notes anchored to a specific span of a workspace file,
// persisted in the workspace's science database by `src-tauri/annotation_store.rs`.
//
// That database lives inside the workspace folder and is reached only through
// Tauri commands, so every call here is desktop-only: the gateway web client has
// no path to it. Reads return empty and writes no-op off-desktop, so a caller
// never has to branch — but a UI that offers annotating must still hide itself
// in web mode (`isGatewayWeb`) rather than present a control that does nothing.
import { isTauri } from "./tauri";

/**
 * Where in a file an annotation points: a 1-based inclusive line span plus the
 * text it covered. The lines are exact for the annotated version; the quote is
 * what lets a later version re-find the span after edits move it.
 */
export interface TextAnchor {
  startLine: number;
  endLine: number;
  quote: string;
}

export interface Annotation {
  id: string;
  /** Free-form category, e.g. `note`, `key_finding`, `method`, `limitation`. */
  annotationKind: string;
  body: string;
  /** Absent when the note is about the whole file version. */
  anchor?: TextAnchor;
  artifactVersionId: string;
  /** Workspace-relative path of the annotated file, `/`-separated. */
  artifactPath: string;
  versionNumber: number;
  /** `local` for the person at this desktop, `agent:<id>` for an agent. */
  authorSubject: string;
  /** ISO-8601 UTC, written by SQLite. */
  createdAt: string;
  updatedAt: string;
}

async function invoker() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

/**
 * Annotate a workspace file. The file's current bytes are recorded as an
 * artifact version first, so the note remembers which content it was made
 * against. Returns the new annotation's id, or null off-desktop.
 */
export async function createAnnotation(
  path: string,
  annotationKind: string,
  body: string,
  anchor?: TextAnchor,
  authorSubject?: string,
): Promise<string | null> {
  if (!isTauri) return null;
  const invoke = await invoker();
  return invoke<string>("create_annotation_cmd", {
    path,
    annotationKind,
    body,
    anchor: anchor ?? null,
    authorSubject: authorSubject ?? null,
  });
}

/** Every annotation in the active workspace's project, newest first ([] off-desktop). */
export async function listAnnotations(): Promise<Annotation[]> {
  if (!isTauri) return [];
  const invoke = await invoker();
  return invoke<Annotation[]>("list_annotations_cmd");
}

/** Annotations on one artifact version, newest first ([] off-desktop). */
export async function listAnnotationsForVersion(
  artifactVersionId: string,
): Promise<Annotation[]> {
  if (!isTauri) return [];
  const invoke = await invoker();
  return invoke<Annotation[]>("list_annotations_for_version_cmd", { artifactVersionId });
}

/**
 * Edit an annotation's category and text. The anchor is not editable — moving a
 * note to a different span would turn it into a claim about text its author
 * never read, so that means writing a new annotation.
 */
export async function updateAnnotation(
  id: string,
  annotationKind: string,
  body: string,
): Promise<void> {
  if (!isTauri) return;
  const invoke = await invoker();
  await invoke("update_annotation_cmd", { id, annotationKind, body });
}

export async function deleteAnnotation(id: string): Promise<void> {
  if (!isTauri) return;
  const invoke = await invoker();
  await invoke("delete_annotation_cmd", { id });
}
