CREATE TABLE reviewer_runs (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    execution_id TEXT REFERENCES executions(id) ON DELETE SET NULL,
    status      TEXT NOT NULL,
    summary_ref TEXT,
    started_at  TEXT,
    finished_at TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_reviewer_runs_session ON reviewer_runs (session_id, created_at);
CREATE INDEX idx_reviewer_runs_execution ON reviewer_runs (execution_id);
CREATE INDEX idx_reviewer_runs_status ON reviewer_runs (status, updated_at);
CREATE INDEX idx_reviewer_runs_tenant ON reviewer_runs (tenant_id);

CREATE TABLE claims (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT,
    reviewer_run_id     TEXT NOT NULL REFERENCES reviewer_runs(id) ON DELETE CASCADE,
    message_id          TEXT REFERENCES messages(id) ON DELETE SET NULL,
    artifact_version_id TEXT REFERENCES artifact_versions(id) ON DELETE SET NULL,
    claim_ref           TEXT NOT NULL,
    status              TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
CREATE INDEX idx_claims_reviewer_run ON claims (reviewer_run_id, status);
CREATE INDEX idx_claims_message ON claims (message_id);
CREATE INDEX idx_claims_artifact ON claims (artifact_version_id);
CREATE INDEX idx_claims_tenant ON claims (tenant_id);

CREATE TABLE verification_checks (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT,
    claim_id     TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    execution_id TEXT REFERENCES executions(id) ON DELETE SET NULL,
    check_kind   TEXT NOT NULL,
    evidence_ref TEXT,
    result       TEXT NOT NULL,
    details_ref  TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX idx_verification_checks_claim ON verification_checks (claim_id, created_at);
CREATE INDEX idx_verification_checks_execution ON verification_checks (execution_id);
CREATE INDEX idx_verification_checks_result ON verification_checks (result);
CREATE INDEX idx_verification_checks_tenant ON verification_checks (tenant_id);

CREATE TABLE resolutions (
    id                    TEXT PRIMARY KEY,
    tenant_id             TEXT,
    claim_id              TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    verification_check_id TEXT REFERENCES verification_checks(id) ON DELETE SET NULL,
    action                TEXT NOT NULL,
    resolution_ref        TEXT,
    resolved_by           TEXT NOT NULL,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
CREATE INDEX idx_resolutions_claim ON resolutions (claim_id, created_at);
CREATE INDEX idx_resolutions_check ON resolutions (verification_check_id);
CREATE INDEX idx_resolutions_action ON resolutions (action);
CREATE INDEX idx_resolutions_tenant ON resolutions (tenant_id);
