CREATE TABLE executions (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id     TEXT NOT NULL,
    parent_id      TEXT REFERENCES executions(id) ON DELETE SET NULL,
    executor_kind  TEXT NOT NULL,
    model_role     TEXT,
    model_provider TEXT,
    model_id       TEXT,
    input_ref      TEXT,
    output_ref     TEXT,
    status         TEXT NOT NULL,
    started_at     TEXT,
    finished_at    TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    UNIQUE (id, project_id),
    UNIQUE (id, session_id),
    FOREIGN KEY (session_id, project_id) REFERENCES sessions(id, project_id) ON DELETE CASCADE
);
CREATE INDEX idx_executions_project ON executions (project_id, created_at);
CREATE INDEX idx_executions_session ON executions (session_id, created_at);
CREATE INDEX idx_executions_parent ON executions (parent_id);
CREATE INDEX idx_executions_status ON executions (status, updated_at);
CREATE INDEX idx_executions_tenant ON executions (tenant_id);

CREATE TABLE artifacts (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id   TEXT,
    logical_path TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    UNIQUE (project_id, logical_path),
    UNIQUE (id, project_id),
    FOREIGN KEY (session_id, project_id) REFERENCES sessions(id, project_id) ON DELETE RESTRICT
);
CREATE INDEX idx_artifacts_project ON artifacts (project_id, updated_at);
CREATE INDEX idx_artifacts_session ON artifacts (session_id);
CREATE INDEX idx_artifacts_tenant ON artifacts (tenant_id);

CREATE TABLE artifact_versions (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT,
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    artifact_id         TEXT NOT NULL,
    source_execution_id TEXT,
    version_number      INTEGER NOT NULL CHECK (version_number > 0),
    content_sha256      TEXT NOT NULL CHECK (
        length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9A-Fa-f]*'
    ),
    content_ref         TEXT NOT NULL,
    media_type          TEXT,
    byte_size           INTEGER NOT NULL CHECK (byte_size >= 0),
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE (artifact_id, version_number),
    UNIQUE (id, project_id),
    FOREIGN KEY (artifact_id, project_id) REFERENCES artifacts(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (source_execution_id, project_id) REFERENCES executions(id, project_id) ON DELETE RESTRICT
);
CREATE INDEX idx_artifact_versions_project ON artifact_versions (project_id, version_number);
CREATE INDEX idx_artifact_versions_artifact ON artifact_versions (artifact_id, version_number);
CREATE INDEX idx_artifact_versions_execution ON artifact_versions (source_execution_id);
CREATE INDEX idx_artifact_versions_hash ON artifact_versions (content_sha256);
CREATE INDEX idx_artifact_versions_tenant ON artifact_versions (tenant_id);

CREATE TABLE artifact_edges (
    id                       TEXT PRIMARY KEY,
    tenant_id                TEXT,
    project_id               TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_artifact_version_id TEXT NOT NULL,
    to_artifact_version_id   TEXT NOT NULL,
    relation                 TEXT NOT NULL,
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL,
    UNIQUE (from_artifact_version_id, to_artifact_version_id, relation),
    CHECK (from_artifact_version_id <> to_artifact_version_id),
    FOREIGN KEY (from_artifact_version_id, project_id)
        REFERENCES artifact_versions(id, project_id) ON DELETE CASCADE,
    FOREIGN KEY (to_artifact_version_id, project_id)
        REFERENCES artifact_versions(id, project_id) ON DELETE CASCADE
);
CREATE INDEX idx_artifact_edges_project ON artifact_edges (project_id);
CREATE INDEX idx_artifact_edges_from ON artifact_edges (from_artifact_version_id);
CREATE INDEX idx_artifact_edges_to ON artifact_edges (to_artifact_version_id);
CREATE INDEX idx_artifact_edges_tenant ON artifact_edges (tenant_id);

CREATE TABLE content_snapshots (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id     TEXT,
    content_sha256 TEXT NOT NULL CHECK (
        length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9A-Fa-f]*'
    ),
    content_ref    TEXT NOT NULL,
    byte_size      INTEGER NOT NULL CHECK (byte_size >= 0),
    snapshot_kind  TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    UNIQUE (project_id, content_sha256, snapshot_kind),
    FOREIGN KEY (session_id, project_id) REFERENCES sessions(id, project_id) ON DELETE RESTRICT
);
CREATE INDEX idx_content_snapshots_project ON content_snapshots (project_id, created_at);
CREATE INDEX idx_content_snapshots_session ON content_snapshots (session_id);
CREATE INDEX idx_content_snapshots_hash ON content_snapshots (content_sha256);
CREATE INDEX idx_content_snapshots_tenant ON content_snapshots (tenant_id);

CREATE TABLE provenance_refs (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT,
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id          TEXT,
    execution_id        TEXT,
    artifact_version_id TEXT,
    ref_kind            TEXT NOT NULL,
    target_ref          TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (session_id, project_id) REFERENCES sessions(id, project_id) ON DELETE RESTRICT,
    FOREIGN KEY (execution_id, project_id) REFERENCES executions(id, project_id) ON DELETE RESTRICT,
    FOREIGN KEY (artifact_version_id, project_id)
        REFERENCES artifact_versions(id, project_id) ON DELETE RESTRICT
);
CREATE INDEX idx_provenance_project ON provenance_refs (project_id, created_at);
CREATE INDEX idx_provenance_session ON provenance_refs (session_id);
CREATE INDEX idx_provenance_execution ON provenance_refs (execution_id);
CREATE INDEX idx_provenance_artifact_version ON provenance_refs (artifact_version_id);
CREATE INDEX idx_provenance_target ON provenance_refs (ref_kind, target_ref);
CREATE INDEX idx_provenance_tenant ON provenance_refs (tenant_id);
