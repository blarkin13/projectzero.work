-- Reconciled schema baseline. For new isolated development databases only.
-- No business records or production data. Never reapply to an existing production database.
CREATE TABLE tracker_tasks(project TEXT NOT NULL,task_id TEXT PRIMARY KEY,priority TEXT NOT NULL,task TEXT NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,due_date TEXT NOT NULL,source_updated TEXT NOT NULL,evidence TEXT NOT NULL,notes TEXT NOT NULL,repository TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_by TEXT NOT NULL DEFAULT 'Sheet import');

CREATE TABLE tracker_instructions(position INTEGER PRIMARY KEY,heading TEXT NOT NULL,details TEXT NOT NULL);

CREATE TABLE tracker_projects(project TEXT PRIMARY KEY,website TEXT,repository TEXT,cadence TEXT);

CREATE TABLE tracker_history(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL,revision INTEGER NOT NULL,actor TEXT NOT NULL,changed_at TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL);

CREATE TABLE tracker_api_keys(id TEXT PRIMARY KEY, actor TEXT NOT NULL CHECK(actor IN ('ChatGPT','Claude')), token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);

CREATE TABLE tracker_api_rate(key_id TEXT NOT NULL,minute TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(key_id,minute));

CREATE TABLE tracker_owner_actions(task_id TEXT PRIMARY KEY REFERENCES tracker_tasks(task_id),instructions TEXT NOT NULL,action_status TEXT NOT NULL DEFAULT 'Needed' CHECK(action_status IN ('Needed','Responded','Resolved')),owner_response TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE tracker_owner_action_history(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL,revision INTEGER NOT NULL,actor TEXT NOT NULL,changed_at TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL);

CREATE TABLE lifecycle_projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,tracker_project TEXT UNIQUE REFERENCES tracker_projects(project),concept TEXT NOT NULL DEFAULT '',audience TEXT NOT NULL DEFAULT '',business_model TEXT NOT NULL DEFAULT '',budget_cents INTEGER CHECK(budget_cents IS NULL OR budget_cents>=0),notes TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE lifecycle_gates(lifecycle_id TEXT NOT NULL REFERENCES lifecycle_projects(id) ON DELETE CASCADE,stage TEXT NOT NULL CHECK(stage IN ('idea','viability','identity','architecture','build','launch','growth')),status TEXT NOT NULL DEFAULT 'Not reviewed' CHECK(status IN ('Not reviewed','In progress','Blocked','Approved')),evidence TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(lifecycle_id,stage),CHECK(status<>'Approved' OR length(trim(evidence))>0));

CREATE TABLE lifecycle_history(id INTEGER PRIMARY KEY AUTOINCREMENT,lifecycle_id TEXT NOT NULL,stage TEXT,action TEXT NOT NULL,revision INTEGER NOT NULL,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE lifecycle_execution(lifecycle_id TEXT PRIMARY KEY REFERENCES lifecycle_projects(id) ON DELETE CASCADE,mode TEXT NOT NULL DEFAULT 'Manual' CHECK(mode IN ('Manual','AI-assisted','Mixed')),repository TEXT NOT NULL DEFAULT '',chatgpt_plan TEXT NOT NULL DEFAULT '',claude_plan TEXT NOT NULL DEFAULT '',manual_plan TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE lifecycle_schedule_observations(automation_id TEXT PRIMARY KEY,title TEXT NOT NULL,cadence TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),scope TEXT NOT NULL,observed_at TEXT NOT NULL);

CREATE TABLE lifecycle_intake(lifecycle_id TEXT PRIMARY KEY REFERENCES lifecycle_projects(id) ON DELETE CASCADE,origin TEXT NOT NULL CHECK(origin IN ('new','existing')),website TEXT NOT NULL DEFAULT '',repo_choice TEXT NOT NULL DEFAULT 'none' CHECK(repo_choice IN ('link','create','none')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE lifecycle_repo_catalog(repository TEXT PRIMARY KEY,url TEXT NOT NULL,visibility TEXT NOT NULL,default_branch TEXT NOT NULL,observed_at TEXT NOT NULL);

CREATE TABLE tracker_document_sync(task_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, synced_revision INTEGER NOT NULL DEFAULT 0, verified_at TEXT, object_key TEXT, CHECK(synced_revision<=revision));

CREATE TABLE tracker_history_sync(id INTEGER PRIMARY KEY CHECK(id=1),last_history_id INTEGER NOT NULL DEFAULT 0,verified_at TEXT);

CREATE TABLE lifecycle_platforms(lifecycle_id TEXT NOT NULL REFERENCES lifecycle_projects(id) ON DELETE CASCADE,category TEXT NOT NULL CHECK(category IN ('hosting','domains','database','storage','identity','payments','email','analytics','monitoring','commerce','distribution','marketing','support','ci')),provider TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Not decided' CHECK(status IN ('Not decided','Needs setup','Existing account','Configured (owner reported)','Not needed')),monthly_cents INTEGER CHECK(monthly_cents IS NULL OR monthly_cents>=0),notes TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(lifecycle_id,category));

CREATE TABLE lifecycle_profile(lifecycle_id TEXT PRIMARY KEY REFERENCES lifecycle_projects(id) ON DELETE CASCADE,product_type TEXT NOT NULL DEFAULT 'Undecided' CHECK(product_type IN ('Undecided','Website / content','Web app / SaaS','Online store','Mobile app','Desktop app','API / backend','Self-hosted / other')),revenue_type TEXT NOT NULL DEFAULT 'Undecided' CHECK(revenue_type IN ('Undecided','Free / noncommercial','Advertising','Subscriptions','One-time sales','Services / leads')),experience TEXT NOT NULL DEFAULT 'Undecided' CHECK(experience IN ('Undecided','Beginner','Some experience','Developer')),analysis TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE "lifecycle_backlog"(lifecycle_id TEXT NOT NULL REFERENCES lifecycle_projects(id) ON DELETE CASCADE,id TEXT NOT NULL,priority TEXT NOT NULL CHECK(priority IN ('P0','P1','P2','Exposure')),title TEXT NOT NULL,requirements TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(lifecycle_id,id));

CREATE TABLE lifecycle_activation(lifecycle_id TEXT PRIMARY KEY REFERENCES lifecycle_projects(id) ON DELETE CASCADE,brief_revision INTEGER NOT NULL,expected_tasks INTEGER NOT NULL CHECK(expected_tasks>0),activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE lifecycle_business_goals(lifecycle_id TEXT PRIMARY KEY REFERENCES lifecycle_projects(id) ON DELETE CASCADE,revenue_cents INTEGER CHECK(revenue_cents IS NULL OR revenue_cents BETWEEN 0 AND 9999999999),profit_cents INTEGER CHECK(profit_cents IS NULL OR profit_cents BETWEEN 0 AND 9999999999),review_due TEXT NOT NULL DEFAULT '' CHECK(review_due='' OR (length(review_due)=10 AND date(review_due,'+0 days')=review_due)),decision TEXT NOT NULL DEFAULT 'Not reviewed' CHECK(decision IN ('Not reviewed','Validate','Continue','Maintain','Expand','Pivot','Pause')),evidence TEXT NOT NULL DEFAULT '' CHECK(length(evidence)<=4000 AND (decision='Not reviewed' OR length(trim(evidence))>0)),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE lifecycle_business_decisions(id INTEGER PRIMARY KEY AUTOINCREMENT,lifecycle_id TEXT NOT NULL REFERENCES lifecycle_projects(id) ON DELETE CASCADE,revision INTEGER NOT NULL,decision TEXT NOT NULL,evidence TEXT NOT NULL,revenue_cents INTEGER,profit_cents INTEGER,review_due TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(lifecycle_id,revision));

CREATE INDEX tracker_priority_status ON tracker_tasks(priority,status);

CREATE INDEX tracker_history_task ON tracker_history(task_id,id DESC);

CREATE INDEX tracker_keys_hash ON tracker_api_keys(token_hash);

CREATE UNIQUE INDEX lifecycle_github_repo_unique ON lifecycle_execution(lower(rtrim(repository,'/'))) WHERE lower(repository) LIKE 'https://github.com/%';

CREATE INDEX tracker_doc_pending ON tracker_document_sync(task_id) WHERE revision>synced_revision;

CREATE UNIQUE INDEX lifecycle_backlog_title_unique ON lifecycle_backlog(lifecycle_id,lower(trim(title)));

CREATE VIEW tracker_active_tasks AS SELECT * FROM tracker_tasks WHERE project<>'tCSC';

CREATE VIEW tracker_active_projects AS SELECT * FROM tracker_projects WHERE project<>'tCSC';

CREATE TRIGGER tracker_revision_guard BEFORE UPDATE ON tracker_tasks WHEN NEW.revision<>OLD.revision+1 OR NEW.task_id<>OLD.task_id OR NEW.updated_by NOT IN ('ChatGPT','Claude','Owner') OR NEW.status NOT IN ('Needs verification','Ready to verify','In progress','Blocked','Done','Deferred','Not started') OR NEW.priority NOT IN ('P0','P1','P2','Exposure') OR (NEW.status='Done' AND OLD.status<>'Done' AND trim(NEW.evidence)='') BEGIN SELECT RAISE(ABORT,'Invalid tracker update: revision, actor, status, priority or evidence'); END;

CREATE TRIGGER tracker_audit AFTER UPDATE ON tracker_tasks BEGIN INSERT INTO tracker_history(task_id,revision,actor,changed_at,before_json,after_json) VALUES(NEW.task_id,NEW.revision,NEW.updated_by,NEW.updated_at,json_object('priority',OLD.priority,'task',OLD.task,'status',OLD.status,'owner',OLD.owner,'due_date',OLD.due_date,'evidence',OLD.evidence,'notes',OLD.notes),json_object('priority',NEW.priority,'task',NEW.task,'status',NEW.status,'owner',NEW.owner,'due_date',NEW.due_date,'evidence',NEW.evidence,'notes',NEW.notes)); END;

CREATE TRIGGER tracker_legacy_archive_guard BEFORE UPDATE ON tracker_tasks WHEN OLD.project='tCSC' BEGIN SELECT RAISE(ABORT,'Archived project'); END;

CREATE TRIGGER tracker_action_revision BEFORE UPDATE ON tracker_owner_actions WHEN NEW.revision<>OLD.revision+1 OR NEW.task_id<>OLD.task_id OR NEW.updated_by NOT IN ('Owner','ChatGPT','Claude') BEGIN SELECT RAISE(ABORT,'Invalid owner action revision'); END;

CREATE TRIGGER tracker_action_audit AFTER UPDATE ON tracker_owner_actions BEGIN INSERT INTO tracker_owner_action_history(task_id,revision,actor,changed_at,before_json,after_json) VALUES(NEW.task_id,NEW.revision,NEW.updated_by,NEW.updated_at,json_object('instructions',OLD.instructions,'status',OLD.action_status,'response',OLD.owner_response),json_object('instructions',NEW.instructions,'status',NEW.action_status,'response',NEW.owner_response)); END;

CREATE TRIGGER tracker_feature_creation_audit AFTER INSERT ON tracker_tasks WHEN NEW.task_id GLOB '*-F-*' AND NEW.updated_by='Owner' BEGIN INSERT INTO tracker_history(task_id,revision,actor,changed_at,before_json,after_json) VALUES(NEW.task_id,NEW.revision,NEW.updated_by,NEW.updated_at,'{}',json_object('priority',NEW.priority,'task',NEW.task,'status',NEW.status,'owner',NEW.owner,'due_date',NEW.due_date,'evidence',NEW.evidence,'notes',NEW.notes)); END;

CREATE TRIGGER lifecycle_gate_update_guard BEFORE UPDATE ON lifecycle_gates WHEN NEW.revision<>OLD.revision+1 OR NEW.stage<>OLD.stage OR NEW.lifecycle_id<>OLD.lifecycle_id BEGIN SELECT RAISE(ABORT,'Lifecycle revision conflict'); END;

CREATE TRIGGER lifecycle_project_update_guard BEFORE UPDATE ON lifecycle_projects WHEN NEW.revision<>OLD.revision+1 OR NEW.id<>OLD.id BEGIN SELECT RAISE(ABORT,'Lifecycle revision conflict'); END;

CREATE TRIGGER lifecycle_gate_audit AFTER UPDATE ON lifecycle_gates BEGIN INSERT INTO lifecycle_history(lifecycle_id,stage,action,revision) VALUES(NEW.lifecycle_id,NEW.stage,NEW.status,NEW.revision); END;

CREATE TRIGGER lifecycle_project_audit AFTER UPDATE ON lifecycle_projects BEGIN INSERT INTO lifecycle_history(lifecycle_id,action,revision) VALUES(NEW.id,'Brief updated',NEW.revision); END;

CREATE TRIGGER lifecycle_repo_tracker_sync AFTER UPDATE OF repository ON lifecycle_execution WHEN NEW.repository<>OLD.repository BEGIN UPDATE tracker_projects SET repository=NEW.repository WHERE project=(SELECT tracker_project FROM lifecycle_projects WHERE id=NEW.lifecycle_id) AND project<>'tCSC'; END;

CREATE TRIGGER lifecycle_repo_tracker_insert AFTER INSERT ON lifecycle_execution WHEN NEW.repository<>'' BEGIN UPDATE tracker_projects SET repository=NEW.repository WHERE project=(SELECT tracker_project FROM lifecycle_projects WHERE id=NEW.lifecycle_id) AND project<>'tCSC'; END;

CREATE TRIGGER tracker_doc_enqueue_insert AFTER INSERT ON tracker_tasks BEGIN INSERT INTO tracker_document_sync(task_id,revision) VALUES(NEW.task_id,NEW.revision) ON CONFLICT(task_id) DO UPDATE SET revision=excluded.revision; END;

CREATE TRIGGER tracker_doc_enqueue_update AFTER UPDATE ON tracker_tasks BEGIN INSERT INTO tracker_document_sync(task_id,revision) VALUES(NEW.task_id,NEW.revision) ON CONFLICT(task_id) DO UPDATE SET revision=excluded.revision; END;

CREATE TRIGGER lifecycle_activate_project AFTER INSERT ON lifecycle_activation BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM lifecycle_projects p WHERE p.id=NEW.lifecycle_id AND p.tracker_project IS NULL AND p.revision=NEW.brief_revision AND length(trim(p.name))>0 AND lower(trim(p.name))<>'tcsc') THEN RAISE(ABORT,'Draft changed or already activated') END;
SELECT CASE WHEN (SELECT COUNT(*) FROM lifecycle_gates WHERE lifecycle_id=NEW.lifecycle_id AND stage IN ('idea','viability','identity','architecture') AND status='Approved')<>4 THEN RAISE(ABORT,'Approve the four planning checkpoints first') END;
SELECT CASE WHEN (SELECT COUNT(*) FROM lifecycle_backlog WHERE lifecycle_id=NEW.lifecycle_id)<>NEW.expected_tasks THEN RAISE(ABORT,'Roadmap changed; review it again') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM tracker_projects t JOIN lifecycle_projects p ON p.id=NEW.lifecycle_id WHERE lower(trim(t.project))=lower(trim(p.name))) THEN RAISE(ABORT,'Tracker project name already exists') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM tracker_projects t JOIN lifecycle_execution e ON e.lifecycle_id=NEW.lifecycle_id WHERE trim(e.repository)<>'' AND lower(rtrim(COALESCE(t.repository,''),'/'))=lower(rtrim(e.repository,'/'))) THEN RAISE(ABORT,'Repository already belongs to a tracker project') END;
INSERT INTO tracker_projects(project,website,repository,cadence) SELECT p.name,COALESCE(i.website,''),COALESCE(e.repository,''),'Manual' FROM lifecycle_projects p LEFT JOIN lifecycle_intake i ON i.lifecycle_id=p.id LEFT JOIN lifecycle_execution e ON e.lifecycle_id=p.id WHERE p.id=NEW.lifecycle_id;
UPDATE lifecycle_projects SET tracker_project=name,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.lifecycle_id;
INSERT INTO tracker_tasks(project,task_id,priority,task,status,owner,due_date,source_updated,evidence,notes,repository,revision,updated_by) SELECT p.tracker_project,b.id,b.priority,b.title,'Not started','Unassigned','','Owner lifecycle activation','',b.requirements,COALESCE(e.repository,''),1,'Owner' FROM lifecycle_backlog b JOIN lifecycle_projects p ON p.id=b.lifecycle_id LEFT JOIN lifecycle_execution e ON e.lifecycle_id=p.id WHERE b.lifecycle_id=NEW.lifecycle_id;
INSERT INTO lifecycle_history(lifecycle_id,action,revision) SELECT id,'Activated private development project',revision FROM lifecycle_projects WHERE id=NEW.lifecycle_id;
END;

CREATE TRIGGER lifecycle_backlog_link_sync AFTER INSERT ON lifecycle_backlog WHEN EXISTS(SELECT 1 FROM lifecycle_projects p JOIN tracker_active_projects t ON t.project=p.tracker_project WHERE p.id=NEW.lifecycle_id) BEGIN
SELECT CASE WHEN EXISTS(SELECT 1 FROM tracker_tasks t JOIN lifecycle_projects p ON p.tracker_project=t.project WHERE p.id=NEW.lifecycle_id AND lower(trim(t.task))=lower(trim(NEW.title))) THEN RAISE(ABORT,'Task title already exists') END;
INSERT INTO tracker_tasks(project,task_id,priority,task,status,owner,due_date,source_updated,evidence,notes,repository,revision,updated_by) SELECT t.project,NEW.id,NEW.priority,NEW.title,'Not started','Unassigned','','Owner lifecycle plan','',NEW.requirements,COALESCE(t.repository,''),1,'Owner' FROM lifecycle_projects p JOIN tracker_active_projects t ON t.project=p.tracker_project WHERE p.id=NEW.lifecycle_id;
END;

CREATE TRIGGER lifecycle_launch_guard BEFORE UPDATE ON lifecycle_gates WHEN NEW.stage='launch' AND NEW.status='Approved' BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM lifecycle_projects p JOIN tracker_active_projects t ON t.project=p.tracker_project WHERE p.id=NEW.lifecycle_id) THEN RAISE(ABORT,'Activate the private development project first') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tracker_tasks t JOIN lifecycle_projects p ON p.tracker_project=t.project WHERE p.id=NEW.lifecycle_id) THEN RAISE(ABORT,'Review a nonempty development roadmap first') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM tracker_tasks t JOIN lifecycle_projects p ON p.tracker_project=t.project WHERE p.id=NEW.lifecycle_id AND t.priority='P0' AND (t.status<>'Done' OR trim(t.evidence)='')) THEN RAISE(ABORT,'Complete and verify all P0 tasks before launch approval') END;
END;

CREATE TRIGGER lifecycle_business_revision BEFORE UPDATE ON lifecycle_business_goals WHEN NEW.lifecycle_id<>OLD.lifecycle_id OR NEW.revision<>OLD.revision+1 BEGIN SELECT RAISE(ABORT,'Business review revision conflict'); END;

CREATE TRIGGER lifecycle_business_created AFTER INSERT ON lifecycle_business_goals BEGIN INSERT INTO lifecycle_business_decisions(lifecycle_id,revision,decision,evidence,revenue_cents,profit_cents,review_due) VALUES(NEW.lifecycle_id,NEW.revision,NEW.decision,NEW.evidence,NEW.revenue_cents,NEW.profit_cents,NEW.review_due); END;

CREATE TRIGGER lifecycle_business_updated AFTER UPDATE ON lifecycle_business_goals BEGIN INSERT INTO lifecycle_business_decisions(lifecycle_id,revision,decision,evidence,revenue_cents,profit_cents,review_due) VALUES(NEW.lifecycle_id,NEW.revision,NEW.decision,NEW.evidence,NEW.revenue_cents,NEW.profit_cents,NEW.review_due); END;

CREATE TRIGGER lifecycle_delete_draft_guard BEFORE DELETE ON lifecycle_projects WHEN OLD.tracker_project IS NOT NULL OR EXISTS (SELECT 1 FROM lifecycle_activation WHERE lifecycle_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Active lifecycle project protected'); END;

CREATE TRIGGER lifecycle_delete_history AFTER DELETE ON lifecycle_projects BEGIN DELETE FROM lifecycle_history WHERE lifecycle_id=OLD.id; END;
