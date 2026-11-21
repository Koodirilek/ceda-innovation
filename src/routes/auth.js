import { Router } from 'express';
import { q } from '../db.js';
import { bad, now, normId, isEmail, isPhone, strongPw, txt, hashPwAsync, checkPwAsync, setSession, clearSession, need, limit, audit, makeOtp, checkOtp, DEV_OTP } from '../lib.js';

const r = Router();
const find = id => (id ? q.get('SELECT * FROM users WHERE email=? OR phone=?', id, id) : null);
const pub = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });
const withCode = code => (DEV_OTP && code ? { devCode: code } : {});

r.post('/register', limit(), async (req, res) => {
  const { password, consent } = req.body, name = txt(req.body.name, 100);
  const email = req.body.email ? normId(req.body.email) : null, phone = req.body.phone ? normId(req.body.phone) : null;
  if (!name || name.length < 2) bad('Enter your full name.');
  if (!email && !phone) bad('Enter an email address or a phone number.');
  if (email && !isEmail(email)) bad('Enter a valid email address.');
  if (phone && !isPhone(phone)) bad('Enter a valid phone number.');
  if (!strongPw(password)) bad('Use at least 8 characters, with a letter and a number.');
  if (consent !== true) bad('Please accept the privacy notice to continue.');
  const ex = q.get('SELECT id,verified FROM users WHERE email=? OR phone=?', email, phone);
  if (ex?.verified) bad('An account with these details already exists. Try signing in.', 409);
  if (ex) q.run('DELETE FROM users WHERE id=?', ex.id);
  const id = q.run('INSERT INTO users(name,email,phone,pass_hash,role,created_at) VALUES(?,?,?,?,?,?)', name, email, phone, await hashPwAsync(password), 'submitter', now()).id;
  req.user = { id }; audit(req, 'register', 'user', id);
  res.json({ ok: true, ...withCode(makeOtp(email || phone, 'register')) });
});

r.post('/verify', limit(), (req, res) => {
  const id = normId(req.body.identifier), purpose = req.body.purpose === 'login' ? 'login' : 'register';
  if (!checkOtp(id, purpose, req.body.code)) bad('That code is not correct or has expired.');
  const u = find(id); if (!u || !u.active) bad('That code is not correct or has expired.');
  q.run('UPDATE users SET verified=1 WHERE id=?', u.id); req.user = u;
  audit(req, purpose === 'login' ? 'login_otp' : 'verify', 'user', u.id);
  if (purpose === 'login') { setSession(res, u.id); return res.json({ ok: true, user: pub(u) }); }
  res.json({ ok: true });
});

r.post('/resend', limit(), (req, res) => {
  const id = normId(req.body.identifier), purpose = ['register', 'login', 'reset'].includes(req.body.purpose) ? req.body.purpose : 'login';
  const u = find(id); let code;
  if (u && u.active && (purpose === 'register' ? !u.verified : u.verified)) code = makeOtp(id, purpose);
  res.json({ ok: true, ...withCode(code) });
});

r.post('/login', limit(), async (req, res) => {
  const id = normId(req.body.identifier), u = find(id), msg = 'Those details do not match. Check them and try again.';
  if (!u) { await hashPwAsync('timing'); bad(msg, 401); }
  if (u.locked_until > Date.now()) bad('Too many failed attempts. Try again in 15 minutes.', 429);
  if (!(await checkPwAsync(req.body.password, u.pass_hash))) {
    const f = u.fails + 1; q.run('UPDATE users SET fails=?,locked_until=? WHERE id=?', f >= 5 ? 0 : f, f >= 5 ? Date.now() + 900000 : 0, u.id);
    req.user = u; audit(req, 'login_failed', 'user', u.id); bad(msg, 401);
  }
  if (!u.active) bad('This account is disabled. Contact CEDA support.', 403);
  if (!u.verified) return res.status(403).json({ message: 'Please confirm your account with the code we send you.', needsVerify: true });
  q.run('UPDATE users SET fails=0,locked_until=0 WHERE id=?', u.id); req.user = u; audit(req, 'login', 'user', u.id);
  setSession(res, u.id); res.json({ ok: true, user: pub(u) });
});

r.post('/otp/request', limit(), (req, res) => {
  const id = normId(req.body.identifier), u = find(id);
  res.json({ ok: true, ...withCode(u && u.verified && u.active ? makeOtp(id, 'login') : null) });
});
r.post('/password/forgot', limit(), (req, res) => {
  const id = normId(req.body.identifier), u = find(id);
  res.json({ ok: true, ...withCode(u && u.verified && u.active ? makeOtp(id, 'reset') : null) });
});
r.post('/password/reset', limit(), async (req, res) => {
  const id = normId(req.body.identifier);
  if (!strongPw(req.body.newPassword)) bad('Use at least 8 characters, with a letter and a number.');
  const u = find(id); if (!u || !checkOtp(id, 'reset', req.body.code)) bad('That code is not correct or has expired.');
  q.run('UPDATE users SET pass_hash=?,fails=0,locked_until=0 WHERE id=?', await hashPwAsync(req.body.newPassword), u.id); req.user = u; audit(req, 'password_reset', 'user', u.id);
  res.json({ ok: true });
});
r.post('/password/change', need(), async (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id=?', req.user.id);
  if (!(await checkPwAsync(req.body.current, u.pass_hash))) bad('Your current password is not correct.', 401);
  if (!strongPw(req.body.newPassword)) bad('Use at least 8 characters, with a letter and a number.');
  q.run('UPDATE users SET pass_hash=? WHERE id=?', await hashPwAsync(req.body.newPassword), u.id); audit(req, 'password_change', 'user', u.id);
  res.json({ ok: true });
});
r.post('/logout', (req, res) => { if (req.user) audit(req, 'logout', 'user', req.user.id); clearSession(res); res.json({ ok: true }); });
r.get('/me', need(), (req, res) => res.json({ user: req.user, unread: q.get('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0', req.user.id).c }));
r.patch('/me', need(), (req, res) => {
  const name = txt(req.body.name, 100) || req.user.name;
  q.run('UPDATE users SET name=?,alert_email=?,alert_sms=? WHERE id=?', name, req.body.alert_email ? 1 : 0, req.body.alert_sms ? 1 : 0, req.user.id);
  audit(req, 'profile_update', 'user', req.user.id); res.json({ ok: true });
});
export default r;
