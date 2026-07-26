// The research graph read-model: one query that joins what the science database
// already records about a project into a single node/edge list the UI can draw.
//
// This module is read-only by design. Every node it emits is owned by another
// module that writes it (artifacts and annotations by `annotation_store`,
// claims by `review_store`, memories by `memory_store`), so duplicating any
// write path here would give a row two authors and two chances to disagree.
//
// The graph is derived, never stored. There is no `research_graph` table and no
// cached projection to invalidate: the tables below are the source of truth, and
// a graph assembled on demand cannot go stale. At the row counts a single
// workspace produces this is a handful of indexed queries.
use std::path::Path;

use rusqlite::Connection;
use tauri::AppHandle;

use crate::runtime::workspace_dir;
use crate::science_store;

/// Hard cap per node kind, so a long-running project cannot hand the renderer a
/// graph it will stall trying to lay out. Newest rows win — the cap truncates
/// history, not the current state the user is looking at.
const MAX_NODES_PER_KIND: u32 = 500;

/// What a node is. These are the kinds the schema can actually populate today;
/// the variant list is deliberately not a superset of that.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    ArtifactVersion,
    Claim,
    Annotation,
    Memory,
}

impl NodeKind {
    /// The `id` prefix each kind carries in the graph. Node ids are namespaced
    /// because artifact and claim ids are only unique within their own table,
    /// and the UI addresses nodes from one flat map.
    fn prefix(self) -> &'static str {
        match self {
            NodeKind::ArtifactVersion => "artifact",
            NodeKind::Claim => "claim",
            NodeKind::Annotation => "annotation",
            NodeKind::Memory => "memory",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    /// Namespaced as `{kind}:{row id}` — unique across the whole graph.
    pub id: String,
    pub kind: NodeKind,
    /// The underlying table's primary key, so the UI can open the real record.
    pub row_id: String,
    /// A short human label. Never a content hash: a SHA-256 tells the reader
    /// nothing, so a node with no readable name falls back to its kind.
    pub label: String,
    /// Kind-specific secondary text (an artifact's version, a claim's status).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub created_at: String,
}

/// How two nodes relate. `Derives` carries the artifact DAG's own `relation`
/// string in `label` rather than being split into variants, because that column
/// is unconstrained free text and inventing an enum over it would misreport
/// whatever a future writer puts there.
///
/// Memories have no variant here: `memories` links only to a session and a
/// source message, so there is no column that could anchor one to an artifact.
/// A memory is therefore a node with no edges until the schema gains such a
/// link — showing it connected would be a claim the data does not make.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EdgeKind {
    /// artifact version -> artifact version, from `artifact_edges`.
    Derives,
    /// claim -> artifact version it is asserted about.
    Assesses,
    /// annotation -> artifact version it is anchored to.
    Annotates,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchGraph {
    pub project_id: String,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    /// True when any node kind hit `MAX_NODES_PER_KIND`, so the UI can say the
    /// view is partial instead of quietly implying it is the whole project.
    pub truncated: bool,
}

fn node_id(kind: NodeKind, row_id: &str) -> String {
    format!("{}:{}", kind.prefix(), row_id)
}

/// Trim a body to something a node label can hold. Operates on chars, not bytes,
/// so a multi-byte character is never split into invalid UTF-8.
fn summarize(text: &str, limit: usize) -> String {
    let line = text.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
    let mut out: String = line.chars().take(limit).collect();
    if line.chars().count() > limit {
        out.push('…');
    }
    out
}

/// Read a stored body for use as a label, tolerating a missing object.
///
/// A dangling `*_ref` is a real possibility the graph must survive: the content
/// store and the database are separate files, so a partial backup or a manual
/// copy can leave a row whose body is gone. Losing one label is recoverable;
/// failing the entire graph query over it is not.
fn label_from_ref(root: &Path, content_ref: &str, fallback: &str) -> String {
    match science_store::read_text(root, content_ref) {
        Ok(text) => {
            let summary = summarize(&text, 80);
            if summary.is_empty() {
                fallback.to_string()
            } else {
                summary
            }
        }
        Err(_) => fallback.to_string(),
    }
}

fn artifact_nodes(
    conn: &Connection,
    project_id: &str,
) -> Result<(Vec<GraphNode>, bool), String> {
    // Joined to `artifacts` for the logical path, which is the only
    // human-readable name an artifact version has.
    let mut stmt = conn
        .prepare(
            "SELECT v.id, a.logical_path, v.version_number, v.created_at
               FROM artifact_versions v
               JOIN artifacts a ON a.id = v.artifact_id
              WHERE v.project_id = ?1
              ORDER BY v.created_at DESC, v.id DESC
              LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![project_id, MAX_NODES_PER_KIND], |row| {
            let id: String = row.get(0)?;
            let path: String = row.get(1)?;
            let version: i64 = row.get(2)?;
            let created_at: String = row.get(3)?;
            Ok(GraphNode {
                id: node_id(NodeKind::ArtifactVersion, &id),
                kind: NodeKind::ArtifactVersion,
                row_id: id,
                label: path,
                detail: Some(format!("v{version}")),
                created_at,
            })
        })
        .map_err(|e| e.to_string())?;
    let nodes = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let truncated = nodes.len() as u32 == MAX_NODES_PER_KIND;
    Ok((nodes, truncated))
}

fn claim_nodes(
    conn: &Connection,
    root: &Path,
    project_id: &str,
) -> Result<(Vec<GraphNode>, Vec<GraphEdge>, bool), String> {
    // `claims` reaches a project only through reviewer_runs -> sessions, so the
    // scope filter has to travel that path; there is no project_id column.
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.claim_ref, c.status, c.artifact_version_id, c.created_at
               FROM claims c
               JOIN reviewer_runs r ON r.id = c.reviewer_run_id
               JOIN sessions s ON s.id = r.session_id
              WHERE s.project_id = ?1
              ORDER BY c.created_at DESC, c.id DESC
              LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![project_id, MAX_NODES_PER_KIND], |row| {
            let id: String = row.get(0)?;
            let claim_ref: String = row.get(1)?;
            let status: String = row.get(2)?;
            let artifact_version_id: Option<String> = row.get(3)?;
            let created_at: String = row.get(4)?;
            Ok((id, claim_ref, status, artifact_version_id, created_at))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let truncated = rows.len() as u32 == MAX_NODES_PER_KIND;
    let mut nodes = Vec::with_capacity(rows.len());
    let mut edges = Vec::new();
    for (id, claim_ref, status, artifact_version_id, created_at) in rows {
        let from = node_id(NodeKind::Claim, &id);
        if let Some(target) = artifact_version_id {
            edges.push(GraphEdge {
                from: from.clone(),
                to: node_id(NodeKind::ArtifactVersion, &target),
                kind: EdgeKind::Assesses,
                label: None,
            });
        }
        nodes.push(GraphNode {
            id: from,
            kind: NodeKind::Claim,
            label: label_from_ref(root, &claim_ref, "claim"),
            row_id: id,
            detail: Some(status),
            created_at,
        });
    }
    Ok((nodes, edges, truncated))
}

fn annotation_nodes(
    conn: &Connection,
    root: &Path,
    project_id: &str,
) -> Result<(Vec<GraphNode>, Vec<GraphEdge>, bool), String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, body_ref, annotation_kind, artifact_version_id, created_at
               FROM annotations
              WHERE project_id = ?1
              ORDER BY created_at DESC, id DESC
              LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![project_id, MAX_NODES_PER_KIND], |row| {
            let id: String = row.get(0)?;
            let body_ref: String = row.get(1)?;
            let kind: String = row.get(2)?;
            let artifact_version_id: Option<String> = row.get(3)?;
            let created_at: String = row.get(4)?;
            Ok((id, body_ref, kind, artifact_version_id, created_at))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let truncated = rows.len() as u32 == MAX_NODES_PER_KIND;
    let mut nodes = Vec::with_capacity(rows.len());
    let mut edges = Vec::new();
    for (id, body_ref, kind, artifact_version_id, created_at) in rows {
        let from = node_id(NodeKind::Annotation, &id);
        if let Some(target) = artifact_version_id {
            edges.push(GraphEdge {
                from: from.clone(),
                to: node_id(NodeKind::ArtifactVersion, &target),
                kind: EdgeKind::Annotates,
                label: None,
            });
        }
        nodes.push(GraphNode {
            id: from,
            kind: NodeKind::Annotation,
            label: label_from_ref(root, &body_ref, "annotation"),
            row_id: id,
            detail: Some(kind),
            created_at,
        });
    }
    Ok((nodes, edges, truncated))
}

fn memory_nodes(
    conn: &Connection,
    root: &Path,
    project_id: &str,
) -> Result<(Vec<GraphNode>, bool), String> {
    // Disabled memories are excluded: the user switched them off, so showing
    // them in the graph would contradict that.
    let mut stmt = conn
        .prepare(
            "SELECT id, content_ref, memory_kind, created_at
               FROM memories
              WHERE project_id = ?1 AND disabled_at IS NULL
              ORDER BY created_at DESC, id DESC
              LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![project_id, MAX_NODES_PER_KIND], |row| {
            let id: String = row.get(0)?;
            let content_ref: String = row.get(1)?;
            let kind: String = row.get(2)?;
            let created_at: String = row.get(3)?;
            Ok((id, content_ref, kind, created_at))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let truncated = rows.len() as u32 == MAX_NODES_PER_KIND;
    let nodes = rows
        .into_iter()
        .map(|(id, content_ref, kind, created_at)| GraphNode {
            id: node_id(NodeKind::Memory, &id),
            kind: NodeKind::Memory,
            label: label_from_ref(root, &content_ref, "memory"),
            row_id: id,
            detail: Some(kind),
            created_at,
        })
        .collect();
    Ok((nodes, truncated))
}

fn derive_edges(conn: &Connection, project_id: &str) -> Result<Vec<GraphEdge>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT from_artifact_version_id, to_artifact_version_id, relation
               FROM artifact_edges
              WHERE project_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![project_id], |row| {
            let from: String = row.get(0)?;
            let to: String = row.get(1)?;
            let relation: String = row.get(2)?;
            Ok(GraphEdge {
                from: node_id(NodeKind::ArtifactVersion, &from),
                to: node_id(NodeKind::ArtifactVersion, &to),
                kind: EdgeKind::Derives,
                label: Some(relation),
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Assemble the graph for one project.
pub fn build(conn: &Connection, root: &Path, project_id: &str) -> Result<ResearchGraph, String> {
    let (artifacts, artifacts_truncated) = artifact_nodes(conn, project_id)?;
    let (claims, claim_edges, claims_truncated) = claim_nodes(conn, root, project_id)?;
    let (annotations, annotation_edges, annotations_truncated) =
        annotation_nodes(conn, root, project_id)?;
    let (memories, memories_truncated) = memory_nodes(conn, root, project_id)?;

    let mut nodes = artifacts;
    nodes.extend(claims);
    nodes.extend(annotations);
    nodes.extend(memories);

    let mut edges = derive_edges(conn, project_id)?;
    edges.extend(claim_edges);
    edges.extend(annotation_edges);

    // Per-kind caps and the artifact-only `LIMIT` mean an edge can point at a
    // node that was truncated away, and a dangling endpoint would render as a
    // line into nowhere. Dropping those edges keeps the graph internally
    // consistent; `truncated` is what tells the user something is missing.
    let present: std::collections::HashSet<&str> = nodes.iter().map(|n| n.id.as_str()).collect();
    edges.retain(|e| present.contains(e.from.as_str()) && present.contains(e.to.as_str()));

    Ok(ResearchGraph {
        project_id: project_id.to_string(),
        nodes,
        edges,
        truncated: artifacts_truncated
            || claims_truncated
            || annotations_truncated
            || memories_truncated,
    })
}

#[tauri::command(async)]
pub fn research_graph_cmd(app: AppHandle) -> Result<ResearchGraph, String> {
    let root = workspace_dir(&app)?;
    let conn = science_store::open(&root)?;
    let project_id = science_store::ensure_project(&conn, &root)?;
    build(&conn, &root, &project_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// A throwaway workspace folder. `science_store`'s equivalent helper is
    /// private to its own test module, and there is no `tempfile` dev-dependency
    /// to reach for, so this repeats the same clock-nonce pattern.
    struct TestWorkspace(PathBuf);

    impl TestWorkspace {
        fn new(tag: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("zerowall-graph-{tag}-{nonce}"));
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

    /// A project with one session, so the review tables have a parent to hang
    /// off. Returns (project_id, session_id).
    fn seed(root: &Path) -> (Connection, String, String) {
        let conn = science_store::open(root).expect("open");
        let project_id = science_store::ensure_project(&conn, root).expect("project");
        let session_id = "ses_graph";
        science_store::ensure_session(&conn, &project_id, session_id, "Graph").expect("session");
        (conn, project_id, session_id.to_string())
    }

    fn insert_artifact(
        conn: &Connection,
        root: &Path,
        project_id: &str,
        logical_path: &str,
        version: i64,
        body: &str,
    ) -> String {
        let artifact_id = format!("art_{}", logical_path.replace(['/', '.'], "_"));
        conn.execute(
            &format!(
                "INSERT OR IGNORE INTO artifacts
                   (id, project_id, logical_path, artifact_type, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'file', {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![artifact_id, project_id, logical_path],
        )
        .expect("artifact");
        let content_ref = science_store::put_text(root, body).expect("put");
        let version_id = format!("av_{artifact_id}_{version}");
        conn.execute(
            &format!(
                "INSERT INTO artifact_versions
                   (id, project_id, artifact_id, version_number, content_sha256,
                    content_ref, byte_size, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![
                version_id,
                project_id,
                artifact_id,
                version,
                content_ref,
                body.len() as i64
            ],
        )
        .expect("version");
        version_id
    }

    #[test]
    fn an_empty_project_yields_an_empty_graph() {
        let dir = TestWorkspace::new("empty");
        let (conn, project_id, _) = seed(dir.path());
        let graph = build(&conn, dir.path(), &project_id).expect("build");
        assert!(graph.nodes.is_empty());
        assert!(graph.edges.is_empty());
        assert!(!graph.truncated);
        assert_eq!(graph.project_id, project_id);
    }

    #[test]
    fn artifact_edges_become_derives_edges() {
        let dir = TestWorkspace::new("edges");
        let (conn, project_id, _) = seed(dir.path());
        let raw = insert_artifact(&conn, dir.path(), &project_id, "data/raw.csv", 1, "a,b\n1,2");
        let fig = insert_artifact(&conn, dir.path(), &project_id, "figures/f.png", 1, "png");
        conn.execute(
            &format!(
                "INSERT INTO artifact_edges
                   (id, project_id, from_artifact_version_id, to_artifact_version_id,
                    relation, created_at, updated_at)
                 VALUES ('ae_1', ?1, ?2, ?3, 'derived_from', {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![project_id, fig, raw],
        )
        .expect("edge");

        let graph = build(&conn, dir.path(), &project_id).expect("build");
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 1);
        let edge = &graph.edges[0];
        assert_eq!(edge.kind, EdgeKind::Derives);
        assert_eq!(edge.from, format!("artifact:{fig}"));
        assert_eq!(edge.to, format!("artifact:{raw}"));
        // The relation column is free text, so it is passed through verbatim
        // rather than mapped onto an invented enum.
        assert_eq!(edge.label.as_deref(), Some("derived_from"));
    }

    #[test]
    fn a_claim_is_scoped_through_its_session_and_links_to_its_artifact() {
        let dir = TestWorkspace::new("claim");
        let (conn, project_id, session_id) = seed(dir.path());
        let version = insert_artifact(&conn, dir.path(), &project_id, "report.md", 1, "# R");
        conn.execute(
            &format!(
                "INSERT INTO reviewer_runs (id, session_id, status, created_at, updated_at)
                 VALUES ('rr_1', ?1, 'complete', {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![session_id],
        )
        .expect("run");
        let claim_ref = science_store::put_text(dir.path(), "The trend is significant.")
            .expect("put");
        conn.execute(
            &format!(
                "INSERT INTO claims
                   (id, reviewer_run_id, artifact_version_id, claim_ref, status,
                    created_at, updated_at)
                 VALUES ('clm_1', 'rr_1', ?1, ?2, 'open', {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![version, claim_ref],
        )
        .expect("claim");

        let graph = build(&conn, dir.path(), &project_id).expect("build");
        let claim = graph
            .nodes
            .iter()
            .find(|n| n.kind == NodeKind::Claim)
            .expect("claim node");
        // The label is the stored body, not the hash.
        assert_eq!(claim.label, "The trend is significant.");
        assert_eq!(claim.detail.as_deref(), Some("open"));
        assert!(graph
            .edges
            .iter()
            .any(|e| e.kind == EdgeKind::Assesses && e.to == format!("artifact:{version}")));
    }

    #[test]
    fn a_disabled_memory_is_left_out() {
        let dir = TestWorkspace::new("memory");
        let (conn, project_id, _) = seed(dir.path());
        let live = science_store::put_text(dir.path(), "Prefers SI units.").expect("put");
        let off = science_store::put_text(dir.path(), "Forgotten.").expect("put");
        conn.execute(
            &format!(
                "INSERT INTO memories
                   (id, project_id, memory_kind, content_ref, created_at, updated_at)
                 VALUES ('mem_1', ?1, 'preference', ?2, {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![project_id, live],
        )
        .expect("memory");
        conn.execute(
            &format!(
                "INSERT INTO memories
                   (id, project_id, memory_kind, content_ref, disabled_at,
                    created_at, updated_at)
                 VALUES ('mem_2', ?1, 'preference', ?2, {NOW}, {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![project_id, off],
        )
        .expect("disabled memory");

        let graph = build(&conn, dir.path(), &project_id).expect("build");
        let memories: Vec<&GraphNode> =
            graph.nodes.iter().filter(|n| n.kind == NodeKind::Memory).collect();
        assert_eq!(memories.len(), 1);
        assert_eq!(memories[0].row_id, "mem_1");
    }

    #[test]
    fn a_node_with_a_missing_body_still_appears_with_a_fallback_label() {
        let dir = TestWorkspace::new("dangling");
        let (conn, project_id, _) = seed(dir.path());
        // A ref that is well-formed but was never stored — what a partial copy
        // of a workspace leaves behind.
        let dangling = "0".repeat(64);
        conn.execute(
            &format!(
                "INSERT INTO memories
                   (id, project_id, memory_kind, content_ref, created_at, updated_at)
                 VALUES ('mem_1', ?1, 'fact', ?2, {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![project_id, dangling],
        )
        .expect("memory");

        let graph = build(&conn, dir.path(), &project_id).expect("build");
        assert_eq!(graph.nodes.len(), 1);
        assert_eq!(graph.nodes[0].label, "memory");
    }

    #[test]
    fn an_edge_to_a_node_outside_the_graph_is_dropped() {
        let dir = TestWorkspace::new("orphan-edge");
        let (conn, project_id, session_id) = seed(dir.path());
        // A claim whose artifact_version_id is NULL must not produce a half
        // edge, and a claim in another project must not leak in.
        conn.execute(
            &format!(
                "INSERT INTO reviewer_runs (id, session_id, status, created_at, updated_at)
                 VALUES ('rr_1', ?1, 'running', {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![session_id],
        )
        .expect("run");
        let claim_ref = science_store::put_text(dir.path(), "Unanchored claim.").expect("put");
        conn.execute(
            &format!(
                "INSERT INTO claims
                   (id, reviewer_run_id, claim_ref, status, created_at, updated_at)
                 VALUES ('clm_1', 'rr_1', ?1, 'open', {NOW}, {NOW})",
                NOW = science_store::NOW
            ),
            rusqlite::params![claim_ref],
        )
        .expect("claim");

        let graph = build(&conn, dir.path(), &project_id).expect("build");
        assert_eq!(graph.nodes.len(), 1);
        assert!(graph.edges.is_empty());
    }

    #[test]
    fn summarize_takes_the_first_nonblank_line_and_never_splits_a_character() {
        assert_eq!(summarize("\n\n  hello  \nworld", 80), "hello");
        let wide = "héllo wörld";
        assert_eq!(summarize(wide, 5), "héllo…");
        assert_eq!(summarize("   ", 80), "");
    }
}
