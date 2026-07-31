-- Group billing multipliers fetched from the sub2api gateway
-- (/api/v1/groups/available). One row per group; refreshed after login or
-- provision. The rate_multiplier converts the base provider cost_usd into the
-- credit actually deducted from the sub2api account balance:
--
--   estimated_credit = cost_usd * rate_multiplier
--
-- e.g. a group with rate_multiplier=0.3 costs 30% of the standard API price.

CREATE TABLE price_catalog (
    group_id        INTEGER PRIMARY KEY,
    group_name      TEXT    NOT NULL,
    platform        TEXT    NOT NULL DEFAULT '',
    rate_multiplier REAL    NOT NULL DEFAULT 1.0,
    updated_at      TEXT    NOT NULL
);

-- Workspace-level pointer to the active gateway group. Zero or one row,
-- enforced by the CHECK on singleton. NULL = active group not yet recorded.
CREATE TABLE active_group_setting (
    singleton   INTEGER PRIMARY KEY DEFAULT 0 CHECK (singleton = 0),
    group_id    INTEGER REFERENCES price_catalog(group_id)
);
