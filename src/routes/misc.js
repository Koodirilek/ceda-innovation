import express, { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { q, FILES } from '../db.js';
import { need, bad, now, txt, hashPwAsync, strongPw, normId, isEmail, audit, sseAdd, ideaAvg, ROLES_LIST } from '../lib.js';
import { chatOpen } from './chat.js';

const r = Router();

// ---- notifications + realtime ----
r.get('/notifications', need(), (req, res) => res.json(q.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100', req.user.id)));
r.post('/notifications/read', need(), (req, res) => { q.run('UPDATE notifications SET read=1 WHERE user_id=?', req.user.id); res.json({ ok: true }); });
r.get('/events', need(), (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.flushHeaders(); res.write('retry: 5000\n\n');
  sseAdd(req.user, res); const t = setInterval(() => res.write(': ping\n\n'), 25000); res.on('close', () => clearInterval(t));
});

// ---- reports ----
const REPORT_ROLES = ['admin', 'adjudicator', 'observer'];
r.get('/reports/summary', need(...REPORT_ROLES), (req, res) => {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const byStage = q.all("SELECT stage,COUNT(*) count FROM ideas WHERE stage!='draft' GROUP BY stage");
  const c = s => byStage.find(x => x.stage === s)?.count || 0, total = byStage.reduce((a, b) => a + b.count, 0);
  const decided = c('approved') + c('declined') + c('awarded');
  res.json({
    totals: { submissions: total, drafts: q.get("SELECT COUNT(*) c FROM ideas WHERE stage='draft'").c, users: q.get("SELECT COUNT(*) c FROM users WHERE role='submitter'").c, inEvaluation: c('level1') + c('level2') + c('screening') + c('adjudication') },
    byStage, byCategory: q.all("SELECT COALESCE(category,'Other') category,COUNT(*) count FROM ideas WHERE stage!='draft' GROUP BY 1 ORDER BY 2 DESC"),
    perDay: q.all('SELECT substr(submitted_at,1,10) day,COUNT(*) count FROM ideas WHERE submitted_at>=? GROUP BY 1 ORDER BY 1', since),
    outcomes: { approved: c('approved'), awarded: c('awarded'), declined: c('declined'), returned: c('returned'), approvalRate: decided ? Math.round((c('approved') + c('awarded')) / decided * 100) : null },
    avgDaysToDecision: (v => (v == null ? null : Math.round(v * 10) / 10))(q.get('SELECT AVG(julianday(decided_at)-julianday(submitted_at)) d FROM ideas WHERE decided_at IS NOT NULL').d),
    workload: q.all("SELECT u.name,COUNT(a.id) assigned,COALESCE(SUM(a.submitted_at IS NOT NULL),0) done FROM users u LEFT JOIN assignments a ON a.evaluator_id=u.id WHERE u.role='evaluator' GROUP BY u.id ORDER BY u.name"),
  });
});
const csvCell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
r.get('/reports/ideas.csv', need(...REPORT_ROLES), (req, res) => {
  const rows = q.all("SELECT * FROM ideas WHERE stage!='draft' ORDER BY id");
  const head = ['id', 'title', 'category', 'stage', 'version', 'submitted_at', 'decided_at', 'days_in_process', 'avg_score_pct'];
  const lines = [head.join(',')].concat(rows.map(i => [i.id, i.title, i.category, i.stage, i.version, i.submitted_at, i.decided_at,
    Math.round(((i.decided_at ? Date.parse(i.decided_at) : Date.now()) - Date.parse(i.submitted_at)) / 864e5 * 10) / 10, ideaAvg(i)].map(csvCell).join(',')));
  audit(req, 'export_csv', 'report', null); res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ideas-report.csv"' }); res.send(lines.join('\n'));
});

// ---- public content: pages, documents, FAQs, regulators ----
r.get('/content', (req, res) => res.json({
  pages: q.all("SELECT id,slug,title,body,kind,sort,updated_at FROM content WHERE kind='page' ORDER BY sort,id"),
  documents: q.all("SELECT c.id,c.title,a.name FROM content c JOIN attachments a ON a.content_id=c.id WHERE c.kind='document' ORDER BY c.sort,c.id"),
  faqs: q.all('SELECT * FROM faqs ORDER BY sort,id'), regulators: q.all('SELECT * FROM regulators ORDER BY id'),
  chat: { open: chatOpen() },
}));
r.get('/content/:id/file', (req, res) => {
  const a = q.get('SELECT * FROM attachments WHERE content_id=?', Number(req.params.id)) || bad('File not found.', 404);
  res.set({ 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}` }); res.send(fs.readFileSync(path.join(FILES, a.file)));
});
function crud(route, table, cols) {
  const clean = b => cols.map(c => (c === 'sort' ? Number(b[c]) || 0 : txt(b[c], c === 'body' || c === 'answer' ? 8000 : 500)));
  const first = cols[0];
  r.post(`/admin/${route}`, need('admin'), (req, res) => {
    const v = clean(req.body); if (!v[0]) bad('Please fill in the required field.');
    const extra = table === 'content' ? ['updated_at'] : [], vals = table === 'content' ? [...v, now()] : v;
    const id = q.run(`INSERT INTO ${table}(${[...cols, ...extra].join(',')}) VALUES(${[...cols, ...extra].map(() => '?').join(',')})`, ...vals).id;
    audit(req, 'create', table, id); res.json({ id });
  });
  r.put(`/admin/${route}/:id`, need('admin'), (req, res) => {
    const v = clean(req.body); if (!v[0]) bad('Please fill in the required field.');
    q.run(`UPDATE ${table} SET ${cols.map(c => c + '=?').join(',')}${table === 'content' ? ',updated_at=?' : ''} WHERE id=?`, ...v, ...(table === 'content' ? [now()] : []), Number(req.params.id));
    audit(req, 'update', table, Number(req.params.id)); res.json({ ok: true });
  });
  r.delete(`/admin/${route}/:id`, need('admin'), (req, res) => {
    const id = Number(req.params.id);
    if (table === 'content') for (const a of q.all('SELECT file FROM attachments WHERE content_id=?', id)) { fs.rmSync(path.join(FILES, a.file), { force: true }); q.run('DELETE FROM attachments WHERE content_id=?', id); }
    q.run(`DELETE FROM ${table} WHERE id=?`, id); audit(req, 'delete', table, id); res.json({ ok: true });
  });
}
crud('content', 'content', ['title', 'body', 'kind', 'slug', 'sort']);
crud('faqs', 'faqs', ['question', 'answer', 'sort']);
crud('regulators', 'regulators', ['name', 'contact', 'url']);
r.post('/admin/content/:id/file', need('admin'), express.raw({ type: () => true, limit: '10mb' }), (req, res) => {
  const c = q.get('SELECT * FROM content WHERE id=?', Number(req.params.id)) || bad('Content not found.', 404);
  const name = path.basename(String(req.query.name || '')).slice(0, 120); if (!/\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|txt|csv|zip)$/i.test(name)) bad('That file type is not allowed.');
  if (!Buffer.isBuffer(req.body) || !req.body.length) bad('The file is empty.');
  for (const a of q.all('SELECT file FROM attachments WHERE content_id=?', c.id)) fs.rmSync(path.join(FILES, a.file), { force: true });
  q.run('DELETE FROM attachments WHERE content_id=?', c.id);
  const key = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(path.join(FILES, key), req.body);
  q.run('INSERT INTO attachments(content_id,name,size,file,created_at) VALUES(?,?,?,?,?)', c.id, name, req.body.length, key, now()); audit(req, 'upload', 'content', c.id); res.json({ ok: true });
});

// ---- users, criteria, audit, outbox (admin) ----
r.get('/admin/users', need('admin'), (req, res) => res.json(q.all('SELECT id,name,email,phone,role,verified,active,created_at FROM users ORDER BY id')));
r.patch('/admin/users/:id', need('admin'), (req, res) => {
  const id = Number(req.params.id), role = req.body.role;
  if (role !== undefined && !ROLES_LIST.includes(role)) bad('Unknown role.');
  if (id === req.user.id && (role && role !== 'admin' || req.body.active === false)) bad('You cannot remove your own admin access.');
  if (role) q.run('UPDATE users SET role=? WHERE id=?', role, id);
  if (req.body.active !== undefined) q.run('UPDATE users SET active=? WHERE id=?', req.body.active ? 1 : 0, id);
  audit(req, 'user_update', 'user', id, { role, active: req.body.active }); res.json({ ok: true });
});
r.post('/admin/users', need('admin'), async (req, res) => {
  const name = txt(req.body.name, 100), email = normId(req.body.email), role = req.body.role;
  if (!name || !isEmail(email) || !ROLES_LIST.includes(role)) bad('Enter a name, a valid email and a role.');
  if (!strongPw(req.body.password)) bad('Use at least 8 characters, with a letter and a number.');
  if (q.get('SELECT 1 x FROM users WHERE email=?', email)) bad('A user with that email already exists.', 409);
  const id = q.run('INSERT INTO users(name,email,pass_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)', name, email, await hashPwAsync(req.body.password), role, now()).id;
  audit(req, 'user_create', 'user', id, { role }); res.json({ id });
});
r.get('/criteria', need('admin', 'evaluator', 'adjudicator'), (req, res) => res.json(q.all('SELECT * FROM criteria WHERE active=1 ORDER BY id')));
const crit = b => { const n = txt(b.name, 100), w = Number(b.weight), m = Number(b.max_score); if (!n || !(w > 0) || !(m >= 1 && m <= 100)) bad('Enter a name, a weight above 0 and a maximum score from 1 to 100.'); return [n, txt(b.description, 300), w, m]; };
r.post('/admin/criteria', need('admin'), (req, res) => { const id = q.run('INSERT INTO criteria(name,description,weight,max_score) VALUES(?,?,?,?)', ...crit(req.body)).id; audit(req, 'create', 'criteria', id); res.json({ id }); });
r.put('/admin/criteria/:id', need('admin'), (req, res) => { q.run('UPDATE criteria SET name=?,description=?,weight=?,max_score=? WHERE id=?', ...crit(req.body), Number(req.params.id)); audit(req, 'update', 'criteria', Number(req.params.id)); res.json({ ok: true }); });
r.delete('/admin/criteria/:id', need('admin'), (req, res) => { q.run('UPDATE criteria SET active=0 WHERE id=?', Number(req.params.id)); audit(req, 'deactivate', 'criteria', Number(req.params.id)); res.json({ ok: true }); });
r.get('/admin/audit', need('admin'), (req, res) => res.json(q.all('SELECT a.*,u.name user FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300')));
r.get('/admin/outbox', need('admin'), (req, res) => res.json(q.all('SELECT * FROM outbox ORDER BY id DESC LIMIT 150')));

// ---- 24/7 assistant (rule-based, runs entirely on this server: no data leaves Botswana) ----
const STOP = new Set('the and for how can what when where does with you your are this that have from not but any all was our out get has his her its who why too use'.split(' '));
const words = s => String(s).toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 2 && !STOP.has(w)) || [];
const INTENTS = [
  [/password|login|sign in|forgot|reset/, 'Use "Forgot password?" on the sign-in page. We send a 6-digit code to your email or phone so you can choose a new password.'],
  [/status|track|progress|where is my/, 'Open "My ideas" to see the current stage of each idea. You can also turn on alerts for any idea with the Subscribe button.'],
  [/feedback|resubmit|returned|change/, 'If evaluators return your idea, open it, read the feedback, edit it and press Submit again. Earlier versions stay on record.'],
  [/file|attach|upload|document/, 'You can attach up to 10 files (PDF, Office, images, text or zip, up to 5 MB each) while your idea is a draft or has been returned.'],
  [/chat|agent|consultant|speak|human|person/, 'Consultants are available 09:00 to 16:00 on working days. Use "Talk to a consultant" in this window. Outside those hours I can still help.'],
];
r.post('/bot', (req, res) => {
  const text = txt(req.body.q, 300) || ''; const qw = new Set(words(text));
  const intent = INTENTS.find(([re]) => re.test(text.toLowerCase()));
  let best = null, bs = 0;
  for (const f of q.all('SELECT * FROM faqs')) {
    const s = words(f.question).filter(w => qw.has(w)).length * 2 + words(f.answer).filter(w => qw.has(w)).length * 0.5;
    if (s > bs) { bs = s; best = f; }
  }
  const out = best && bs >= 2 ? { answer: best.answer, source: 'faq', question: best.question } : intent ? { answer: intent[1], source: 'help' }
    : { answer: 'I am not sure about that one. Check the FAQ, or talk to a CEDA consultant between 09:00 and 16:00 on working days.', source: 'fallback' };
  res.json({ ...out, chatOpen: chatOpen() });
});

export default r;
