-- D1 binding: portfolio-owner/PORTFOLIO
-- Dedicated MCP-only connections. Backing tracker keys are encrypted and never shown to clients.
CREATE TABLE IF NOT EXISTS mcp_connections(id TEXT PRIMARY KEY,label TEXT NOT NULL,actor TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,tracker_key_id TEXT NOT NULL UNIQUE,ciphertext TEXT NOT NULL,iv TEXT NOT NULL,scopes TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT,last_seen_at TEXT);
