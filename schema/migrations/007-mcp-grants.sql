-- D1 binding: portfolio-owner/PORTFOLIO
-- Additive, idempotent owner-controlled MCP grants.
CREATE TABLE IF NOT EXISTS mcp_grants(key_id TEXT PRIMARY KEY, scopes TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mcp_rate(key_id TEXT NOT NULL, minute TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY(key_id,minute));
