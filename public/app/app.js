(() => {
'use strict';
const $ = s => document.querySelector(s);
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ST = { draft: 'Draft', submitted: 'Submitted', screening: 'Screening', level1: 'Evaluation L1', level2: 'Evaluation L2', adjudication: 'Adjudication', approved: 'Approved', returned: 'Returned', declined: 'Declined', awarded: 'Awarded' };
const MOVE = { screening: 'Start screening', level1: 'Send to level 1', level2: 'Send to level 2', adjudication: 'Send to adjudication', approved: 'Approve', returned: 'Return for feedback', declined: 'Decline', awarded: 'Mark as awarded' };
const badge = s => `<span class="b b-${s}">${ST[s] || E(s)}</span>`;
const D = s => (s ? new Date(s).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');
let ME = null, es = null, tick = null;

async function api(method, url, body, raw) {
  const o = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'portal' } };
  if (raw) { o.headers['Content-Type'] = 'application/octet-stream'; o.body = raw; } else if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
  const r = await fetch('/api' + url, o);
  if (r.status === 401 && !url.startsWith('/auth/login')) { location.href = '../auth.html'; throw new Error('Please sign in.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Something went wrong.');
  return d;
}
function toast(m, err) { const t = $('#toast'); t.textContent = m; t.className = 'on' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3500); }
const run = async fn => { try { await fn(); } catch (e) { if (e.message !== 'Please sign in.') toast(e.message, true); } };
const view = h => { $('#view').innerHTML = h; };
const fd = f => Object.fromEntries(new FormData(f));

const IC = {"bulb": "<path d=\"M9 18h6M10 21h4\"/><path d=\"M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z\"/>", "plus": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8v8M8 12h8\"/>", "help": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01\"/>", "clip": "<rect x=\"6\" y=\"4\" width=\"12\" height=\"17\" rx=\"2\"/><path d=\"M9 4h6v2H9zM9 13l2 2 4-4\"/>", "scale": "<path d=\"M12 3v18M6 21h12M5 7h14\"/><path d=\"M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z\"/>", "chart": "<path d=\"M4 20V10M10 20V4M16 20v-7M22 20H2\"/>", "list": "<path d=\"M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01\"/>", "users": "<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6\"/>", "sliders": "<path d=\"M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0\"/><circle cx=\"15\" cy=\"6\" r=\"2\"/><circle cx=\"9\" cy=\"12\" r=\"2\"/><circle cx=\"17\" cy=\"18\" r=\"2\"/>", "doc": "<path d=\"M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z\"/><path d=\"M14 3v5h5M9 13h6M9 17h6\"/>", "shield": "<path d=\"M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z\"/><path d=\"M9 12l2 2 4-4\"/>", "mail": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3 7l9 6 9-6\"/>", "chat": "<path d=\"M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z\"/>", "pulse": "<path d=\"M3 12h4l3-8 4 16 3-8h4\"/>", "bell": "<path d=\"M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 0 0 4 0\"/>", "user": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21a8 8 0 0 1 16 0\"/>", "out": "<path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9\"/>", "eye": "<path d=\"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", "grid": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>"};
const icon = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
const NAV = {
  submitter: [['#/', 'My ideas', 'bulb'], ['#/new', 'New idea', 'plus'], ['#/faq', 'Help and FAQ', 'help']],
  evaluator: [['#/', 'Assigned ideas', 'clip'], ['#/faq', 'Help and FAQ', 'help']],
  adjudicator: [['#/', 'Decision queue', 'scale'], ['#/ideas', 'All ideas', 'list'], ['#/reports', 'Reports', 'chart'], ['#/faq', 'Help and FAQ', 'help']],
  admin: [['#/', 'Dashboard', 'grid'], ['#/ideas', 'All ideas', 'list'], ['#/users', 'Users', 'users'], ['#/criteria', 'Criteria', 'sliders'], ['#/content', 'Content', 'doc'], ['#/audit', 'Audit log', 'shield'], ['#/outbox', 'Message log', 'mail'], ['#/chat-stats', 'Chat analytics', 'pulse'], ['#/console', 'Chat console', 'chat']],
  observer: [['#/', 'Live dashboard', 'chart'], ['#/ideas', 'Status tracker', 'eye'], ['#/faq', 'Help and FAQ', 'help']],
  agent: [['#/', 'Chat console', 'chat'], ['#/faq', 'Help and FAQ', 'help']],
};

// ---------- ideas ----------
async function ideasView(stage, title) {
  const rows = await api('GET', '/ideas' + (stage ? '?stage=' + stage : ''));
  const ME_R = ME.role;
  view(`<h1>${E(title)}</h1><p class="muted">${rows.length} idea${rows.length === 1 ? '' : 's'}</p>
  ${ME_R === 'submitter' ? '<p><a class="btn" href="#/new">Submit a new idea</a></p>' : ''}
  <div class="row card"><label class="grow">Stage<select id="fstage"><option value="">All stages</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${k === stage ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
  <div class="wrapx"><table><thead><tr><th>Idea</th><th>Category</th><th>Stage</th><th>Version</th>${ME_R === 'admin' ? '<th>Submitter</th><th>Evaluators</th>' : ''}<th>Updated</th></tr></thead><tbody>
  ${rows.map(i => `<tr class="link" data-act="open" data-id="${i.id}"><td><a href="#/idea/${i.id}">${E(i.title)}</a></td><td>${E(i.category || '')}</td><td>${badge(i.stage)}</td><td>v${i.version}</td>${ME_R === 'admin' ? `<td>${E(i.owner_name)}</td><td>${i.assigned_count}</td>` : ''}<td>${D(i.updated_at)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nothing here yet.</td></tr>'}</tbody></table></div>`);
  $('#fstage').onchange = e => { location.hash = '#/ideas?stage=' + e.target.value; };
}

async function formView(id) {
  const d = id ? await api('GET', '/ideas/' + id) : null, i = d ? d.idea : {}, cats = (d && d.categories) || ['Agriculture', 'Technology', 'Education', 'Health', 'Manufacturing', 'Tourism', 'Green economy', 'Financial inclusion', 'Other'];
  if (d && !d.can_edit) { location.hash = '#/idea/' + id; return; }
  const ta = (n, l, h) => `<label>${l}<textarea name="${n}" maxlength="4000" placeholder="${h}">${E(i[n])}</textarea></label>`;
  view(`<h1>${id ? 'Edit idea' : 'New idea'}</h1><p class="muted">Fields marked * are required to submit. You can save a draft and come back later.</p>
  <form class="card" data-submit="idea" data-id="${id || ''}"><label>Title *<input name="title" required minlength="5" maxlength="150" value="${E(i.title)}"></label>
  <label>Category *<select name="category"><option value="">Choose a category</option>${cats.map(c => `<option ${c === i.category ? 'selected' : ''}>${E(c)}</option>`).join('')}</select></label>
  <label>Short summary * <span class="muted sm">(max 600 characters)</span><textarea name="summary" maxlength="600" style="min-height:70px">${E(i.summary)}</textarea></label>
  ${ta('problem', 'The problem you are solving *', 'Who is affected and how?')}${ta('solution', 'Your proposed solution *', 'What will you build or do?')}${ta('impact', 'Expected impact *', 'What will change, and how will you measure it?')}
  <div id="dup" aria-live="polite"></div><div class="row" style="margin-top:16px"><button class="btn" type="submit">Save draft</button><a class="btn line" href="${id ? '#/idea/' + id : '#/'}">Cancel</a></div></form>`);
  dupCheck().catch(() => {});
}

async function ideaView(id) {
  const d = await api('GET', '/ideas/' + id), i = d.idea, R = ME.role;
  const steps = ['submitted', 'screening', 'level1', 'level2', 'adjudication', 'decision', 'awarded'], dec = ['approved', 'declined', 'returned'].includes(i.stage);
  const idx = steps.indexOf(dec ? 'decision' : i.stage), lbl = { submitted: 'Submitted', screening: 'Screening', level1: 'Level 1', level2: 'Level 2', adjudication: 'Adjudication', decision: dec ? ST[i.stage] : 'Decision', awarded: 'Award' };
  const sec = (t, v) => (v ? `<div class="card"><h2>${t}</h2><p>${E(v).replace(/\n/g, '<br>')}</p></div>` : '');
  const crit = d.criteria, my = Object.fromEntries(d.my_scores.map(s => [s.criterion_id, s]));
  view(`<p><a href="#/">&larr; Back</a></p><h1>${E(i.title)}</h1>
  <div class="row"><span>${badge(i.stage)}</span><span class="muted">${E(i.category || '')} &middot; version ${i.version}${d.owner_name ? ' &middot; by ' + E(d.owner_name) : ''}</span>
  ${i.stage !== 'draft' ? `<button class="btn line sm" data-act="sub" data-id="${i.id}">${d.subscribed ? 'Unsubscribe from alerts' : 'Subscribe to alerts'}</button>` : ''}</div>
  ${i.stage !== 'draft' ? `<ol class="steps">${steps.map((s, k) => `<li class="${dec && s === 'decision' ? 'now' : k < idx ? 'done' : k === idx ? 'now' : ''}">${lbl[s]}</li>`).join('')}</ol>` : ''}
  ${i.decision_note && R !== 'observer' ? `<div class="fb"><b>Decision note:</b> ${E(i.decision_note)}</div>` : ''}
  ${d.can_edit ? `<div class="row card"><a class="btn line" href="#/edit/${i.id}">Edit idea</a><button class="btn" data-act="submit" data-id="${i.id}">${i.stage === 'returned' ? 'Resubmit' : 'Submit for evaluation'}</button></div>` : ''}
  ${R === 'observer' ? '<p class="msg ok">Committee observers see status and progress only. Idea content is hidden to protect intellectual property.</p>' : ''}
  ${sec('Summary', i.summary)}${sec('Problem', i.problem)}${sec('Proposed solution', i.solution)}${sec('Expected impact', i.impact)}
  ${R !== 'observer' ? `<div class="card"><h2>Files</h2>${d.attachments.map(a => `<div class="row"><a href="/api/ideas/${i.id}/attachments/${a.id}">${E(a.name)}</a><span class="muted sm">${Math.round(a.size / 1024)} KB</span>${d.can_edit ? `<button class="btn line sm" data-act="delfile" data-id="${i.id}" data-aid="${a.id}">Remove</button>` : ''}</div>`).join('') || '<p class="muted">No files attached.</p>'}
  ${d.can_edit ? `<label>Add a file (PDF, Office, image, text or zip, up to 5 MB)<input type="file" id="file" data-change="upload" data-id="${i.id}"></label>` : ''}</div>` : ''}
  ${R === 'admin' ? adminPanel(d) : ''}${similarPanel(d)}${d.can_score ? scorePanel(d, crit, my) : ''}${d.scores.length ? scoreTable(d) : ''}
  ${(R === 'adjudicator' || R === 'admin') && d.next.length && R !== 'admin' ? movePanel(d) : ''}
  ${R !== 'observer' && i.stage !== 'draft' ? feedbackPanel(d) : ''}
  <div class="card"><h2>Timeline</h2><ul class="tl">${d.log.map(l => `<li><b>${l.to_stage ? ST[l.to_stage] : ''}</b> &middot; ${D(l.created_at)}${l.actor ? ' &middot; ' + E(l.actor) : ''}${l.note ? `<br><span class="muted">${E(l.note)}</span>` : ''}</li>`).join('')}</ul></div>`);
}
function similarPanel(d) {
  if (!d.similar || !d.similar.length) return '';
  return `<div class="card"><h2>Similar ideas</h2><p class="muted sm">Found by comparing the text of this idea with every submitted idea. Check these before screening.</p>
  ${table(['Idea', 'Stage', 'Similarity'], d.similar.map(s => `<tr class="link" data-act="open" data-id="${s.id}"><td><a href="#/idea/${s.id}">${E(s.title)}</a></td><td>${badge(s.stage)}</td><td><b>${s.score}%</b> ${s.level === 'high' ? '<span class="b b-declined">Likely duplicate</span>' : s.level === 'possible' ? '<span class="b b-returned">Possible overlap</span>' : ''}</td></tr>`))}</div>`;
}
// Duplicate check while writing an idea. Submitters only learn whether similar ideas exist, never what they are.
let dupTimer;
async function dupCheck() {
  const f = document.querySelector('form[data-submit=idea]'), box = $('#dup'); if (!f || !box) return;
  const b = fd(f); if (((b.title || '') + (b.summary || '') + (b.problem || '') + (b.solution || '')).length < 40) { box.innerHTML = ''; return; }
  const r = await api('POST', '/ideas/check', { ...b, id: f.dataset.id || undefined });
  const own = r.own.map(o => `<a href="#/idea/${o.id}">${E(o.title)}</a> (${o.score}% similar)`).join(', ');
  box.innerHTML = r.level === 'high' ? '<div class="dup high"><b>Very similar ideas already exist in the portal.</b> You can still submit, but make sure what makes yours different is clear. Reviewers will compare them.</div>'
    : r.level === 'possible' ? '<div class="dup possible"><b>Some similar ideas have been submitted.</b> Explain what is new or different about yours.</div>'
    : '<div class="dup">No similar ideas found so far.</div>';
  if (own) box.innerHTML += `<div class="dup possible">You already have a similar idea: ${own}.</div>`;
}
function movePanel(d) {
  return `<div class="card"><h2>Decision</h2><label>Note (required for approve, return or decline)<textarea id="mnote" maxlength="1000"></textarea></label>
  <div class="row" style="margin-top:12px">${d.next.map(t => `<button class="btn ${t === 'declined' ? 'red' : t === 'returned' ? 'line' : ''}" data-act="move" data-id="${d.idea.id}" data-to="${t}">${MOVE[t]}</button>`).join('')}</div></div>`;
}
function adminPanel(d) {
  const has = lvl => d.assignments.filter(a => a.level === lvl);
  return `<div class="card"><h2>Workflow (administrator)</h2><div class="cols"><div><h2 style="font-size:15px">Evaluators</h2>
  ${[1, 2].map(l => `<p class="sm"><b>Level ${l}:</b> ${has(l).map(a => `${E(a.name)} ${a.submitted_at ? '(scored)' : '(pending)'}`).join(', ') || '<span class="muted">none assigned</span>'}</p>`).join('')}
  <form data-submit="assign" data-id="${d.idea.id}"><label>Assign to level<select name="level"><option value="1">Level 1</option><option value="2">Level 2</option></select></label>
  <div class="sm" style="margin:8px 0">${d.evaluators.map(e => `<label style="display:inline-block;margin:0 12px 0 0;font-weight:400"><input type="checkbox" name="ev" value="${e.id}">${E(e.name)}</label>`).join('')}</div><button class="btn sm" type="submit">Assign</button></form></div>
  <div>${d.next.length ? `<h2 style="font-size:15px">Move this idea</h2><label>Note (required for approve, return or decline)<textarea id="mnote" maxlength="1000" style="min-height:70px"></textarea></label><div class="row" style="margin-top:10px">${d.next.map(t => `<button class="btn ${t === 'declined' ? 'red' : t === 'returned' ? 'line' : ''} sm" data-act="move" data-id="${d.idea.id}" data-to="${t}">${MOVE[t]}</button>`).join('')}</div>` : '<p class="muted">No further moves from this stage.</p>'}</div></div></div>`;
}
function scorePanel(d, crit, my) {
  return `<div class="card"><h2>Your evaluation (level ${d.idea.stage === 'level2' ? 2 : 1})</h2><p class="muted sm">Submitter details are hidden so you can review fairly. Score each criterion.</p>
  <form data-submit="score" data-id="${d.idea.id}">${crit.map(c => `<div class="cols"><label>${E(c.name)} <span class="muted sm">(0 to ${c.max_score}, weight ${c.weight}) ${E(c.description)}</span><input type="number" name="s${c.id}" min="0" max="${c.max_score}" step="0.5" required value="${my[c.id] ? my[c.id].score : ''}"></label>
  <label>Comment<input name="c${c.id}" maxlength="500" value="${E(my[c.id]?.comment)}"></label></div>`).join('')}
  <button class="btn" type="submit" style="margin-top:14px">${d.my_scores.length ? 'Update scores' : 'Submit scores'}</button></form></div>`;
}
function scoreTable(d) {
  return `<div class="card"><h2>Scores ${d.avg_pct != null ? `<span class="muted">(average ${d.avg_pct}%)</span>` : ''}</h2><div class="wrapx"><table><thead><tr><th>Evaluator</th><th>Level</th><th>Weighted score</th><th>Criteria</th></tr></thead><tbody>
  ${d.scores.map(g => `<tr><td>${E(g.evaluator)}</td><td>${g.level}</td><td><b>${g.pct}%</b></td><td class="sm">${g.items.map(s => `${E(s.cname)}: ${s.score}/${s.max_score}${s.comment ? ' (' + E(s.comment) + ')' : ''}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function feedbackPanel(d) {
  const R = ME.role, canWrite = ['evaluator', 'adjudicator', 'admin'].includes(R);
  return `<div class="card"><h2>Feedback and discussion</h2>${d.feedback.map(f => `<div class="fb ${f.kind === 'submitter' ? 'me' : f.elements.shared ? '' : 'int'}"><b>${E(f.author)}</b> <span class="muted sm">${D(f.created_at)}${f.kind !== 'submitter' && !f.elements.shared ? ' &middot; internal' : ''}${f.version ? ' &middot; v' + f.version : ''}</span><br>${E(f.elements.body)}</div>`).join('') || '<p class="muted">No feedback yet.</p>'}
  ${R === 'submitter' ? `<form data-submit="respond" data-id="${d.idea.id}"><label>Reply to the evaluators<textarea name="body" maxlength="2000" required></textarea></label><button class="btn" type="submit" style="margin-top:10px">Send reply</button></form>` : ''}
  ${canWrite ? `<form data-submit="feedback" data-id="${d.idea.id}"><label>Add feedback<textarea name="body" maxlength="2000" required></textarea></label><label style="font-weight:400"><input type="checkbox" name="shared" checked> Share with the submitter (untick for internal discussion)</label><button class="btn" type="submit" style="margin-top:10px">Post</button></form>` : ''}</div>`;
}

// ---------- reports ----------
async function reportsView() {
  const r = await api('GET', '/reports/summary'), max = Math.max(1, ...r.byStage.map(x => x.count), ...r.byCategory.map(x => x.count));
  const bars = (rows, k) => rows.map(x => `<div class="r"><span>${E(ST[x[k]] || x[k])}</span><div class="bar"><i style="width:${x.count / max * 100}%"></i></div><b>${x.count}</b></div>`).join('') || '<p class="muted">No data yet.</p>';
  const pd = r.perDay, pm = Math.max(1, ...pd.map(x => x.count));
  view(`<h1>${ME.role === 'observer' ? 'Live dashboard' : 'Dashboard'}</h1><p class="muted">Updates automatically when ideas change stage.</p>
  <div class="grid"><div class="stat"><b>${r.totals.submissions}</b>Submitted ideas</div><div class="stat"><b>${r.totals.inEvaluation}</b>In progress</div><div class="stat"><b>${r.outcomes.approved + r.outcomes.awarded}</b>Approved or awarded</div>
  <div class="stat"><b>${r.outcomes.approvalRate == null ? 'n/a' : r.outcomes.approvalRate + '%'}</b>Approval rate</div><div class="stat"><b>${r.avgDaysToDecision ?? 'n/a'}</b>Avg days to decision</div><div class="stat"><b>${r.totals.users}</b>Registered submitters</div></div>
  <div class="cols"><div class="card"><h2>Ideas by stage</h2><div class="bars">${bars(r.byStage, 'stage')}</div></div><div class="card"><h2>Ideas by category</h2><div class="bars">${bars(r.byCategory, 'category')}</div></div></div>
  <div class="cols"><div class="card"><h2>Submissions, last 14 days</h2>${pd.map(x => `<div class="bars"><div class="r"><span>${x.day.slice(5)}</span><div class="bar"><i style="width:${x.count / pm * 100}%"></i></div><b>${x.count}</b></div></div>`).join('') || '<p class="muted">No submissions in this period.</p>'}</div>
  <div class="card"><h2>Evaluator workload</h2><table><thead><tr><th>Evaluator</th><th>Assigned</th><th>Scored</th></tr></thead><tbody>${r.workload.map(w => `<tr><td>${E(w.name)}</td><td>${w.assigned}</td><td>${w.done}</td></tr>`).join('')}</tbody></table></div></div>
  <p><a class="btn line" href="/api/reports/ideas.csv">Export ideas report (CSV)</a></p>`);
}

// ---------- admin ----------
async function usersView() {
  const rows = await api('GET', '/admin/users'), roles = ['submitter', 'evaluator', 'adjudicator', 'admin', 'observer', 'agent'];
  view(`<h1>Users and roles</h1><div class="wrapx"><table><thead><tr><th>Name</th><th>Contact</th><th>Role</th><th>Status</th></tr></thead><tbody>
  ${rows.map(u => `<tr><td>${E(u.name)}</td><td>${E(u.email || u.phone)}</td><td><select data-change="role" data-id="${u.id}">${roles.map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
  <td><button class="btn sm ${u.active ? 'line' : ''}" data-act="active" data-id="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? 'Disable' : 'Enable'}</button></td></tr>`).join('')}</tbody></table></div>
  <form class="card" data-submit="newuser"><h2>Add a staff user</h2><div class="cols"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label>
  <label>Role<select name="role">${roles.map(r => `<option>${r}</option>`).join('')}</select></label><label>Temporary password<input name="password" type="password" required minlength="8"></label></div><button class="btn" type="submit" style="margin-top:12px">Create user</button></form>`);
}
async function criteriaView() {
  const rows = await api('GET', '/criteria');
  view(`<h1>Evaluation criteria</h1><p class="muted">Evaluators score every active criterion. Weights decide how much each one counts.</p>
  ${rows.map(c => `<form class="card" data-submit="crit" data-id="${c.id}"><div class="cols"><label>Name<input name="name" value="${E(c.name)}" required></label><label>Description<input name="description" value="${E(c.description)}"></label>
  <label>Weight<input name="weight" type="number" step="0.5" min="0.5" value="${c.weight}"></label><label>Max score<input name="max_score" type="number" min="1" max="100" value="${c.max_score}"></label></div>
  <div class="row" style="margin-top:12px"><button class="btn sm" type="submit">Save</button><button class="btn line sm" type="button" data-act="delcrit" data-id="${c.id}">Remove</button></div></form>`).join('')}
  <form class="card" data-submit="crit"><h2>Add a criterion</h2><div class="cols"><label>Name<input name="name" required></label><label>Description<input name="description"></label><label>Weight<input name="weight" type="number" step="0.5" min="0.5" value="10"></label><label>Max score<input name="max_score" type="number" min="1" max="100" value="10"></label></div><button class="btn" type="submit" style="margin-top:12px">Add criterion</button></form>`);
}
async function contentView() {
  const c = await api('GET', '/content');
  const f = (act, id, fields, extra = '') => `<form class="card" data-submit="${act}" data-id="${id || ''}">${fields}<div class="row" style="margin-top:12px"><button class="btn sm" type="submit">${id ? 'Save' : 'Add'}</button>${id ? `<button class="btn line sm" type="button" data-act="del" data-kind="${act}" data-id="${id}">Delete</button>` : ''}${extra}</div></form>`;
  const page = p => f('page', p?.id, `<label>Title<input name="title" required value="${E(p?.title)}"></label><label>Text<textarea name="body">${E(p?.body)}</textarea></label><input type="hidden" name="slug" value="${E(p?.slug || 'page-' + Date.now())}"><input type="hidden" name="sort" value="${p?.sort || 0}">`);
  view(`<h1>Portal content</h1><p class="muted">Change the guidance, FAQs, support details and documents without touching code.</p><h2>Pages (application guide, support, privacy)</h2>${c.pages.map(page).join('')}${page()}
  <h2>FAQs</h2>${c.faqs.map(q => f('faq', q.id, `<label>Question<input name="question" required value="${E(q.question)}"></label><label>Answer<textarea name="answer" required>${E(q.answer)}</textarea></label><input type="hidden" name="sort" value="${q.sort}">`)).join('')}
  ${f('faq', 0, '<label>Question<input name="question" required></label><label>Answer<textarea name="answer" required></textarea></label><input type="hidden" name="sort" value="99">')}
  <h2>Regulatory authority contacts</h2>${c.regulators.map(g => f('reg', g.id, `<div class="cols"><label>Name<input name="name" required value="${E(g.name)}"></label><label>Contact<input name="contact" value="${E(g.contact)}"></label></div><label>Website<input name="url" value="${E(g.url)}"></label>`)).join('')}
  ${f('reg', 0, '<div class="cols"><label>Name<input name="name" required></label><label>Contact<input name="contact"></label></div><label>Website<input name="url"></label>')}
  <h2>Documents and application form copies</h2>${c.documents.map(x => `<div class="card row"><a href="/api/content/${x.id}/file">${E(x.title)} (${E(x.name)})</a><button class="btn line sm" data-act="del" data-kind="page" data-id="${x.id}">Delete</button></div>`).join('')}
  <form class="card" data-submit="doc"><div class="cols"><label>Title<input name="title" required></label><label>File<input type="file" name="file" required></label></div><button class="btn" type="submit" style="margin-top:12px">Upload document</button></form>`);
}
const table = (heads, rows) => `<div class="wrapx"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${heads.length}" class="muted">Nothing yet.</td></tr>`}</tbody></table></div>`;
async function auditView() { const r = await api('GET', '/admin/audit'); view(`<h1>Audit log</h1><p class="muted">Who did what, when and from where. Latest 300 actions.</p>${table(['When', 'User', 'Action', 'Item', 'IP', 'Detail'], r.map(a => `<tr><td>${D(a.created_at)}</td><td>${E(a.user || 'system')}</td><td>${E(a.action)}</td><td>${E(a.entity || '')} ${a.entity_id ?? ''}</td><td>${E(a.ip)}</td><td class="sm">${E(a.detail)}</td></tr>`))}`); }
async function outboxView() { const r = await api('GET', '/admin/outbox'); view(`<h1>Message log</h1><p class="muted">Every email and SMS the portal sends. In demo mode nothing leaves the server; connect your local SMTP or SMS gateway in <code>deliver()</code> to send them.</p>${table(['When', 'Channel', 'To', 'Message'], r.map(m => `<tr><td>${D(m.created_at)}</td><td>${E(m.channel)}</td><td>${E(m.to_addr)}</td><td>${E(m.body)}</td></tr>`))}`); }
async function chatStatsView() {
  const a = await api('GET', '/chat/analytics');
  view(`<h1>Chat analytics</h1><div class="grid"><div class="stat"><b>${a.total}</b>Chat requests</div><div class="stat"><b>${a.answered}</b>Answered</div><div class="stat"><b>${a.missed}</b>Missed (after hours or no agent)</div><div class="stat"><b>${a.waiting}</b>Waiting now</div>
  <div class="stat"><b>${a.avgWaitSeconds ?? 'n/a'}</b>Avg wait (seconds)</div><div class="stat"><b>${a.avgDurationMinutes ?? 'n/a'}</b>Avg chat (minutes)</div><div class="stat"><b>${a.messages}</b>Messages</div></div>
  <div class="cols"><div class="card"><h2>Requests by hour (UTC)</h2>${table(['Hour', 'Requests'], a.byHour.map(h => `<tr><td>${h.hour}:00</td><td>${h.count}</td></tr>`))}</div><div class="card"><h2>Chats per consultant</h2>${table(['Consultant', 'Chats'], a.agents.map(g => `<tr><td>${E(g.name)}</td><td>${g.chats}</td></tr>`))}</div></div>`);
}
let cur = null;
async function consoleView() {
  clearInterval(tick);
  view(`<h1>Chat console</h1><p class="muted">Stay on this page to show as online. You can handle several chats at once.</p><div class="cols"><div class="card"><h2>Waiting</h2><div id="qw"></div><h2 style="margin-top:16px">My chats</h2><div id="qm"></div></div>
  <div class="card"><h2 id="ct">Select a chat</h2><div class="cm" id="cm" style="height:300px;border-radius:10px"></div><form class="cf" data-submit="agentmsg"><input name="body" placeholder="Type a reply" autocomplete="off" maxlength="1000"><button class="btn sm" type="submit">Send</button></form></div></div>`);
  let last = 0;
  const poll = async () => {
    if (!$('#qw')) return clearInterval(tick);
    if (document.hidden) return; // do not poll from a background tab
    const q = await api('GET', '/chat/queue');
    $('#qw').innerHTML = q.waiting.map(s => `<div class="row"><span class="grow">${E(s.user)}<br><span class="muted sm">${E(s.last || '')}</span></span><button class="btn sm" data-act="accept" data-id="${s.id}">Accept</button></div>`).join('') || '<p class="muted">No one waiting.</p>';
    $('#qm').innerHTML = q.mine.map(s => `<div class="row"><span class="grow">${E(s.user)}</span><button class="btn line sm" data-act="pick" data-id="${s.id}">Open</button><button class="btn line sm" data-act="endchat" data-id="${s.id}">End</button></div>`).join('') || '<p class="muted">No active chats.</p>';
    if (cur) { const m = await api('GET', `/chat/sessions/${cur}?after=${last}`); m.messages.forEach(x => { last = x.id; $('#cm').insertAdjacentHTML('beforeend', `<p class="${x.sender === 'agent' ? 'me' : x.sender === 'system' ? 'sys' : ''}">${E(x.body)}</p>`); }); if (m.messages.length) $('#cm').scrollTop = 1e9; }
  };
  consoleView.reset = () => { last = 0; $('#cm').innerHTML = ''; };
  poll(); tick = setInterval(() => run(poll), 3000);
}

// ---------- other ----------
async function notifView() {
  const n = await api('GET', '/notifications'); await api('POST', '/notifications/read', {}); badgeCount(0);
  view(`<h1>Notifications</h1>${n.map(x => `<div class="fb ${x.read ? '' : 'me'}">${x.idea_id ? `<a href="#/idea/${x.idea_id}">${E(x.message)}</a>` : E(x.message)}<br><span class="muted sm">${D(x.created_at)}</span></div>`).join('') || '<p class="muted">No notifications yet.</p>'}`);
}
async function accountView() {
  view(`<h1>My account</h1><form class="card" data-submit="profile"><h2>Profile and alerts</h2><label>Name<input name="name" value="${E(ME.name)}" required></label><p class="muted sm">${E(ME.email || ME.phone)}</p>
  <label style="font-weight:400"><input type="checkbox" name="alert_email" ${ME.alert_email ? 'checked' : ''}> Email me about updates (free)</label><label style="font-weight:400"><input type="checkbox" name="alert_sms" ${ME.alert_sms ? 'checked' : ''}> SMS me about updates (free)</label><button class="btn" type="submit" style="margin-top:12px">Save</button></form>
  <form class="card" data-submit="pw"><h2>Change password</h2><label>Current password<input type="password" name="current" required autocomplete="current-password"></label><label>New password<input type="password" name="newPassword" required minlength="8" autocomplete="new-password"></label><p class="muted sm">At least 8 characters, with a letter and a number.</p><button class="btn" type="submit">Update password</button></form>`);
}
async function faqView() {
  const c = await api('GET', '/content');
  view(`<h1>Help and FAQ</h1>${c.pages.filter(p => p.slug !== 'privacy').map(p => `<div class="card"><h2>${E(p.title)}</h2><p>${E(p.body)}</p></div>`).join('')}
  <h2>Frequently asked questions</h2>${c.faqs.map(q => `<details><summary>${E(q.question)}</summary><p>${E(q.answer)}</p></details>`).join('')}
  ${c.documents.length ? `<h2 style="margin-top:20px">Documents</h2>${c.documents.map(x => `<p><a href="/api/content/${x.id}/file">${E(x.title)}</a></p>`).join('')}` : ''}
  <h2 style="margin-top:20px">Regulatory authorities</h2>${table(['Authority', 'Covers', 'Website'], c.regulators.map(g => `<tr><td>${E(g.name)}</td><td>${E(g.contact)}</td><td>${g.url ? `<a href="${E(g.url)}" target="_blank" rel="noopener">${E(g.url)}</a>` : ''}</td></tr>`))}`);
}

// ---------- chat widget: assistant 24/7 + consultant ----------
let sid = null, lastMsg = 0, chatTimer = null;
const cbox = () => $('#chatbox');
function bubble(t, cls = '') { const m = $('#cmsgs'); if (m) { m.insertAdjacentHTML('beforeend', `<p class="${cls}">${E(t)}</p>`); m.scrollTop = 1e9; } }
function openChat() {
  const b = cbox(); b.hidden = !b.hidden; if (b.hidden) { clearInterval(chatTimer); return; }
  b.innerHTML = `<div class="ch"><span>Help and chat</span><button class="icon" data-act="chat" style="color:#fff;border-color:#fff3;padding:2px 10px" aria-label="Close chat">Close</button></div><div class="cm" id="cmsgs"></div>
  <div class="row" style="padding:6px 10px"><button class="btn line sm" data-act="agentchat">Talk to a consultant</button></div><form class="cf" data-submit="chatmsg"><input name="body" placeholder="Ask a question" autocomplete="off" maxlength="300"><button class="btn sm" type="submit">Send</button></form>`;
  bubble('Hi, I am the CEDA assistant. I am available 24/7. Ask me about submitting ideas, tracking progress, feedback or your account.');
  sid = null;
}
async function startAgent() {
  const r = await api('POST', '/chat/sessions', {});
  if (!r.available) return bubble(r.message, 'sys');
  sid = r.session.id; lastMsg = 0; bubble('Connecting you to a consultant...', 'sys');
  clearInterval(chatTimer);
  chatTimer = setInterval(() => run(async () => {
    if (!sid || document.hidden) return; const m = await api('GET', `/chat/sessions/${sid}?after=${lastMsg}`);
    m.messages.forEach(x => { lastMsg = x.id; if (x.sender !== 'user') bubble(x.body, x.sender === 'system' ? 'sys' : ''); });
    if (m.session.status === 'closed') { sid = null; clearInterval(chatTimer); }
  }), 3000);
}

// ---------- form + click handlers ----------
const SUBMIT = {
  async idea(f) {
    const b = fd(f), id = f.dataset.id; const r = id ? await api('PUT', '/ideas/' + id, b) : await api('POST', '/ideas', b);
    toast('Draft saved.'); location.hash = '#/idea/' + (id || r.id);
  },
  async assign(f) { const ids = [...f.querySelectorAll('[name=ev]:checked')].map(x => +x.value); await api('POST', `/ideas/${f.dataset.id}/assign`, { level: +f.elements.level.value, evaluator_ids: ids }); toast('Evaluators assigned.'); route(); },
  async score(f) {
    const scores = [...f.elements].filter(e => /^s\d+$/.test(e.name)).map(e => ({ criterion_id: +e.name.slice(1), score: e.value, comment: f.elements['c' + e.name.slice(1)].value }));
    await api('POST', `/ideas/${f.dataset.id}/scores`, { scores }); toast('Scores saved.'); route();
  },
  async respond(f) { await api('POST', `/ideas/${f.dataset.id}/respond`, fd(f)); toast('Reply sent.'); route(); },
  async feedback(f) { await api('POST', `/ideas/${f.dataset.id}/feedback`, { body: f.elements.body.value, shared: f.elements.shared.checked }); toast('Feedback posted.'); route(); },
  async newuser(f) { await api('POST', '/admin/users', fd(f)); toast('User created.'); route(); },
  async crit(f) { const b = fd(f); f.dataset.id ? await api('PUT', '/admin/criteria/' + f.dataset.id, b) : await api('POST', '/admin/criteria', b); toast('Criteria saved.'); route(); },
  async page(f) { const b = { ...fd(f), kind: 'page' }; f.dataset.id ? await api('PUT', '/admin/content/' + f.dataset.id, b) : await api('POST', '/admin/content', b); toast('Saved.'); route(); },
  async faq(f) { const b = fd(f); +f.dataset.id ? await api('PUT', '/admin/faqs/' + f.dataset.id, b) : await api('POST', '/admin/faqs', b); toast('Saved.'); route(); },
  async reg(f) { const b = fd(f); +f.dataset.id ? await api('PUT', '/admin/regulators/' + f.dataset.id, b) : await api('POST', '/admin/regulators', b); toast('Saved.'); route(); },
  async doc(f) {
    const file = f.elements.file.files[0]; if (!file) return; if (file.size > 10 * 1048576) throw new Error('That file is larger than 10 MB.');
    const c = await api('POST', '/admin/content', { title: f.elements.title.value, body: '', kind: 'document', slug: 'doc-' + Date.now(), sort: 50 });
    await api('POST', `/admin/content/${c.id}/file?name=${encodeURIComponent(file.name)}`, undefined, await file.arrayBuffer()); toast('Document uploaded.'); route();
  },
  async profile(f) { await api('PATCH', '/auth/me', { name: f.elements.name.value, alert_email: f.elements.alert_email.checked, alert_sms: f.elements.alert_sms.checked }); await loadMe(); toast('Saved.'); },
  async pw(f) { await api('POST', '/auth/password/change', fd(f)); f.reset(); toast('Password updated.'); },
  async agentmsg(f) { if (!cur || !f.elements.body.value.trim()) return; await api('POST', `/chat/sessions/${cur}/messages`, { body: f.elements.body.value }); f.reset(); },
  async chatmsg(f) {
    const t = f.elements.body.value.trim(); if (!t) return; f.reset();
    if (sid) { bubble(t, 'me'); await api('POST', `/chat/sessions/${sid}/messages`, { body: t }); return; }
    bubble(t, 'me'); const r = await api('POST', '/bot', { q: t }); bubble(r.answer);
    if (r.source === 'fallback') bubble(r.chatOpen ? 'Tap "Talk to a consultant" to chat with a person.' : 'Consultants are offline now (09:00 to 16:00 on working days).', 'sys');
  },
};
const ACT = {
  open: a => { location.hash = '#/idea/' + a.dataset.id; },
  async sub(a) { const r = await api('POST', `/ideas/${a.dataset.id}/subscribe`, {}); toast(r.subscribed ? 'You will get alerts for this idea.' : 'Alerts turned off for this idea.'); route(); },
  async submit(a) { await api('POST', `/ideas/${a.dataset.id}/submit`, {}); toast('Submitted. We will keep you updated.'); route(); },
  async delfile(a) { await api('DELETE', `/ideas/${a.dataset.id}/attachments/${a.dataset.aid}`); route(); },
  async move(a) { await api('POST', `/ideas/${a.dataset.id}/transition`, { to: a.dataset.to, note: $('#mnote')?.value || '' }); toast('Updated.'); route(); },
  async active(a) { await api('PATCH', '/admin/users/' + a.dataset.id, { active: a.dataset.on === '1' }); route(); },
  async delcrit(a) { await api('DELETE', '/admin/criteria/' + a.dataset.id); route(); },
  async del(a) { if (!confirm('Delete this item?')) return; const k = { page: 'content', faq: 'faqs', reg: 'regulators' }[a.dataset.kind]; await api('DELETE', `/admin/${k}/${a.dataset.id}`); route(); },
  async accept(a) { await api('POST', `/chat/sessions/${a.dataset.id}/accept`, {}); cur = a.dataset.id; consoleView.reset(); $('#ct').textContent = 'Chat'; },
  pick: a => { cur = a.dataset.id; consoleView.reset(); $('#ct').textContent = 'Chat'; },
  async endchat(a) { await api('POST', `/chat/sessions/${a.dataset.id}/close`, {}); if (cur === a.dataset.id) { cur = null; consoleView.reset(); } },
  notifs: () => { location.hash = '#/notifications'; },
  async logout() { await api('POST', '/auth/logout', {}).catch(() => {}); location.href = '../auth.html'; },
  chat: () => openChat(),
  agentchat: () => startAgent(),
};
const CHANGE = {
  async role(el) { await api('PATCH', '/admin/users/' + el.dataset.id, { role: el.value }); toast('Role updated.'); },
  async upload(el) {
    const f = el.files[0]; if (!f) return; if (f.size > 5 * 1048576) { el.value = ''; throw new Error('That file is larger than 5 MB.'); }
    await api('POST', `/ideas/${el.dataset.id}/attachments?name=${encodeURIComponent(f.name)}`, undefined, await f.arrayBuffer()); toast('File added.'); route();
  },
};
document.addEventListener('submit', e => { const f = e.target.closest('form[data-submit]'); if (!f) return; e.preventDefault(); const b = f.querySelector('[type=submit]'); if (b) b.disabled = true; run(() => SUBMIT[f.dataset.submit](f)).finally(() => { if (b) b.disabled = false; }); });
document.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (!a) return; if (a.tagName === 'TR' && e.target.closest('a')) return; run(() => ACT[a.dataset.act](a, e)); });
document.addEventListener('input', e => { if (e.target.closest('form[data-submit=idea]')) { clearTimeout(dupTimer); dupTimer = setTimeout(() => run(dupCheck), 700); } });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) run(() => CHANGE[el.dataset.change](el)); });

// ---------- routing + boot ----------
function badgeCount(n) { const c = $('#cnt'); c.hidden = !n; c.textContent = n; }
const welcome = () => { $('#welcome').textContent = ME ? 'Welcome, ' + ME.name : ''; };
async function loadMe() { const r = await api('GET', '/auth/me'); ME = r.user; badgeCount(r.unread); welcome(); }
async function route() {
  clearInterval(tick);
  const [path, qs] = (location.hash || '#/').slice(1).split('?'), p = path.split('/').filter(Boolean), stage = new URLSearchParams(qs || '').get('stage') || '';
  $('#nav').innerHTML = NAV[ME.role].map(([h, t, i]) => `<a href="${h}" class="${h.slice(1) === path || (h === '#/' && path === '/') ? 'on' : ''}">${icon(i)}<span>${t}</span></a>`).join('') + `<a href="#/notifications" class="${path === '/notifications' ? 'on' : ''}">${icon('bell')}<span>Notifications</span></a><a href="#/account" class="${path === '/account' ? 'on' : ''}">${icon('user')}<span>My account</span></a>`;
  const R = ME.role, home = { submitter: () => ideasView('', 'My ideas'), evaluator: () => ideasView('', 'Ideas assigned to me'), adjudicator: () => ideasView('adjudication', 'Decision queue'), admin: reportsView, observer: reportsView, agent: consoleView };
  const slow = setTimeout(() => view('<p class="muted">Loading...</p>'), 150); // only shown if a screen takes longer than 150 ms
  await run(async () => {
    if (!p.length) return home[R]();
    const [a, b] = p;
    if (a === 'ideas') return ideasView(stage, 'All ideas');
    if (a === 'idea') return ideaView(b);
    if (a === 'new' && R === 'submitter') return formView();
    if (a === 'edit' && R === 'submitter') return formView(b);
    if (a === 'reports') return reportsView();
    if (R === 'admin' && a === 'users') return usersView();
    if (R === 'admin' && a === 'criteria') return criteriaView();
    if (R === 'admin' && a === 'content') return contentView();
    if (R === 'admin' && a === 'audit') return auditView();
    if (R === 'admin' && a === 'outbox') return outboxView();
    if (['admin', 'agent'].includes(R) && a === 'console') return consoleView();
    if (['admin', 'agent'].includes(R) && a === 'chat-stats') return chatStatsView();
    if (a === 'notifications') return notifView();
    if (a === 'account') return accountView();
    if (a === 'faq') return faqView();
    view('<h1>Page not found</h1><p><a href="#/">Go to home</a></p>');
  });
  clearTimeout(slow); $('#view').focus({ preventScroll: true });
}
let rt; const soon = () => { clearTimeout(rt); rt = setTimeout(() => { if (!/^#\/(new|edit|content|criteria|users|console|account)/.test(location.hash) && !document.activeElement?.closest('form')) route(); }, 400); };
(async () => {
  await run(loadMe); if (!ME) return;
  $('#role').textContent = ME.role; $('#nav'); window.addEventListener('hashchange', route); route();
  es = new EventSource('/api/events');
  es.addEventListener('idea', soon);
  es.addEventListener('notification', async ev => { const r = await api('GET', '/auth/me'); badgeCount(r.unread); toast(JSON.parse(ev.data).message); });
})();
})();
