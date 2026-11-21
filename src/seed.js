import { q, tx } from './db.js';
import { hashPw, now } from './lib.js';

export const DEMO_PASSWORD = 'Demo@1234';

export function seed() {
  if (q.get('SELECT COUNT(*) c FROM users').c) return false;
  if (process.env.SEED_DEMO === 'false') return seedBase(true);
  seedBase(false);
  const pw = hashPw(DEMO_PASSWORD), t = now(), U = {};
  for (const [k, name, role] of [['admin', 'Neo Admin', 'admin'], ['e1', 'Kabo Evaluator', 'evaluator'], ['e2', 'Lerato Evaluator', 'evaluator'], ['adj', 'Tumi Adjudicator', 'adjudicator'],
    ['obs', 'Mpho Observer', 'observer'], ['agent', 'Boitumelo Consultant', 'agent'], ['sub', 'Thabo Submitter', 'submitter'], ['sub2', 'Naledi Submitter', 'submitter']])
    U[k] = q.run('INSERT INTO users(name,email,pass_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)', name, `${role === 'submitter' ? (k === 'sub' ? 'submitter' : 'submitter2') : role === 'evaluator' ? (k === 'e1' ? 'evaluator1' : 'evaluator2') : role}@demo.bw`, pw, role, t).id;
  const crit = q.all('SELECT id FROM criteria').map(c => c.id);
  const day = n => new Date(Date.now() - n * 864e5).toISOString();
  const TXT = {
    'Solar-powered cold storage for rural farmers': ['Smallholder farmers lose a large share of fresh produce after harvest because villages have no electricity for cold rooms.', 'Shared solar-powered cold rooms placed at village collection points, rented by the day and managed by a local cooperative.', 'Cuts post-harvest losses, lets farmers sell at better prices and creates jobs for local operators.'],
    'Township recycling collection app': ['Households in townships have no convenient way to hand over plastic, glass and cans, so recyclable waste ends up in open dumps.', 'A phone app and USSD service that schedules neighbourhood pickups and pays collectors per kilogram through mobile money.', 'Creates income for waste collectors, cleaner streets and a steady supply of material for recyclers.'],
    'Youth digital skills hubs': ['Young people outside the big towns cannot learn coding, design or online work because training centres and fast internet are far away.', 'Community hubs in existing halls with laptops, mentors and short courses that lead to paid freelance work.', 'Trains hundreds of unemployed youth each year and links them to remote work and local employers.'],
    'Water-saving drip irrigation kits': ['Dry seasons and borehole costs make it hard for small vegetable growers to water their crops reliably.', 'Low-cost drip irrigation kits made from local parts, sold on instalments with installation training.', 'Uses much less water per hectare, raises yields and keeps small farms productive during droughts.'],
    'Mobile clinic booking platform': ['Patients in remote areas travel long distances only to find the mobile clinic has already left or is full.', 'A booking platform that shows mobile clinic routes and times and lets patients reserve a slot by SMS.', 'Shorter waits, fewer wasted trips and better planning of nurses and medicine stock.'],
  };
  const mk = (owner, title, cat, stage, ago) => {
    const id = q.run('INSERT INTO ideas(owner_id,title,category,summary,problem,solution,impact,stage,submitted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', owner, title, cat,
      `${title}: a practical solution for Botswana communities and small businesses.`,
      TXT[title][0], TXT[title][1], TXT[title][2],
      stage, stage === 'draft' ? null : day(ago), day(ago + 1), day(ago)).id;
    if (stage !== 'draft') { q.run('INSERT INTO idea_versions(idea_id,version,snapshot,created_at) VALUES(?,1,?,?)', id, '{}', day(ago)); q.run('INSERT INTO subscriptions(user_id,idea_id) VALUES(?,?)', owner, id); q.run("INSERT INTO stage_log(idea_id,from_stage,to_stage,actor_id,note,created_at) VALUES(?,'draft','submitted',?,'Submitted',?)", id, owner, day(ago)); }
    return id;
  };
  const step = (id, from, to, ago) => q.run('INSERT INTO stage_log(idea_id,from_stage,to_stage,actor_id,note,created_at) VALUES(?,?,?,?,NULL,?)', id, from, to, U.admin, day(ago));
  const score = (id, ev, lvl, vals) => { crit.forEach((c, k) => q.run('INSERT INTO scores(idea_id,evaluator_id,level,version,criterion_id,score) VALUES(?,?,?,1,?,?)', id, ev, lvl, c, vals[k])); q.run('UPDATE assignments SET submitted_at=? WHERE idea_id=? AND evaluator_id=? AND level=?', t, id, ev, lvl); };
  const asg = (id, ev, lvl) => q.run('INSERT INTO assignments(idea_id,evaluator_id,level) VALUES(?,?,?)', id, ev, lvl);
  tx(() => {
    const a = mk(U.sub, 'Solar-powered cold storage for rural farmers', 'Agriculture', 'level1', 6); step(a, 'submitted', 'screening', 5); step(a, 'screening', 'level1', 4);
    asg(a, U.e1, 1); asg(a, U.e2, 1); score(a, U.e1, 1, [8, 7, 9, 8, 7]);
    mk(U.sub2, 'Township recycling collection app', 'Green economy', 'submitted', 1);
    const c = mk(U.sub, 'Youth digital skills hubs', 'Education', 'adjudication', 12); step(c, 'submitted', 'screening', 11); step(c, 'screening', 'level1', 10); step(c, 'level1', 'level2', 8); step(c, 'level2', 'adjudication', 5);
    asg(c, U.e1, 1); asg(c, U.e2, 1); asg(c, U.e1, 2); score(c, U.e1, 1, [7, 8, 8, 7, 9]); score(c, U.e2, 1, [8, 8, 7, 8, 8]); score(c, U.e1, 2, [8, 9, 8, 8, 9]);
    const d = mk(U.sub2, 'Water-saving drip irrigation kits', 'Agriculture', 'approved', 20); step(d, 'submitted', 'screening', 19); step(d, 'screening', 'level1', 18); step(d, 'level1', 'level2', 15); step(d, 'level2', 'adjudication', 12); step(d, 'adjudication', 'approved', 9);
    asg(d, U.e1, 1); score(d, U.e1, 1, [9, 8, 9, 9, 8]); q.run("UPDATE ideas SET decided_at=?,decision_note='Strong impact and a realistic plan.' WHERE id=?", day(9), d);
    mk(U.sub, 'Mobile clinic booking platform', 'Health', 'draft', 0);
    q.run("INSERT INTO notifications(user_id,idea_id,message,created_at) VALUES(?,?,?,?)", U.sub, a, 'Your idea "Solar-powered cold storage for rural farmers" is now: Evaluation level 1.', day(4));
  });
  return true;
}

function seedBase(withAdminOnly) {
  const t = now();
  if (withAdminOnly) {
    const pw = process.env.ADMIN_PASSWORD; if (!pw) throw new Error('Set ADMIN_PASSWORD (and ADMIN_EMAIL) when SEED_DEMO=false.');
    q.run("INSERT INTO users(name,email,pass_hash,role,verified,created_at) VALUES('Administrator',?,?,'admin',1,?)", (process.env.ADMIN_EMAIL || 'admin@example.bw').toLowerCase(), hashPw(pw), t);
  }
  for (const [n, d, w] of [['Innovation', 'How new and original is the idea?', 25], ['Feasibility', 'Can it be built and run with the resources described?', 20], ['Impact', 'How much benefit for people and businesses in Botswana?', 25], ['Sustainability', 'Can it keep going and grow after the first year?', 15], ['Team and readiness', 'Does the submitter have what it takes to deliver?', 15]])
    q.run('INSERT INTO criteria(name,description,weight,max_score) VALUES(?,?,?,10)', n, d, w);
  const page = (slug, title, body, sort) => q.run("INSERT INTO content(slug,title,body,kind,sort,updated_at) VALUES(?,?,?,'page',?,?)", slug, title, body, sort, t);
  page('guide', 'How to complete the idea form', 'Give your idea a clear title and pick a category. Describe the problem you are solving, your proposed solution and the impact you expect. Text fields need at least 20 characters. You can save a draft and come back later, and attach up to 10 supporting files.', 1);
  page('support', 'Support and fault remediation', 'The portal is monitored 24/7. Critical outage: acknowledged within 1 hour and restored within 4 hours. Major defect: fixed within 1 business day. Minor defect: fixed within 5 business days. Report faults through the chat assistant or the support email shown in your submission confirmation.', 2);
  page('privacy', 'Privacy summary', 'Your personal data is collected for your account and your submissions only, protected by role-based access and an audit trail, held in Botswana, and kept only as long as needed. Contact CEDA to access, correct or delete your data.', 3);
  const faq = (qn, a, s) => q.run('INSERT INTO faqs(question,answer,sort) VALUES(?,?,?)', qn, a, s);
  faq('Who can submit an idea?', 'Anyone can create a free account with an email address or phone number and submit an idea.', 1);
  faq('How do I know what stage my idea is at?', 'Open "My ideas" to see the current stage. Turn on alerts with the Subscribe button to receive an email or SMS whenever something changes.', 2);
  faq('What happens after I submit?', 'Your idea is screened, then reviewed by evaluation teams in up to two levels, and finally decided by an adjudicator. You are notified at each step.', 3);
  faq('What if evaluators ask for changes?', 'You will get a notification with their feedback. Reply in the portal, or edit and resubmit. Every version is kept on record.', 4);
  faq('I forgot my password. What do I do?', 'Choose "Forgot password?" on the sign-in page. We will send a 6-digit code to your email or phone so you can set a new password.', 5);
  faq('When can I chat with a consultant?', 'Consultants are available 09:00 to 16:00 on working days. The assistant is available 24/7.', 6);
  const reg = (n, c, u) => q.run('INSERT INTO regulators(name,contact,url) VALUES(?,?,?)', n, c, u);
  reg('Citizen Entrepreneurial Development Agency (CEDA)', 'Funding and business support', 'https://www.ceda.co.bw');
  reg('Companies and Intellectual Property Authority (CIPA)', 'Company registration and intellectual property', 'https://www.cipa.co.bw');
  reg('Botswana Unified Revenue Service (BURS)', 'Tax and customs', 'https://www.burs.org.bw');
  reg('Botswana Communications Regulatory Authority (BOCRA)', 'Telecommunications and ICT licensing', 'https://www.bocra.org.bw');
  reg('Botswana Digital and Innovation Hub (BDIH)', 'Innovation programmes and hackathon support: hackathon@bih.co.bw', 'https://www.bih.co.bw');
  return true;
}
