CREATE TABLE message_queue (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id   TEXT REFERENCES messages(id) ON DELETE SET NULL,
    payload_ref  TEXT NOT NULL,
    status       TEXT NOT NULL,
    priority     INTEGER NOT NULL DEFAULT 0,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    available_at TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX idx_message_queue_ready ON message_queue (status, available_at, priority);
CREATE INDEX idx_message_queue_session ON message_queue (session_id, created_at);
CREATE INDEX idx_message_queue_message ON message_queue (message_id);
CREATE INDEX idx_message_queue_tenant ON message_queue (tenant_id);

CREATE TABLE session_concurrency (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT,
    session_id       TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    holder_id        TEXT NOT NULL,
    max_parallel     INTEGER NOT NULL CHECK (max_parallel > 0),
    active_count     INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0),
    lease_expires_at TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    CHECK (active_count <= max_parallel)
);
CREATE INDEX idx_session_concurrency_expiry ON session_concurrency (lease_expires_at);
CREATE INDEX idx_session_concurrency_tenant ON session_concurrency (tenant_id);

CREATE TABLE routine_schedules (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id       TEXT REFERENCES agents(id) ON DELETE SET NULL,
    name           TEXT NOT NULL,
    schedule_ref   TEXT NOT NULL,
    payload_ref    TEXT NOT NULL,
    enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    next_run_at    TEXT,
    last_run_at    TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE INDEX idx_routine_schedules_due ON routine_schedules (enabled, next_run_at);
CREATE INDEX idx_routine_schedules_project ON routine_schedules (project_id);
CREATE INDEX idx_routine_schedules_agent ON routine_schedules (agent_id);
CREATE INDEX idx_routine_schedules_tenant ON routine_schedules (tenant_id);

CREATE TABLE leases (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT,
    resource_kind TEXT NOT NULL,
    resource_ref TEXT NOT NULL,
    holder_id    TEXT NOT NULL,
    lease_token_sha256 TEXT NOT NULL CHECK (
        length(lease_token_sha256) = 64 AND lease_token_sha256 NOT GLOB '*[^0-9A-Fa-f]*'
    ),
    expires_at   TEXT NOT NULL,
    released_at  TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    UNIQUE (resource_kind, resource_ref)
);
CREATE INDEX idx_leases_resource ON leases (resource_kind, resource_ref);
CREATE INDEX idx_leases_expiry ON leases (expires_at, released_at);
CREATE INDEX idx_leases_tenant ON leases (tenant_id);
