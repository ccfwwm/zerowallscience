-- Per-reply token and cost accounting. OpenCode stamps every assistant message
-- with cumulative token counts (input/output/reasoning + cache read/write) and
-- an optional USD cost; this table is the durable rollup the usage surfaces read
-- from (status bar, Settings → Usage). One row per assistant message.
--
-- message_id is the OpenCode message id and the PRIMARY KEY: the runtime
-- restamps the same message with growing totals as a reply streams, so the
-- writer UPSERTs on it (latest-wins) rather than appending a row per stamp.
-- The counts are therefore final-cumulative-per-reply, never double-counted.
--
-- cost_usd is nullable, not defaulted to 0: a provider that priced nothing (a
-- local model, a free tier) leaves it NULL, which the UI renders as "—". A real
-- $0.00 and "unpriced" are different facts and the schema keeps them apart.

CREATE TABLE usage_events (
    message_id  TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    input       INTEGER NOT NULL DEFAULT 0,
    output      INTEGER NOT NULL DEFAULT 0,
    reasoning   INTEGER NOT NULL DEFAULT 0,
    cache_read  INTEGER NOT NULL DEFAULT 0,
    cache_write INTEGER NOT NULL DEFAULT 0,
    cost_usd    REAL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_usage_events_session ON usage_events (session_id, created_at);
