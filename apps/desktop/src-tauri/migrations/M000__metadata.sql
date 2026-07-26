CREATE TABLE IF NOT EXISTS schema_metadata (
    singleton       INTEGER PRIMARY KEY CHECK (singleton = 1),
    current_version INTEGER NOT NULL CHECK (current_version >= 0),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    version    INTEGER NOT NULL UNIQUE CHECK (version >= 0),
    sql_checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
);
