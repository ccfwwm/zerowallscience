// Persisted review state: reviewer runs, the claims they raise, the checks that
// verify a claim, and the resolution that closes it (M006).
//
// Everything here hangs off `sessions`, which hangs off `projects`, so the row
// creation goes through `science_store::ensure_project` / `ensure_session`
// first — `foreign_keys` is ON and an orphan insert fails outright.
//
// Bodies (`claim_ref`, `evidence_ref`, `details_ref`, `resolution_ref`,
// `summary_ref`) are SHA-256s into the workspace content store, never inline
// text. The state vocabularies are the closed sets M006 CHECKs and
// `packages/shared/src/review-state.ts` both declare.
//
// Mapping from what the UI already has to what M006 stores: the shipping
// ```review``` contract is a list of findings, and a finding is a verdict about
// one assertion. So each finding becomes ONE `claims` row (its title is the
// claim) plus ONE `verification_checks` row (its level is the verdict, its
// evidence the check's evidence). Nothing invents a claim the reviewer did not
// state.
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::AppHandle;

use crate::runtime::workspace_dir;
use crate::science_store::{self, NOW};

/// Mirrors of the M006 CHECK vocabularies (and
/// `packages/shared/src/review-state.ts`). Validated here so a bad value fails
/// with a named error instead of a bare SQLite constraint message.
const RESOLUTION_ACTIONS: [&str; 4] = ["verified", "conditional", "inconclusive", "refuted"];
const VERIFICATION_RESULTS: [&str; 3] = ["ok", "warn", "error"];

/// A reviewer run reaches this store only after the reviewer has spoken — the
/// findings are already in the conversation — so the run is finished by
/// construction. The other three statuses describe a run being watched live,
/// which nothing does yet.
const RUN_STATUS_COMPLETE: &str = "complete";
const CLAIM_OPEN: &str = "open";
const CLAIM_RESOLVED: &str = "resolved";

/// `check_kind` for a finding that names neither a `check` nor a `tag`. The
/// column is free text (no CHECK), and the shipping contract makes both fields
/// optional, so this records "the reviewer checked it" without inventing a
/// category.
const DEFAULT_CHECK_KIND: &str = "review";

/// A resolution recorded from the card is the local user's judgement. The column
/// is free text; this distinguishes it from an agent-written resolution, which
/// nothing produces yet.
const RESOLVED_BY_USER: &str = "user";

/// One finding as the ```review``` block carries it. Field order is fixed
/// because the serialized form is the run's identity (see `run_fingerprint`).
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindingInput {
    pub level: String,
    pub title: String,
    #[serde(default)]
    pub evidence: Option<String>,
    #[serde(default)]
    pub check: Option<String>,
    #[serde(default)]
    pub tag: Option<String>,
    /// Workspace-relative path of the artifact this finding is about. Bound to
    /// that artifact's latest provenance version so the claim draws a graph
    /// edge. Last field and skipped when absent, so a review block written
    /// before this existed serializes — and fingerprints — identically.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_path: Option<String>,
}

/// One persisted finding: the claim row, its current state, and the resolution
/// that most recently closed it (if any).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredFinding {
    pub claim_id: String,
    /// `claims.status` — 'open' or 'resolved'.
    pub status: String,
    /// Action of the newest `resolutions` row, or null when never resolved.
    /// Survives a reopen (see `reopen_claim`), so the card can say what the
    /// last verdict was even while the claim is open again.
    pub resolution: Option<String>,
    /// `resolutions.created_at` of that newest row.
    pub resolved_at: Option<String>,
}

/// A whole persisted reviewer run: its id plus one entry per finding, in the
/// order the findings were given.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredReview {
    pub run_id: String,
    pub findings: Vec<StoredFinding>,
}

/// The canonical JSON body of a run: its findings and note.
///
/// This doubles as the run's identity. `serde_json` emits struct fields in
/// declaration order, so the same block always serializes to the same bytes and
/// therefore the same SHA-256 — which is what lets `ensure_run` recognize a run
/// it already stored instead of duplicating it every time the card mounts.
fn run_body(findings: &[FindingInput], note: Option<&str>) -> Result<String, String> {
    #[derive(serde::Serialize)]
    struct Body<'a> {
        findings: &'a [FindingInput],
        note: Option<&'a str>,
    }
    serde_json::to_string(&Body { findings, note })
        .map_err(|error| format!("serialize review body: {error}"))
}

fn check_kind(finding: &FindingInput) -> String {
    finding
        .check
        .as_deref()
        .or(finding.tag.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CHECK_KIND)
        .to_owned()
}

fn validate(value: &str, allowed: &[&str], what: &str) -> Result<(), String> {
    if allowed.contains(&value) {
        return Ok(());
    }
    Err(format!("unknown {what}: {value:?} (expected one of {allowed:?})"))
}

/// Get-or-create the reviewer run for one ````review``` block, with its claims
/// and their checks, and read the current state back.
///
/// Idempotent on the run's content: `summary_ref` holds the SHA-256 of the
/// canonical body, so a remount of the same card finds the existing run rather
/// than inserting a parallel copy of every claim. An edited or re-run review has
/// a different body and becomes its own run, which is correct — it is a
/// different review.
///
/// The whole insert is one transaction: a run with only some of its claims would
/// read back as a review that lost findings.
pub fn ensure_run(
    conn: &Connection,
    root: &Path,
    project_id: &str,
    session_id: &str,
    findings: &[FindingInput],
    note: Option<&str>,
) -> Result<StoredReview, String> {
    for finding in findings {
        validate(&finding.level, &VERIFICATION_RESULTS, "verification result")?;
    }
    let summary_ref = science_store::put_text(root, &run_body(findings, note)?)?;

    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM reviewer_runs WHERE session_id = ?1 AND summary_ref = ?2",
            params![session_id, &summary_ref],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("look up reviewer run: {error}"))?;

    let run_id = match existing {
        Some(id) => id,
        None => insert_run(conn, root, project_id, session_id, findings, &summary_ref)?,
    };
    read_run(conn, &run_id)
}

fn insert_run(
    conn: &Connection,
    root: &Path,
    project_id: &str,
    session_id: &str,
    findings: &[FindingInput],
    summary_ref: &str,
) -> Result<String, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|error| format!("begin review transaction: {error}"))?;

    science_store::ensure_session(&tx, project_id, session_id, "")?;

    let run_id = science_store::new_id("rrun");
    // `started_at` stays NULL: the block is all we saw, and it only tells us the
    // run had finished. `execution_id` likewise — nothing writes `executions`.
    tx.execute(
        &format!(
            "INSERT INTO reviewer_runs \
             (id, session_id, status, summary_ref, finished_at, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, {NOW}, {NOW}, {NOW})"
        ),
        params![&run_id, session_id, RUN_STATUS_COMPLETE, summary_ref],
    )
    .map_err(|error| format!("insert reviewer run: {error}"))?;

    for finding in findings {
        let claim_id = science_store::new_id("claim");
        let claim_ref = science_store::put_text(root, &finding.title)?;
        // `message_id` stays NULL — nothing writes `messages`. `artifact_version_id`
        // is bound when the finding names an artifact: the bridge projects that
        // file's latest provenance version into an `artifact_versions` row and
        // returns its id, so the claim→artifact `Assesses` edge fires in the
        // research graph. It stays NULL when no path is given or the artifact has
        // no content-addressable version (binary/indirect writes) — never faked.
        let artifact_version_id = match finding
            .artifact_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            Some(path) => {
                science_store::ensure_artifact_version(&tx, root, project_id, path)?
            }
            None => None,
        };
        tx.execute(
            &format!(
                "INSERT INTO claims \
                 (id, reviewer_run_id, claim_ref, artifact_version_id, status, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, {NOW}, {NOW})"
            ),
            params![&claim_id, &run_id, &claim_ref, &artifact_version_id, CLAIM_OPEN],
        )
        .map_err(|error| format!("insert claim: {error}"))?;

        let evidence_ref = match finding.evidence.as_deref().filter(|s| !s.is_empty()) {
            Some(text) => Some(science_store::put_text(root, text)?),
            None => None,
        };
        tx.execute(
            &format!(
                "INSERT INTO verification_checks \
                 (id, claim_id, check_kind, evidence_ref, result, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, {NOW}, {NOW})"
            ),
            params![
                science_store::new_id("vchk"),
                &claim_id,
                check_kind(finding),
                &evidence_ref,
                &finding.level,
            ],
        )
        .map_err(|error| format!("insert verification check: {error}"))?;
    }

    tx.commit()
        .map_err(|error| format!("commit review transaction: {error}"))?;
    Ok(run_id)
}

/// Read one run's claims back in insertion order.
///
/// Ordered by `rowid`, not `created_at`: the whole run is inserted inside one
/// transaction and the timestamp has millisecond resolution, so several claims
/// share an instant. The card maps this list onto its findings by position, so
/// the order has to be exact rather than merely stable.
pub fn read_run(conn: &Connection, run_id: &str) -> Result<StoredReview, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.status, \
                    (SELECT r.action FROM resolutions r WHERE r.claim_id = c.id \
                     ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1), \
                    (SELECT r.created_at FROM resolutions r WHERE r.claim_id = c.id \
                     ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) \
             FROM claims c WHERE c.reviewer_run_id = ?1 ORDER BY c.rowid",
        )
        .map_err(|error| format!("prepare claim read: {error}"))?;
    let findings = stmt
        .query_map(params![run_id], |row| {
            Ok(StoredFinding {
                claim_id: row.get(0)?,
                status: row.get(1)?,
                resolution: row.get(2)?,
                resolved_at: row.get(3)?,
            })
        })
        .map_err(|error| format!("read claims: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read claims: {error}"))?;
    Ok(StoredReview {
        run_id: run_id.to_owned(),
        findings,
    })
}

/// Resolve a claim: append a `resolutions` row and flip `claims.status`.
///
/// The resolution is attached to the claim's newest `verification_check`, which
/// is the verdict the user was looking at when they judged it. `note` becomes
/// `resolution_ref` (a content hash) when the user wrote one.
pub fn resolve_claim(
    conn: &Connection,
    root: &Path,
    claim_id: &str,
    action: &str,
    note: Option<&str>,
) -> Result<StoredReview, String> {
    validate(action, &RESOLUTION_ACTIONS, "resolution action")?;
    let run_id = run_of_claim(conn, claim_id)?;

    let check_id: Option<String> = conn
        .query_row(
            "SELECT id FROM verification_checks WHERE claim_id = ?1 \
             ORDER BY created_at DESC, rowid DESC LIMIT 1",
            params![claim_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("look up verification check: {error}"))?;
    let resolution_ref = match note.map(str::trim).filter(|s| !s.is_empty()) {
        Some(text) => Some(science_store::put_text(root, text)?),
        None => None,
    };

    let tx = conn
        .unchecked_transaction()
        .map_err(|error| format!("begin resolve transaction: {error}"))?;
    tx.execute(
        &format!(
            "INSERT INTO resolutions \
             (id, claim_id, verification_check_id, action, resolution_ref, resolved_by, \
              created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, {NOW}, {NOW})"
        ),
        params![
            science_store::new_id("res"),
            claim_id,
            &check_id,
            action,
            &resolution_ref,
            RESOLVED_BY_USER,
        ],
    )
    .map_err(|error| format!("insert resolution: {error}"))?;
    tx.execute(
        &format!("UPDATE claims SET status = ?1, updated_at = {NOW} WHERE id = ?2"),
        params![CLAIM_RESOLVED, claim_id],
    )
    .map_err(|error| format!("update claim status: {error}"))?;
    tx.commit()
        .map_err(|error| format!("commit resolve transaction: {error}"))?;

    read_run(conn, &run_id)
}

/// Reopen a resolved claim: flip `claims.status` back to 'open' and KEEP every
/// `resolutions` row.
///
/// Why keep them: a resolution records that a person judged this claim, when,
/// and on what evidence. That happened. Deleting the row to make the state
/// "clean" would erase the audit trail this schema exists to hold, and would
/// make a mistaken resolve unauditable — which is precisely the case reopen is
/// for. `resolutions` is therefore append-only here.
///
/// The cost is explicit: after a reopen, an 'open' claim can still have
/// resolution rows, so "a resolutions row exists" is no longer equivalent to
/// status = 'resolved' (M006's comment reads them as one distinction).
/// `claims.status` is the single authority on current state; `resolutions` is
/// history. The alternative — a fifth 'reopened' action — would widen a CHECK
/// vocabulary that is quoted from the reviewer agent's prompt, so it is not on
/// the table.
pub fn reopen_claim(conn: &Connection, claim_id: &str) -> Result<StoredReview, String> {
    let run_id = run_of_claim(conn, claim_id)?;
    conn.execute(
        &format!("UPDATE claims SET status = ?1, updated_at = {NOW} WHERE id = ?2"),
        params![CLAIM_OPEN, claim_id],
    )
    .map_err(|error| format!("reopen claim: {error}"))?;
    read_run(conn, &run_id)
}

/// The run a claim belongs to. An unknown claim is an error, not an empty
/// result: the caller is acting on a row it believes it stored.
fn run_of_claim(conn: &Connection, claim_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT reviewer_run_id FROM claims WHERE id = ?1",
        params![claim_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|error| format!("look up claim: {error}"))?
    .ok_or_else(|| format!("unknown claim: {claim_id}"))
}

/// Open the workspace's science database and ensure the project row every
/// review row ultimately hangs off.
fn open(app: &AppHandle) -> Result<(std::path::PathBuf, Connection, String), String> {
    let root = workspace_dir(app)?;
    let conn = science_store::open(&root)?;
    let project_id = science_store::ensure_project(&conn, &root)?;
    Ok((root, conn, project_id))
}

/// `async`: opens SQLite and writes files — never on the UI thread.
#[tauri::command(async)]
pub fn review_sync(
    app: AppHandle,
    session_id: String,
    findings: Vec<FindingInput>,
    note: Option<String>,
) -> Result<StoredReview, String> {
    let (root, conn, project_id) = open(&app)?;
    ensure_run(
        &conn,
        &root,
        &project_id,
        &session_id,
        &findings,
        note.as_deref(),
    )
}

#[tauri::command(async)]
pub fn review_resolve(
    app: AppHandle,
    claim_id: String,
    action: String,
    note: Option<String>,
) -> Result<StoredReview, String> {
    let (root, conn, _) = open(&app)?;
    resolve_claim(&conn, &root, &claim_id, &action, note.as_deref())
}

#[tauri::command(async)]
pub fn review_reopen(app: AppHandle, claim_id: String) -> Result<StoredReview, String> {
    let (_, conn, _) = open(&app)?;
    reopen_claim(&conn, &claim_id)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    struct TestWorkspace(PathBuf);

    impl TestWorkspace {
        fn new(tag: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("zerowall-review-{tag}-{nonce}"));
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

    /// A workspace with its science DB open and a project row ready — the state
    /// every command sees after `open`.
    fn fixture(tag: &str) -> (TestWorkspace, Connection, String) {
        let ws = TestWorkspace::new(tag);
        let conn = science_store::open(ws.path()).unwrap();
        let project = science_store::ensure_project(&conn, ws.path()).unwrap();
        (ws, conn, project)
    }

    fn finding(level: &str, title: &str, evidence: Option<&str>, check: Option<&str>) -> FindingInput {
        FindingInput {
            level: level.to_owned(),
            title: title.to_owned(),
            evidence: evidence.map(str::to_owned),
            check: check.map(str::to_owned),
            tag: None,
            artifact_path: None,
        }
    }

    fn sample() -> Vec<FindingInput> {
        vec![
            finding("warn", "Duplicate PMID in plan", Some("same PMID twice"), Some("citation")),
            finding("error", "Figure older than its code", None, Some("figure")),
        ]
    }

    #[test]
    fn ensure_run_stores_claims_and_checks_in_findings_order() {
        let (ws, conn, project) = fixture("store");
        let review = ensure_run(&conn, ws.path(), &project, "ses_1", &sample(), Some("note")).unwrap();

        assert_eq!(review.findings.len(), 2);
        assert!(review.findings.iter().all(|f| f.status == "open"));
        assert!(review.findings.iter().all(|f| f.resolution.is_none()));

        // Order is positional — the card maps this list onto its own findings.
        let titles: Vec<String> = review
            .findings
            .iter()
            .map(|f| {
                let claim_ref: String = conn
                    .query_row(
                        "SELECT claim_ref FROM claims WHERE id = ?1",
                        params![&f.claim_id],
                        |row| row.get(0),
                    )
                    .unwrap();
                science_store::read_text(ws.path(), &claim_ref).unwrap()
            })
            .collect();
        assert_eq!(titles, vec!["Duplicate PMID in plan", "Figure older than its code"]);

        // One check per finding, carrying its level and check kind.
        let mut stmt = conn
            .prepare(
                "SELECT v.check_kind, v.result, v.evidence_ref FROM verification_checks v \
                 JOIN claims c ON c.id = v.claim_id WHERE c.reviewer_run_id = ?1 ORDER BY v.rowid",
            )
            .unwrap();
        let checks: Vec<(String, String, Option<String>)> = stmt
            .query_map(params![&review.run_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(checks.len(), 2);
        assert_eq!(checks[0].0, "citation");
        assert_eq!(checks[0].1, "warn");
        assert_eq!(
            science_store::read_text(ws.path(), checks[0].2.as_deref().unwrap()).unwrap(),
            "same PMID twice"
        );
        assert_eq!(checks[1].1, "error");
        assert!(checks[1].2.is_none(), "a finding without evidence stores no ref");

        // The run is finished by construction, and its summary body round-trips.
        let (status, summary): (String, String) = conn
            .query_row(
                "SELECT status, summary_ref FROM reviewer_runs WHERE id = ?1",
                params![&review.run_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "complete");
        assert!(science_store::read_text(ws.path(), &summary).unwrap().contains("\"note\":\"note\""));
    }

    #[test]
    fn ensure_run_is_idempotent_per_block_but_a_changed_block_is_a_new_run() {
        let (ws, conn, project) = fixture("idem");
        let first = ensure_run(&conn, ws.path(), &project, "ses_1", &sample(), None).unwrap();
        let again = ensure_run(&conn, ws.path(), &project, "ses_1", &sample(), None).unwrap();
        assert_eq!(first.run_id, again.run_id, "a remount must not duplicate the run");

        let claims: i64 = conn
            .query_row("SELECT COUNT(*) FROM claims", [], |row| row.get(0))
            .unwrap();
        assert_eq!(claims, 2, "claims must not be inserted twice");

        // A different review body is a different review.
        let mut edited = sample();
        edited.push(finding("ok", "Units check out", None, None));
        let third = ensure_run(&conn, ws.path(), &project, "ses_1", &edited, None).unwrap();
        assert_ne!(third.run_id, first.run_id);
        assert_eq!(third.findings.len(), 3);

        // ...and so is the same body under a different session.
        let other = ensure_run(&conn, ws.path(), &project, "ses_2", &sample(), None).unwrap();
        assert_ne!(other.run_id, first.run_id);
    }

    #[test]
    fn a_finding_without_a_check_falls_back_to_its_tag_then_to_review() {
        let (ws, conn, project) = fixture("kind");
        let tagged = FindingInput {
            level: "warn".into(),
            title: "CRS mismatch".into(),
            evidence: None,
            check: None,
            tag: Some("earth · crs".into()),
            artifact_path: None,
        };
        let bare = finding("ok", "Nothing else to flag", None, None);
        let review = ensure_run(&conn, ws.path(), &project, "ses_1", &[tagged, bare], None).unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT v.check_kind FROM verification_checks v JOIN claims c ON c.id = v.claim_id \
                 WHERE c.reviewer_run_id = ?1 ORDER BY v.rowid",
            )
            .unwrap();
        let kinds: Vec<String> = stmt
            .query_map(params![&review.run_id], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(kinds, vec!["earth · crs", "review"]);
    }

    #[test]
    fn resolving_writes_a_resolution_row_and_flips_the_claim() {
        let (ws, conn, project) = fixture("resolve");
        let review = ensure_run(&conn, ws.path(), &project, "ses_1", &sample(), None).unwrap();
        let claim = review.findings[0].claim_id.clone();

        let after = resolve_claim(&conn, ws.path(), &claim, "verified", Some("checked by hand")).unwrap();
        assert_eq!(after.findings[0].status, "resolved");
        assert_eq!(after.findings[0].resolution.as_deref(), Some("verified"));
        assert!(after.findings[0].resolved_at.is_some());
        assert_eq!(after.findings[1].status, "open", "only the named claim moves");

        // The note is a content hash, and the resolution points at the claim's check.
        let (resolution_ref, check_id, resolved_by): (Option<String>, Option<String>, String) = conn
            .query_row(
                "SELECT resolution_ref, verification_check_id, resolved_by FROM resolutions \
                 WHERE claim_id = ?1",
                params![&claim],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            science_store::read_text(ws.path(), resolution_ref.as_deref().unwrap()).unwrap(),
            "checked by hand"
        );
        assert_eq!(resolved_by, "user");
        let owner: String = conn
            .query_row(
                "SELECT claim_id FROM verification_checks WHERE id = ?1",
                params![check_id.as_deref().unwrap()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(owner, claim, "the resolution must cite this claim's own check");
    }

    #[test]
    fn reopening_keeps_the_resolution_history() {
        let (ws, conn, project) = fixture("reopen");
        let review = ensure_run(&conn, ws.path(), &project, "ses_1", &sample(), None).unwrap();
        let claim = review.findings[0].claim_id.clone();

        resolve_claim(&conn, ws.path(), &claim, "refuted", None).unwrap();
        let after = reopen_claim(&conn, &claim).unwrap();

        assert_eq!(after.findings[0].status, "open");
        // The audit trail survives, and the card can still show the last verdict.
        assert_eq!(after.findings[0].resolution.as_deref(), Some("refuted"));
        let kept: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM resolutions WHERE claim_id = ?1",
                params![&claim],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(kept, 1, "reopen must not delete history");

        // Resolving again appends; the newest row is what is reported.
        let again = resolve_claim(&conn, ws.path(), &claim, "conditional", None).unwrap();
        assert_eq!(again.findings[0].status, "resolved");
        assert_eq!(again.findings[0].resolution.as_deref(), Some("conditional"));
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM resolutions WHERE claim_id = ?1",
                params![&claim],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(total, 2);
    }

    #[test]
    fn state_outside_the_m006_vocabularies_is_rejected() {
        let (ws, conn, project) = fixture("vocab");
        let bad = vec![finding("critical", "Not a level", None, None)];
        let error = ensure_run(&conn, ws.path(), &project, "ses_1", &bad, None).unwrap_err();
        assert!(error.contains("verification result"), "got: {error}");
        let runs: i64 = conn
            .query_row("SELECT COUNT(*) FROM reviewer_runs", [], |row| row.get(0))
            .unwrap();
        assert_eq!(runs, 0, "a rejected block must store nothing");

        let review = ensure_run(&conn, ws.path(), &project, "ses_1", &sample(), None).unwrap();
        let claim = review.findings[0].claim_id.clone();
        let error = resolve_claim(&conn, ws.path(), &claim, "reopened", None).unwrap_err();
        assert!(error.contains("resolution action"), "got: {error}");
        assert_eq!(
            read_run(&conn, &review.run_id).unwrap().findings[0].status,
            "open",
            "a rejected action must not move the claim"
        );
    }

    #[test]
    fn acting_on_an_unknown_claim_fails_loudly() {
        let (ws, conn, _) = fixture("unknown");
        assert!(resolve_claim(&conn, ws.path(), "claim_nope", "verified", None).is_err());
        assert!(reopen_claim(&conn, "claim_nope").is_err());
    }

    #[test]
    fn claims_without_a_cited_artifact_stay_unbound() {
        // `message_id` points at a table nothing writes, so it is always NULL.
        // `artifact_version_id` is only bound when a finding names an artifact;
        // the sample findings name none, so it too stays NULL — never faked.
        let (ws, conn, project) = fixture("nulls");
        let review = ensure_run(&conn, ws.path(), &project, "ses_1", &sample(), None).unwrap();
        let dangling: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM claims WHERE reviewer_run_id = ?1 \
                 AND (message_id IS NOT NULL OR artifact_version_id IS NOT NULL)",
                params![&review.run_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dangling, 0);
    }

    #[test]
    fn a_finding_that_cites_an_artifact_binds_to_its_version() {
        // The evidence-binding path end to end: a recorded provenance version →
        // a claim whose artifact_version_id points at a real artifact_versions
        // row, which is what lights the graph's claim→artifact edge.
        let (ws, conn, project) = fixture("bind");
        crate::provenance::append_record(
            ws.path(),
            "analysis/trend.py",
            "write",
            None,
            None,
            Some("import numpy as np\n".to_owned()),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        let mut f = finding("warn", "Slope not significant", None, Some("number"));
        f.artifact_path = Some("analysis/trend.py".to_owned());
        let review = ensure_run(&conn, ws.path(), &project, "ses_1", &[f], None).unwrap();

        let version_id: Option<String> = conn
            .query_row(
                "SELECT artifact_version_id FROM claims WHERE id = ?1",
                params![&review.findings[0].claim_id],
                |row| row.get(0),
            )
            .unwrap();
        let version_id = version_id.expect("claim should bind to an artifact version");

        // The bound row is a real artifact_versions row for that logical path.
        let logical: String = conn
            .query_row(
                "SELECT a.logical_path FROM artifact_versions v \
                 JOIN artifacts a ON a.id = v.artifact_id WHERE v.id = ?1",
                params![&version_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(logical, "analysis/trend.py");

        // Re-running the same block reuses the version row, not a duplicate.
        let mut f2 = finding("warn", "Slope not significant", None, Some("number"));
        f2.artifact_path = Some("analysis/trend.py".to_owned());
        ensure_run(&conn, ws.path(), &project, "ses_1", &[f2], None).unwrap();
        let versions: i64 = conn
            .query_row("SELECT COUNT(*) FROM artifact_versions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(versions, 1, "the same provenance version maps to one row");
    }
}
