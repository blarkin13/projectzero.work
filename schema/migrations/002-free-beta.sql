-- Additive migration; isolated commercial database only.
CREATE TABLE IF NOT EXISTS beta_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  accepted_terms TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS beta_email_challenges (
  challenge_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5)
);
CREATE INDEX IF NOT EXISTS beta_challenge_expiry ON beta_email_challenges(expires_at);
CREATE TABLE IF NOT EXISTS beta_email_limits (
  bucket TEXT NOT NULL,
  window TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count>=0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(bucket,window)
);
CREATE INDEX IF NOT EXISTS beta_email_limits_expiry ON beta_email_limits(expires_at);
