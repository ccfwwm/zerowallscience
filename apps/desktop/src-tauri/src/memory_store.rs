// Persisted memory and conversation compaction (M005 `memories`,
// `compaction_archives`).
//
// A memory is a durable note the agent may recall in a later session. It hangs
// off `projects` through a NOT NULL foreign key, so creation goes through
// `science_store::ensure_project` first — `foreign_keys` is ON and an orphan
// insert fails outright.
//
// `memories.disabled_at` is the disable switch: a disabled memory stays on disk
// (so the user can see what was learned and undo) but must never be recalled.
// Deletion is separate and destructive.
//
// `content_ref` is a SHA-256 into the workspace content store, never inline
// text.
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::AppHandle;

use crate::runtime::workspace_dir;
use crate::science_store::{self, NOW};

/// Title given to a `sessions` row this module has to create to satisfy the
/// foreign key. Only used when the session is not already recorded — an
/// existing row keeps whatever title it has.
const UNTITLED_SESSION: &str = "Untitled session";

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: String,
    /// The conversation this was learned in, when one was recorded.
    pub session_id: Option<String>,
    pub kind: String,
    /// Resolved from `content_ref`. `None` when the content object is missing:
    /// one unreadable body must not hide every other memory from the user.
    pub content: Option<String>,
    /// Set ⇒ excluded from recall. The row itself stays.
    pub disabled_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactionArchive {
    pub id: String,
    pub session_id: String,
    /// Ends of the archived span. Written only when the `messages` row exists —
    /// see `existing_message`.
    pub first_message_id: Option<String>,
    pub last_message_id: Option<String>,
    /// SHA-256 of the archived text in the workspace content store. The body is
    /// not inlined here: an archive is a whole span of a conversation, and a
    /// list of them would otherwise load every span into memory at once.
    pub content_ref: String,
    pub message_count: i64,
    pub created_at: String,
}

/// Make sure the `sessions` row for `session_id` exists, without disturbing it.
///
/// `science_store::ensure_session` upserts the title, so calling it for a
/// session the app already recorded would rename that session to whatever this
/// call happened to pass. Only a genuinely absent row is created.
fn ensure_session_row(
    conn: &Connection,
    project_id: &str,
    session_id: &str,
    title: Option<&str>,
) -> Result<(), String> {
    let known: Option<String> = conn
        .query_row(
            "SELECT id FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("look up session row: {error}"))?;
    if known.is_some() {
        return Ok(());
    }
    science_store::ensure_session(
        conn,
        project_id,
        session_id,
        title.map(str::trim).filter(|t| !t.is_empty()).unwrap_or(UNTITLED_SESSION),
    )
}

/// The message id if that row genuinely exists, else `None`.
///
/// `messages` is written by no code path yet, so a caller's message id normally
/// has no row to point at. Storing it anyway would violate the foreign key, and
/// inserting a placeholder `messages` row would fabricate a message that never
/// existed — so the reference is simply left NULL and the span is still recorded.
fn existing_message(conn: &Connection, id: Option<&str>) -> Result<Option<String>, String> {
    let Some(id) = id.map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    conn.query_row("SELECT id FROM messages WHERE id = ?1", params![id], |row| {
        row.get(0)
    })
    .optional()
    .map_err(|error| format!("look up message row: {error}"))
}

/// Read one memory row back by id, within its project.
fn load(conn: &Connection, root: &Path, project_id: &str, id: &str) -> Result<Memory, String> {
    conn.query_row(
        "SELECT id, session_id, memory_kind, content_ref, disabled_at, created_at, updated_at \
         FROM memories WHERE id = ?1 AND project_id = ?2",
        params![id, project_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        },
    )
    .optional()
    .map_err(|error| format!("read memory row: {error}"))?
    .map(|(id, session_id, kind, content_ref, disabled_at, created_at, updated_at)| Memory {
        id,
        session_id,
        kind,
        content: science_store::read_text(root, &content_ref).ok(),
        disabled_at,
        created_at,
        updated_at,
    })
    .ok_or_else(|| format!("no memory {id} in this project"))
}

/// Store a memory for `project_id` and return it as saved.
pub fn create(
    conn: &Connection,
    root: &Path,
    project_id: &str,
    session_id: Option<&str>,
    session_title: Option<&str>,
    kind: &str,
    content: &str,
) -> Result<Memory, String> {
    let kind = kind.trim();
    if kind.is_empty() {
        return Err("memory kind must not be empty".to_owned());
    }
    if content.trim().is_empty() {
        return Err("memory content must not be empty".to_owned());
    }
    let session = session_id.map(str::trim).filter(|s| !s.is_empty());
    if let Some(session) = session {
        ensure_session_row(conn, project_id, session, session_title)?;
    }
    // Content lands in the store first: a memory row whose body was never
    // written would be a dangling reference.
    let content_ref = science_store::put_text(root, content)?;
    let id = science_store::new_id("mem");
    conn.execute(
        &format!(
            "INSERT INTO memories \
             (id, project_id, session_id, memory_kind, content_ref, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, {NOW}, {NOW})"
        ),
        params![&id, project_id, session, kind, &content_ref],
    )
    .map_err(|error| format!("insert memory row: {error}"))?;
    load(conn, root, project_id, &id)
}

/// Memories of one project, newest first.
///
/// `include_disabled` is what separates the management view from recall: the UI
/// lists everything so the user can undo, a recall query must not see a disabled
/// memory at all.
pub fn list(
    conn: &Connection,
    root: &Path,
    project_id: &str,
    include_disabled: bool,
) -> Result<Vec<Memory>, String> {
    let sql = format!(
        "SELECT id, session_id, memory_kind, content_ref, disabled_at, created_at, updated_at \
         FROM memories WHERE project_id = ?1{} ORDER BY created_at DESC, id DESC",
        if include_disabled { "" } else { " AND disabled_at IS NULL" }
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|error| format!("prepare memory query: {error}"))?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(Memory {
                id: row.get(0)?,
                session_id: row.get(1)?,
                kind: row.get(2)?,
                content: science_store::read_text(root, &row.get::<_, String>(3)?).ok(),
                disabled_at: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|error| format!("query memories: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read memories: {error}"))
}

/// Disable or re-enable a memory. Disabling stamps `disabled_at`; re-enabling
/// clears it. The row and its content are untouched either way.
pub fn set_disabled(
    conn: &Connection,
    root: &Path,
    project_id: &str,
    id: &str,
    disabled: bool,
) -> Result<Memory, String> {
    let changed = conn
        .execute(
            &format!(
                "UPDATE memories SET disabled_at = {}, updated_at = {NOW} \
                 WHERE id = ?1 AND project_id = ?2",
                if disabled { NOW } else { "NULL" }
            ),
            params![id, project_id],
        )
        .map_err(|error| format!("update memory row: {error}"))?;
    if changed == 0 {
        return Err(format!("no memory {id} in this project"));
    }
    load(conn, root, project_id, id)
}

/// Delete a memory. Destructive and separate from disabling.
///
/// The content object is left in the store: it is content-addressed and shared,
/// so removing it could break another row that hashes to the same bytes.
pub fn delete(conn: &Connection, project_id: &str, id: &str) -> Result<(), String> {
    let changed = conn
        .execute(
            "DELETE FROM memories WHERE id = ?1 AND project_id = ?2",
            params![id, project_id],
        )
        .map_err(|error| format!("delete memory row: {error}"))?;
    if changed == 0 {
        return Err(format!("no memory {id} in this project"));
    }
    Ok(())
}

/// Record an archived span of a conversation: the text is stored once,
/// content-addressed, and the row keeps the span's ends and message count.
#[allow(clippy::too_many_arguments)]
pub fn archive(
    conn: &Connection,
    root: &Path,
    project_id: &str,
    session_id: &str,
    session_title: Option<&str>,
    first_message_id: Option<&str>,
    last_message_id: Option<&str>,
    content: &str,
    message_count: i64,
) -> Result<CompactionArchive, String> {
    let session_id = session_id.trim();
    if session_id.is_empty() {
        return Err("session id must not be empty".to_owned());
    }
    // M005 CHECKs `message_count >= 0`; reject here so the caller gets a reason
    // rather than a constraint string.
    if message_count < 0 {
        return Err("message count must not be negative".to_owned());
    }
    ensure_session_row(conn, project_id, session_id, session_title)?;
    let first = existing_message(conn, first_message_id)?;
    let last = existing_message(conn, last_message_id)?;
    let content_ref = science_store::put_text(root, content)?;
    let id = science_store::new_id("cmp");
    conn.execute(
        &format!(
            "INSERT INTO compaction_archives \
             (id, session_id, first_message_id, last_message_id, content_ref, message_count, \
              created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, {NOW}, {NOW})"
        ),
        params![&id, session_id, &first, &last, &content_ref, message_count],
    )
    .map_err(|error| format!("insert compaction archive: {error}"))?;
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM compaction_archives WHERE id = ?1",
            params![&id],
            |row| row.get(0),
        )
        .map_err(|error| format!("read compaction archive: {error}"))?;
    Ok(CompactionArchive {
        id,
        session_id: session_id.to_owned(),
        first_message_id: first,
        last_message_id: last,
        content_ref,
        message_count,
        created_at,
    })
}

/// Archived spans, newest first. Scoped to the project through `sessions` so an
/// archive from another workspace's project can never be listed here;
/// `session_id` narrows to one conversation.
pub fn list_archives(
    conn: &Connection,
    project_id: &str,
    session_id: Option<&str>,
) -> Result<Vec<CompactionArchive>, String> {
    let session = session_id.map(str::trim).filter(|s| !s.is_empty());
    let sql = format!(
        "SELECT a.id, a.session_id, a.first_message_id, a.last_message_id, a.content_ref, \
                a.message_count, a.created_at \
         FROM compaction_archives a JOIN sessions s ON s.id = a.session_id \
         WHERE s.project_id = ?1{} ORDER BY a.created_at DESC, a.id DESC",
        if session.is_some() { " AND a.session_id = ?2" } else { "" }
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|error| format!("prepare archive query: {error}"))?;
    let read = |row: &rusqlite::Row<'_>| {
        Ok(CompactionArchive {
            id: row.get(0)?,
            session_id: row.get(1)?,
            first_message_id: row.get(2)?,
            last_message_id: row.get(3)?,
            content_ref: row.get(4)?,
            message_count: row.get(5)?,
            created_at: row.get(6)?,
        })
    };
    let rows = match session {
        Some(session) => stmt.query_map(params![project_id, session], read),
        None => stmt.query_map(params![project_id], read),
    }
    .map_err(|error| format!("query compaction archives: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read compaction archives: {error}"))
}

/// Open the active workspace's science database and resolve its project row —
/// the two steps every command below starts with.
fn open_project(app: &AppHandle) -> Result<(std::path::PathBuf, Connection, String), String> {
    let root = workspace_dir(app)?;
    let conn = science_store::open(&root)?;
    let project_id = science_store::ensure_project(&conn, &root)?;
    Ok((root, conn, project_id))
}

/// `async`: opens SQLite and writes the content store — never on the UI thread.
#[tauri::command(async)]
pub fn create_memory(
    app: AppHandle,
    kind: String,
    content: String,
    session_id: Option<String>,
    session_title: Option<String>,
) -> Result<Memory, String> {
    let (root, conn, project_id) = open_project(&app)?;
    create(
        &conn,
        &root,
        &project_id,
        session_id.as_deref(),
        session_title.as_deref(),
        &kind,
        &content,
    )
}

/// `async`: opens SQLite and reads every listed body from disk.
///
/// `include_disabled` defaults to false, so a caller that omits it gets the
/// recall set — a disabled memory is never returned by accident.
#[tauri::command(async)]
pub fn list_memories(
    app: AppHandle,
    include_disabled: Option<bool>,
) -> Result<Vec<Memory>, String> {
    let (root, conn, project_id) = open_project(&app)?;
    list(&conn, &root, &project_id, include_disabled.unwrap_or(false))
}

/// `async`: opens SQLite off the UI thread.
#[tauri::command(async)]
pub fn set_memory_disabled(app: AppHandle, id: String, disabled: bool) -> Result<Memory, String> {
    let (root, conn, project_id) = open_project(&app)?;
    set_disabled(&conn, &root, &project_id, &id, disabled)
}

/// `async`: opens SQLite off the UI thread. Destructive — the UI confirms first.
#[tauri::command(async)]
pub fn delete_memory(app: AppHandle, id: String) -> Result<(), String> {
    let (_root, conn, project_id) = open_project(&app)?;
    delete(&conn, &project_id, &id)
}

/// `async`: opens SQLite and writes the archived span to the content store.
#[tauri::command(async)]
pub fn record_compaction_archive(
    app: AppHandle,
    session_id: String,
    content: String,
    message_count: i64,
    first_message_id: Option<String>,
    last_message_id: Option<String>,
    session_title: Option<String>,
) -> Result<CompactionArchive, String> {
    let (root, conn, project_id) = open_project(&app)?;
    archive(
        &conn,
        &root,
        &project_id,
        &session_id,
        session_title.as_deref(),
        first_message_id.as_deref(),
        last_message_id.as_deref(),
        &content,
        message_count,
    )
}

/// `async`: opens SQLite off the UI thread.
#[tauri::command(async)]
pub fn list_compaction_archives(
    app: AppHandle,
    session_id: Option<String>,
) -> Result<Vec<CompactionArchive>, String> {
    let (_root, conn, project_id) = open_project(&app)?;
    list_archives(&conn, &project_id, session_id.as_deref())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    /// A throwaway workspace folder, named off the clock so parallel tests in
    /// the same process never collide.
    struct TestWorkspace(PathBuf);

    impl TestWorkspace {
        fn new(tag: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("zerowall-memory-{tag}-{nonce}"));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// An open science DB plus the project row every memory hangs off.
    fn workspace(tag: &str) -> (TestWorkspace, Connection, String) {
        let ws = TestWorkspace::new(tag);
        let conn = science_store::open(ws.path()).unwrap();
        let project = science_store::ensure_project(&conn, ws.path()).unwrap();
        (ws, conn, project)
    }

    #[test]
    fn create_stores_the_body_out_of_line_and_reads_it_back() {
        let (ws, conn, project) = workspace("create");
        let memory = create(
            &conn,
            ws.path(),
            &project,
            None,
            None,
            "preference",
            "Prefers SI units in figure axes.",
        )
        .unwrap();

        assert!(memory.id.starts_with("mem_"));
        assert_eq!(memory.kind, "preference");
        assert_eq!(memory.content.as_deref(), Some("Prefers SI units in figure axes."));
        assert!(memory.disabled_at.is_none(), "a new memory is active");

        // The row holds a hash, not the text.
        let content_ref: String = conn
            .query_row(
                "SELECT content_ref FROM memories WHERE id = ?1",
                params![&memory.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(content_ref.len(), 64, "content_ref is a SHA-256");
        assert_eq!(
            science_store::read_text(ws.path(), &content_ref).unwrap(),
            "Prefers SI units in figure axes."
        );
    }

    #[test]
    fn create_rejects_an_empty_kind_or_body() {
        let (ws, conn, project) = workspace("reject");
        assert!(create(&conn, ws.path(), &project, None, None, "  ", "text").is_err());
        assert!(create(&conn, ws.path(), &project, None, None, "note", "   \n ").is_err());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM memories", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0, "a rejected memory must leave no row");
    }

    #[test]
    fn a_disabled_memory_stays_on_disk_but_leaves_the_recall_set() {
        let (ws, conn, project) = workspace("disable");
        let keep = create(&conn, ws.path(), &project, None, None, "note", "keep").unwrap();
        let hide = create(&conn, ws.path(), &project, None, None, "note", "hide").unwrap();

        let disabled = set_disabled(&conn, ws.path(), &project, &hide.id, true).unwrap();
        assert!(disabled.disabled_at.is_some());

        // Recall: the disabled one is gone.
        let recalled = list(&conn, ws.path(), &project, false).unwrap();
        assert_eq!(
            recalled.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
            vec![keep.id.as_str()]
        );

        // Management view: still there, with its content, so the user can undo.
        let all = list(&conn, ws.path(), &project, true).unwrap();
        assert_eq!(all.len(), 2);
        let shown = all.iter().find(|m| m.id == hide.id).unwrap();
        assert_eq!(shown.content.as_deref(), Some("hide"));

        // Re-enabling clears the stamp and it returns to recall.
        let back = set_disabled(&conn, ws.path(), &project, &hide.id, false).unwrap();
        assert!(back.disabled_at.is_none());
        assert_eq!(list(&conn, ws.path(), &project, false).unwrap().len(), 2);
    }

    #[test]
    fn delete_removes_the_row_and_is_scoped_to_the_project() {
        let (ws, conn, project) = workspace("delete");
        let memory = create(&conn, ws.path(), &project, None, None, "note", "gone").unwrap();

        // A different project must not be able to delete it.
        assert!(delete(&conn, "proj_other", &memory.id).is_err());
        assert_eq!(list(&conn, ws.path(), &project, true).unwrap().len(), 1);

        delete(&conn, &project, &memory.id).unwrap();
        assert!(list(&conn, ws.path(), &project, true).unwrap().is_empty());
        // Deleting twice is an error, not a silent success.
        assert!(delete(&conn, &project, &memory.id).is_err());
    }

    #[test]
    fn a_memory_can_be_attached_to_a_session_without_renaming_it() {
        let (ws, conn, project) = workspace("session");
        science_store::ensure_session(&conn, &project, "ses_1", "Real title").unwrap();

        let memory = create(
            &conn,
            ws.path(),
            &project,
            Some("ses_1"),
            Some("Wrong title"),
            "note",
            "learned mid-session",
        )
        .unwrap();
        assert_eq!(memory.session_id.as_deref(), Some("ses_1"));

        let title: String = conn
            .query_row("SELECT title FROM sessions WHERE id = 'ses_1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Real title", "an existing session keeps its title");

        // An unknown session is created, so the NOT NULL reference holds.
        create(&conn, ws.path(), &project, Some("ses_2"), None, "note", "new session").unwrap();
        let title: String = conn
            .query_row("SELECT title FROM sessions WHERE id = 'ses_2'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, UNTITLED_SESSION);
    }

    #[test]
    fn an_archive_records_the_span_and_nulls_message_ids_that_have_no_row() {
        let (ws, conn, project) = workspace("archive");
        let archived = archive(
            &conn,
            ws.path(),
            &project,
            "ses_1",
            Some("Long conversation"),
            Some("msg_first"),
            Some("msg_last"),
            "...the compacted transcript...",
            42,
        )
        .unwrap();

        assert!(archived.id.starts_with("cmp_"));
        assert_eq!(archived.message_count, 42);
        // Nothing writes `messages` yet, so the FK targets do not exist. The
        // span is still recorded; the ends are NULL rather than fabricated.
        assert!(archived.first_message_id.is_none());
        assert!(archived.last_message_id.is_none());
        assert_eq!(
            science_store::read_text(ws.path(), &archived.content_ref).unwrap(),
            "...the compacted transcript..."
        );
        let messages: i64 = conn
            .query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))
            .unwrap();
        assert_eq!(messages, 0, "no placeholder message rows were invented");
    }

    #[test]
    fn an_archive_keeps_message_ids_that_do_exist() {
        let (ws, conn, project) = workspace("archive-fk");
        science_store::ensure_session(&conn, &project, "ses_1", "Conversation").unwrap();
        let content_ref = science_store::put_text(ws.path(), "hello").unwrap();
        for (id, sequence) in [("msg_a", 0), ("msg_b", 1)] {
            conn.execute(
                &format!(
                    "INSERT INTO messages \
                     (id, session_id, role, content_ref, sequence, created_at, updated_at) \
                     VALUES (?1, 'ses_1', 'user', ?2, ?3, {NOW}, {NOW})"
                ),
                params![id, &content_ref, sequence],
            )
            .unwrap();
        }

        let archived = archive(
            &conn,
            ws.path(),
            &project,
            "ses_1",
            None,
            Some("msg_a"),
            Some("msg_b"),
            "span",
            2,
        )
        .unwrap();
        assert_eq!(archived.first_message_id.as_deref(), Some("msg_a"));
        assert_eq!(archived.last_message_id.as_deref(), Some("msg_b"));
    }

    #[test]
    fn archives_list_newest_first_and_narrow_to_one_session() {
        let (ws, conn, project) = workspace("archive-list");
        let first = archive(&conn, ws.path(), &project, "ses_1", None, None, None, "a", 1).unwrap();
        let second = archive(&conn, ws.path(), &project, "ses_2", None, None, None, "b", 2).unwrap();

        let all = list_archives(&conn, &project, None).unwrap();
        assert_eq!(all.len(), 2);
        // Same-millisecond rows tie on created_at, so only membership is asserted
        // here; the id tiebreaker keeps the order deterministic.
        assert!(all.iter().any(|a| a.id == first.id));
        assert!(all.iter().any(|a| a.id == second.id));

        let one = list_archives(&conn, &project, Some("ses_2")).unwrap();
        assert_eq!(one.len(), 1);
        assert_eq!(one[0].id, second.id);

        // Another project sees none of them.
        assert!(list_archives(&conn, "proj_other", None).unwrap().is_empty());
    }

    #[test]
    fn archive_rejects_an_empty_session_or_a_negative_count() {
        let (ws, conn, project) = workspace("archive-reject");
        assert!(archive(&conn, ws.path(), &project, "  ", None, None, None, "x", 1).is_err());
        assert!(archive(&conn, ws.path(), &project, "ses_1", None, None, None, "x", -1).is_err());
        assert!(list_archives(&conn, &project, None).unwrap().is_empty());
    }

    #[test]
    fn a_memory_survives_an_unreadable_body_instead_of_hiding_the_list() {
        let (ws, conn, project) = workspace("dangling");
        let good = create(&conn, ws.path(), &project, None, None, "note", "readable").unwrap();
        // A row whose content object was never written — what a partially
        // restored workspace looks like.
        conn.execute(
            &format!(
                "INSERT INTO memories \
                 (id, project_id, memory_kind, content_ref, created_at, updated_at) \
                 VALUES ('mem_dangling', ?1, 'note', ?2, {NOW}, {NOW})"
            ),
            params![&project, "0".repeat(64)],
        )
        .unwrap();

        let all = list(&conn, ws.path(), &project, true).unwrap();
        assert_eq!(all.len(), 2, "the readable memory is still listed");
        let broken = all.iter().find(|m| m.id == "mem_dangling").unwrap();
        assert!(broken.content.is_none(), "an unresolvable body reads as absent");
        let ok = all.iter().find(|m| m.id == good.id).unwrap();
        assert_eq!(ok.content.as_deref(), Some("readable"));
    }

    #[test]
    fn memories_are_scoped_to_their_project() {
        let (ws, conn, project) = workspace("scope");
        create(&conn, ws.path(), &project, None, None, "note", "mine").unwrap();
        conn.execute(
            &format!(
                "INSERT INTO projects (id, name, workspace_path, status, created_at, updated_at) \
                 VALUES ('proj_other', 'Other', '/tmp/other-ws', 'active', {NOW}, {NOW})"
            ),
            [],
        )
        .unwrap();
        create(&conn, ws.path(), "proj_other", None, None, "note", "theirs").unwrap();

        let mine = list(&conn, ws.path(), &project, true).unwrap();
        assert_eq!(mine.len(), 1);
        assert_eq!(mine[0].content.as_deref(), Some("mine"));
    }
}
