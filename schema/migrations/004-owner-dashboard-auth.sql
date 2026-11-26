-- Owner-only dashboard sessions; raw credentials are never persisted.
CREATE TABLE IF NOT EXISTS owner_dashboard_codes(token_hash TEXT PRIMARY KEY,account_session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,expires_at INTEGER NOT NULL,used_at INTEGER);
CREATE TABLE IF NOT EXISTS owner_dashboard_sessions(token_hash TEXT PRIMARY KEY,account_session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,expires_at INTEGER NOT NULL,revoked_at INTEGER);
CREATE INDEX IF NOT EXISTS owner_dashboard_codes_expiry ON owner_dashboard_codes(expires_at);
CREATE INDEX IF NOT EXISTS owner_dashboard_sessions_expiry ON owner_dashboard_sessions(expires_at);
