-- D1 binding: portfolio-owner/PORTFOLIO. Additive OAuth 2.1 owner connection state.
CREATE TABLE IF NOT EXISTS mcp_oauth_clients(client_id TEXT PRIMARY KEY,redirect_uri TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mcp_oauth_requests(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,state TEXT NOT NULL,challenge TEXT NOT NULL,expires_at INTEGER NOT NULL,code_hash TEXT UNIQUE,scopes TEXT,used_at INTEGER);
CREATE INDEX IF NOT EXISTS mcp_oauth_requests_expiry ON mcp_oauth_requests(expires_at);
CREATE TABLE IF NOT EXISTS mcp_oauth_sessions(connection_id TEXT PRIMARY KEY,client_id TEXT NOT NULL,access_hash TEXT NOT NULL UNIQUE,refresh_hash TEXT NOT NULL UNIQUE,access_expires INTEGER NOT NULL);
