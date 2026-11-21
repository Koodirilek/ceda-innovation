import crypto from 'node:crypto';
import { q } from './db.js';

export const PROD = process.env.NODE_ENV === 'production' || !!process.env.RENDER; // Render sets RENDER=true
const SECRET = process.env.SESSION_SECRET || (PROD ? crypto.randomBytes(32).toString('hex') : 'dev-only-secret-change-me');
if (PROD && !process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production' && !process.env.RENDER) throw new Error('Set SESSION_SECRET in production.');
  console.warn('WARNING: SESSION_SECRET is not set. Using a temporary secret, so sign-ins reset when the server restarts. Set SESSION_SECRET in your host settings.');
}
const SECURE = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : PROD; // set COOKIE_SECURE=false only if serving plain HTTP
export const DEV_OTP = process.env.DEV_SHOW_OTP !== 'false'; // demo mode: show OTP codes on screen (no SMS/email gateway yet)
export const now = () => new Date().toISOString();

export const CATEGORIES = ['Agriculture', 'Technology', 'Education', 'Health', 'Manufacturing', 'Tourism', 'Green economy', 'Financial inclusion', 'Other'];
export const LABEL = { draft: 'Draft', submitted: 'Submitted', screening: 'Screening', level1: 'Evaluation level 1', level2: 'Evaluation level 2', adjudication: 'Adjudication', approved: 'Approved', returned: 'Returned for feedback', declined: 'Declined', awarded: 'Awarded' };
// Workflow engine: from-stage -> to-stage -> roles allowed. Edit this table to add stages or roles.
export const FLOW = {
  submitted: { screening: ['admin'] },
  screening: { level1: ['admin'], returned: ['admin'], declined: ['admin'] },
  level1: { level2: ['admin'], returned: ['admin'], declined: ['admin'] },
  level2: { adjudication: ['admin'], returned: ['admin'], declined: ['admin'] },
  adjudication: { approved: ['adjudicator', 'admin'], returned: ['adjudicator', 'admin'], declined: ['adjudicator', 'admin'] },
  approved: { awarded: ['admin'] },
};
export const ROLES_LIST = ['submitter', 'evaluator', 'adjudicator', 'admin', 'observer', 'agent'];
export const levelOf = s => ({ level1: 1, level2: 2 })[s];

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const bad = (m, s = 400) => { throw new HttpError(s, m); };

export const normId = s => {
  s = String(s || '').trim();
  if (s.includes('@')) return s.toLowerCase();
  const plus = s.startsWith('+'); const d = s.replace(/\D/g, '');
  if (!d) return '';
  if (!plus && d.length === 8 && d[0] === '7') return '+267' + d;
  return '+' + d;
};
export const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const isPhone = s => /^\+\d{8,15}$/.test(s);
export const strongPw = s => typeof s === 'string' && s.length >= 8 && s.length <= 100 && /[A-Za-z]/.test(s) && /\d/.test(s);
export const txt = (v, max = 4000) => (v == null ? null : String(v).trim().slice(0, max));

// Async versions run on the thread pool so password hashing never blocks other requests.
const scryptAsync = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));
export async function hashPwAsync(pw) { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + (await scryptAsync(pw, s)).toString('hex'); }
export async function checkPwAsync(pw, stored) {
  const [s, h] = stored.split(':'); const x = await scryptAsync(String(pw), Buffer.from(s, 'hex'));
  return crypto.timingSafeEqual(x, Buffer.from(h, 'hex'));
}
export function hashPw(pw) { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); }
export function checkPw(pw, stored) {
  const [s, h] = stored.split(':'); const x = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 64);
  return crypto.timingSafeEqual(x, Buffer.from(h, 'hex'));
}
const mac = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const sign = p => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + mac(b); };
const verify = t => {
  if (!t) return null; const [b, m] = t.split('.'); if (!b || !m || m.length !== mac(b).length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(m), Buffer.from(mac(b)))) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null;
};
export const setSession = (res, uid) => res.setHeader('Set-Cookie', `sid=${sign({ uid, exp: Date.now() + 8 * 3600e3 })}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${SECURE ? '; Secure' : ''}`);
export const clearSession = res => res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
export function loadUser(req, res, next) {
  req.body ??= {};
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ''); const p = verify(m && m[1]);
  if (p) { const u = q.get('SELECT id,name,email,phone,role,verified,active,alert_email,alert_sms FROM users WHERE id=?', p.uid); if (u && u.active) req.user = u; }
  next();
}
export const need = (...roles) => (req, res, next) => !req.user ? res.status(401).json({ message: 'Please sign in.' })
  : roles.length && !roles.includes(req.user.role) ? res.status(403).json({ message: 'You do not have access to this.' }) : next();

const hits = new Map();
export const limit = (max = Number(process.env.RATE_LIMIT || 20), win = 60000) => (req, res, next) => {
  const k = req.ip + req.baseUrl + req.path, t = Date.now(); const a = (hits.get(k) || []).filter(x => t - x < win); a.push(t); hits.set(k, a);
  if (a.length > max) return res.status(429).json({ message: 'Too many attempts. Please wait a minute and try again.' }); next();
};

export function audit(req, action, entity, entityId, detail) {
  q.run('INSERT INTO audit_log(user_id,action,entity,entity_id,ip,detail,created_at) VALUES(?,?,?,?,?,?,?)', req.user?.id, action, entity, entityId, req.ip, detail ? JSON.stringify(detail) : null, now());
}

// ---- real-time (Server-Sent Events) ----
const clients = new Set();
export function sseAdd(user, res) { const c = { user, res }; clients.add(c); res.on('close', () => clients.delete(c)); }
export function push(event, data, ids = []) {
  for (const c of clients) if (ids.includes(c.user.id) || ['admin', 'observer', 'adjudicator'].includes(c.user.role)) c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---- messaging + integration hooks ----
export function hook(event, data) {
  const u = process.env.WEBHOOK_URL;
  if (u) fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, data, at: now() }) }).catch(() => {});
}
// Replace the body of deliver() with your local SMTP / SMS gateway call. Every message is also logged to the outbox table.
export function deliver(channel, to, subject, body) {
  q.run('INSERT INTO outbox(channel,to_addr,subject,body,created_at) VALUES(?,?,?,?,?)', channel, to, subject, body, now());
  if (!PROD) console.log(`[${channel}] to ${to}: ${body}`);
}
export function notify(userIds, ideaId, message) {
  const seen = new Set();
  for (const id of userIds) {
    if (!id || seen.has(id)) continue; seen.add(id);
    const u = q.get('SELECT * FROM users WHERE id=?', id); if (!u) continue;
    q.run('INSERT INTO notifications(user_id,idea_id,message,created_at) VALUES(?,?,?,?)', id, ideaId, message, now());
    if (u.email && u.alert_email) deliver('email', u.email, 'CEDA Innovation Portal update', message);
    if (u.phone && u.alert_sms) deliver('sms', u.phone, 'CEDA Innovation Portal', message);
  }
  push('notification', { ideaId, message }, [...seen]);
}
export const admins = () => q.all("SELECT id FROM users WHERE role='admin' AND active=1").map(r => r.id);
export function notifyIdea(i, message) { notify([i.owner_id, ...q.all('SELECT user_id FROM subscriptions WHERE idea_id=?', i.id).map(r => r.user_id)], i.id, message); }

// ---- one-time codes ----
export function makeOtp(identifier, purpose) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  q.run('UPDATE otps SET used=1 WHERE identifier=? AND purpose=?', identifier, purpose);
  q.run('INSERT INTO otps(identifier,purpose,code_hash,expires) VALUES(?,?,?,?)', identifier, purpose, mac(code), Date.now() + 600000);
  const msg = `Your CEDA Innovation Portal code is ${code}. It expires in 10 minutes.`;
  identifier.includes('@') ? deliver('email', identifier, 'Your verification code', msg) : deliver('sms', identifier, 'Verification code', msg);
  return code;
}
export function checkOtp(identifier, purpose, code) {
  const o = q.get('SELECT * FROM otps WHERE identifier=? AND purpose=? AND used=0 ORDER BY id DESC LIMIT 1', identifier, purpose);
  if (!o || o.expires < Date.now() || o.attempts >= 5) return false;
  q.run('UPDATE otps SET attempts=attempts+1 WHERE id=?', o.id);
  if (mac(String(code)) !== o.code_hash) return false;
  q.run('UPDATE otps SET used=1 WHERE id=?', o.id); return true;
}

// ---- scoring ----
export const pct = items => { let a = 0, b = 0; for (const s of items) { a += s.score / s.max_score * s.weight; b += s.weight; } return b ? Math.round(a / b * 1000) / 10 : null; };
export function scoreGroups(ideaId, version) {
  const rows = q.all(`SELECT s.evaluator_id,s.level,s.criterion_id,s.score,s.comment,c.name cname,c.weight,c.max_score,u.name evaluator FROM scores s
    JOIN criteria c ON c.id=s.criterion_id JOIN users u ON u.id=s.evaluator_id WHERE s.idea_id=? AND s.version=? ORDER BY s.level,s.evaluator_id,c.id`, ideaId, version);
  const g = new Map();
  for (const r of rows) { const k = r.evaluator_id + '-' + r.level; if (!g.has(k)) g.set(k, { evaluator_id: r.evaluator_id, evaluator: r.evaluator, level: r.level, items: [] }); g.get(k).items.push(r); }
  return [...g.values()].map(x => ({ ...x, pct: pct(x.items) }));
}
export function ideaAvg(i) { const g = scoreGroups(i.id, i.version).filter(x => x.pct != null); return g.length ? Math.round(g.reduce((a, b) => a + b.pct, 0) / g.length * 10) / 10 : null; }
