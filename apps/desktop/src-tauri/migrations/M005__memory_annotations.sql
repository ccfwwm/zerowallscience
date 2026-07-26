CREATE TABLE memories (
    id                TEXT PRIMARY KEY,
    tenant_id         TEXT,
    project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id        TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    memory_kind       TEXT NOT NULL,
    content_ref       TEXT NOT NULL,
    disabled_at       TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);
CREATE INDEX idx_memories_project ON memories (project_id, memory_kind, updated_at);
CREATE INDEX idx_memories_session ON memories (session_id);
CREATE INDEX idx_memories_source_message ON memories (source_message_id);
CREATE INDEX idx_memories_active ON memories (disabled_at);
CREATE INDEX idx_memories_tenant ON memories (tenant_id);

CREATE TABLE compaction_archives (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    first_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    last_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    content_ref     TEXT NOT NULL,
    message_count   INTEGER NOT NULL CHECK (message_count >= 0),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX idx_compaction_archives_session ON compaction_archives (session_id, created_at);
CREATE INDEX idx_compaction_archives_first ON compaction_archives (first_message_id);
CREATE INDEX idx_compaction_archives_last ON compaction_archives (last_message_id);
CREATE INDEX idx_compaction_archives_tenant ON compaction_archives (tenant_id);

CREATE TABLE annotations (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT,
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id          TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    message_id          TEXT REFERENCES messages(id) ON DELETE CASCADE,
    artifact_version_id TEXT REFERENCES artifact_versions(id) ON DELETE CASCADE,
    annotation_kind     TEXT NOT NULL,
    body_ref            TEXT NOT NULL,
    anchor_ref          TEXT,
    author_subject      TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    CHECK (message_id IS NOT NULL OR artifact_version_id IS NOT NULL)
);
CREATE INDEX idx_annotations_project ON annotations (project_id, created_at);
CREATE INDEX idx_annotations_session ON annotations (session_id);
CREATE INDEX idx_annotations_message ON annotations (message_id);
CREATE INDEX idx_annotations_artifact ON annotations (artifact_version_id);
CREATE INDEX idx_annotations_tenant ON annotations (tenant_id);

CREATE TABLE read_marks (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT,
    session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    subject_id     TEXT NOT NULL,
    message_id     TEXT REFERENCES messages(id) ON DELETE CASCADE,
    event_id       TEXT REFERENCES events(id) ON DELETE CASCADE,
    read_at        TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    CHECK (message_id IS NOT NULL OR event_id IS NOT NULL)
);
CREATE UNIQUE INDEX idx_read_marks_message
    ON read_marks (subject_id, message_id) WHERE message_id IS NOT NULL;
CREATE UNIQUE INDEX idx_read_marks_event
    ON read_marks (subject_id, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_read_marks_session ON read_marks (session_id, read_at);
CREATE INDEX idx_read_marks_tenant ON read_marks (tenant_id);
