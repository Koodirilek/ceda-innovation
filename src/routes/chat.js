import { Router } from 'express';
import { q } from '../db.js';
import { need, bad, now, txt, audit } from '../lib.js';

const r = Router();
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
// Open 09:00-16:00 Monday-Friday, Africa/Gaborone time. CHAT_ALWAYS_OPEN=true is for testing only.
export function chatOpen() {
  if (process.env.CHAT_ALWAYS_OPEN === 'true') return true;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Gaborone', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const m = Number(p.hour) * 60 + Number(p.minute); return DAYS.includes(p.weekday) && m >= 540 && m < 960;
}
const online = () => q.get("SELECT COUNT(*) c FROM users WHERE role='agent' AND active=1 AND last_seen>?", Date.now() - 40000).c;
const AFTER = 'Agent not available at the moment. Our consultants are available from 09:00 to 16:00 on working days. You can still ask the assistant any time.';
const BUSY = 'All agents are busy or offline at the moment. Please try again shortly, or ask the assistant.';
const sys = (id, body) => q.run("INSERT INTO chat_messages(session_id,sender,body,created_at) VALUES(?,'system',?,?)", id, body, now());
const session = id => q.get('SELECT * FROM chat_sessions WHERE id=?', Number(id)) || bad('Chat not found.', 404);
const member = (u, s) => s.user_id === u.id || (['agent', 'admin'].includes(u.role) && (s.agent_id === u.id || s.status === 'waiting' || u.role === 'admin'));

r.get('/status', (req, res) => { const open = chatOpen(); res.json({ open, agentsOnline: online(), hours: 'Monday to Friday, 09:00 to 16:00 (Botswana time)', message: open ? (online() ? null : BUSY) : AFTER }); });

r.post('/sessions', need(), (req, res) => {
  if (!chatOpen()) { q.run("INSERT INTO chat_sessions(user_id,status,created_at) VALUES(?, 'missed', ?)", req.user.id, now()); return res.json({ available: false, message: AFTER }); }
  if (!online()) { q.run("INSERT INTO chat_sessions(user_id,status,created_at) VALUES(?, 'missed', ?)", req.user.id, now()); return res.json({ available: false, message: BUSY }); }
  let s = q.get("SELECT * FROM chat_sessions WHERE user_id=? AND status IN ('waiting','active') ORDER BY id DESC", req.user.id);
  if (!s) { const id = q.run("INSERT INTO chat_sessions(user_id,status,created_at) VALUES(?, 'waiting', ?)", req.user.id, now()).id; sys(id, 'You are in the queue. A consultant will join shortly.'); s = session(id); }
  res.json({ available: true, session: s });
});
r.get('/sessions/:id', need(), (req, res) => {
  const s = session(req.params.id); if (!member(req.user, s)) bad('Chat not found.', 404);
  res.json({ session: s, messages: q.all('SELECT id,sender,body,created_at FROM chat_messages WHERE session_id=? AND id>? ORDER BY id', s.id, Number(req.query.after) || 0) });
});
r.post('/sessions/:id/messages', need(), (req, res) => {
  const s = session(req.params.id); if (!member(req.user, s)) bad('Chat not found.', 404);
  if (s.status === 'closed') bad('This chat has ended.', 409);
  if (s.user_id !== req.user.id && s.agent_id !== req.user.id) bad('Accept this chat first.', 403);
  const body = txt(req.body.body, 1000); if (!body) bad('Type a message first.');
  q.run('INSERT INTO chat_messages(session_id,sender,sender_id,body,created_at) VALUES(?,?,?,?,?)', s.id, s.user_id === req.user.id ? 'user' : 'agent', req.user.id, body, now()); res.json({ ok: true });
});
r.post('/sessions/:id/accept', need('agent', 'admin'), (req, res) => {
  const s = session(req.params.id); if (s.status !== 'waiting') bad('Another consultant already took this chat.', 409);
  q.run("UPDATE chat_sessions SET status='active',agent_id=?,accepted_at=? WHERE id=?", req.user.id, now(), s.id); sys(s.id, `${req.user.name} from CEDA has joined the chat.`); audit(req, 'chat_accept', 'chat', s.id); res.json({ ok: true });
});
r.post('/sessions/:id/close', need(), (req, res) => {
  const s = session(req.params.id); if (!member(req.user, s)) bad('Chat not found.', 404);
  if (s.status !== 'closed') { q.run("UPDATE chat_sessions SET status='closed',closed_at=? WHERE id=?", now(), s.id); sys(s.id, 'This chat has ended.'); } res.json({ ok: true });
});
r.get('/queue', need('agent', 'admin'), (req, res) => {
  q.run('UPDATE users SET last_seen=? WHERE id=?', Date.now(), req.user.id);
  const base = "SELECT s.id,s.status,s.created_at,u.name user,(SELECT body FROM chat_messages m WHERE m.session_id=s.id AND m.sender='user' ORDER BY m.id DESC LIMIT 1) last FROM chat_sessions s JOIN users u ON u.id=s.user_id";
  res.json({ waiting: q.all(base + " WHERE s.status='waiting' ORDER BY s.id"), mine: q.all(base + " WHERE s.status='active' AND s.agent_id=? ORDER BY s.id", req.user.id) });
});
r.get('/analytics', need('agent', 'admin'), (req, res) => {
  const c = w => q.get(`SELECT COUNT(*) c FROM chat_sessions ${w}`).c, t = (a, b) => q.get(`SELECT AVG((julianday(${b})-julianday(${a}))*86400) v FROM chat_sessions WHERE ${b} IS NOT NULL AND ${a} IS NOT NULL`).v;
  const num = v => (v == null ? null : Math.round(v * 10) / 10);
  res.json({
    total: c(''), answered: c("WHERE status IN ('active','closed')"), missed: c("WHERE status='missed'"), waiting: c("WHERE status='waiting'"),
    avgWaitSeconds: num(t('created_at', 'accepted_at')), avgDurationMinutes: num((t('accepted_at', 'closed_at') || 0) / 60) || null,
    messages: q.get('SELECT COUNT(*) c FROM chat_messages').c,
    byHour: q.all("SELECT substr(created_at,12,2) hour,COUNT(*) count FROM chat_sessions GROUP BY 1 ORDER BY 1"),
    agents: q.all("SELECT u.name,COUNT(s.id) chats FROM users u LEFT JOIN chat_sessions s ON s.agent_id=u.id WHERE u.role='agent' GROUP BY u.id"),
  });
});
export default r;
