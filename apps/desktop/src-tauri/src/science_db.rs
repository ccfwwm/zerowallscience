//! Durable, versioned science data for one workspace.
//!
//! This database is deliberately separate from `runs.db`: runs are a disposable
//! read model, while `science.db` is migrated in place and stores durable
//! relationships. Large content lives in the content-addressed workspace store;
//! these tables only retain references and hashes.

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

const DATABASE_FILE: &str = "science.db";
const BUSY_TIMEOUT_MS: u64 = 5_000;

#[derive(Clone, Copy)]
struct Migration {
    id: &'static str,
    version: i64,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        id: "M000",
        version: 0,
        sql: include_str!("../migrations/M000__metadata.sql"),
    },
    Migration {
        id: "M001",
        version: 1,
        sql: include_str!("../migrations/M001__projects_sessions.sql"),
    },
    Migration {
        id: "M002",
        version: 2,
        sql: include_str!("../migrations/M002__artifacts_provenance.sql"),
    },
    Migration {
        id: "M003",
        version: 3,
        sql: include_str!("../migrations/M003__security_approvals.sql"),
    },
    Migration {
        id: "M004",
        version: 4,
        sql: include_str!("../migrations/M004__agents_catalog.sql"),
    },
    Migration {
        id: "M005",
        version: 5,
        sql: include_str!("../migrations/M005__memory_annotations.sql"),
    },
    Migration {
        id: "M006",
        version: 6,
        sql: include_str!("../migrations/M006__review.sql"),
    },
    Migration {
        id: "M007",
        version: 7,
        sql: include_str!("../migrations/M007__queue_scheduling.sql"),
    },
    Migration {
        id: "M008",
        version: 8,
        sql: include_str!("../migrations/M008__compute_egress.sql"),
    },
];

const REQUIRED_TABLES: &[&str] = &[
    "agents",
    "annotations",
    "approval_decisions",
    "artifact_edges",
    "artifact_versions",
    "artifacts",
    "assignments",
    "claims",
    "compaction_archives",
    "compute_jobs",
    "compute_providers",
    "compute_usage",
    "content_snapshots",
    "egress_policies",
    "events",
    "executions",
    "leases",
    "managed_endpoints",
    "marketplace_sources",
    "mcp_resources",
    "mcp_servers",
    "memories",
    "message_queue",
    "messages",
    "projects",
    "provenance_refs",
    "read_marks",
    "resolutions",
    "resource_grants",
    "reviewer_runs",
    "routine_schedules",
    "schema_metadata",
    "schema_migrations",
    "secret_refs",
    "session_concurrency",
    "sessions",
    "skills",
    "termination_queue",
    "tool_policies",
    "verification_checks",
];

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScienceDbStatus {
    pub version: i64,
    pub applied_migration_ids: Vec<String>,
    pub table_count: u32,
}

fn metadata_is_link_or_reparse_point(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}

fn require_plain_directory(path: &Path, label: &str) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("inspect {label} {}: {error}", path.display()))?;
    if !metadata.is_dir() || metadata_is_link_or_reparse_point(&metadata) {
        return Err(format!(
            "{label} must be a directory and cannot be a link or reparse point: {}",
            path.display()
        ));
    }
    Ok(())
}

fn validate_workspace_store(root: &Path, create: bool) -> Result<PathBuf, String> {
    require_plain_directory(root, "workspace root")?;
    let store = root.join(".zerowall");
    match std::fs::symlink_metadata(&store) {
        Ok(_) => require_plain_directory(&store, "workspace metadata directory")?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && create => {
            std::fs::create_dir(&store).map_err(|error| {
                format!(
                    "create workspace metadata directory {}: {error}",
                    store.display()
                )
            })?;
            require_plain_directory(&store, "workspace metadata directory")?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "inspect workspace metadata directory {}: {error}",
                store.display()
            ))
        }
    }
    Ok(store)
}

/// Open the durable per-workspace science database and apply all migrations.
pub fn open_science_db(root: &Path) -> Result<Connection, String> {
    let path = validate_workspace_store(root, true)?.join(DATABASE_FILE);

    let mut conn = Connection::open(&path)
        .map_err(|error| format!("open science database {}: {error}", path.display()))?;
    configure_connection(&conn)?;
    apply_migrations(&mut conn, MIGRATIONS)?;
    verify_schema_state(&conn)?;
    Ok(conn)
}

fn configure_connection(conn: &Connection) -> Result<(), String> {
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("enable science database foreign keys: {error}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| format!("enable science database WAL: {error}"))?;
    conn.busy_timeout(Duration::from_millis(BUSY_TIMEOUT_MS))
        .map_err(|error| format!("set science database busy timeout: {error}"))?;
    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?1",
        params![name],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
    .map_err(|error| format!("inspect science database schema: {error}"))
}

fn migration_is_applied(conn: &Connection, migration: Migration) -> Result<bool, String> {
    if !table_exists(conn, "schema_migrations")? {
        return Ok(false);
    }
    let recorded: Option<(i64, String)> = conn
        .query_row(
            "SELECT version, sql_checksum FROM schema_migrations WHERE id = ?1",
            params![migration.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| format!("read migration {}: {error}", migration.id))?;
    match recorded {
        Some((version, checksum))
            if version == migration.version && checksum == sql_checksum(migration.sql) =>
        {
            Ok(true)
        }
        Some((version, checksum)) if version == migration.version => Err(format!(
            "migration {} checksum is {checksum}, expected {}",
            migration.id,
            sql_checksum(migration.sql)
        )),
        Some((version, _)) => Err(format!(
            "migration {} has version {version}, expected {}",
            migration.id, migration.version
        )),
        None => Ok(false),
    }
}

fn sql_checksum(sql: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in sql.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("fnv1a64:{hash:016x}")
}

fn current_version(conn: &Connection) -> Result<Option<i64>, String> {
    if !table_exists(conn, "schema_metadata")? {
        return Ok(None);
    }
    conn.query_row(
        "SELECT current_version FROM schema_metadata WHERE singleton = 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(|error| format!("read science database version: {error}"))
}

fn apply_migrations(conn: &mut Connection, migrations: &[Migration]) -> Result<(), String> {
    for migration in migrations {
        if migration_is_applied(conn, *migration)? {
            continue;
        }

        let expected_previous = migration.version - 1;
        let actual_previous = current_version(conn)?.unwrap_or(-1);
        if actual_previous != expected_previous {
            return Err(format!(
                "cannot apply {}: current version is {actual_previous}, expected {expected_previous}",
                migration.id
            ));
        }

        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("begin migration {}: {error}", migration.id))?;
        tx.execute_batch(migration.sql)
            .map_err(|error| format!("apply migration {}: {error}", migration.id))?;
        tx.execute(
            "INSERT INTO schema_migrations (id, version, sql_checksum, applied_at) \
             VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![migration.id, migration.version, sql_checksum(migration.sql)],
        )
        .map_err(|error| format!("record migration {}: {error}", migration.id))?;
        tx.execute(
            "INSERT INTO schema_metadata \
                 (singleton, current_version, created_at, updated_at) \
             VALUES (1, ?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
             ON CONFLICT(singleton) DO UPDATE SET \
                 current_version = excluded.current_version, \
                 updated_at = excluded.updated_at",
            params![migration.version],
        )
        .map_err(|error| format!("advance migration {} metadata: {error}", migration.id))?;
        tx.commit()
            .map_err(|error| format!("commit migration {}: {error}", migration.id))?;
    }
    Ok(())
}

fn verify_schema_state(conn: &Connection) -> Result<(), String> {
    let expected_version = MIGRATIONS
        .last()
        .map(|migration| migration.version)
        .ok_or_else(|| "science database has no migrations".to_owned())?;
    let actual_version = current_version(conn)?
        .ok_or_else(|| "science database metadata is missing".to_owned())?;
    if actual_version != expected_version {
        return Err(format!(
            "science database current version is {actual_version}, expected {expected_version}"
        ));
    }

    let recorded_count = conn
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get::<_, usize>(0)
        })
        .map_err(|error| format!("count science database migrations: {error}"))?;
    if recorded_count != MIGRATIONS.len() {
        return Err(format!(
            "science database has {recorded_count} migration records, expected {}",
            MIGRATIONS.len()
        ));
    }

    for table in REQUIRED_TABLES {
        if !table_exists(conn, table)? {
            return Err(format!("science database required table is missing: {table}"));
        }
    }

    Ok(())
}

/// Open the database if necessary and return its migration state.
pub fn science_db_status(root: &Path) -> Result<ScienceDbStatus, String> {
    let conn = open_science_db(root)?;
    let version =
        current_version(&conn)?.ok_or_else(|| "science database metadata is missing".to_owned())?;
    let applied_migration_ids = {
        let mut stmt = conn
            .prepare("SELECT id FROM schema_migrations ORDER BY version")
            .map_err(|error| format!("prepare migration status query: {error}"))?;
        let ids = stmt
            .query_map([], |row| row.get(0))
            .map_err(|error| format!("query migration status: {error}"))?
            .collect::<Result<Vec<String>, _>>()
            .map_err(|error| format!("read migration status: {error}"))?;
        ids
    };
    let table_count = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_schema \
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            [],
            |row| row.get::<_, u32>(0),
        )
        .map_err(|error| format!("count science database tables: {error}"))?;
    Ok(ScienceDbStatus {
        version,
        applied_migration_ids,
        table_count,
    })
}

/// Resolve a SHA-256 object location without allowing user-controlled path parts.
pub fn content_store_path(root: &Path, sha256: &str) -> Result<PathBuf, String> {
    if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("content hash must be exactly 64 hexadecimal characters".to_owned());
    }
    validate_workspace_store(root, false)?;
    let normalized = sha256.to_ascii_lowercase();
    Ok(root
        .join(".zerowall")
        .join("store")
        .join("sha256")
        .join(&normalized[..2])
        .join(normalized))
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use rusqlite::Connection;

    use super::*;

    struct TestWorkspace(PathBuf);

    impl TestWorkspace {
        fn new(tag: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "zerowall-science-db-{tag}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&root).unwrap();
            Self(root)
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

    fn table_names(conn: &Connection) -> BTreeSet<String> {
        let mut stmt = conn
            .prepare(
                "SELECT name FROM sqlite_schema \
                 WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .unwrap();
        stmt.query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    fn insert_project_and_session(conn: &Connection, project_id: &str, session_id: &str) {
        conn.execute(
            "INSERT INTO projects \
             (id, name, workspace_path, status, created_at, updated_at) \
             VALUES (?1, ?1, ?2, 'active', 'now', 'now')",
            params![project_id, format!("/workspace/{project_id}")],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions \
             (id, project_id, title, status, created_at, updated_at) \
             VALUES (?1, ?2, ?1, 'active', 'now', 'now')",
            params![session_id, project_id],
        )
        .unwrap();
    }

    #[test]
    fn new_database_reaches_version_eight_with_the_complete_table_set() {
        let workspace = TestWorkspace::new("fresh");
        let conn = open_science_db(workspace.path()).unwrap();

        let status = science_db_status(workspace.path()).unwrap();
        assert_eq!(status.version, 8);
        assert_eq!(
            status.applied_migration_ids,
            (0..=8).map(|n| format!("M{n:03}")).collect::<Vec<_>>()
        );
        assert_eq!(status.table_count, REQUIRED_TABLES.len() as u32);
        assert_eq!(
            table_names(&conn),
            REQUIRED_TABLES
                .iter()
                .map(|name| (*name).to_owned())
                .collect()
        );
        assert!(workspace.path().join(".zerowall/science.db").is_file());

        let foreign_keys: i64 = conn
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        let journal_mode: String = conn
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .unwrap();
        let busy_timeout: i64 = conn
            .pragma_query_value(None, "busy_timeout", |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);
        assert_eq!(journal_mode.to_ascii_lowercase(), "wal");
        assert_eq!(busy_timeout, 5_000);
    }

    #[test]
    fn repeated_open_does_not_reapply_migrations() {
        let workspace = TestWorkspace::new("idempotent");
        let first = open_science_db(workspace.path()).unwrap();
        let applied_before: Vec<(String, String)> = {
            let mut stmt = first
                .prepare("SELECT id, applied_at FROM schema_migrations ORDER BY version")
                .unwrap();
            stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };
        drop(first);

        let second = open_science_db(workspace.path()).unwrap();
        let mut stmt = second
            .prepare("SELECT id, applied_at FROM schema_migrations ORDER BY version")
            .unwrap();
        let applied_after: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(applied_after, applied_before);
        assert_eq!(applied_after.len(), 9);
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let workspace = TestWorkspace::new("foreign-key");
        let conn = open_science_db(workspace.path()).unwrap();

        let error = conn
            .execute(
                "INSERT INTO sessions \
                 (id, project_id, title, status, created_at, updated_at) \
                 VALUES ('session-1', 'missing-project', 'Test', 'active', 'now', 'now')",
                [],
            )
            .unwrap_err();
        assert!(error.to_string().contains("FOREIGN KEY constraint failed"));
    }

    #[test]
    fn failed_migration_rolls_back_and_does_not_advance_metadata() {
        let mut conn = Connection::open_in_memory().unwrap();
        configure_connection(&conn).unwrap();
        apply_migrations(&mut conn, &MIGRATIONS[..1]).unwrap();

        let broken = Migration {
            id: "M001",
            version: 1,
            sql: "CREATE TABLE should_roll_back (id TEXT PRIMARY KEY); INVALID SQL;",
        };
        assert!(apply_migrations(&mut conn, &[broken]).is_err());

        let version: i64 = conn
            .query_row(
                "SELECT current_version FROM schema_metadata WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let migration_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(version, 0);
        assert_eq!(migration_count, 1);
        assert!(!table_names(&conn).contains("should_roll_back"));
    }

    #[test]
    fn changed_migration_sql_is_rejected_after_it_was_applied() {
        let mut conn = Connection::open_in_memory().unwrap();
        configure_connection(&conn).unwrap();
        apply_migrations(&mut conn, &MIGRATIONS[..1]).unwrap();

        let changed = Migration {
            id: "M000",
            version: 0,
            sql: "CREATE TABLE unexpected (id TEXT PRIMARY KEY);",
        };
        let error = apply_migrations(&mut conn, &[changed]).unwrap_err();
        assert!(error.contains("checksum"), "{error}");
        assert!(!table_names(&conn).contains("unexpected"));
    }

    #[test]
    fn reopening_rejects_metadata_version_drift() {
        let workspace = TestWorkspace::new("metadata-drift");
        let conn = open_science_db(workspace.path()).unwrap();
        conn.execute(
            "UPDATE schema_metadata SET current_version = 7 WHERE singleton = 1",
            [],
        )
        .unwrap();
        drop(conn);

        let error = open_science_db(workspace.path()).unwrap_err();
        assert!(error.contains("current version"), "{error}");
    }

    #[test]
    fn reopening_rejects_a_missing_migrated_table() {
        let workspace = TestWorkspace::new("missing-table");
        let conn = open_science_db(workspace.path()).unwrap();
        conn.execute_batch("DROP TABLE claims").unwrap();
        drop(conn);

        let error = open_science_db(workspace.path()).unwrap_err();
        assert!(error.contains("claims"), "{error}");
    }

    #[test]
    fn secret_references_cannot_store_secret_material() {
        let workspace = TestWorkspace::new("secret-columns");
        let conn = open_science_db(workspace.path()).unwrap();
        let mut stmt = conn.prepare("PRAGMA table_info(secret_refs)").unwrap();
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();

        assert_eq!(
            columns,
            [
                "id",
                "tenant_id",
                "provider",
                "key_name",
                "keychain_service",
                "keychain_account",
                "created_at",
                "updated_at",
            ]
        );
        for forbidden in ["value", "blob", "ciphertext", "secret", "token", "password"] {
            assert!(!columns.iter().any(|column| column == forbidden));
        }
    }

    #[test]
    fn content_store_path_is_sharded_by_a_valid_sha256() {
        let workspace = TestWorkspace::new("content-path");
        let hash = "A3B5C7D9E1F3A5B7C9D1E3F5A7B9C1D3E5F7A9B1C3D5E7F9A1B3C5D7E9F1A3B5";

        assert_eq!(
            content_store_path(workspace.path(), hash).unwrap(),
            workspace.path().join(
                ".zerowall/store/sha256/a3/a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5"
            )
        );
    }

    #[test]
    fn content_store_path_rejects_invalid_hashes_and_traversal() {
        let workspace = TestWorkspace::new("content-invalid");
        for invalid in [
            "",
            "abc123",
            "../a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3",
            "g3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5",
            "a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5/..",
        ] {
            assert!(
                content_store_path(workspace.path(), invalid).is_err(),
                "{invalid}"
            );
        }
    }

    #[cfg(unix)]
    fn create_directory_link(target: &Path, link: &Path) {
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    #[cfg(windows)]
    fn create_directory_link(target: &Path, link: &Path) {
        if std::os::windows::fs::symlink_dir(target, link).is_ok() {
            return;
        }
        let status = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .status()
            .unwrap();
        assert!(status.success());
    }

    #[test]
    fn database_and_content_store_reject_linked_workspace_metadata() {
        let workspace = TestWorkspace::new("linked-store");
        let outside = TestWorkspace::new("linked-store-outside");
        let linked_store = workspace.path().join(".zerowall");
        create_directory_link(outside.path(), &linked_store);

        let hash = "a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5";
        assert!(open_science_db(workspace.path()).is_err());
        assert!(content_store_path(workspace.path(), hash).is_err());
        assert!(!outside.path().join("science.db").exists());

        fs::remove_dir(&linked_store).unwrap();
    }

    #[test]
    fn artifact_can_return_to_content_from_an_earlier_version() {
        let workspace = TestWorkspace::new("artifact-rollback");
        let conn = open_science_db(workspace.path()).unwrap();
        insert_project_and_session(&conn, "project-1", "session-1");
        conn.execute(
            "INSERT INTO artifacts \
             (id, project_id, session_id, logical_path, artifact_type, created_at, updated_at) \
             VALUES ('artifact-1', 'project-1', 'session-1', 'result.csv', 'table', 'now', 'now')",
            [],
        )
        .unwrap();
        let first = "a".repeat(64);
        let second = "b".repeat(64);
        for (id, version, hash) in [
            ("version-1", 1, first.as_str()),
            ("version-2", 2, second.as_str()),
            ("version-3", 3, first.as_str()),
        ] {
            conn.execute(
                "INSERT INTO artifact_versions \
                 (id, project_id, artifact_id, version_number, content_sha256, content_ref, \
                  byte_size, created_at, updated_at) \
                 VALUES (?1, 'project-1', 'artifact-1', ?2, ?3, ?3, 1, 'now', 'now')",
                params![id, version, hash],
            )
            .unwrap();
        }
    }

    #[test]
    fn content_hash_columns_reject_non_hex_values() {
        let workspace = TestWorkspace::new("artifact-hash");
        let conn = open_science_db(workspace.path()).unwrap();
        insert_project_and_session(&conn, "project-1", "session-1");
        conn.execute(
            "INSERT INTO artifacts \
             (id, project_id, session_id, logical_path, artifact_type, created_at, updated_at) \
             VALUES ('artifact-1', 'project-1', 'session-1', 'result.csv', 'table', 'now', 'now')",
            [],
        )
        .unwrap();
        let invalid = "g".repeat(64);
        assert!(conn
            .execute(
                "INSERT INTO artifact_versions \
                 (id, project_id, artifact_id, version_number, content_sha256, content_ref, \
                  byte_size, created_at, updated_at) \
                 VALUES ('version-1', 'project-1', 'artifact-1', 1, ?1, ?1, 1, 'now', 'now')",
                params![invalid],
            )
            .is_err());
    }

    #[test]
    fn artifact_edges_cannot_cross_projects() {
        let workspace = TestWorkspace::new("artifact-edge-project");
        let conn = open_science_db(workspace.path()).unwrap();
        insert_project_and_session(&conn, "project-1", "session-1");
        insert_project_and_session(&conn, "project-2", "session-2");
        for (artifact, project, session, version, hash) in [
            (
                "artifact-1",
                "project-1",
                "session-1",
                "version-1",
                "a".repeat(64),
            ),
            (
                "artifact-2",
                "project-2",
                "session-2",
                "version-2",
                "b".repeat(64),
            ),
        ] {
            conn.execute(
                "INSERT INTO artifacts \
                 (id, project_id, session_id, logical_path, artifact_type, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?1, 'table', 'now', 'now')",
                params![artifact, project, session],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO artifact_versions \
                 (id, project_id, artifact_id, version_number, content_sha256, content_ref, \
                  byte_size, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, 1, ?4, ?4, 1, 'now', 'now')",
                params![version, project, artifact, hash],
            )
            .unwrap();
        }

        assert!(conn
            .execute(
                "INSERT INTO artifact_edges \
                 (id, project_id, from_artifact_version_id, to_artifact_version_id, relation, \
                  created_at, updated_at) \
                 VALUES ('edge-1', 'project-1', 'version-1', 'version-2', 'derived', 'now', 'now')",
                [],
            )
            .is_err());
    }

    #[test]
    fn concurrency_and_leases_enforce_their_limits() {
        let workspace = TestWorkspace::new("concurrency");
        let conn = open_science_db(workspace.path()).unwrap();
        insert_project_and_session(&conn, "project-1", "session-1");
        assert!(conn
            .execute(
                "INSERT INTO session_concurrency \
                 (id, session_id, holder_id, max_parallel, active_count, created_at, updated_at) \
                 VALUES ('limit-1', 'session-1', 'worker-1', 1, 2, 'now', 'now')",
                [],
            )
            .is_err());

        let hash = "a".repeat(64);
        conn.execute(
            "INSERT INTO leases \
             (id, resource_kind, resource_ref, holder_id, lease_token_sha256, expires_at, \
              created_at, updated_at) \
             VALUES ('lease-1', 'session', 'session-1', 'worker-1', ?1, 'later', 'now', 'now')",
            params![hash],
        )
        .unwrap();
        assert!(conn
            .execute(
                "INSERT INTO leases \
                 (id, resource_kind, resource_ref, holder_id, lease_token_sha256, expires_at, \
                  created_at, updated_at) \
                 VALUES ('lease-2', 'session', 'session-1', 'worker-2', ?1, 'later', 'now', 'now')",
                params![hash],
            )
            .is_err());
    }

    #[test]
    fn compute_jobs_cannot_mix_provider_endpoint_or_session_execution() {
        let workspace = TestWorkspace::new("compute-relations");
        let conn = open_science_db(workspace.path()).unwrap();
        insert_project_and_session(&conn, "project-1", "session-1");
        conn.execute(
            "INSERT INTO sessions \
             (id, project_id, title, status, created_at, updated_at) \
             VALUES ('session-2', 'project-1', 'session-2', 'active', 'now', 'now')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO executions \
             (id, project_id, session_id, executor_kind, status, created_at, updated_at) \
             VALUES ('execution-2', 'project-1', 'session-2', 'kernel', 'complete', 'now', 'now')",
            [],
        )
        .unwrap();
        for provider in ["provider-1", "provider-2"] {
            conn.execute(
                "INSERT INTO compute_providers \
                 (id, project_id, name, provider_kind, config_ref, status, created_at, updated_at) \
                 VALUES (?1, 'project-1', ?1, 'local', ?1, 'ready', 'now', 'now')",
                params![provider],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO managed_endpoints \
             (id, compute_provider_id, name, endpoint_ref, status, created_at, updated_at) \
             VALUES ('endpoint-2', 'provider-2', 'endpoint-2', 'endpoint-ref', 'ready', 'now', 'now')",
            [],
        )
        .unwrap();

        assert!(conn
            .execute(
                "INSERT INTO compute_jobs \
                 (id, compute_provider_id, managed_endpoint_id, session_id, input_ref, status, \
                  created_at, updated_at) \
                 VALUES ('job-1', 'provider-1', 'endpoint-2', 'session-1', 'input', 'queued', 'now', 'now')",
                [],
            )
            .is_err());
        assert!(conn
            .execute(
                "INSERT INTO compute_jobs \
                 (id, compute_provider_id, session_id, execution_id, input_ref, status, \
                  created_at, updated_at) \
                 VALUES ('job-2', 'provider-1', 'session-1', 'execution-2', 'input', 'queued', 'now', 'now')",
                [],
            )
            .is_err());
    }

    #[test]
    fn opening_science_database_does_not_touch_disposable_runs_database() {
        let workspace = TestWorkspace::new("runs-untouched");
        let metadata_dir = workspace.path().join(".zerowall");
        fs::create_dir_all(&metadata_dir).unwrap();
        let runs_path = metadata_dir.join("runs.db");
        let sentinel = b"not a sqlite database; owned by runs_index";
        fs::write(&runs_path, sentinel).unwrap();

        let _science = open_science_db(workspace.path()).unwrap();

        assert_eq!(fs::read(runs_path).unwrap(), sentinel);
        assert!(metadata_dir.join("science.db").is_file());
    }
}
