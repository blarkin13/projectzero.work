-- Additive, one-time migration for the isolated commercial database.
CREATE TABLE IF NOT EXISTS beta_invitations (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  redeemed_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS beta_invitation_email ON beta_invitations(email,expires_at);
ALTER TABLE beta_email_challenges ADD COLUMN invite_hash TEXT;
ALTER TABLE oauth_states ADD COLUMN invite_hash TEXT;
