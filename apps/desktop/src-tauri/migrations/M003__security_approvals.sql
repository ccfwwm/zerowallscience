CREATE TABLE secret_refs (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT,
    provider         TEXT NOT NULL,
    key_name         TEXT NOT NULL,
    keychain_service TEXT NOT NULL,
    keychain_account TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    UNIQUE (keychain_service, keychain_account)
);
CREATE INDEX idx_secret_refs_provider ON secret_refs (provider, key_name);
CREATE INDEX idx_secret_refs_tenant ON secret_refs (tenant_id);

CREATE TABLE approval_decisions (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    execution_id TEXT REFERENCES executions(id) ON DELETE SET NULL,
    action_kind  TEXT NOT NULL,
    resource_ref TEXT,
    decision     TEXT NOT NULL,
    reason_ref   TEXT,
    decided_by  TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX idx_approvals_session ON approval_decisions (session_id, created_at);
CREATE INDEX idx_approvals_execution ON approval_decisions (execution_id);
CREATE INDEX idx_approvals_decision ON approval_decisions (decision, created_at);
CREATE INDEX idx_approvals_tenant ON approval_decisions (tenant_id);

CREATE TABLE resource_grants (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id    TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    resource_kind TEXT NOT NULL,
    resource_ref  TEXT NOT NULL,
    access_scope  TEXT NOT NULL,
    granted_by    TEXT NOT NULL,
    expires_at    TEXT,
    revoked_at    TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX idx_resource_grants_project ON resource_grants (project_id, resource_kind);
CREATE INDEX idx_resource_grants_session ON resource_grants (session_id);
CREATE INDEX idx_resource_grants_expiry ON resource_grants (expires_at);
CREATE INDEX idx_resource_grants_tenant ON resource_grants (tenant_id);
