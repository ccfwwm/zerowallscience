// Bridge to the workspace's persisted memory (M005 `memories`,
// `compaction_archives`), served by src-tauri/src/memory_store.rs.
//
// The science database lives inside the workspace folder, so only the desktop
// shell can reach it: in a plain browser and in the gateway web client these
// return null / [] and the memory UI hides itself (see MemoryCard).
import { isTauri } from "./tauri";

export interface Memory {
  id: string;
  /** The conversation this was learned in, when one was recorded. */
  sessionId: string | null;
  kind: string;
  /** Null when the stored body could not be read (a partially restored workspace). */
  content: string | null;
  /** Set ⇒ excluded from recall. The row stays so the user can undo. */
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One archived span of a conversation. The body is not inlined — `contentRef`
 *  addresses it in the workspace content store. */
export interface CompactionArchive {
  id: string;
  sessionId: string;
  /** Null unless the `messages` row genuinely exists (nothing writes it yet). */
  firstMessageId: string | null;
  lastMessageId: string | null;
  contentRef: string;
  messageCount: number;
  createdAt: string;
}

/** Store a memory for the active workspace's project. Null off-desktop. */
export async function createMemory(
  kind: string,
  content: string,
  sessionId?: string,
  sessionTitle?: string,
): Promise<Memory | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Memory>("create_memory", {
    kind,
    content,
    sessionId: sessionId ?? null,
    sessionTitle: sessionTitle ?? null,
  });
}

/**
 * Memories of the active workspace's project, newest first. `includeDisabled`
 * is what separates the management view from recall: the default omits disabled
 * memories, so a recall path can never surface one by accident.
 */
export async function listMemories(includeDisabled = false): Promise<Memory[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Memory[]>("list_memories", { includeDisabled });
}

/** Disable or re-enable a memory. Returns the saved row; null off-desktop. */
export async function setMemoryDisabled(id: string, disabled: boolean): Promise<Memory | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Memory>("set_memory_disabled", { id, disabled });
}

/** Delete a memory. Destructive and separate from disabling — confirm first. */
export async function deleteMemory(id: string): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_memory", { id });
}

/** Record an archived span of a conversation. Null off-desktop. */
export async function recordCompactionArchive(
  sessionId: string,
  content: string,
  messageCount: number,
  firstMessageId?: string,
  lastMessageId?: string,
  sessionTitle?: string,
): Promise<CompactionArchive | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CompactionArchive>("record_compaction_archive", {
    sessionId,
    content,
    messageCount,
    firstMessageId: firstMessageId ?? null,
    lastMessageId: lastMessageId ?? null,
    sessionTitle: sessionTitle ?? null,
  });
}

/** Archived spans, newest first; `sessionId` narrows to one conversation. */
export async function listCompactionArchives(sessionId?: string): Promise<CompactionArchive[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CompactionArchive[]>("list_compaction_archives", {
    sessionId: sessionId ?? null,
  });
}
