-- Reconciled schema baseline. For new isolated development databases only.
-- No business records or production data. Never reapply to an existing production database.
CREATE TABLE users(id TEXT PRIMARY KEY,oidc_subject TEXT NOT NULL UNIQUE,email TEXT NOT NULL,display_name TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,disabled_at TEXT);

CREATE TABLE workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT);

CREATE TABLE memberships(workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('owner','admin','viewer')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(workspace_id,user_id));

CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,revoked_at INTEGER);

CREATE TABLE projects(workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,id TEXT NOT NULL,name TEXT NOT NULL,website TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,archived_at TEXT,PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,name));

CREATE TABLE tasks(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',priority TEXT NOT NULL CHECK(priority IN ('P0','P1','P2','Exposure')),status TEXT NOT NULL CHECK(status IN ('Not started','In progress','Blocked','Ready to verify','Done','Deferred')),assignee TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE CASCADE);

CREATE TABLE integrations(workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,id TEXT NOT NULL,project_id TEXT NOT NULL,provider TEXT NOT NULL CHECK(provider IN ('github','stripe','cloudflare','siteapt')),display_name TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('disconnected','connected','error','revoked')),credential_ciphertext TEXT,credential_nonce TEXT,key_version INTEGER,scopes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(scopes_json)),last_sync_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE CASCADE);

CREATE TABLE metrics(workspace_id TEXT NOT NULL,integration_id TEXT NOT NULL,metric TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,value REAL,unit TEXT NOT NULL,observed_at TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(workspace_id,integration_id,metric,period_start,period_end),FOREIGN KEY(workspace_id,integration_id) REFERENCES integrations(workspace_id,id) ON DELETE CASCADE);

CREATE TABLE audit_events(workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,resource_type TEXT NOT NULL,resource_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(workspace_id,id));

CREATE TABLE workspace_entitlements(workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,plan TEXT NOT NULL CHECK(plan IN ('private_beta','starter','professional','agency')),state TEXT NOT NULL CHECK(state IN ('disabled','active','past_due','cancelled')),project_limit INTEGER NOT NULL CHECK(project_limit>=0),integration_limit INTEGER NOT NULL CHECK(integration_limit>=0),sync_daily_limit INTEGER NOT NULL CHECK(sync_daily_limit>=0),retention_days INTEGER NOT NULL CHECK(retention_days BETWEEN 1 AND 365),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE sync_budget(workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,day TEXT NOT NULL,operations INTEGER NOT NULL DEFAULT 0 CHECK(operations>=0),PRIMARY KEY(workspace_id,day));

CREATE TABLE oauth_states(state_hash TEXT PRIMARY KEY,verifier_ciphertext TEXT NOT NULL,nonce_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER);

CREATE INDEX commercial_session_user ON sessions(user_id,expires_at);

CREATE INDEX commercial_task_queue ON tasks(workspace_id,priority,status,project_id);

CREATE INDEX commercial_audit_date ON audit_events(workspace_id,created_at);
