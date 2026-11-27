-- Target: owner PORTFOLIO D1 database (not the commercial database). Additive and idempotent.
-- Reversible spam overrides for the central inbox. Existing mailbox_state and message data are untouched.
CREATE TABLE IF NOT EXISTS mailbox_spam(project TEXT NOT NULL,message_id TEXT NOT NULL CHECK(length(message_id) BETWEEN 1 AND 160),sender TEXT NOT NULL DEFAULT '' CHECK(length(sender)<=254),spam INTEGER NOT NULL CHECK(spam IN (0,1)),updated_at TEXT NOT NULL,PRIMARY KEY(project,message_id));
CREATE INDEX IF NOT EXISTS mailbox_spam_trusted ON mailbox_spam(spam,sender);
