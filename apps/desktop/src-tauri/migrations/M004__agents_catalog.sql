CREATE TABLE marketplace_sources (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT,
    name           TEXT NOT NULL,
    source_kind    TEXT NOT NULL,
    source_ref     TEXT NOT NULL,
    manifest_sha256 TEXT CHECK (
        manifest_sha256 IS NULL OR (
            length(manifest_sha256) = 64 AND manifest_sha256 NOT GLOB '*[^0-9A-Fa-f]*'
        )
    ),
    enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    UNIQUE (source_kind, source_ref)
);
CREATE INDEX idx_marketplace_sources_enabled ON marketplace_sources (enabled, updated_at);
CREATE INDEX idx_marketplace_sources_tenant ON marketplace_sources (tenant_id);

CREATE TABLE agents (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT,
    project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    agent_kind     TEXT NOT NULL,
    definition_ref TEXT NOT NULL,
    read_only      INTEGER NOT NULL DEFAULT 0 CHECK (read_only IN (0, 1)),
    enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE INDEX idx_agents_project ON agents (project_id, enabled);
CREATE INDEX idx_agents_kind ON agents (agent_kind, enabled);
CREATE INDEX idx_agents_tenant ON agents (tenant_id);

CREATE TABLE skills (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT,
    marketplace_source_id TEXT REFERENCES marketplace_sources(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    version         TEXT NOT NULL,
    manifest_ref    TEXT NOT NULL,
    source_sha256   TEXT CHECK (
        source_sha256 IS NULL OR (
            length(source_sha256) = 64 AND source_sha256 NOT GLOB '*[^0-9A-Fa-f]*'
        )
    ),
    enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE (name, version)
);
CREATE INDEX idx_skills_source ON skills (marketplace_source_id);
CREATE INDEX idx_skills_enabled ON skills (enabled, name);
CREATE INDEX idx_skills_tenant ON skills (tenant_id);

CREATE TABLE mcp_servers (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT,
    marketplace_source_id TEXT REFERENCES marketplace_sources(id) ON DELETE SET NULL,
    secret_ref_id   TEXT REFERENCES secret_refs(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    transport       TEXT NOT NULL,
    manifest_ref    TEXT NOT NULL,
    config_ref      TEXT,
    enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE (name)
);
CREATE INDEX idx_mcp_servers_source ON mcp_servers (marketplace_source_id);
CREATE INDEX idx_mcp_servers_secret ON mcp_servers (secret_ref_id);
CREATE INDEX idx_mcp_servers_enabled ON mcp_servers (enabled, name);
CREATE INDEX idx_mcp_servers_tenant ON mcp_servers (tenant_id);

CREATE TABLE mcp_resources (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT,
    mcp_server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    resource_kind TEXT NOT NULL,
    external_id   TEXT NOT NULL,
    schema_ref    TEXT,
    enabled       INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    UNIQUE (mcp_server_id, resource_kind, external_id)
);
CREATE INDEX idx_mcp_resources_server ON mcp_resources (mcp_server_id, enabled);
CREATE INDEX idx_mcp_resources_kind ON mcp_resources (resource_kind, enabled);
CREATE INDEX idx_mcp_resources_tenant ON mcp_resources (tenant_id);

CREATE TABLE assignments (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT,
    agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id      TEXT REFERENCES skills(id) ON DELETE CASCADE,
    mcp_server_id TEXT REFERENCES mcp_servers(id) ON DELETE CASCADE,
    priority      INTEGER NOT NULL DEFAULT 0,
    enabled       INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    CHECK ((skill_id IS NOT NULL) <> (mcp_server_id IS NOT NULL))
);
CREATE UNIQUE INDEX idx_assignments_agent_skill
    ON assignments (agent_id, skill_id) WHERE skill_id IS NOT NULL;
CREATE UNIQUE INDEX idx_assignments_agent_mcp
    ON assignments (agent_id, mcp_server_id) WHERE mcp_server_id IS NOT NULL;
CREATE INDEX idx_assignments_skill ON assignments (skill_id);
CREATE INDEX idx_assignments_mcp ON assignments (mcp_server_id);
CREATE INDEX idx_assignments_tenant ON assignments (tenant_id);

CREATE TABLE tool_policies (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT,
    project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
    agent_id     TEXT REFERENCES agents(id) ON DELETE CASCADE,
    tool_pattern TEXT NOT NULL,
    decision     TEXT NOT NULL,
    policy_ref   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX idx_tool_policies_project ON tool_policies (project_id);
CREATE INDEX idx_tool_policies_agent ON tool_policies (agent_id);
CREATE INDEX idx_tool_policies_match ON tool_policies (tool_pattern, decision);
CREATE INDEX idx_tool_policies_tenant ON tool_policies (tenant_id);
