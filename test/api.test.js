import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE = ':memory:';
process.env.DATA_DIR = (await import('node:fs')).mkdtempSync('/tmp/ceda-');
process.env.CHAT_ALWAYS_OPEN = 'true';
process.env.RATE_LIMIT = '500';
const { app } = await import('../server.js');
const { seed } = await import('../src/seed.js');
seed();
const server = app.listen(0); const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());

function client() {
  let cookie = '';
  const call = async (method, url, body, raw) => {
    const h = { 'X-Requested-With': 'portal' }; if (cookie) h.cookie = cookie;
    let b; if (raw) { h['Content-Type'] = 'application/octet-stream'; b = raw; } else if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const r = await fetch(base + url, { method, headers: h, body: b });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0].startsWith('sid=') && sc.includes('Max-Age=0') ? '' : sc.split(';')[0];
    const ct = r.headers.get('content-type') || ''; const data = ct.includes('json') ? await r.json() : await r.text();
    return { status: r.status, data };
  };
  return { call, login: async (id, pw = 'Demo@1234') => { const r = await call('POST', '/auth/login', { identifier: id, password: pw }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r; } };
}
const ok = (r, s = 200) => { assert.equal(r.status, s, JSON.stringify(r.data)); return r.data; };

test('registration, OTP verification, login, password reset and change', async () => {
  const c = client();
  const reg = ok(await c.call('POST', '/auth/register', { name: 'Test User', email: 'Test.User@example.com', phone: '71234567', password: 'Passw0rdX', consent: true }));
  assert.match(reg.devCode, /^\d{6}$/);
  assert.equal((await c.call('POST', '/auth/login', { identifier: 'test.user@example.com', password: 'Passw0rdX' })).status, 403); // not verified yet
  assert.equal((await c.call('POST', '/auth/verify', { identifier: 'test.user@example.com', code: '000000', purpose: 'register' })).status, 400);
  ok(await c.call('POST', '/auth/verify', { identifier: 'test.user@example.com', code: reg.devCode, purpose: 'register' }));
  ok(await c.login('test.user@example.com', 'Passw0rdX'));
  assert.equal(ok(await c.call('GET', '/auth/me')).user.role, 'submitter');
  ok(await c.call('POST', '/auth/password/change', { current: 'Passw0rdX', newPassword: 'NewPassw0rd1' }));
  // OTP login by phone
  const o = ok(await c.call('POST', '/auth/otp/request', { identifier: '71234567' }));
  const v = ok(await c.call('POST', '/auth/verify', { identifier: '71234567', code: o.devCode, purpose: 'login' })); assert.equal(v.user.name, 'Test User');
  // forgot / reset
  const f = ok(await c.call('POST', '/auth/password/forgot', { identifier: 'test.user@example.com' }));
  ok(await c.call('POST', '/auth/password/reset', { identifier: 'test.user@example.com', code: f.devCode, newPassword: 'Another1Pass' }));
  ok(await c.login('test.user@example.com', 'Another1Pass'));
  assert.equal((await c.call('POST', '/auth/register', { name: 'x', email: 'a@b.co', password: 'short', consent: true })).status, 400);
  assert.equal((await client().call('POST', '/auth/logout', {})).status, 200);
  const csrf = await fetch(base + '/auth/logout', { method: 'POST' }); assert.equal(csrf.status, 403);
});

test('account lockout after repeated failures', async () => {
  const c = client();
  for (let i = 0; i < 5; i++) assert.equal((await c.call('POST', '/auth/login', { identifier: 'test.user@example.com', password: 'wrong' + i })).status, 401);
  assert.equal((await c.call('POST', '/auth/login', { identifier: 'test.user@example.com', password: 'Another1Pass' })).status, 429);
});

test('full idea lifecycle with RBAC, versions, scoring, adjudication, reports', async () => {
  const sub = client(), adm = client(), e1 = client(), e2 = client(), adj = client(), obs = client();
  await sub.login('submitter2@demo.bw'); await adm.login('admin@demo.bw'); await e1.login('evaluator1@demo.bw'); await e2.login('evaluator2@demo.bw'); await adj.login('adjudicator@demo.bw'); await obs.login('observer@demo.bw');
  const { id } = ok(await sub.call('POST', '/ideas', { title: 'Community biogas for small farms' }));
  assert.equal((await sub.call('POST', `/ideas/${id}/submit`)).status, 400); // mandatory fields
  const long = 'This text is long enough to pass validation rules.';
  ok(await sub.call('PUT', `/ideas/${id}`, { title: 'Community biogas for small farms', category: 'Green economy', summary: long, problem: long, solution: long, impact: long }));
  ok(await sub.call('POST', `/ideas/${id}/attachments?name=plan.pdf`, undefined, Buffer.from('%PDF-1.4 test')));
  assert.equal((await sub.call('POST', `/ideas/${id}/attachments?name=virus.exe`, undefined, Buffer.from('x'))).status, 400);
  ok(await sub.call('POST', `/ideas/${id}/submit`));
  assert.equal((await e1.call('GET', `/ideas/${id}`)).status, 404); // not assigned
  assert.equal((await sub.call('POST', `/ideas/${id}/transition`, { to: 'screening' })).status, 403);
  ok(await adm.call('POST', `/ideas/${id}/transition`, { to: 'screening' }));
  assert.equal((await adm.call('POST', `/ideas/${id}/transition`, { to: 'level1' })).status, 400); // needs evaluators
  const ev = ok(await adm.call('GET', `/ideas/${id}`)).evaluators.map(e => e.id);
  assert.equal(ev.length, 2);
  ok(await adm.call('POST', `/ideas/${id}/assign`, { level: 1, evaluator_ids: ev }));
  ok(await adm.call('POST', `/ideas/${id}/transition`, { to: 'level1' }));
  const d1 = ok(await e1.call('GET', `/ideas/${id}`)); assert.equal(d1.owner_name, null); assert.equal(d1.can_score, true); // blind review
  assert.ok(!JSON.stringify(d1).includes('Naledi')); // submitter identity never reaches evaluators
  const crit = d1.criteria;
  assert.equal((await e1.call('POST', `/ideas/${id}/scores`, { scores: [] })).status, 400);
  ok(await e1.call('POST', `/ideas/${id}/scores`, { scores: crit.map(c => ({ criterion_id: c.id, score: 8 })) }));
  ok(await adm.call('POST', `/ideas/${id}/assign`, { level: 2, evaluator_ids: [ev[0]] }));
  assert.equal((await adm.call('POST', `/ideas/${id}/transition`, { to: 'level2' })).status, 409); // e2 has not scored
  ok(await e2.call('POST', `/ideas/${id}/scores`, { scores: crit.map(c => ({ criterion_id: c.id, score: 6 })) }));
  assert.equal(ok(await e2.call('GET', `/ideas/${id}`)).scores.length, 2); // collaborative: sees peer after own submission
  ok(await e1.call('POST', `/ideas/${id}/feedback`, { body: 'Please add a cost estimate for one pilot site.', shared: true }));
  // return for feedback, resubmit as version 2
  ok(await adm.call('POST', `/ideas/${id}/transition`, { to: 'returned', note: 'Add costings and resubmit.' }));
  const sd = ok(await sub.call('GET', `/ideas/${id}`)); assert.equal(sd.idea.stage, 'returned'); assert.ok(sd.feedback.some(f => f.author === 'Evaluator'));
  ok(await sub.call('PUT', `/ideas/${id}`, { title: 'Community biogas for small farms', category: 'Green economy', summary: long, problem: long, solution: long + ' Costings added.', impact: long }));
  assert.equal(ok(await sub.call('POST', `/ideas/${id}/submit`)).version, 2);
  ok(await adm.call('POST', `/ideas/${id}/transition`, { to: 'screening' }));
  ok(await adm.call('POST', `/ideas/${id}/assign`, { level: 1, evaluator_ids: ev }));
  ok(await adm.call('POST', `/ideas/${id}/transition`, { to: 'level1' }));
  for (const e of [e1, e2]) ok(await e.call('POST', `/ideas/${id}/scores`, { scores: crit.map(c => ({ criterion_id: c.id, score: 9 })) }));
  ok(await adm.call('POST', `/ideas/${id}/assign`, { level: 2, evaluator_ids: [ev[0]] }));
  ok(await adm.call('POST', `/ideas/${id}/transition`, { to: 'level2' }));
  ok(await e1.call('POST', `/ideas/${id}/scores`, { scores: crit.map(c => ({ criterion_id: c.id, score: 9 })) }));
  ok(await adm.call('POST', `/ideas/${id}/transition`, { to: 'adjudication' }));
  assert.equal((await adj.call('POST', `/ideas/${id}/transition`, { to: 'approved' })).status, 400); // note required
  ok(await adj.call('POST', `/ideas/${id}/transition`, { to: 'approved', note: 'Excellent plan with clear impact.' }));
  ok(await adm.call('POST', `/ideas/${id}/transition`, { to: 'awarded' }));
  const fin = ok(await sub.call('GET', `/ideas/${id}`)); assert.equal(fin.idea.stage, 'awarded'); assert.ok(fin.versions.length === 2);
  const notes = ok(await sub.call('GET', '/notifications')); assert.ok(notes.length >= 5);
  const od = ok(await obs.call('GET', `/ideas/${id}`)); assert.equal(od.idea.problem, null); assert.equal(od.owner_name, null); // observer sees status only
  assert.equal((await obs.call('POST', `/ideas/${id}/transition`, { to: 'declined', note: 'nope nope' })).status, 403);
  assert.equal((await sub.call('GET', '/reports/summary')).status, 403);
  const rep = ok(await obs.call('GET', '/reports/summary')); assert.ok(rep.totals.submissions >= 5 && rep.byStage.length);
  const csv = (await adm.call('GET', '/reports/ideas.csv')).data; assert.match(csv, /Community biogas/);
  const aud = ok(await adm.call('GET', '/admin/audit')); assert.ok(aud.some(a => a.action === 'stage_change') && aud.some(a => a.action === 'score'));
  assert.ok(ok(await adm.call('GET', '/admin/outbox')).length > 0);
  const dl = await sub.call('GET', `/ideas/${id}/attachments/${fin.attachments[0].id}`); assert.match(dl.data, /PDF/);
  assert.equal((await obs.call('GET', `/ideas/${id}/attachments/${fin.attachments[0].id}`)).status, 404);
  assert.equal((await e1.call('GET', '/admin/users')).status, 403);
});

test('admin content, criteria, users; public FAQ and the assistant', async () => {
  const adm = client(); await adm.login('admin@demo.bw');
  const pub = client().call;
  const content = ok(await pub('GET', '/content')); assert.ok(content.faqs.length >= 5 && content.regulators.length >= 4);
  const f = ok(await adm.call('POST', '/admin/faqs', { question: 'Can I edit after submitting?', answer: 'Only if the idea is returned to you for feedback.', sort: 9 }));
  ok(await adm.call('PUT', `/admin/faqs/${f.id}`, { question: 'Can I edit after submitting?', answer: 'Only when the idea is returned for feedback.', sort: 9 }));
  const bot = ok(await pub('POST', '/bot', { q: 'how do I reset my password' })); assert.ok(bot.answer.length > 20);
  const bot2 = ok(await pub('POST', '/bot', { q: 'can I edit after submitting' })); assert.match(bot2.answer, /returned/);
  ok(await adm.call('DELETE', `/admin/faqs/${f.id}`));
  const doc = ok(await adm.call('POST', '/admin/content', { title: 'Application form template', body: '', kind: 'document', slug: 'form', sort: 5 }));
  ok(await adm.call('POST', `/admin/content/${doc.id}/file?name=form.pdf`, undefined, Buffer.from('%PDF doc')));
  assert.equal((await pub('GET', `/content/${doc.id}/file`)).data, '%PDF doc');
  ok(await adm.call('DELETE', `/admin/content/${doc.id}`));
  const cr = ok(await adm.call('POST', '/admin/criteria', { name: 'Local ownership', weight: 10, max_score: 10, description: 'test' }));
  ok(await adm.call('DELETE', `/admin/criteria/${cr.id}`));
  const u = ok(await adm.call('POST', '/admin/users', { name: 'New Evaluator', email: 'neweval@demo.bw', role: 'evaluator', password: 'Evalpass1' }));
  ok(await adm.call('PATCH', `/admin/users/${u.id}`, { active: false }));
  assert.equal((await client().call('POST', '/auth/login', { identifier: 'neweval@demo.bw', password: 'Evalpass1' })).status, 403);
});

test('live chat: queue, accept, messages, analytics, hours logic', async () => {
  const u = client(), a = client(); await u.login('submitter@demo.bw'); await a.login('agent@demo.bw');
  const none = ok(await u.call('POST', '/chat/sessions')); assert.equal(none.available, false); assert.match(none.message, /not available|busy/i); // no agent online yet
  ok(await a.call('GET', '/chat/queue')); // agent heartbeat
  const s = ok(await u.call('POST', '/chat/sessions')); assert.equal(s.available, true);
  const q1 = ok(await a.call('GET', '/chat/queue')); assert.equal(q1.waiting.length, 1);
  ok(await u.call('POST', `/chat/sessions/${s.session.id}/messages`, { body: 'Hello, I need help with my form' }));
  ok(await a.call('POST', `/chat/sessions/${s.session.id}/accept`));
  ok(await a.call('POST', `/chat/sessions/${s.session.id}/messages`, { body: 'Happy to help.' }));
  const m = ok(await u.call('GET', `/chat/sessions/${s.session.id}?after=0`)); assert.ok(m.messages.length >= 3);
  ok(await u.call('POST', `/chat/sessions/${s.session.id}/close`));
  const an = ok(await a.call('GET', '/chat/analytics')); assert.ok(an.total >= 2 && an.answered >= 1 && an.missed >= 1);
  process.env.CHAT_ALWAYS_OPEN = 'false';
  const st = ok(await client().call('GET', '/chat/status')); assert.equal(typeof st.open, 'boolean'); process.env.CHAT_ALWAYS_OPEN = 'true';
});

test('duplicate-idea detection: private to submitters, visible to admin and adjudicator', async () => {
  const sub = client(), adm = client(), adj = client(), e1 = client();
  await sub.login('submitter2@demo.bw'); await adm.login('admin@demo.bw'); await adj.login('adjudicator@demo.bw'); await e1.login('evaluator1@demo.bw');
  const similar = { title: 'Solar cold storage rooms for farmers', summary: 'Shared solar powered cold rooms for farmers in villages', problem: 'Farmers lose harvested vegetables because villages have no electricity for cold storage', solution: 'Cold rooms powered by solar panels at village collection points run by a cooperative' };
  const chk = ok(await sub.call('POST', '/ideas/check', similar));
  assert.ok(['high', 'possible'].includes(chk.level), 'similar idea should be flagged: ' + JSON.stringify(chk));
  assert.ok(!JSON.stringify(chk).includes('Solar-powered cold storage'), 'submitters must never see other ideas'); // IP protection
  const other = ok(await sub.call('POST', '/ideas/check', { title: 'Taxi route sharing for school children', summary: 'Parents share taxi routes', problem: 'Parents struggle with school transport costs', solution: 'Group taxi booking with verified drivers' }));
  assert.equal(other.level, 'none');
  assert.equal((await e1.call('POST', '/ideas/check', similar)).status, 403);
  // submit the similar idea: admins are alerted and see the match, evaluators do not
  const { id } = ok(await sub.call('POST', '/ideas', { title: similar.title }));
  ok(await sub.call('PUT', `/ideas/${id}`, { ...similar, category: 'Agriculture', impact: 'Reduces post-harvest losses and raises farmer incomes in villages.' }));
  ok(await sub.call('POST', `/ideas/${id}/submit`));
  const ad = ok(await adm.call('GET', `/ideas/${id}`)); assert.ok(ad.similar.some(s => s.title === 'Solar-powered cold storage for rural farmers' && s.score >= 35));
  assert.ok(ok(await adm.call('GET', '/notifications')).some(n => /Possible duplicate/.test(n.message)));
  assert.equal(ok(await adj.call('GET', `/ideas/${id}`)).similar.length > 0, true);
  assert.deepEqual(ok(await sub.call('GET', `/ideas/${id}`)).similar, []);
});

test('demo mode offers one-click demo roles to judges', async () => {
  const d = await (await fetch(base + '/demo')).json();
  assert.equal(d.demo, true); assert.ok(d.accounts.some(a => a.email === 'admin@demo.bw') && d.accounts.length >= 6);
  const c = client(); const r = await c.login(d.accounts[0].email, d.password); assert.equal(r.data.ok, true);
});
