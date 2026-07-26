CREATE TABLE projects (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT,
    name           TEXT NOT NULL,
    workspace_path TEXT NOT NULL UNIQUE,
    status         TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE INDEX idx_projects_tenant ON projects (tenant_id);
CREATE INDEX idx_projects_status ON projects (status, updated_at);

CREATE TABLE sessions (
    id                TEXT PRIMARY KEY,
    tenant_id         TEXT,
    project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    title             TEXT NOT NULL,
    status            TEXT NOT NULL,
    model_snapshot_ref TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    UNIQUE (id, project_id)
);
CREATE INDEX idx_sessions_project ON sessions (project_id, updated_at);
CREATE INDEX idx_sessions_parent ON sessions (parent_session_id);
CREATE INDEX idx_sessions_tenant ON sessions (tenant_id);

CREATE TABLE messages (
    id                TEXT PRIMARY KEY,
    tenant_id         TEXT,
    session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    role              TEXT NOT NULL,
    content_ref       TEXT NOT NULL,
    sequence          INTEGER NOT NULL CHECK (sequence >= 0),
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    UNIQUE (session_id, sequence)
);
CREATE INDEX idx_messages_session ON messages (session_id, sequence);
CREATE INDEX idx_messages_parent ON messages (parent_message_id);
CREATE INDEX idx_messages_tenant ON messages (tenant_id);

CREATE TABLE events (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id  TEXT REFERENCES messages(id) ON DELETE SET NULL,
    event_type  TEXT NOT NULL,
    payload_ref TEXT,
    sequence    INTEGER NOT NULL CHECK (sequence >= 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE (session_id, sequence)
);
CREATE INDEX idx_events_session ON events (session_id, sequence);
CREATE INDEX idx_events_message ON events (message_id);
CREATE INDEX idx_events_type ON events (event_type, created_at);
CREATE INDEX idx_events_tenant ON events (tenant_id);
