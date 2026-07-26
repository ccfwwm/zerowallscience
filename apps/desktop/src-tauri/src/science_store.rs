// The write path into the science database.
//
// Until this module, nothing in production wrote to it at all: `science_db.rs`
// creates the 40 tables and every INSERT lived inside its own `#[cfg(test)]`
// module. That was not merely an unimplemented feature. `foreign_keys` is ON
// (see `science_db::configure_connection`) and every P6 table hangs off
// `projects` / `sessions` through a NOT NULL reference, so a memory row or a
// reviewer run was *unwritable* — the first INSERT would have failed the
// constraint. This module supplies the parent rows and the content store that
// the rest of P6 writes through.
//
// The mapping is deliberately thin, because the folder already IS the project:
//
//   projects.id             `.zerowall/project.json` `id`, or a path-derived id
//                           for a plain dated workspace, which has no marker
//   projects.workspace_path the canonical workspace folder (UNIQUE in M001)
//   sessions.id             the OpenCode session id the UI already holds
//
// Bodies are never stored inline. Every `*_ref` column holds a SHA-256 that
// resolves through `science_db::content_store_path`, so identical text is stored
// once and a memory, an annotation body, and a claim all share one store.
//
// Timestamps are written by SQLite itself via `strftime('%Y-%m-%dT%H:%M:%fZ')`,
// the same expression `science_db.rs` already uses for `schema_migrations` —
// one clock and one format across the whole database, with no date crate.
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::science_db::{content_store_path, open_science_db};

/// SQL for "now", in the one timestamp format this database uses.
pub const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/// The only project lifecycle state the app expresses. `project.rs` has no
/// archive concept — deleting a project removes its `project.json` marker — so
/// inventing a richer vocabulary here would describe behaviour that does not
/// exist. M001 puts no CHECK on the column; this keeps it honest anyway.
const PROJECT_STATUS: &str = "active";

/// Likewise for sessions: the app either has a session or it does not.
const SESSION_STATUS: &str = "active";

/// A fresh row id, prefixed so a bare id in a log or a test failure says what
/// it is. 16 bytes of OS randomness, matching every other id in the app.
pub fn new_id(prefix: &str) -> String {
    format!("{prefix}_{}", crate::runtime::random_hex(16))
}

/// Open the workspace's science database, applying migrations. A thin re-export
/// so P6 modules do not each reach into `science_db`.
pub fn open(root: &Path) -> Result<Connection, String> {
    open_science_db(root)
}

/// Lowercase hex SHA-256 of `bytes` — the form `content_store_path` accepts.
pub fn content_hash(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Store `bytes` in the workspace's content store and return its SHA-256.
///
/// The store is content-addressed, so an object is immutable once written and
/// re-storing identical bytes is a no-op. The write goes to a temporary file in
/// the same directory and is then renamed: a crash mid-write leaves a stray
/// temp file rather than a truncated object that a later read would trust as
/// complete.
pub fn put_content(root: &Path, bytes: &[u8]) -> Result<String, String> {
    let hash = content_hash(bytes);
    let path = content_store_path(root, &hash)?;
    if path.is_file() {
        return Ok(hash); // already stored; identical content by construction
    }
    let parent = path
        .parent()
        .ok_or_else(|| "content store path has no parent".to_owned())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create content store {}: {error}", parent.display()))?;
    let temp = parent.join(format!("{hash}.{}.tmp", crate::runtime::random_hex(8)));
    std::fs::write(&temp, bytes)
        .map_err(|error| format!("write content object {}: {error}", temp.display()))?;
    match std::fs::rename(&temp, &path) {
        Ok(()) => Ok(hash),
        // A concurrent writer of the SAME hash won the race. The object is
        // correct either way, so this is success, not a conflict.
        Err(_) if path.is_file() => {
            let _ = std::fs::remove_file(&temp);
            Ok(hash)
        }
        Err(error) => {
            let _ = std::fs::remove_file(&temp);
            Err(format!("publish content object {}: {error}", path.display()))
        }
    }
}

/// Read a stored object back. Errors when the hash is malformed or absent —
/// a dangling `*_ref` is a real inconsistency, not an empty value.
pub fn read_content(root: &Path, sha256: &str) -> Result<Vec<u8>, String> {
    let path = content_store_path(root, sha256)?;
    std::fs::read(&path).map_err(|error| format!("read content {}: {error}", path.display()))
}

/// Store UTF-8 text and return its SHA-256. Convenience over `put_content` for
/// the many `*_ref` columns whose payload is text.
pub fn put_text(root: &Path, text: &str) -> Result<String, String> {
    put_content(root, text.as_bytes())
}

/// Read a stored object as UTF-8 text.
pub fn read_text(root: &Path, sha256: &str) -> Result<String, String> {
    let bytes = read_content(root, sha256)?;
    String::from_utf8(bytes).map_err(|error| format!("content is not valid UTF-8: {error}"))
}

/// The project id and display name a workspace folder should map to.
///
/// A folder marked by `.zerowall/project.json` uses that file's own id, so the
/// database agrees with what the sidebar shows. A plain dated workspace has no
/// marker and no id, so one is derived from the canonical path — stable across
/// launches, and distinct per folder without inventing a registry.
fn project_identity(root: &Path) -> (String, String) {
    let canonical = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let display = canonical.to_string_lossy().to_string();
    let marker = canonical.join(".zerowall").join("project.json");
    if let Ok(text) = std::fs::read_to_string(&marker) {
        if let Ok(meta) = serde_json::from_str::<crate::project::ProjectMeta>(&text) {
            if !meta.id.trim().is_empty() {
                return (meta.id, meta.name);
            }
        }
    }
    let fallback_name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| display.clone());
    // `ws_` + a hash of the path: derived, not random, so the same folder maps
    // to the same row on every launch.
    (format!("ws_{}", content_hash(display.as_bytes())), fallback_name)
}

/// Get-or-create the `projects` row for a workspace folder, returning its id.
///
/// The workspace path is the identity, not the id: `projects.workspace_path` is
/// UNIQUE in M001, and a folder can gain a `project.json` marker *after* rows
/// already reference its derived id. Looking the row up by path and keeping
/// whatever id it already has means promoting a plain workspace to a named
/// project never orphans the memories and claims that point at it. The name is
/// refreshed on every call so a rename shows up.
pub fn ensure_project(conn: &Connection, root: &Path) -> Result<String, String> {
    let (preferred_id, name) = project_identity(root);
    let canonical = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let path = canonical.to_string_lossy().to_string();

    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM projects WHERE workspace_path = ?1",
            params![&path],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("look up project row: {error}"))?;

    if let Some(id) = existing {
        conn.execute(
            &format!("UPDATE projects SET name = ?1, updated_at = {NOW} WHERE id = ?2"),
            params![&name, &id],
        )
        .map_err(|error| format!("refresh project row: {error}"))?;
        return Ok(id);
    }

    conn.execute(
        &format!(
            "INSERT INTO projects (id, name, workspace_path, status, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, {NOW}, {NOW})"
        ),
        params![&preferred_id, &name, &path, PROJECT_STATUS],
    )
    .map_err(|error| format!("insert project row: {error}"))?;
    Ok(preferred_id)
}

/// Get-or-create the `sessions` row for an OpenCode session id.
///
/// The id comes from the agent runtime, so this is an upsert on it rather than
/// a fresh insert. `project_id` is left alone on conflict: a session belongs to
/// the project it was first recorded under, and silently re-parenting it would
/// move every message and claim beneath it.
pub fn ensure_session(
    conn: &Connection,
    project_id: &str,
    session_id: &str,
    title: &str,
) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Err("session id must not be empty".to_owned());
    }
    conn.execute(
        &format!(
            "INSERT INTO sessions (id, project_id, title, status, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, {NOW}, {NOW}) \
             ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = {NOW}"
        ),
        params![session_id, project_id, title, SESSION_STATUS],
    )
    .map_err(|error| format!("upsert session row: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    /// A throwaway workspace folder. Named off the clock so parallel tests in
    /// the same process never collide.
    struct TestWorkspace(PathBuf);

    impl TestWorkspace {
        fn new(tag: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("zerowall-store-{tag}-{nonce}"));
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

    #[test]
    fn content_hash_matches_the_known_sha256_of_abc() {
        // The canonical SHA-256 test vector: proves the store's addressing is a
        // real SHA-256 and not merely self-consistent.
        assert_eq!(
            content_hash(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn put_content_is_content_addressed_and_idempotent() {
        let ws = TestWorkspace::new("content");
        let first = put_content(ws.path(), b"hello science").unwrap();
        let second = put_content(ws.path(), b"hello science").unwrap();
        assert_eq!(first, second, "identical bytes must map to one object");
        assert_eq!(read_text(ws.path(), &first).unwrap(), "hello science");

        let other = put_text(ws.path(), "different").unwrap();
        assert_ne!(other, first);

        // No temp files left behind — a stray *.tmp would eventually be read as
        // an object by a directory walk.
        let shard = content_store_path(ws.path(), &first)
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf();
        let leftovers: Vec<_> = fs::read_dir(&shard)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp files must be renamed or removed");
    }

    #[test]
    fn read_content_rejects_a_dangling_ref() {
        let ws = TestWorkspace::new("dangling");
        let absent = "0".repeat(64);
        assert!(read_content(ws.path(), &absent).is_err());
        // A malformed hash must not escape the store directory.
        assert!(read_content(ws.path(), "../../etc/passwd").is_err());
    }

    #[test]
    fn ensure_project_derives_a_stable_id_for_an_unmarked_workspace() {
        let ws = TestWorkspace::new("plain");
        let conn = open(ws.path()).unwrap();
        let first = ensure_project(&conn, ws.path()).unwrap();
        let second = ensure_project(&conn, ws.path()).unwrap();
        assert_eq!(first, second, "the same folder must map to one row");
        assert!(first.starts_with("ws_"));

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1, "ensure must not insert a second row");
    }

    #[test]
    fn ensure_project_uses_the_marker_id_when_one_exists() {
        let ws = TestWorkspace::new("marked");
        fs::create_dir_all(ws.path().join(".zerowall")).unwrap();
        fs::write(
            ws.path().join(".zerowall").join("project.json"),
            r#"{"id":"proj_abc","name":"BCI Trends","createdAt":0,"version":1}"#,
        )
        .unwrap();
        let conn = open(ws.path()).unwrap();
        let id = ensure_project(&conn, ws.path()).unwrap();
        assert_eq!(id, "proj_abc");
        let name: String = conn
            .query_row("SELECT name FROM projects WHERE id = ?1", params![&id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(name, "BCI Trends");
    }

    #[test]
    fn promoting_a_workspace_to_a_project_keeps_the_existing_row() {
        // The case that would orphan data if the id were the identity: rows
        // already reference the derived id when project.json appears.
        let ws = TestWorkspace::new("promote");
        let conn = open(ws.path()).unwrap();
        let derived = ensure_project(&conn, ws.path()).unwrap();

        fs::create_dir_all(ws.path().join(".zerowall")).unwrap();
        fs::write(
            ws.path().join(".zerowall").join("project.json"),
            r#"{"id":"proj_later","name":"Named Later","createdAt":0,"version":1}"#,
        )
        .unwrap();
        let after = ensure_project(&conn, ws.path()).unwrap();

        assert_eq!(after, derived, "the id must not change under existing rows");
        let name: String = conn
            .query_row("SELECT name FROM projects WHERE id = ?1", params![&after], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(name, "Named Later", "the display name still follows the marker");
    }

    #[test]
    fn ensure_session_upserts_and_never_reparents() {
        let ws = TestWorkspace::new("session");
        let conn = open(ws.path()).unwrap();
        let project = ensure_project(&conn, ws.path()).unwrap();

        ensure_session(&conn, &project, "ses_1", "First title").unwrap();
        ensure_session(&conn, &project, "ses_1", "Renamed").unwrap();
        let (title, owner): (String, String) = conn
            .query_row(
                "SELECT title, project_id FROM sessions WHERE id = 'ses_1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(title, "Renamed", "the title follows the latest call");
        assert_eq!(owner, project);

        // A second project in the same database must not steal the session.
        conn.execute(
            &format!(
                "INSERT INTO projects (id, name, workspace_path, status, created_at, updated_at) \
                 VALUES ('proj_other', 'Other', '/tmp/other-ws', 'active', {NOW}, {NOW})"
            ),
            [],
        )
        .unwrap();
        ensure_session(&conn, "proj_other", "ses_1", "Moved?").unwrap();
        let owner: String = conn
            .query_row("SELECT project_id FROM sessions WHERE id = 'ses_1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(owner, project, "an existing session keeps its project");
    }

    #[test]
    fn ensure_session_rejects_an_empty_id() {
        let ws = TestWorkspace::new("empty-session");
        let conn = open(ws.path()).unwrap();
        let project = ensure_project(&conn, ws.path()).unwrap();
        assert!(ensure_session(&conn, &project, "   ", "Untitled").is_err());
    }

    #[test]
    fn foreign_keys_are_enforced_so_a_missing_parent_fails_loudly() {
        // The premise of this whole module: without a parent row, a P6 insert
        // does not silently succeed — it violates a constraint.
        let ws = TestWorkspace::new("fk");
        let conn = open(ws.path()).unwrap();
        let result = conn.execute(
            &format!(
                "INSERT INTO memories \
                 (id, project_id, memory_kind, content_ref, created_at, updated_at) \
                 VALUES ('mem_1', 'no_such_project', 'note', 'ref', {NOW}, {NOW})"
            ),
            [],
        );
        assert!(result.is_err(), "foreign_keys must reject an orphan memory");
    }
}
