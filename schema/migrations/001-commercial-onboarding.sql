-- Additive commercial-only onboarding tables; safe for an existing disabled commercial DB.
CREATE TABLE IF NOT EXISTS project_onboarding(
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 concept TEXT NOT NULL CHECK(length(concept) BETWEEN 1 AND 2000),
 audience TEXT NOT NULL CHECK(length(audience) BETWEEN 1 AND 500),
 product_type TEXT NOT NULL CHECK(product_type IN ('Website / content','Web app / SaaS','Online store','Mobile app','Desktop app','API / backend','Other')),
 business_model TEXT NOT NULL CHECK(business_model IN ('Undecided','Subscriptions','One-time sales','Advertising','Services / leads','Free / noncommercial')),
 budget_cents INTEGER NOT NULL CHECK(budget_cents BETWEEN 0 AND 10000000),
 work_mode TEXT NOT NULL CHECK(work_mode IN ('Manual','AI-assisted','Mixed')),
 preferred_assistant TEXT NOT NULL CHECK(preferred_assistant IN ('None','ChatGPT','Claude','ChatGPT + Claude')),
 custom_instructions TEXT NOT NULL DEFAULT '' CHECK(length(custom_instructions)<=2000),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(workspace_id,project_id),
 FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE CASCADE,
 CHECK(work_mode<>'Manual' OR preferred_assistant='None')
);
CREATE TABLE IF NOT EXISTS project_assistant_keys(
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
 provider TEXT NOT NULL CHECK(provider IN ('ChatGPT','Claude')),
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 revoked_at INTEGER, request_day TEXT NOT NULL DEFAULT '',
 request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count BETWEEN 0 AND 100),
 PRIMARY KEY(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS commercial_assistant_key_project ON project_assistant_keys(workspace_id,project_id,provider,expires_at);
