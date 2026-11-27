-- Reconciled schema baseline. For new isolated development databases only.
-- No business records or production data. Never reapply to an existing production database.
CREATE TABLE mailbox_state(project TEXT NOT NULL,message_id TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(project,message_id));

CREATE TABLE outbound(id TEXT PRIMARY KEY,project TEXT NOT NULL,from_address TEXT NOT NULL,to_address TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,provider_id TEXT,created_at TEXT NOT NULL,reply_message_id TEXT);

CREATE TABLE deployment_snapshot(worker TEXT NOT NULL,deployed_at TEXT,source TEXT,version_id TEXT,observed_at TEXT NOT NULL,deployment_id TEXT NOT NULL PRIMARY KEY);

CREATE TABLE monthly_finance(project TEXT NOT NULL,month TEXT NOT NULL,revenue_cents INTEGER NOT NULL CHECK(revenue_cents>=0),refund_cents INTEGER NOT NULL CHECK(refund_cents>=0),fees_cents INTEGER NOT NULL CHECK(fees_cents>=0),hosting_cents INTEGER NOT NULL CHECK(hosting_cents>=0),other_cents INTEGER NOT NULL CHECK(other_cents>=0),note TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(project,month));

CREATE TABLE portfolio_brands(project TEXT PRIMARY KEY, data_json TEXT NOT NULL CHECK(json_valid(data_json)),revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);

CREATE TABLE portfolio_expenses(id TEXT PRIMARY KEY,project TEXT NOT NULL CHECK(length(trim(project)) BETWEEN 1 AND 120),vendor TEXT NOT NULL CHECK(length(trim(vendor)) BETWEEN 1 AND 120),service TEXT NOT NULL CHECK(length(trim(service)) BETWEEN 1 AND 160),category TEXT NOT NULL CHECK(category IN ('Hosting','Domain','AI','Software','Email','Marketing','Other')),cadence TEXT NOT NULL CHECK(cadence IN ('Monthly','Annual','One-time')),amount_cents INTEGER CHECK(amount_cents IS NULL OR amount_cents BETWEEN 0 AND 9999999999),next_due TEXT NOT NULL DEFAULT '' CHECK(next_due='' OR (length(next_due)=10 AND date(next_due,'+0 days')=next_due)),state TEXT NOT NULL DEFAULT 'Active' CHECK(state IN ('Active','Review','Ended')),notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=2000),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE portfolio_expense_history(id INTEGER PRIMARY KEY AUTOINCREMENT,expense_id TEXT NOT NULL REFERENCES portfolio_expenses(id),revision INTEGER NOT NULL,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,action TEXT NOT NULL,previous_json TEXT NOT NULL CHECK(json_valid(previous_json)),current_json TEXT NOT NULL CHECK(json_valid(current_json)));

CREATE INDEX outbound_created ON outbound(created_at DESC);

CREATE INDEX portfolio_expenses_due ON portfolio_expenses(state,next_due);

CREATE TRIGGER portfolio_expense_revision BEFORE UPDATE ON portfolio_expenses WHEN NEW.revision<>OLD.revision+1 OR NEW.id<>OLD.id BEGIN SELECT RAISE(ABORT,'Expense revision conflict'); END;

CREATE TRIGGER portfolio_expense_audit AFTER UPDATE ON portfolio_expenses BEGIN INSERT INTO portfolio_expense_history(expense_id,revision,action,previous_json,current_json) VALUES(NEW.id,NEW.revision,'Updated',json_object('project',OLD.project,'vendor',OLD.vendor,'service',OLD.service,'category',OLD.category,'cadence',OLD.cadence,'amount_cents',OLD.amount_cents,'next_due',OLD.next_due,'state',OLD.state,'notes',OLD.notes),json_object('project',NEW.project,'vendor',NEW.vendor,'service',NEW.service,'category',NEW.category,'cadence',NEW.cadence,'amount_cents',NEW.amount_cents,'next_due',NEW.next_due,'state',NEW.state,'notes',NEW.notes)); END;

CREATE TRIGGER portfolio_expense_created AFTER INSERT ON portfolio_expenses BEGIN INSERT INTO portfolio_expense_history(expense_id,revision,action,previous_json,current_json) VALUES(NEW.id,NEW.revision,'Created','{}',json_object('project',NEW.project,'vendor',NEW.vendor,'service',NEW.service,'category',NEW.category,'cadence',NEW.cadence,'amount_cents',NEW.amount_cents,'next_due',NEW.next_due,'state',NEW.state,'notes',NEW.notes)); END;

-- Project Zero private inbound mail index. Original MIME is retained in private R2.
CREATE TABLE IF NOT EXISTS projectzero_mail_messages(id TEXT PRIMARY KEY CHECK(length(id)=64),sender TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL CHECK(length(body)<=20000),message_id TEXT NOT NULL,created_at TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes>=0 AND bytes<=10485760));
CREATE INDEX IF NOT EXISTS projectzero_mail_received ON projectzero_mail_messages(created_at DESC);

-- Central inbox spam overrides. NULL row = automatic classification; spam=1 forced Spam, spam=0 forced Inbox and trusted sender.
CREATE TABLE IF NOT EXISTS mailbox_spam(project TEXT NOT NULL,message_id TEXT NOT NULL CHECK(length(message_id) BETWEEN 1 AND 160),sender TEXT NOT NULL DEFAULT '' CHECK(length(sender)<=254),spam INTEGER NOT NULL CHECK(spam IN (0,1)),updated_at TEXT NOT NULL,PRIMARY KEY(project,message_id));
CREATE INDEX IF NOT EXISTS mailbox_spam_trusted ON mailbox_spam(spam,sender);
