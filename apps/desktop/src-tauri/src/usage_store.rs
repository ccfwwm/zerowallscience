// Persisted token/cost accounting: one row per assistant reply, keyed by the
// OpenCode message id (M009).
//
// Like review_store, every row hangs off `sessions` (foreign_keys is ON), so a
// write goes through `science_store::ensure_project` / `ensure_session` first —
// an orphan insert fails outright.
//
// The runtime restamps the same assistant message with growing cumulative
// totals as a reply streams, so `usage_record` UPSERTs on `message_id`
// (latest-wins) rather than appending a row per stamp. The stored counts are
// therefore final-cumulative-per-reply, never double-counted.
//
// `cost_usd` is nullable, not defaulted: a provider that priced nothing leaves
// it NULL, which the UI renders as "—". A real $0.00 and "unpriced" are
// different facts and the schema keeps them apart.
use rusqlite::{params, Connection};
use tauri::AppHandle;

use crate::runtime::workspace_dir;
use crate::science_store::{self, NOW};

/// Cumulative token counts for one assistant reply, plus its optional USD cost.
/// Field names match the SDK `UsageEvent` wire shape (camelCase over serde).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInput {
    pub input: i64,
    pub output: i64,
    pub reasoning: i64,
    pub cache_read: i64,
    pub cache_write: i64,
    #[serde(default)]
    pub cost: Option<f64>,
}

/// The usage rollup for one session: its per-reply rows (newest first) and the
/// grand totals across them, for the status bar and the Usage settings panel.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsage {
    pub replies: Vec<StoredUsage>,
    pub total: UsageTotals,
}

/// One persisted reply's usage, as the panel renders it.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredUsage {
    pub message_id: String,
    pub input: i64,
    pub output: i64,
    pub reasoning: i64,
    pub cache_read: i64,
    pub cache_write: i64,
    pub cost: Option<f64>,
    pub created_at: String,
}

/// Grand totals across a session's replies. `cost` is null when NO reply had a
/// cost (all unpriced); a mix sums the priced ones and ignores the rest.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageTotals {
    pub input: i64,
    pub output: i64,
    pub reasoning: i64,
    pub cache_read: i64,
    pub cache_write: i64,
    pub cost: Option<f64>,
    pub replies: i64,
}

/// One session's totals for the workspace-wide Usage panel: the grand totals
/// plus the session's id and title so the table can label each row.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRollup {
    pub session_id: String,
    pub title: String,
    #[serde(flatten)]
    pub total: UsageTotals,
}

/// The whole workspace's usage: one row per session (busiest first) and the
/// grand total across every session — what Settings → Usage renders.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUsage {
    pub sessions: Vec<SessionRollup>,
    pub total: UsageTotals,
}

/// Get-or-update the usage row for one assistant message.
///
/// Idempotent per message id and monotone: the runtime restamps a streaming
/// reply many times, so the UPSERT overwrites the counts with the latest
/// cumulative totals. `created_at` is preserved on conflict (the reply's first
/// stamp), while `updated_at` advances.
pub fn record(
    conn: &Connection,
    project_id: &str,
    session_id: &str,
    message_id: &str,
    usage: &UsageInput,
) -> Result<(), String> {
    if message_id.trim().is_empty() {
        return Err("message id must not be empty".to_owned());
    }
    let tx = conn
        .unchecked_transaction()
        .map_err(|error| format!("begin usage transaction: {error}"))?;
    science_store::ensure_session(&tx, project_id, session_id, "")?;
    tx.execute(
        &format!(
            "INSERT INTO usage_events \
             (message_id, session_id, input, output, reasoning, cache_read, cache_write, \
              cost_usd, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, {NOW}, {NOW}) \
             ON CONFLICT(message_id) DO UPDATE SET \
                 input = excluded.input, \
                 output = excluded.output, \
                 reasoning = excluded.reasoning, \
                 cache_read = excluded.cache_read, \
                 cache_write = excluded.cache_write, \
                 cost_usd = excluded.cost_usd, \
                 updated_at = {NOW}"
        ),
        params![
            message_id,
            session_id,
            usage.input,
            usage.output,
            usage.reasoning,
            usage.cache_read,
            usage.cache_write,
            usage.cost,
        ],
    )
    .map_err(|error| format!("upsert usage row: {error}"))?;
    tx.commit()
        .map_err(|error| format!("commit usage transaction: {error}"))?;
    Ok(())
}

/// A session's per-reply usage (newest first) and grand totals.
pub fn by_session(conn: &Connection, session_id: &str) -> Result<SessionUsage, String> {
    let mut stmt = conn
        .prepare(
            "SELECT message_id, input, output, reasoning, cache_read, cache_write, \
                    cost_usd, created_at \
             FROM usage_events WHERE session_id = ?1 ORDER BY created_at DESC, rowid DESC",
        )
        .map_err(|error| format!("prepare usage read: {error}"))?;
    let replies = stmt
        .query_map(params![session_id], |row| {
            Ok(StoredUsage {
                message_id: row.get(0)?,
                input: row.get(1)?,
                output: row.get(2)?,
                reasoning: row.get(3)?,
                cache_read: row.get(4)?,
                cache_write: row.get(5)?,
                cost: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("read usage rows: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read usage rows: {error}"))?;

    let mut total = UsageTotals {
        input: 0,
        output: 0,
        reasoning: 0,
        cache_read: 0,
        cache_write: 0,
        cost: None,
        replies: replies.len() as i64,
    };
    for r in &replies {
        total.input += r.input;
        total.output += r.output;
        total.reasoning += r.reasoning;
        total.cache_read += r.cache_read;
        total.cache_write += r.cache_write;
        // Sum only priced replies; a session of all-unpriced replies keeps a
        // null cost (rendered "—"), which a defaulted 0.0 would misrepresent.
        if let Some(cost) = r.cost {
            total.cost = Some(total.cost.unwrap_or(0.0) + cost);
        }
    }
    Ok(SessionUsage { replies, total })
}

/// Per-session totals across the whole workspace (busiest first) and the grand
/// total across every session. Aggregated in SQL so a workspace with a long
/// history stays one round trip. `title` comes from the `sessions` row; an
/// untitled session (empty title) is labelled by the caller's i18n.
pub fn by_workspace(conn: &Connection) -> Result<WorkspaceUsage, String> {
    let mut stmt = conn
        .prepare(
            "SELECT u.session_id, COALESCE(s.title, ''), \
                    SUM(u.input), SUM(u.output), SUM(u.reasoning), \
                    SUM(u.cache_read), SUM(u.cache_write), \
                    SUM(u.cost_usd), COUNT(*) \
             FROM usage_events u LEFT JOIN sessions s ON s.id = u.session_id \
             GROUP BY u.session_id \
             ORDER BY SUM(u.input + u.output) DESC, u.session_id",
        )
        .map_err(|error| format!("prepare workspace usage read: {error}"))?;
    let sessions = stmt
        .query_map([], |row| {
            Ok(SessionRollup {
                session_id: row.get(0)?,
                title: row.get(1)?,
                total: UsageTotals {
                    input: row.get(2)?,
                    output: row.get(3)?,
                    reasoning: row.get(4)?,
                    cache_read: row.get(5)?,
                    cache_write: row.get(6)?,
                    // SUM over all-NULL costs is NULL — kept as None ("—").
                    cost: row.get(7)?,
                    replies: row.get(8)?,
                },
            })
        })
        .map_err(|error| format!("read workspace usage rows: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read workspace usage rows: {error}"))?;

    let mut total = UsageTotals {
        input: 0,
        output: 0,
        reasoning: 0,
        cache_read: 0,
        cache_write: 0,
        cost: None,
        replies: 0,
    };
    for s in &sessions {
        total.input += s.total.input;
        total.output += s.total.output;
        total.reasoning += s.total.reasoning;
        total.cache_read += s.total.cache_read;
        total.cache_write += s.total.cache_write;
        total.replies += s.total.replies;
        if let Some(cost) = s.total.cost {
            total.cost = Some(total.cost.unwrap_or(0.0) + cost);
        }
    }
    Ok(WorkspaceUsage { sessions, total })
}

/// Open the workspace's science database and ensure the project row every usage
/// row hangs off.
fn open(app: &AppHandle) -> Result<(std::path::PathBuf, Connection, String), String> {
    let root = workspace_dir(app)?;
    let conn = science_store::open(&root)?;
    let project_id = science_store::ensure_project(&conn, &root)?;
    Ok((root, conn, project_id))
}

/// Record (or refresh) one assistant reply's usage.
///
/// `async`: opens SQLite off the UI thread. Best-effort by the caller — a
/// failed record must never break the chat, so the frontend swallows errors.
#[tauri::command(async)]
pub fn usage_record(
    app: AppHandle,
    session_id: String,
    message_id: String,
    usage: UsageInput,
) -> Result<(), String> {
    let (_, conn, project_id) = open(&app)?;
    record(&conn, &project_id, &session_id, &message_id, &usage)
}

#[tauri::command(async)]
pub fn usage_by_session(app: AppHandle, session_id: String) -> Result<SessionUsage, String> {
    let (_, conn, _) = open(&app)?;
    by_session(&conn, &session_id)
}

#[tauri::command(async)]
pub fn usage_by_workspace(app: AppHandle) -> Result<WorkspaceUsage, String> {
    let (_, conn, _) = open(&app)?;
    by_workspace(&conn)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    struct TestWorkspace(PathBuf);

    impl TestWorkspace {
        fn new(tag: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("zerowall-usage-{tag}-{nonce}"));
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

    fn fixture(tag: &str) -> (TestWorkspace, Connection, String) {
        let ws = TestWorkspace::new(tag);
        let conn = science_store::open(ws.path()).unwrap();
        let project = science_store::ensure_project(&conn, ws.path()).unwrap();
        (ws, conn, project)
    }

    fn usage(input: i64, output: i64, cost: Option<f64>) -> UsageInput {
        UsageInput {
            input,
            output,
            reasoning: 0,
            cache_read: 0,
            cache_write: 0,
            cost,
        }
    }

    #[test]
    fn recording_a_reply_stores_its_counts_and_totals() {
        let (ws, conn, project) = fixture("store");
        record(&conn, &project, "ses_1", "m1", &usage(100, 40, Some(0.002))).unwrap();
        let _ = ws;

        let out = by_session(&conn, "ses_1").unwrap();
        assert_eq!(out.replies.len(), 1);
        assert_eq!(out.replies[0].message_id, "m1");
        assert_eq!(out.replies[0].input, 100);
        assert_eq!(out.replies[0].output, 40);
        assert_eq!(out.replies[0].cost, Some(0.002));
        assert_eq!(out.total.input, 100);
        assert_eq!(out.total.output, 40);
        assert_eq!(out.total.cost, Some(0.002));
        assert_eq!(out.total.replies, 1);
    }

    #[test]
    fn restamping_the_same_message_overwrites_rather_than_appends() {
        // The core invariant: OpenCode restamps a streaming reply with growing
        // cumulative totals, so the same message id must update in place.
        let (_ws, conn, project) = fixture("upsert");
        record(&conn, &project, "ses_1", "m1", &usage(50, 10, Some(0.001))).unwrap();
        record(&conn, &project, "ses_1", "m1", &usage(100, 40, Some(0.002))).unwrap();

        let out = by_session(&conn, "ses_1").unwrap();
        assert_eq!(out.replies.len(), 1, "one message is one row");
        assert_eq!(out.replies[0].input, 100, "latest cumulative total wins");
        assert_eq!(out.total.output, 40, "totals never double-count a restamp");
    }

    #[test]
    fn totals_sum_across_replies_and_ignore_unpriced_for_cost() {
        let (_ws, conn, project) = fixture("totals");
        record(&conn, &project, "ses_1", "m1", &usage(100, 40, Some(0.002))).unwrap();
        record(&conn, &project, "ses_1", "m2", &usage(200, 80, None)).unwrap();

        let out = by_session(&conn, "ses_1").unwrap();
        assert_eq!(out.total.input, 300);
        assert_eq!(out.total.output, 120);
        assert_eq!(out.total.replies, 2);
        // One reply was unpriced; the total counts only the priced one.
        assert_eq!(out.total.cost, Some(0.002));
    }

    #[test]
    fn a_session_of_only_unpriced_replies_has_a_null_total_cost() {
        let (_ws, conn, project) = fixture("unpriced");
        record(&conn, &project, "ses_1", "m1", &usage(100, 40, None)).unwrap();
        let out = by_session(&conn, "ses_1").unwrap();
        assert!(out.total.cost.is_none(), "all-unpriced stays null, not 0.0");
    }

    #[test]
    fn usage_is_scoped_per_session() {
        let (_ws, conn, project) = fixture("scope");
        record(&conn, &project, "ses_1", "m1", &usage(100, 40, Some(0.002))).unwrap();
        record(&conn, &project, "ses_2", "m2", &usage(200, 80, Some(0.004))).unwrap();

        let one = by_session(&conn, "ses_1").unwrap();
        assert_eq!(one.replies.len(), 1);
        assert_eq!(one.total.input, 100);
        let empty = by_session(&conn, "ses_none").unwrap();
        assert!(empty.replies.is_empty());
        assert_eq!(empty.total.replies, 0);
        assert!(empty.total.cost.is_none());
    }

    #[test]
    fn an_empty_message_id_is_rejected() {
        let (_ws, conn, project) = fixture("empty-id");
        assert!(record(&conn, &project, "ses_1", "  ", &usage(1, 1, None)).is_err());
    }

    #[test]
    fn replies_come_back_newest_first() {
        let (_ws, conn, project) = fixture("order");
        record(&conn, &project, "ses_1", "m1", &usage(1, 1, None)).unwrap();
        record(&conn, &project, "ses_1", "m2", &usage(2, 2, None)).unwrap();
        let out = by_session(&conn, "ses_1").unwrap();
        // created_at ties (same-ms inserts) fall back to rowid DESC.
        assert_eq!(out.replies[0].message_id, "m2");
        assert_eq!(out.replies[1].message_id, "m1");
    }

    #[test]
    fn workspace_rolls_up_each_session_and_the_grand_total() {
        let (_ws, conn, project) = fixture("ws-rollup");
        // Two replies in ses_1, one in ses_2.
        record(&conn, &project, "ses_1", "m1", &usage(100, 40, Some(0.002))).unwrap();
        record(&conn, &project, "ses_1", "m2", &usage(50, 10, Some(0.001))).unwrap();
        record(&conn, &project, "ses_2", "m3", &usage(200, 80, Some(0.004))).unwrap();

        let out = by_workspace(&conn).unwrap();
        assert_eq!(out.sessions.len(), 2, "one row per session");

        // Per-session rows carry that session's own summed counts and reply count.
        let s1 = out.sessions.iter().find(|s| s.session_id == "ses_1").unwrap();
        assert_eq!(s1.total.input, 150);
        assert_eq!(s1.total.output, 50);
        assert_eq!(s1.total.replies, 2);
        assert_eq!(s1.total.cost, Some(0.003));

        // Grand total sums across every session.
        assert_eq!(out.total.input, 350);
        assert_eq!(out.total.output, 130);
        assert_eq!(out.total.replies, 3);
        assert_eq!(out.total.cost, Some(0.007));
    }

    #[test]
    fn workspace_is_ordered_busiest_first() {
        let (_ws, conn, project) = fixture("ws-order");
        record(&conn, &project, "ses_small", "m1", &usage(10, 5, None)).unwrap();
        record(&conn, &project, "ses_big", "m2", &usage(1000, 500, None)).unwrap();

        let out = by_workspace(&conn).unwrap();
        assert_eq!(out.sessions[0].session_id, "ses_big", "most tokens first");
        assert_eq!(out.sessions[1].session_id, "ses_small");
    }

    #[test]
    fn an_all_unpriced_workspace_has_a_null_total_cost() {
        let (_ws, conn, project) = fixture("ws-unpriced");
        record(&conn, &project, "ses_1", "m1", &usage(100, 40, None)).unwrap();
        record(&conn, &project, "ses_2", "m2", &usage(200, 80, None)).unwrap();

        let out = by_workspace(&conn).unwrap();
        assert!(out.total.cost.is_none(), "all-unpriced stays null, not 0.0");
        assert!(out.sessions.iter().all(|s| s.total.cost.is_none()));
    }

    #[test]
    fn an_empty_workspace_rolls_up_to_nothing() {
        let (_ws, conn, _project) = fixture("ws-empty");
        let out = by_workspace(&conn).unwrap();
        assert!(out.sessions.is_empty());
        assert_eq!(out.total.replies, 0);
        assert_eq!(out.total.input, 0);
        assert!(out.total.cost.is_none());
    }
}
