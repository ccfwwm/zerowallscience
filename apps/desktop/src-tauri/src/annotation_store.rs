// Persisted annotations (M005 `annotations`): a note anchored to a specific
// place in a message or an artifact version.
//
// The M005 CHECK requires `message_id IS NOT NULL OR artifact_version_id IS NOT
// NULL`, and both reference tables that only this bridge writes — so an
// annotation cannot exist without its anchor target existing first.
//
// `body_ref` is a SHA-256 into the workspace content store. `anchor_ref` locates
// the annotated span within the target and is what makes an annotation
// re-findable after the surrounding text moves.
//
// SCOPE: this module anchors to artifact versions only, and always writes
// `message_id` NULL. A workspace file exists on disk and can be hashed, so
// `ensure_artifact_version` below can create a real anchor row from it. The
// message side has no such source: nothing in production mirrors OpenCode's
// message stream into M001 `messages`, whose NOT NULL `sequence` is UNIQUE per
// session — so a message anchor would require inventing a sequence number and a
// row that describes no real conversation. `runtime/agents/bookmarker.json`
// declares message-anchored annotations; that half stays unbacked until a real
// message mirror exists.
use std::path::{Component, Path};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::runtime::workspace_dir;
use crate::science_store::{self, NOW};

/// Hard cap on one list response. Annotations are hand-made notes, so a project
/// realistically holds tens of them; the cap only stops a pathological store
/// from being rendered in full.
const LIST_LIMIT: u32 = 500;

/// Author identity written to the NOT NULL `author_subject`.
///
/// The app has no accounts, no login, and no multi-user identity anywhere —
/// `approval_decisions.decided_by` is the only comparable column and nothing
/// populates it yet. So the honest value for a note made in this app's UI is
/// "the person at this desktop", one subject, spelled once here. An annotation
/// written on an agent's behalf passes `agent:<agent-id>` instead (the ids in
/// `runtime/agents/*.json`, e.g. `agent:bookmarker`), which keeps human and
/// machine authorship distinguishable without inventing a user registry.
const LOCAL_SUBJECT: &str = "local";

/// Where in an artifact version an annotation points.
///
/// Lines, not character offsets: a line span is what a file viewer shows and
/// what a selection maps onto, and it is computed identically in Rust and in TS
/// by splitting on `\n` — character offsets would have to pick between Unicode
/// scalars (Rust) and UTF-16 code units (JS) and would silently disagree on any
/// text outside the BMP.
///
/// `quote` is the text the span covered when the annotation was made. The lines
/// are exact for that version — versions are immutable — but stop being
/// meaningful in a later version, which can re-find the span by searching for
/// the quote. Keeping both is what survives an edit above the anchor; lines
/// alone would end up pointing at unrelated text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextAnchor {
    /// 1-based first line of the span.
    pub start_line: u32,
    /// 1-based last line of the span, inclusive.
    pub end_line: u32,
    /// The exact text those lines covered. May be empty when the annotation is
    /// about the location rather than about specific words.
    pub quote: String,
}

impl TextAnchor {
    fn validate(&self) -> Result<(), String> {
        if self.start_line == 0 {
            return Err("anchor startLine is 1-based".to_owned());
        }
        if self.end_line < self.start_line {
            return Err("anchor endLine must not precede startLine".to_owned());
        }
        Ok(())
    }
}

/// One annotation, with its refs already resolved.
///
/// The body text and the anchor are read back out of the content store here
/// rather than handed to the caller as hashes: every consumer wants to display
/// them, and a `*_ref` is useless to the frontend, which cannot reach the store.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub annotation_kind: String,
    pub body: String,
    /// Absent when the annotation targets the whole version, or when the stored
    /// locator no longer parses (a store written by a newer shape).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor: Option<TextAnchor>,
    pub artifact_version_id: String,
    /// Workspace-relative path of the annotated artifact, `/`-separated.
    pub artifact_path: String,
    pub version_number: u32,
    pub author_subject: String,
    pub created_at: String,
    pub updated_at: String,
}

/// A workspace-relative logical path, `/`-separated.
///
/// `artifacts.logical_path` is the project-wide identity of a file
/// (`UNIQUE (project_id, logical_path)`), so it has to be spelled one way:
/// relative, forward slashes, no `.` or `..`. Rejecting absolute paths and
/// non-normal components also keeps a caller from naming a file outside the
/// workspace, which the agent is never allowed to touch.
fn logical_path(path: &str) -> Result<String, String> {
    let candidate = Path::new(path);
    if candidate.is_absolute() {
        return Err("path must be relative to the workspace".to_owned());
    }
    let parts: Vec<String> = candidate
        .components()
        .map(|component| match component {
            Component::Normal(part) => Ok(part.to_string_lossy().into_owned()),
            _ => Err("path must stay inside the workspace".to_owned()),
        })
        .collect::<Result<_, _>>()?;
    if parts.is_empty() {
        return Err("path must not be empty".to_owned());
    }
    Ok(parts.join("/"))
}

/// The `artifacts.artifact_type` for a logical path.
///
/// The extension is the only type information a workspace file carries — there
/// is no per-file metadata sidecar — so it is what gets recorded, lowercased,
/// with `file` for an extensionless path. M002 puts no CHECK on the column.
fn artifact_type(logical_path: &str) -> String {
    Path::new(logical_path)
        .extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase())
        .filter(|ext| !ext.is_empty())
        .unwrap_or_else(|| "file".to_owned())
}

/// Get-or-create the `artifacts` row for a logical path, returning its id.
fn ensure_artifact(
    conn: &Connection,
    project_id: &str,
    logical_path: &str,
) -> Result<String, String> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM artifacts WHERE project_id = ?1 AND logical_path = ?2",
            params![project_id, logical_path],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("look up artifact row: {error}"))?;
    if let Some(id) = existing {
        return Ok(id);
    }

    let id = science_store::new_id("art");
    // `session_id` stays NULL: an annotation is about a file, not about the
    // conversation that happened to produce it, and M002's composite FK would
    // demand a real `sessions` row for the same project to fill it in.
    conn.execute(
        &format!(
            "INSERT INTO artifacts \
             (id, project_id, logical_path, artifact_type, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, {NOW}, {NOW})"
        ),
        params![&id, project_id, logical_path, artifact_type(logical_path)],
    )
    .map_err(|error| format!("insert artifact row: {error}"))?;
    Ok(id)
}

/// Record `bytes` as the current version of `logical_path` and return the
/// version id — the anchor row an annotation needs.
///
/// A new `artifact_versions` row is appended only when the content hash differs
/// from the LATEST version; otherwise the existing version id comes back.
/// Annotating a file is a read, and this runs on every annotate and every list,
/// so without the dedupe an unchanged file would gain a version per glance and
/// bury the real edits. Comparing against the latest version only — not against
/// every version ever — is deliberate: a file that returns to earlier content is
/// at a new point in its history, and M002's `UNIQUE (artifact_id,
/// version_number)` plus the existing `content_sha256` index are built for
/// exactly that (see `science_db`'s rollback test). Version numbers are dense
/// and start at 1.
pub fn ensure_artifact_version(
    conn: &Connection,
    root: &Path,
    project_id: &str,
    logical_path: &str,
    bytes: &[u8],
) -> Result<String, String> {
    let path = logical_path.to_owned();
    let artifact_id = ensure_artifact(conn, project_id, &path)?;
    let hash = science_store::put_content(root, bytes)?;

    let latest: Option<(String, String, i64)> = conn
        .query_row(
            "SELECT id, content_sha256, version_number FROM artifact_versions \
             WHERE artifact_id = ?1 ORDER BY version_number DESC LIMIT 1",
            params![&artifact_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| format!("look up latest artifact version: {error}"))?;

    let next_version = match latest {
        Some((id, latest_hash, _)) if latest_hash == hash => return Ok(id),
        Some((_, _, version_number)) => version_number + 1,
        None => 1,
    };

    let id = science_store::new_id("ver");
    // `content_ref` and `content_sha256` are the same value: the content store
    // IS addressed by hash, so a second column spelling the location differently
    // would be a way for the two to disagree.
    conn.execute(
        &format!(
            "INSERT INTO artifact_versions \
             (id, project_id, artifact_id, version_number, content_sha256, content_ref, \
              byte_size, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, {NOW}, {NOW})"
        ),
        params![
            &id,
            project_id,
            &artifact_id,
            next_version,
            &hash,
            bytes.len() as i64
        ],
    )
    .map_err(|error| format!("insert artifact version row: {error}"))?;
    conn.execute(
        &format!("UPDATE artifacts SET updated_at = {NOW} WHERE id = ?1"),
        params![&artifact_id],
    )
    .map_err(|error| format!("touch artifact row: {error}"))?;
    Ok(id)
}

fn clean_kind(kind: &str) -> Result<String, String> {
    let kind = kind.trim();
    if kind.is_empty() {
        return Err("annotation kind must not be empty".to_owned());
    }
    // M005 puts no CHECK on `annotation_kind`, and this module does not invent
    // one: the vocabulary lives in the agent manifests under `runtime/agents/`
    // (`key_finding`, `method`, `limitation`, …), which this module does not own
    // and must not go stale against.
    Ok(kind.to_owned())
}

fn clean_subject(author_subject: Option<&str>) -> String {
    author_subject
        .map(str::trim)
        .filter(|subject| !subject.is_empty())
        .unwrap_or(LOCAL_SUBJECT)
        .to_owned()
}

/// Create an annotation on an existing artifact version. Returns its id.
///
/// The project is read from the anchor row rather than passed in: M005 has no
/// composite FK tying `annotations.project_id` to the version's project, so a
/// caller could otherwise file an annotation under one project against a
/// version belonging to another — and a project listing would then miss it.
/// Taking it from the version makes that unrepresentable, and a version that
/// does not exist fails here with a clear message instead of as an FK violation.
pub fn create_annotation(
    conn: &Connection,
    root: &Path,
    artifact_version_id: &str,
    annotation_kind: &str,
    body: &str,
    anchor: Option<&TextAnchor>,
    author_subject: Option<&str>,
) -> Result<String, String> {
    let kind = clean_kind(annotation_kind)?;
    if body.trim().is_empty() {
        return Err("annotation body must not be empty".to_owned());
    }
    let project_id: String = conn
        .query_row(
            "SELECT project_id FROM artifact_versions WHERE id = ?1",
            params![artifact_version_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("look up annotation anchor: {error}"))?
        .ok_or_else(|| format!("artifact version {artifact_version_id} does not exist"))?;

    let body_ref = science_store::put_text(root, body)?;
    let anchor_ref = match anchor {
        Some(anchor) => {
            anchor.validate()?;
            let json = serde_json::to_string(anchor)
                .map_err(|error| format!("serialize anchor: {error}"))?;
            Some(science_store::put_text(root, &json)?)
        }
        None => None,
    };

    let id = science_store::new_id("ann");
    // `message_id` is NULL by design — see this module's header. The M005 CHECK
    // is satisfied by `artifact_version_id`.
    conn.execute(
        &format!(
            "INSERT INTO annotations \
             (id, project_id, artifact_version_id, annotation_kind, body_ref, anchor_ref, \
              author_subject, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, {NOW}, {NOW})"
        ),
        params![
            &id,
            &project_id,
            artifact_version_id,
            &kind,
            &body_ref,
            &anchor_ref,
            clean_subject(author_subject)
        ],
    )
    .map_err(|error| format!("insert annotation row: {error}"))?;
    Ok(id)
}

/// SELECT shared by both list queries. Joins through to the artifact so a row
/// carries the path and version a reader needs to see what it points at.
const SELECT_ANNOTATIONS: &str = "SELECT a.id, a.annotation_kind, a.body_ref, a.anchor_ref, \
     a.artifact_version_id, art.logical_path, v.version_number, a.author_subject, \
     a.created_at, a.updated_at \
     FROM annotations a \
     JOIN artifact_versions v ON v.id = a.artifact_version_id \
     JOIN artifacts art ON art.id = v.artifact_id";

/// Raw row shape, before the content store is consulted.
struct Row {
    id: String,
    annotation_kind: String,
    body_ref: String,
    anchor_ref: Option<String>,
    artifact_version_id: String,
    artifact_path: String,
    version_number: i64,
    author_subject: String,
    created_at: String,
    updated_at: String,
}

fn query(conn: &Connection, sql: &str, key: &str) -> Result<Vec<Row>, String> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|error| format!("prepare annotation query: {error}"))?;
    let rows = stmt
        .query_map(params![key, LIST_LIMIT], |row| {
            Ok(Row {
                id: row.get(0)?,
                annotation_kind: row.get(1)?,
                body_ref: row.get(2)?,
                anchor_ref: row.get(3)?,
                artifact_version_id: row.get(4)?,
                artifact_path: row.get(5)?,
                version_number: row.get(6)?,
                author_subject: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|error| format!("run annotation query: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read annotation rows: {error}"))
}

/// Resolve each row's refs. A dangling `body_ref` fails the whole list: the
/// store and the database are written together, so a missing body is real
/// corruption and hiding it would present an annotation that says nothing.
fn resolve(root: &Path, rows: Vec<Row>) -> Result<Vec<Annotation>, String> {
    rows.into_iter()
        .map(|row| {
            Ok(Annotation {
                id: row.id,
                annotation_kind: row.annotation_kind,
                body: science_store::read_text(root, &row.body_ref)?,
                // A locator that no longer parses is dropped rather than fatal:
                // the note itself is still worth showing, and the UI treats a
                // missing anchor as "the whole version".
                anchor: row.anchor_ref.and_then(|anchor_ref| {
                    science_store::read_text(root, &anchor_ref)
                        .ok()
                        .and_then(|json| serde_json::from_str::<TextAnchor>(&json).ok())
                }),
                artifact_version_id: row.artifact_version_id,
                artifact_path: row.artifact_path,
                version_number: row.version_number.max(0) as u32,
                author_subject: row.author_subject,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
        })
        .collect()
}

/// Every annotation in a project, newest first.
pub fn list_annotations(
    conn: &Connection,
    root: &Path,
    project_id: &str,
) -> Result<Vec<Annotation>, String> {
    let sql = format!(
        "{SELECT_ANNOTATIONS} WHERE a.project_id = ?1 \
         ORDER BY a.created_at DESC, a.id DESC LIMIT ?2"
    );
    resolve(root, query(conn, &sql, project_id)?)
}

/// Annotations on one artifact version, newest first.
pub fn list_annotations_for_version(
    conn: &Connection,
    root: &Path,
    artifact_version_id: &str,
) -> Result<Vec<Annotation>, String> {
    let sql = format!(
        "{SELECT_ANNOTATIONS} WHERE a.artifact_version_id = ?1 \
         ORDER BY a.created_at DESC, a.id DESC LIMIT ?2"
    );
    resolve(root, query(conn, &sql, artifact_version_id)?)
}

/// Edit an annotation's kind and body.
///
/// The anchor is deliberately not editable: it is what the annotation is ABOUT,
/// and re-pointing a note at a different span silently turns it into a claim
/// about text its author never read. Moving a note means writing a new one.
pub fn update_annotation(
    conn: &Connection,
    root: &Path,
    id: &str,
    annotation_kind: &str,
    body: &str,
) -> Result<(), String> {
    let kind = clean_kind(annotation_kind)?;
    if body.trim().is_empty() {
        return Err("annotation body must not be empty".to_owned());
    }
    let body_ref = science_store::put_text(root, body)?;
    let changed = conn
        .execute(
            &format!(
                "UPDATE annotations SET annotation_kind = ?1, body_ref = ?2, updated_at = {NOW} \
                 WHERE id = ?3"
            ),
            params![&kind, &body_ref, id],
        )
        .map_err(|error| format!("update annotation row: {error}"))?;
    if changed == 0 {
        return Err(format!("annotation {id} does not exist"));
    }
    Ok(())
}

/// Delete an annotation.
///
/// The body and anchor objects stay in the content store: it is content-
/// addressed and shared, so any other row may hold the same hash — deleting the
/// object would break them.
pub fn delete_annotation(conn: &Connection, id: &str) -> Result<(), String> {
    let changed = conn
        .execute("DELETE FROM annotations WHERE id = ?1", params![id])
        .map_err(|error| format!("delete annotation row: {error}"))?;
    if changed == 0 {
        return Err(format!("annotation {id} does not exist"));
    }
    Ok(())
}

// ---- commands ---------------------------------------------------------------
// All `async`: each one opens SQLite, may apply migrations, and reads or writes
// the workspace — none of which may run on the UI thread.

/// Annotate a workspace file. The file's current bytes become (or match) an
/// artifact version, and the annotation hangs off that version — so the note
/// records which content it was made against, even after the file changes.
#[tauri::command(async)]
pub fn create_annotation_cmd(
    app: AppHandle,
    path: String,
    annotation_kind: String,
    body: String,
    anchor: Option<TextAnchor>,
    author_subject: Option<String>,
) -> Result<String, String> {
    let root = workspace_dir(&app)?;
    let logical = logical_path(&path)?;
    let bytes = std::fs::read(root.join(&logical))
        .map_err(|error| format!("read {logical}: {error}"))?;

    let conn = science_store::open(&root)?;
    let project_id = science_store::ensure_project(&conn, &root)?;
    let version_id = ensure_artifact_version(&conn, &root, &project_id, &logical, &bytes)?;
    create_annotation(
        &conn,
        &root,
        &version_id,
        &annotation_kind,
        &body,
        anchor.as_ref(),
        author_subject.as_deref(),
    )
}

/// Every annotation in the active workspace's project, newest first.
#[tauri::command(async)]
pub fn list_annotations_cmd(app: AppHandle) -> Result<Vec<Annotation>, String> {
    let root = workspace_dir(&app)?;
    let conn = science_store::open(&root)?;
    let project_id = science_store::ensure_project(&conn, &root)?;
    list_annotations(&conn, &root, &project_id)
}

/// Annotations on one artifact version, newest first.
#[tauri::command(async)]
pub fn list_annotations_for_version_cmd(
    app: AppHandle,
    artifact_version_id: String,
) -> Result<Vec<Annotation>, String> {
    let root = workspace_dir(&app)?;
    let conn = science_store::open(&root)?;
    list_annotations_for_version(&conn, &root, &artifact_version_id)
}

#[tauri::command(async)]
pub fn update_annotation_cmd(
    app: AppHandle,
    id: String,
    annotation_kind: String,
    body: String,
) -> Result<(), String> {
    let root = workspace_dir(&app)?;
    let conn = science_store::open(&root)?;
    update_annotation(&conn, &root, &id, &annotation_kind, &body)
}

#[tauri::command(async)]
pub fn delete_annotation_cmd(app: AppHandle, id: String) -> Result<(), String> {
    let root = workspace_dir(&app)?;
    let conn = science_store::open(&root)?;
    delete_annotation(&conn, &id)
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
            let dir = std::env::temp_dir().join(format!("zerowall-annot-{tag}-{nonce}"));
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

    /// An open database plus the project row every annotation needs.
    fn workspace(tag: &str) -> (TestWorkspace, Connection, String) {
        let ws = TestWorkspace::new(tag);
        let conn = science_store::open(ws.path()).unwrap();
        let project = science_store::ensure_project(&conn, ws.path()).unwrap();
        (ws, conn, project)
    }

    fn anchor(start_line: u32, end_line: u32, quote: &str) -> TextAnchor {
        TextAnchor { start_line, end_line, quote: quote.to_owned() }
    }

    #[test]
    fn ensure_artifact_version_appends_only_when_the_content_changes() {
        let (ws, conn, project) = workspace("version-dedupe");

        let first =
            ensure_artifact_version(&conn, ws.path(), &project, "data/result.csv", b"a,b\n1,2")
                .unwrap();
        // Re-recording identical bytes must return the SAME version, or every
        // list would mint a version for an untouched file.
        let again =
            ensure_artifact_version(&conn, ws.path(), &project, "data/result.csv", b"a,b\n1,2")
                .unwrap();
        assert_eq!(first, again);

        let second =
            ensure_artifact_version(&conn, ws.path(), &project, "data/result.csv", b"a,b\n3,4")
                .unwrap();
        assert_ne!(second, first);

        // Dense numbering from 1, one artifact row for the path.
        let versions: Vec<i64> = conn
            .prepare("SELECT version_number FROM artifact_versions ORDER BY version_number")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(versions, vec![1, 2]);
        let artifacts: i64 = conn
            .query_row("SELECT COUNT(*) FROM artifacts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(artifacts, 1);

        // The recorded hash addresses the bytes actually stored.
        let (hash, size): (String, i64) = conn
            .query_row(
                "SELECT content_sha256, byte_size FROM artifact_versions WHERE id = ?1",
                params![&second],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(science_store::read_text(ws.path(), &hash).unwrap(), "a,b\n3,4");
        assert_eq!(size, 7);

        // The type comes from the extension.
        let kind: String = conn
            .query_row("SELECT artifact_type FROM artifacts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(kind, "csv");
    }

    #[test]
    fn a_file_returning_to_earlier_content_is_a_new_version() {
        // Dedupe is against the LATEST version only: v1 content coming back is a
        // new point in the file's history, not a no-op.
        let (ws, conn, project) = workspace("version-rollback");
        let first = ensure_artifact_version(&conn, ws.path(), &project, "notes.md", b"one").unwrap();
        ensure_artifact_version(&conn, ws.path(), &project, "notes.md", b"two").unwrap();
        let third = ensure_artifact_version(&conn, ws.path(), &project, "notes.md", b"one").unwrap();

        assert_ne!(third, first);
        let version_number: i64 = conn
            .query_row(
                "SELECT version_number FROM artifact_versions WHERE id = ?1",
                params![&third],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version_number, 3);
    }

    #[test]
    fn create_stores_the_body_and_anchor_by_hash_never_inline() {
        let (ws, conn, project) = workspace("create");
        let version =
            ensure_artifact_version(&conn, ws.path(), &project, "report.md", b"line1\nline2\n")
                .unwrap();
        let id = create_annotation(
            &conn,
            ws.path(),
            &version,
            "key_finding",
            "The effect holds after the correction.",
            Some(&anchor(2, 2, "line2")),
            None,
        )
        .unwrap();

        let (body_ref, anchor_ref, subject, message_id): (String, String, String, Option<String>) =
            conn.query_row(
                "SELECT body_ref, anchor_ref, author_subject, message_id FROM annotations \
                 WHERE id = ?1",
                params![&id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();

        // Both refs are 64-hex content hashes, not the text itself.
        for reference in [&body_ref, &anchor_ref] {
            assert_eq!(reference.len(), 64, "{reference}");
            assert!(reference.bytes().all(|b| b.is_ascii_hexdigit()));
        }
        assert_eq!(
            science_store::read_text(ws.path(), &body_ref).unwrap(),
            "The effect holds after the correction."
        );
        assert_eq!(
            serde_json::from_str::<TextAnchor>(
                &science_store::read_text(ws.path(), &anchor_ref).unwrap()
            )
            .unwrap(),
            anchor(2, 2, "line2")
        );
        assert_eq!(subject, "local", "the desktop author, absent any identity");
        assert_eq!(message_id, None, "the message anchor is out of scope");

        // An agent-authored note stays distinguishable from a human one.
        create_annotation(
            &conn,
            ws.path(),
            &version,
            "method",
            "Extracted at checkpoint.",
            None,
            Some("agent:bookmarker"),
        )
        .unwrap();
        let subjects: Vec<String> = conn
            .prepare("SELECT author_subject FROM annotations ORDER BY author_subject")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(subjects, vec!["agent:bookmarker", "local"]);
    }

    #[test]
    fn create_rejects_an_orphan_anchor_an_empty_body_and_a_bad_span() {
        let (ws, conn, project) = workspace("create-invalid");
        let version =
            ensure_artifact_version(&conn, ws.path(), &project, "report.md", b"text").unwrap();

        // The premise of the module: no anchor row, no annotation. Rejected by
        // name here rather than left to the foreign key, so the caller is told
        // which version is missing instead of reading an FK violation.
        let orphan =
            create_annotation(&conn, ws.path(), "no_such_version", "note", "body", None, None)
                .unwrap_err();
        assert!(orphan.contains("no_such_version"), "{orphan}");

        for (kind, body) in [("note", "   "), ("  ", "body")] {
            assert!(
                create_annotation(&conn, ws.path(), &version, kind, body, None, None).is_err(),
                "kind={kind:?} body={body:?}"
            );
        }

        for bad in [anchor(0, 1, ""), anchor(5, 4, "")] {
            assert!(create_annotation(
                &conn,
                ws.path(),
                &version,
                "note",
                "body",
                Some(&bad),
                None,
            )
            .is_err());
        }

        // A rejection is a rejection: none of the above left a row behind.
        let written: i64 = conn
            .query_row("SELECT COUNT(*) FROM annotations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(written, 0);
    }

    #[test]
    fn list_returns_resolved_rows_newest_first_and_narrows_by_version() {
        let (ws, conn, project) = workspace("list");
        let v1 = ensure_artifact_version(&conn, ws.path(), &project, "a/report.md", b"one").unwrap();
        let v2 = ensure_artifact_version(&conn, ws.path(), &project, "b/data.csv", b"x,y").unwrap();

        // created_at has millisecond resolution, so the tiebreak on id is what
        // actually orders same-instant rows; assert the set, then the narrowing.
        let older = create_annotation(
            &conn, ws.path(), &v1, "note", "first", Some(&anchor(1, 1, "one")), None,
        )
        .unwrap();
        let newer =
            create_annotation(&conn, ws.path(), &v2, "limitation", "second", None, None).unwrap();

        let all = list_annotations(&conn, ws.path(), &project).unwrap();
        assert_eq!(all.len(), 2);
        let bodies: Vec<&str> = all.iter().map(|a| a.body.as_str()).collect();
        assert!(bodies.contains(&"first") && bodies.contains(&"second"));

        let first = all.iter().find(|a| a.id == older).unwrap();
        assert_eq!(first.annotation_kind, "note");
        assert_eq!(first.artifact_path, "a/report.md");
        assert_eq!(first.version_number, 1);
        assert_eq!(first.anchor, Some(anchor(1, 1, "one")));
        let second = all.iter().find(|a| a.id == newer).unwrap();
        assert_eq!(second.artifact_path, "b/data.csv");
        assert_eq!(second.anchor, None, "a whole-version note has no locator");

        let only_v2 = list_annotations_for_version(&conn, ws.path(), &v2).unwrap();
        assert_eq!(only_v2.len(), 1);
        assert_eq!(only_v2[0].id, newer);

        // A second project must not see this one's annotations.
        conn.execute(
            &format!(
                "INSERT INTO projects (id, name, workspace_path, status, created_at, updated_at) \
                 VALUES ('proj_other', 'Other', '/tmp/other-annot-ws', 'active', {NOW}, {NOW})"
            ),
            [],
        )
        .unwrap();
        assert!(list_annotations(&conn, ws.path(), "proj_other").unwrap().is_empty());
    }

    #[test]
    fn update_replaces_the_kind_and_body_but_leaves_the_anchor() {
        let (ws, conn, project) = workspace("update");
        let version =
            ensure_artifact_version(&conn, ws.path(), &project, "report.md", b"one\ntwo").unwrap();
        let id = create_annotation(
            &conn,
            ws.path(),
            &version,
            "note",
            "draft",
            Some(&anchor(2, 2, "two")),
            None,
        )
        .unwrap();

        update_annotation(&conn, ws.path(), &id, "key_finding", "revised").unwrap();
        let row = &list_annotations(&conn, ws.path(), &project).unwrap()[0];
        assert_eq!(row.annotation_kind, "key_finding");
        assert_eq!(row.body, "revised");
        assert_eq!(row.anchor, Some(anchor(2, 2, "two")), "the target must not move");

        assert!(update_annotation(&conn, ws.path(), &id, "note", "  ").is_err());
        assert!(update_annotation(&conn, ws.path(), "ann_missing", "note", "x").is_err());
    }

    #[test]
    fn delete_removes_the_row_and_reports_a_missing_id() {
        let (ws, conn, project) = workspace("delete");
        let version =
            ensure_artifact_version(&conn, ws.path(), &project, "report.md", b"one").unwrap();
        let id = create_annotation(&conn, ws.path(), &version, "note", "gone", None, None).unwrap();

        delete_annotation(&conn, &id).unwrap();
        assert!(list_annotations(&conn, ws.path(), &project).unwrap().is_empty());
        assert!(delete_annotation(&conn, &id).is_err(), "a second delete is not a no-op");
    }

    #[test]
    fn deleting_the_artifact_version_takes_its_annotations_with_it() {
        // M005 declares ON DELETE CASCADE from `artifact_versions`; with
        // foreign_keys ON that leaves no annotation pointing at nothing.
        let (ws, conn, project) = workspace("cascade");
        let version =
            ensure_artifact_version(&conn, ws.path(), &project, "report.md", b"one").unwrap();
        create_annotation(&conn, ws.path(), &version, "note", "body", None, None).unwrap();

        conn.execute("DELETE FROM artifact_versions WHERE id = ?1", params![&version])
            .unwrap();
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM annotations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn logical_path_normalizes_separators_and_refuses_to_escape_the_workspace() {
        assert_eq!(logical_path("data\\result.csv").unwrap(), "data/result.csv");
        assert_eq!(logical_path("report.md").unwrap(), "report.md");
        for invalid in ["", "..", "../secrets.env", "data/../../etc/passwd", "./"] {
            assert!(logical_path(invalid).is_err(), "{invalid}");
        }
        #[cfg(windows)]
        assert!(logical_path("C:\\Windows\\system32").is_err());
        #[cfg(unix)]
        assert!(logical_path("/etc/passwd").is_err());
    }

    #[test]
    fn artifact_type_falls_back_when_a_path_has_no_extension() {
        assert_eq!(artifact_type("a/b/notes.MD"), "md");
        assert_eq!(artifact_type("Makefile"), "file");
    }
}
