// Headless UI smoke test (needs: npm install --no-save jsdom). Opens every screen for every role and drives the main forms.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
process.env.DB_FILE = ':memory:'; process.env.DATA_DIR = fs.mkdtempSync('/tmp/ui-'); process.env.CHAT_ALWAYS_OPEN = 'true'; process.env.RATE_LIMIT = '500';
const ROOT = path.resolve(import.meta.dirname, '..'); process.chdir(ROOT);
const { app } = await import(ROOT + '/server.js'); const { seed } = await import(ROOT + '/src/seed.js'); seed();
const server = app.listen(0); const port = server.address().port, base = `http://localhost:${port}`;
const code = fs.readFileSync(ROOT + '/public/app/app.js', 'utf8'), shell = fs.readFileSync(ROOT + '/public/app/index.html', 'utf8');
let fails = 0;
async function asRole(email, hashes) {
  const lr = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'portal' }, body: JSON.stringify({ identifier: email, password: 'Demo@1234' }) });
  const cookie = lr.headers.get('set-cookie').split(';')[0];
  const out = [];
  for (const h of hashes) {
    const dom = new JSDOM(shell.replace(/<script src="app.js"><\/script>/, ''), { url: `${base}/app/${h}`, runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window; const errs = [];
    w.fetch = (u, o = {}) => fetch(base + (u.startsWith('/') ? u : '/' + u), { ...o, headers: { ...(o.headers || {}), cookie } });
    w.EventSource = class { addEventListener() {} close() {} };
    w.confirm = () => true; w.addEventListener('error', e => errs.push(e.message));
    w.eval(code);
    await new Promise(r => setTimeout(r, 700));
    const txt = w.document.querySelector('#view').textContent.replace(/\s+/g, ' ').trim().slice(0, 90);
    const toast = w.document.querySelector('#toast').textContent;
    const bad = errs.length || /Something went wrong|undefined|\[object/.test(w.document.querySelector('#view').textContent) || (toast && w.document.querySelector('#toast').className.includes('err'));
    if (bad) fails++;
    out.push(`${bad ? 'FAIL' : 'ok  '} ${email.split('@')[0]} ${h || '#/'} -> ${txt}${toast ? ' | toast: ' + toast : ''}${errs.length ? ' | ERR ' + errs : ''}`);
    w.close();
  }
  return out;
}
const lines = [];
lines.push(...await asRole('submitter@demo.bw', ['', '#/new', '#/idea/1', '#/idea/5', '#/edit/5', '#/faq', '#/notifications', '#/account']));
lines.push(...await asRole('evaluator1@demo.bw', ['', '#/idea/1', '#/idea/3']));
lines.push(...await asRole('adjudicator@demo.bw', ['', '#/idea/3', '#/reports', '#/ideas']));
lines.push(...await asRole('admin@demo.bw', ['', '#/ideas', '#/idea/1', '#/idea/2', '#/users', '#/criteria', '#/content', '#/audit', '#/outbox', '#/chat-stats', '#/console']));
lines.push(...await asRole('observer@demo.bw', ['', '#/ideas', '#/idea/1']));
lines.push(...await asRole('agent@demo.bw', ['', '#/faq']));

// ---- interactive flows through the real handlers ----
async function session(email) {
  const lr = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'portal' }, body: JSON.stringify({ identifier: email, password: 'Demo@1234' }) });
  return lr.headers.get('set-cookie').split(';')[0];
}
async function open(cookie, h) {
  const dom = new JSDOM(shell.replace(/<script src="app.js"><\/script>/, ''), { url: `${base}/app/${h}`, runScripts: 'outside-only', pretendToBeVisual: true }); const w = dom.window;
  w.fetch = (u, o = {}) => fetch(base + u, { ...o, headers: { ...(o.headers || {}), cookie } }); w.EventSource = class { addEventListener() {} }; w.confirm = () => true; w.eval(code);
  await new Promise(r => setTimeout(r, 600)); return w;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const chk = (name, cond) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) fails++; lines.push((cond ? 'ok   ' : 'FAIL ') + name); };
let ck = await session('submitter@demo.bw'), w = await open(ck, '#/');
chk('UI: header greets the signed-in user', w.document.querySelector('#welcome').textContent === 'Welcome, Thabo Submitter');
chk('UI: navigation shows icons', w.document.querySelectorAll('#nav svg').length >= 5);
w.close(); w = await open(ck, '#/edit/5');
const f = w.document.querySelector('form[data-submit=idea]'); const long = 'This text is long enough to be accepted by the form.';
['summary', 'problem', 'solution', 'impact'].forEach(n => (f.elements[n].value = long)); f.elements.category.value = 'Health';
f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(600);
chk('UI: save draft redirects to idea page', w.location.hash === '#/idea/5');
w.document.querySelector('[data-act=submit]').click(); await wait(800);
chk('UI: submit moves idea to Submitted', /Submitted/.test(w.document.querySelector('#view').textContent) && !w.document.querySelector('[data-act=submit]'));
w.close();
ck = await session('admin@demo.bw'); w = await open(ck, '#/idea/5');
w.document.querySelector('[data-act=move][data-to=screening]').click(); await wait(800);
chk('UI: admin moves idea to Screening', /Screening/.test(w.document.querySelector('.b')?.textContent || ''));
const f2 = w.document.querySelector('form[data-submit=assign]'); f2.querySelector('[name=ev]').checked = true; f2.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(800);
chk('UI: admin assigns evaluator', /pending/.test(w.document.querySelector('#view').textContent));
w.document.querySelector('[data-act=move][data-to=level1]').click(); await wait(800);
chk('UI: admin sends to level 1', /Evaluation L1/.test(w.document.querySelector('.b')?.textContent || ''));
w.close();
ck = await session('evaluator1@demo.bw'); w = await open(ck, '#/idea/5');
const sf = w.document.querySelector('form[data-submit=score]'); chk('UI: evaluator sees blind scoring form', !!sf && !/Thabo/.test(w.document.querySelector('#view').textContent));
sf.querySelectorAll('input[type=number]').forEach(i => (i.value = 8)); sf.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(900);
chk('UI: evaluator scores saved', /Weighted score/.test(w.document.querySelector('#view').textContent));
w.close();
console.log(lines.join('\n')); console.log('FAILS:', fails);
server.close(); process.exit(0);
