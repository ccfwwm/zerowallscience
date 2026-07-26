-- The review state vocabularies are constrained here because nothing writes to
-- these tables yet: the schema is the only thing that can keep the first writer
-- honest. Each set is mirrored in packages/shared/src/review-state.ts and a test
-- compares the two, so the app and the database cannot drift apart.

CREATE TABLE reviewer_runs (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    execution_id TEXT REFERENCES executions(id) ON DELETE SET NULL,
    -- Only 'complete' is named upstream (the reviewer agent's `review_complete`
    -- handoff trigger); the rest are the phases the nullable started_at /
    -- finished_at pair below can already distinguish.
    status      TEXT NOT NULL CHECK (
                    status IN ('pending', 'running', 'complete', 'failed')
                ),
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
    -- No claim vocabulary is attested anywhere. The one distinction this schema
    -- can actually express is whether a resolutions row exists for the claim;
    -- a richer lifecycle would be invented, so it stays at two states.
    status              TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
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
    -- The verdict vocabulary the shipping ```review``` contract already uses
    -- (FindingLevel). A check that could not run is a 'warn' there, so this
    -- needs no fourth state.
    result       TEXT NOT NULL CHECK (result IN ('ok', 'warn', 'error')),
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
    -- The four resolutions the reviewer agent's system prompt enumerates,
    -- lowercased to match every other state column in this schema.
    action                TEXT NOT NULL CHECK (
                              action IN ('verified', 'conditional', 'inconclusive', 'refuted')
                          ),
    resolution_ref        TEXT,
    resolved_by           TEXT NOT NULL,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
CREATE INDEX idx_resolutions_claim ON resolutions (claim_id, created_at);
CREATE INDEX idx_resolutions_check ON resolutions (verification_check_id);
CREATE INDEX idx_resolutions_action ON resolutions (action);
CREATE INDEX idx_resolutions_tenant ON resolutions (tenant_id);
