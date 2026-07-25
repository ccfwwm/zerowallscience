CREATE TABLE compute_providers (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT,
    project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
    secret_ref_id TEXT REFERENCES secret_refs(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    provider_kind TEXT NOT NULL,
    config_ref    TEXT NOT NULL,
    status        TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX idx_compute_providers_project ON compute_providers (project_id, status);
CREATE INDEX idx_compute_providers_secret ON compute_providers (secret_ref_id);
CREATE INDEX idx_compute_providers_kind ON compute_providers (provider_kind, status);
CREATE INDEX idx_compute_providers_tenant ON compute_providers (tenant_id);

CREATE TABLE managed_endpoints (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT,
    compute_provider_id TEXT NOT NULL REFERENCES compute_providers(id) ON DELETE CASCADE,
    secret_ref_id       TEXT REFERENCES secret_refs(id) ON DELETE SET NULL,
    name                TEXT NOT NULL,
    endpoint_ref        TEXT NOT NULL,
    model_catalog_ref   TEXT,
    status              TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE (compute_provider_id, name),
    UNIQUE (id, compute_provider_id)
);
CREATE INDEX idx_managed_endpoints_provider ON managed_endpoints (compute_provider_id, status);
CREATE INDEX idx_managed_endpoints_secret ON managed_endpoints (secret_ref_id);
CREATE INDEX idx_managed_endpoints_tenant ON managed_endpoints (tenant_id);

CREATE TABLE compute_jobs (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT,
    compute_provider_id TEXT NOT NULL REFERENCES compute_providers(id) ON DELETE RESTRICT,
    managed_endpoint_id TEXT,
    session_id          TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    execution_id        TEXT,
    remote_job_id       TEXT,
    input_ref           TEXT NOT NULL,
    output_ref          TEXT,
    log_ref             TEXT,
    status              TEXT NOT NULL,
    submitted_at        TEXT,
    started_at          TEXT,
    finished_at         TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (managed_endpoint_id, compute_provider_id)
        REFERENCES managed_endpoints(id, compute_provider_id) ON DELETE RESTRICT,
    FOREIGN KEY (execution_id, session_id)
        REFERENCES executions(id, session_id) ON DELETE RESTRICT
);
CREATE INDEX idx_compute_jobs_provider ON compute_jobs (compute_provider_id, status);
CREATE INDEX idx_compute_jobs_endpoint ON compute_jobs (managed_endpoint_id);
CREATE INDEX idx_compute_jobs_session ON compute_jobs (session_id, created_at);
CREATE INDEX idx_compute_jobs_execution ON compute_jobs (execution_id);
CREATE INDEX idx_compute_jobs_remote ON compute_jobs (compute_provider_id, remote_job_id);
CREATE INDEX idx_compute_jobs_tenant ON compute_jobs (tenant_id);

CREATE TABLE compute_usage (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT,
    compute_job_id  TEXT NOT NULL REFERENCES compute_jobs(id) ON DELETE CASCADE,
    cpu_seconds     REAL CHECK (cpu_seconds IS NULL OR cpu_seconds >= 0),
    gpu_seconds     REAL CHECK (gpu_seconds IS NULL OR gpu_seconds >= 0),
    peak_memory_bytes INTEGER CHECK (peak_memory_bytes IS NULL OR peak_memory_bytes >= 0),
    storage_bytes   INTEGER CHECK (storage_bytes IS NULL OR storage_bytes >= 0),
    cost_microunits INTEGER CHECK (cost_microunits IS NULL OR cost_microunits >= 0),
    currency        TEXT,
    measured_at     TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX idx_compute_usage_job ON compute_usage (compute_job_id, measured_at);
CREATE INDEX idx_compute_usage_tenant ON compute_usage (tenant_id);

CREATE TABLE termination_queue (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT,
    compute_job_id TEXT NOT NULL REFERENCES compute_jobs(id) ON DELETE CASCADE,
    reason_ref     TEXT,
    status         TEXT NOT NULL,
    attempt_count  INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    available_at   TEXT NOT NULL,
    completed_at   TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE INDEX idx_termination_queue_ready ON termination_queue (status, available_at);
CREATE INDEX idx_termination_queue_job ON termination_queue (compute_job_id);
CREATE INDEX idx_termination_queue_tenant ON termination_queue (tenant_id);

CREATE TABLE egress_policies (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT,
    project_id          TEXT REFERENCES projects(id) ON DELETE CASCADE,
    compute_provider_id TEXT REFERENCES compute_providers(id) ON DELETE CASCADE,
    host_pattern        TEXT NOT NULL,
    decision            TEXT NOT NULL,
    policy_ref          TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
CREATE INDEX idx_egress_policies_project ON egress_policies (project_id);
CREATE INDEX idx_egress_policies_provider ON egress_policies (compute_provider_id);
CREATE INDEX idx_egress_policies_match ON egress_policies (host_pattern, decision);
CREATE INDEX idx_egress_policies_tenant ON egress_policies (tenant_id);
