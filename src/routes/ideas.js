import express, { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { q, tx, FILES } from '../db.js';
import { findSimilar, levelOf as simLevel } from '../similar.js';
import { need, bad, limit, now, txt, audit, notify, notifyIdea, admins, push, hook, FLOW, LABEL, CATEGORIES, levelOf, scoreGroups, ideaAvg } from '../lib.js';

const r = Router();
const get = id => q.get('SELECT * FROM ideas WHERE id=?', Number(id)) || bad('Idea not found.', 404);
const assigned = (u, i) => !!q.get('SELECT 1 x FROM assignments WHERE idea_id=? AND evaluator_id=?', i.id, u.id);
const canView = (u, i) => ({
  admin: true,
  adjudicator: i.stage !== 'draft', observer: i.stage !== 'draft',
  submitter: i.owner_id === u.id,
  evaluator: i.stage !== 'draft' && assigned(u, i),
})[u.role] || false;
const own = (u, i) => u.role === 'submitter' && i.owner_id === u.id;
const editable = i => ['draft', 'returned'].includes(i.stage);
const REQ = { title: 5, category: 1, summary: 20, problem: 20, solution: 20, impact: 20 };
const fields = b => ({
  title: txt(b.title, 150), category: CATEGORIES.includes(b.category) ? b.category : null,
  summary: txt(b.summary, 600), problem: txt(b.problem), solution: txt(b.solution), impact: txt(b.impact),
});
const log = (i, from, to, actor, note) => q.run('INSERT INTO stage_log(idea_id,from_stage,to_stage,actor_id,note,created_at) VALUES(?,?,?,?,?,?)', i.id, from, to, actor, note || null, now());

export function moveStage(req, i, to, note) {
  const from = i.stage, t = now();
  tx(() => {
    q.run('UPDATE ideas SET stage=?,updated_at=? WHERE id=?', to, t, i.id);
    if (['approved', 'declined', 'returned'].includes(to)) {
      q.run('UPDATE ideas SET decision_note=?,decided_at=? WHERE id=?', note, to === 'returned' ? null : t, i.id);
      q.run("INSERT INTO feedback(idea_id,author_id,kind,shared,body,version,created_at) VALUES(?,?,'decision',1,?,?,?)", i.id, req.user.id, `${LABEL[to]}: ${note}`, i.version, t);
    }
    log(i, from, to, req.user.id, note);
  });
  i.stage = to;
  notifyIdea(i, `Your idea "${i.title}" is now: ${LABEL[to]}.${note ? ' ' + note : ''}`);
  push('idea', { id: i.id, stage: to });
  hook('idea.stage_changed', { id: i.id, from, to });
  audit(req, 'stage_change', 'idea', i.id, { from, to });
}

r.get('/', need(), (req, res) => {
  const u = req.user, w = [], p = [];
  if (u.role === 'agent') return res.json([]);
  if (u.role === 'submitter') { w.push('i.owner_id=?'); p.push(u.id); }
  else if (u.role === 'evaluator') { w.push("i.stage!='draft' AND i.id IN (SELECT idea_id FROM assignments WHERE evaluator_id=?)"); p.push(u.id); }
  else if (u.role !== 'admin') w.push("i.stage!='draft'");
  if (req.query.stage) { w.push('i.stage=?'); p.push(String(req.query.stage)); }
  if (req.query.q) { w.push('i.title LIKE ?'); p.push('%' + String(req.query.q).slice(0, 60) + '%'); }
  const rows = q.all(`SELECT i.id,i.title,i.category,i.stage,i.version,i.updated_at,i.submitted_at,u.name owner_name,
    (SELECT COUNT(*) FROM assignments a WHERE a.idea_id=i.id) assigned_count FROM ideas i JOIN users u ON u.id=i.owner_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY i.updated_at DESC LIMIT 500`, ...p);
  if (['evaluator', 'observer'].includes(u.role)) rows.forEach(x => (x.owner_name = null));
  res.json(rows);
});

// Live duplicate check while a submitter types. Never reveals other people's ideas: only a level, plus the submitter's own matches.
r.post('/check', need('submitter'), limit(40), (req, res) => {
  const f = fields(req.body), editing = Number(req.body.id) || null;
  const hits = findSimilar(f, { excludeId: editing });
  const others = hits.filter(h => h.owner_id !== req.user.id), own = hits.filter(h => h.owner_id === req.user.id && simLevel(h.score) !== 'none');
  const top = others.length ? simLevel(others[0].score) : 'none';
  res.json({ level: top, count: others.filter(h => simLevel(h.score) !== 'none').length, own: own.map(h => ({ id: h.id, title: h.title, score: h.score })) });
});

r.post('/', need('submitter'), (req, res) => {
  const f = fields(req.body); if (!f.title || f.title.length < 5) bad('Give your idea a title of at least 5 characters.');
  const t = now();
  const id = q.run('INSERT INTO ideas(owner_id,title,category,summary,problem,solution,impact,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', req.user.id, f.title, f.category, f.summary, f.problem, f.solution, f.impact, t, t).id;
  audit(req, 'idea_create', 'idea', id); res.json({ id });
});

r.get('/:id', need(), (req, res) => {
  const i = get(req.params.id), u = req.user; if (!canView(u, i)) bad('Idea not found.', 404);
  const staff = ['admin', 'adjudicator', 'evaluator'].includes(u.role), obs = u.role === 'observer';
  const idea = { ...i };
  if (obs) for (const k of ['summary', 'problem', 'solution', 'impact', 'decision_note']) idea[k] = null;
  const owner = q.get('SELECT name FROM users WHERE id=?', i.owner_id);
  const fb = q.all(`SELECT f.id,f.kind,f.shared,f.body,f.version,f.created_at,u.name author,f.author_id FROM feedback f JOIN users u ON u.id=f.author_id WHERE f.idea_id=? ORDER BY f.id`, i.id)
    .filter(x => staff || (u.role === 'submitter' && x.shared))
    .map(x => ({ ...x, author: u.role === 'submitter' ? (x.kind === 'submitter' ? x.author : x.kind === 'evaluator' ? 'Evaluator' : 'CEDA')
      : ['evaluator', 'observer'].includes(u.role) && x.author_id === i.owner_id ? 'Submitter' : x.author }));
  let groups = [];
  if (['admin', 'adjudicator'].includes(u.role)) groups = scoreGroups(i.id, i.version);
  else if (u.role === 'evaluator') {
    const done = new Set(q.all('SELECT level FROM assignments WHERE idea_id=? AND evaluator_id=? AND submitted_at IS NOT NULL', i.id, u.id).map(x => x.level));
    groups = scoreGroups(i.id, i.version).filter(g => g.evaluator_id === u.id || done.has(g.level));
  }
  const lvl = levelOf(i.stage), mine = u.role === 'evaluator' && lvl && q.get('SELECT * FROM assignments WHERE idea_id=? AND evaluator_id=? AND level=?', i.id, u.id, lvl);
  const valid = groups.filter(g => g.pct != null);
  res.json({
    idea, owner_name: u.role === 'evaluator' || obs ? null : owner.name,
    attachments: obs ? [] : q.all('SELECT id,name,size,created_at FROM attachments WHERE idea_id=?', i.id),
    log: q.all('SELECT l.actor_id,l.to_stage,l.note,l.created_at,u.name actor FROM stage_log l LEFT JOIN users u ON u.id=l.actor_id WHERE l.idea_id=? ORDER BY l.id', i.id)
      .map(x => ({ to_stage: x.to_stage, note: x.note, created_at: x.created_at,
        actor: x.actor_id === i.owner_id ? (['evaluator', 'observer'].includes(u.role) ? 'Submitter' : x.actor) : u.role === 'submitter' ? 'CEDA' : x.actor })),
    feedback: obs ? [] : fb,
    assignments: ['admin', 'adjudicator', 'evaluator'].includes(u.role) ? q.all('SELECT a.evaluator_id,a.level,a.submitted_at,u.name FROM assignments a JOIN users u ON u.id=a.evaluator_id WHERE a.idea_id=? ORDER BY a.level', i.id) : [],
    scores: groups, avg_pct: valid.length ? Math.round(valid.reduce((a, b) => a + b.pct, 0) / valid.length * 10) / 10 : null,
    criteria: q.all('SELECT * FROM criteria WHERE active=1 ORDER BY id'),
    next: Object.entries(FLOW[i.stage] || {}).filter(([, roles]) => roles.includes(u.role)).map(([to]) => to),
    can_edit: own(u, i) && editable(i), can_score: !!mine,
    my_scores: mine ? q.all('SELECT criterion_id,score,comment FROM scores WHERE idea_id=? AND evaluator_id=? AND level=? AND version=?', i.id, u.id, lvl, i.version) : [],
    subscribed: !!q.get('SELECT 1 x FROM subscriptions WHERE user_id=? AND idea_id=?', u.id, i.id),
    evaluators: u.role === 'admin' ? q.all("SELECT id,name FROM users WHERE role='evaluator' AND active=1 ORDER BY name") : [],
    similar: ['admin', 'adjudicator'].includes(u.role) && i.stage !== 'draft' ? findSimilar(i, { excludeId: i.id }).map(h => ({ id: h.id, title: h.title, stage: h.stage, score: h.score, level: simLevel(h.score) })) : [],
    versions: staff || u.role === 'submitter' ? q.all('SELECT version,created_at FROM idea_versions WHERE idea_id=? ORDER BY version', i.id) : [],
    categories: CATEGORIES, labels: LABEL,
  });
});

r.put('/:id', need('submitter'), (req, res) => {
  const i = get(req.params.id); if (!own(req.user, i)) bad('Idea not found.', 404);
  if (!editable(i)) bad('This idea can no longer be edited.', 409);
  const f = fields(req.body); if (!f.title || f.title.length < 5) bad('Give your idea a title of at least 5 characters.');
  q.run('UPDATE ideas SET title=?,category=?,summary=?,problem=?,solution=?,impact=?,updated_at=? WHERE id=?', f.title, f.category, f.summary, f.problem, f.solution, f.impact, now(), i.id);
  audit(req, 'idea_update', 'idea', i.id); res.json({ ok: true });
});

r.post('/:id/submit', need('submitter'), (req, res) => {
  const i = get(req.params.id); if (!own(req.user, i)) bad('Idea not found.', 404);
  if (!editable(i)) bad('This idea has already been submitted.', 409);
  const labels = { title: 'title', category: 'category', summary: 'summary', problem: 'problem', solution: 'proposed solution', impact: 'expected impact' };
  const miss = Object.entries(REQ).filter(([k, n]) => !(i[k] && String(i[k]).trim().length >= n)).map(([k]) => labels[k]);
  if (miss.length) bad(`Please complete: ${miss.join(', ')} (text fields need at least 20 characters).`);
  const resub = i.stage === 'returned', ver = resub ? i.version + 1 : i.version, t = now(), from = i.stage;
  tx(() => {
    q.run("UPDATE ideas SET stage='submitted',version=?,submitted_at=?,decision_note=NULL,updated_at=? WHERE id=?", ver, resub ? i.submitted_at : t, t, i.id);
    q.run('INSERT INTO idea_versions(idea_id,version,snapshot,created_at) VALUES(?,?,?,?)', i.id, ver, JSON.stringify({ title: i.title, category: i.category, summary: i.summary, problem: i.problem, solution: i.solution, impact: i.impact }), t);
    q.run('INSERT OR IGNORE INTO subscriptions(user_id,idea_id) VALUES(?,?)', req.user.id, i.id);
    if (resub) q.run('DELETE FROM assignments WHERE idea_id=?', i.id); // restart evaluation for the new version
    log(i, from, 'submitted', req.user.id, resub ? `Resubmitted as version ${ver}` : 'Submitted');
  });
  notify([req.user.id], i.id, `We received your idea "${i.title}"${resub ? ` (version ${ver})` : ''}. You can follow its progress in the portal.`);
  notify(admins(), i.id, `${resub ? 'Resubmission' : 'New idea'}: "${i.title}" is ready for screening.`);
  const dup = findSimilar(i, { excludeId: i.id })[0];
  if (dup && dup.score >= 60) notify(admins(), i.id, `Possible duplicate: "${i.title}" is ${dup.score}% similar to "${dup.title}" (idea ${dup.id}). Check the Similar ideas panel before screening.`);
  push('idea', { id: i.id, stage: 'submitted' }); hook('idea.submitted', { id: i.id, version: ver }); audit(req, 'idea_submit', 'idea', i.id, { version: ver });
  res.json({ ok: true, version: ver });
});

const EXT = /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|txt|csv|zip|md)$/i;
r.post('/:id/attachments', need('submitter'), express.raw({ type: () => true, limit: '5mb' }), (req, res) => {
  const i = get(req.params.id); if (!own(req.user, i)) bad('Idea not found.', 404);
  if (!editable(i)) bad('Files can only be added while the idea is a draft or returned.', 409);
  const name = path.basename(String(req.query.name || '')).slice(0, 120);
  if (!EXT.test(name)) bad('That file type is not allowed. Use PDF, Office documents, images, text or zip.');
  if (!Buffer.isBuffer(req.body) || !req.body.length) bad('The file is empty.');
  if (q.get('SELECT COUNT(*) c FROM attachments WHERE idea_id=?', i.id).c >= 10) bad('You can attach up to 10 files.');
  const key = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(path.join(FILES, key), req.body);
  const id = q.run('INSERT INTO attachments(idea_id,name,size,file,created_at) VALUES(?,?,?,?,?)', i.id, name, req.body.length, key, now()).id;
  audit(req, 'attachment_add', 'idea', i.id, { name }); res.json({ id });
});
r.get('/:id/attachments/:aid', need(), (req, res) => {
  const i = get(req.params.id); if (!canView(req.user, i) || req.user.role === 'observer') bad('File not found.', 404);
  const a = q.get('SELECT * FROM attachments WHERE id=? AND idea_id=?', Number(req.params.aid), i.id) || bad('File not found.', 404);
  res.set({ 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}` });
  audit(req, 'attachment_download', 'idea', i.id, { name: a.name }); res.send(fs.readFileSync(path.join(FILES, a.file)));
});
r.delete('/:id/attachments/:aid', need('submitter'), (req, res) => {
  const i = get(req.params.id); if (!own(req.user, i) || !editable(i)) bad('Not allowed.', 403);
  const a = q.get('SELECT * FROM attachments WHERE id=? AND idea_id=?', Number(req.params.aid), i.id) || bad('File not found.', 404);
  q.run('DELETE FROM attachments WHERE id=?', a.id); fs.rmSync(path.join(FILES, a.file), { force: true }); audit(req, 'attachment_delete', 'idea', i.id); res.json({ ok: true });
});

r.post('/:id/respond', need('submitter'), (req, res) => {
  const i = get(req.params.id); if (!own(req.user, i) || i.stage === 'draft') bad('Idea not found.', 404);
  const body = txt(req.body.body, 2000); if (!body) bad('Write a reply first.');
  q.run("INSERT INTO feedback(idea_id,author_id,kind,shared,body,version,created_at) VALUES(?,?,'submitter',1,?,?,?)", i.id, req.user.id, body, i.version, now());
  notify(admins(), i.id, `The submitter replied on "${i.title}".`); audit(req, 'respond', 'idea', i.id); res.json({ ok: true });
});
r.post('/:id/feedback', need('evaluator', 'adjudicator', 'admin'), (req, res) => {
  const i = get(req.params.id), u = req.user; if (!canView(u, i)) bad('Idea not found.', 404);
  const body = txt(req.body.body, 2000); if (!body) bad('Write your feedback first.');
  const shared = req.body.shared ? 1 : 0;
  q.run('INSERT INTO feedback(idea_id,author_id,kind,shared,body,version,created_at) VALUES(?,?,?,?,?,?,?)', i.id, u.id, u.role, shared, body, i.version, now());
  if (shared) notifyIdea(i, `New feedback on your idea "${i.title}". Open the portal to read it.`);
  audit(req, 'feedback', 'idea', i.id, { shared }); res.json({ ok: true });
});
r.post('/:id/subscribe', need(), (req, res) => {
  const i = get(req.params.id); if (!canView(req.user, i)) bad('Idea not found.', 404);
  const on = !q.get('SELECT 1 x FROM subscriptions WHERE user_id=? AND idea_id=?', req.user.id, i.id);
  on ? q.run('INSERT INTO subscriptions(user_id,idea_id) VALUES(?,?)', req.user.id, i.id) : q.run('DELETE FROM subscriptions WHERE user_id=? AND idea_id=?', req.user.id, i.id);
  res.json({ subscribed: on });
});

r.post('/:id/assign', need('admin'), (req, res) => {
  const i = get(req.params.id), level = Number(req.body.level); if (![1, 2].includes(level)) bad('Choose evaluation level 1 or 2.');
  const ids = [...new Set((req.body.evaluator_ids || []).map(Number))]; if (!ids.length) bad('Select at least one evaluator.');
  for (const id of ids) {
    if (!q.get("SELECT 1 x FROM users WHERE id=? AND role='evaluator' AND active=1", id)) bad('One of the selected users is not an active evaluator.');
    q.run('INSERT OR IGNORE INTO assignments(idea_id,evaluator_id,level) VALUES(?,?,?)', i.id, id, level);
    if (levelOf(i.stage) === level) notify([id], i.id, `An idea has been assigned to you for evaluation (level ${level}).`);
  }
  audit(req, 'assign', 'idea', i.id, { ids, level }); res.json({ ok: true });
});
r.delete('/:id/assign/:eid', need('admin'), (req, res) => {
  const i = get(req.params.id);
  q.run('DELETE FROM assignments WHERE idea_id=? AND evaluator_id=? AND level=? AND submitted_at IS NULL', i.id, Number(req.params.eid), Number(req.query.level));
  audit(req, 'unassign', 'idea', i.id); res.json({ ok: true });
});

r.post('/:id/scores', need('evaluator'), (req, res) => {
  const i = get(req.params.id), u = req.user, lvl = levelOf(i.stage);
  if (!lvl) bad('Scoring is not open for this idea.', 409);
  if (!q.get('SELECT 1 x FROM assignments WHERE idea_id=? AND evaluator_id=? AND level=?', i.id, u.id, lvl)) bad('Idea not found.', 404);
  const crit = q.all('SELECT * FROM criteria WHERE active=1'); const items = new Map((req.body.scores || []).map(s => [Number(s.criterion_id), s]));
  for (const c of crit) {
    const s = items.get(c.id); const v = s && s.score !== '' ? Number(s.score) : NaN;
    if (!Number.isFinite(v) || v < 0 || v > c.max_score) bad(`Enter a score from 0 to ${c.max_score} for "${c.name}".`);
  }
  tx(() => {
    for (const c of crit) {
      const s = items.get(c.id);
      q.run(`INSERT INTO scores(idea_id,evaluator_id,level,version,criterion_id,score,comment) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(idea_id,evaluator_id,level,version,criterion_id) DO UPDATE SET score=excluded.score,comment=excluded.comment`, i.id, u.id, lvl, i.version, c.id, Number(s.score), txt(s.comment, 500));
    }
    q.run('UPDATE assignments SET submitted_at=? WHERE idea_id=? AND evaluator_id=? AND level=?', now(), i.id, u.id, lvl);
  });
  const pend = q.get('SELECT COUNT(*) c FROM assignments WHERE idea_id=? AND level=? AND submitted_at IS NULL', i.id, lvl).c;
  if (!pend) notify(admins(), i.id, `All level ${lvl} evaluators have scored "${i.title}". It is ready to move on.`);
  push('idea', { id: i.id, stage: i.stage }); audit(req, 'score', 'idea', i.id, { level: lvl }); res.json({ ok: true });
});

r.post('/:id/transition', need('admin', 'adjudicator'), (req, res) => {
  const i = get(req.params.id), to = String(req.body.to), note = txt(req.body.note, 1000) || '';
  const rule = FLOW[i.stage]?.[to]; if (!rule) bad('That move is not allowed from the current stage.', 409);
  if (!rule.includes(req.user.role)) bad('You are not allowed to make that move.', 403);
  if (['returned', 'declined', 'approved'].includes(to) && note.length < 5) bad('Add a note explaining the decision.');
  const lvl = levelOf(to);
  if (lvl && !q.get('SELECT 1 x FROM assignments WHERE idea_id=? AND level=?', i.id, lvl)) bad('Assign at least one evaluator for this level first.');
  const cur = levelOf(i.stage);
  if (cur && ['level2', 'adjudication'].includes(to)) {
    const pend = q.get('SELECT COUNT(*) c FROM assignments WHERE idea_id=? AND level=? AND submitted_at IS NULL', i.id, cur).c;
    if (pend) bad(`${pend} evaluator(s) have not submitted their scores yet.`, 409);
  }
  moveStage(req, i, to, note);
  if (lvl) q.all('SELECT evaluator_id FROM assignments WHERE idea_id=? AND level=?', i.id, lvl).forEach(a => notify([a.evaluator_id], i.id, `An idea is ready for your evaluation (level ${lvl}).`));
  res.json({ ok: true, stage: to });
});

export { ideaAvg };
export default r;
