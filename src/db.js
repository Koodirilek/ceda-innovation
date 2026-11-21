import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const FILES = path.join(dir, 'files');
fs.mkdirSync(FILES, { recursive: true });
export const db = new DatabaseSync(process.env.DB_FILE || path.join(dir, 'portal.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-20000; PRAGMA busy_timeout=5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT UNIQUE, pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'submitter', verified INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, fails INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0, alert_email INTEGER NOT NULL DEFAULT 1, alert_sms INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS otps(id INTEGER PRIMARY KEY, identifier TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ideas(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, category TEXT, summary TEXT, problem TEXT, solution TEXT, impact TEXT,
  stage TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 1, decision_note TEXT, submitted_at TEXT, decided_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS idea_versions(id INTEGER PRIMARY KEY, idea_id INTEGER NOT NULL REFERENCES ideas(id), version INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY, idea_id INTEGER, content_id INTEGER, name TEXT NOT NULL, size INTEGER, file TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS criteria(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, weight REAL NOT NULL DEFAULT 1, max_score INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY, idea_id INTEGER NOT NULL REFERENCES ideas(id), evaluator_id INTEGER NOT NULL REFERENCES users(id), level INTEGER NOT NULL, submitted_at TEXT, UNIQUE(idea_id,evaluator_id,level));
CREATE TABLE IF NOT EXISTS scores(id INTEGER PRIMARY KEY, idea_id INTEGER NOT NULL, evaluator_id INTEGER NOT NULL, level INTEGER NOT NULL, version INTEGER NOT NULL, criterion_id INTEGER NOT NULL, score REAL NOT NULL, comment TEXT,
  UNIQUE(idea_id,evaluator_id,level,version,criterion_id));
CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY, idea_id INTEGER NOT NULL, author_id INTEGER NOT NULL, kind TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, version INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stage_log(id INTEGER PRIMARY KEY, idea_id INTEGER NOT NULL, from_stage TEXT, to_stage TEXT NOT NULL, actor_id INTEGER, note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, idea_id INTEGER, message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subscriptions(user_id INTEGER NOT NULL, idea_id INTEGER NOT NULL, PRIMARY KEY(user_id,idea_id));
CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY, channel TEXT, to_addr TEXT, subject TEXT, body TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, entity TEXT, entity_id INTEGER, ip TEXT, detail TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content(id INTEGER PRIMARY KEY, slug TEXT, title TEXT NOT NULL, body TEXT, kind TEXT NOT NULL DEFAULT 'page', sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT);
CREATE TABLE IF NOT EXISTS faqs(id INTEGER PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS regulators(id INTEGER PRIMARY KEY, name TEXT NOT NULL, contact TEXT, url TEXT);
CREATE TABLE IF NOT EXISTS chat_sessions(id INTEGER PRIMARY KEY, user_id INTEGER, agent_id INTEGER, status TEXT NOT NULL, created_at TEXT NOT NULL, accepted_at TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL, sender TEXT NOT NULL, sender_id INTEGER, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_scores_idea ON scores(idea_id,version); CREATE INDEX IF NOT EXISTS ix_feedback_idea ON feedback(idea_id); CREATE INDEX IF NOT EXISTS ix_log_idea ON stage_log(idea_id);
CREATE INDEX IF NOT EXISTS ix_att_idea ON attachments(idea_id); CREATE INDEX IF NOT EXISTS ix_att_content ON attachments(content_id); CREATE INDEX IF NOT EXISTS ix_assign_idea ON assignments(idea_id,level);
CREATE INDEX IF NOT EXISTS ix_sub_idea ON subscriptions(idea_id); CREATE INDEX IF NOT EXISTS ix_ver_idea ON idea_versions(idea_id); CREATE INDEX IF NOT EXISTS ix_msg_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS ix_chat_status ON chat_sessions(status,user_id); CREATE INDEX IF NOT EXISTS ix_ideas_upd ON ideas(updated_at); CREATE INDEX IF NOT EXISTS ix_users_role ON users(role); CREATE INDEX IF NOT EXISTS ix_otp_ident ON otps(identifier,purpose);
CREATE INDEX IF NOT EXISTS ix_ideas_stage ON ideas(stage); CREATE INDEX IF NOT EXISTS ix_ideas_owner ON ideas(owner_id);
CREATE INDEX IF NOT EXISTS ix_assign_eval ON assignments(evaluator_id); CREATE INDEX IF NOT EXISTS ix_notif_user ON notifications(user_id);
`);

const nul = a => a.map(v => (v === undefined ? null : v));
const stmts = new Map(); // prepared statements are compiled once and reused
const prep = s => { let p = stmts.get(s); if (!p) { p = db.prepare(s); stmts.set(s, p); } return p; };
export const q = {
  all: (s, ...p) => prep(s).all(...nul(p)),
  get: (s, ...p) => prep(s).get(...nul(p)),
  run: (s, ...p) => { const r = prep(s).run(...nul(p)); return { changes: Number(r.changes), id: Number(r.lastInsertRowid) }; },
};
export const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
