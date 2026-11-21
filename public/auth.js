
// Backend API base. Same-origin '/api' works when the backend serves these pages.
// If the pages are on GitHub Pages and the API is elsewhere, set the full URL here.
const API = window.API_BASE || '/api';
const views = [...document.querySelectorAll('[data-view]')];
const state = { id: '', purpose: 'register' };
let timer = null;

function show(name, note) {
  views.forEach(v => v.hidden = v.dataset.view !== name);
  const f = document.querySelector('[data-view="' + name + '"]');
  f.querySelectorAll('.msg').forEach(m => m.hidden = true);
  if (note) say(f, note, true);
  const first = f.querySelector('input:not([type=checkbox])');
  if (first) first.focus();
}
function say(form, text, ok) {
  const m = form.querySelector('.msg');
  m.textContent = text; m.className = 'msg' + (ok ? ' ok' : ''); m.hidden = false;
}
async function api(path, body) {
  try {
    const r = await fetch(API + path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'portal' }, body: JSON.stringify(body) });
    let data = {}; try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, data };
  } catch (e) {
    return { ok: false, data: { message: 'We could not reach the service. Please check your connection and try again.' } };
  }
}
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPhone = s => /^\+?[0-9 ]{7,15}$/.test(s);
const validId = s => isEmail(s) || isPhone(s);
const strong = s => s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);

async function submit(form, work) {
  const btn = form.querySelector('.btn'); btn.disabled = true;
  try { await work(); } finally { btn.disabled = false; }
}
function problem(form, res, fallback) {
  say(form, (res.data && res.data.message) || fallback);
}

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { show(go.dataset.go); history.replaceState(null, '', '#' + go.dataset.go); }
  const t = e.target.closest('[data-toggle]');
  if (t) {
    const i = document.getElementById(t.dataset.toggle);
    const hide = i.type === 'password';
    i.type = hide ? 'text' : 'password';
    t.textContent = hide ? 'Hide' : 'Show';
    t.setAttribute('aria-label', hide ? 'Hide password' : 'Show password');
  }
});

// Demo mode: the server returns the code so the prototype works before an SMS/email gateway is connected.
function demo(r, view) { if (r && r.data && r.data.devCode) { const f = document.querySelector('[data-view="' + (view || 'verify') + '"]'); say(f, 'Demo mode: your code is ' + r.data.devCode, true); } }
const F = n => document.querySelector('[data-view="' + n + '"]');

F('login').addEventListener('submit', e => { e.preventDefault(); const f = e.target;
  submit(f, async () => {
    const id = f.elements.id.value.trim(), pw = f.elements.pw.value;
    if (!validId(id)) return say(f, 'Enter a valid email address or phone number.');
    if (!pw) return say(f, 'Enter your password.');
    const r = await api('/auth/login', { identifier: id, password: pw });
    if (r.ok) { location.href = 'app/'; }
    else if (r.data.needsVerify) {
      state.id = id; state.purpose = 'register';
      const r2 = await api('/auth/resend', { identifier: id, purpose: 'register' });
      document.getElementById('v-lede').textContent = 'Your account is not confirmed yet. Enter the code we sent to ' + id + '.';
      show('verify'); countdown(); demo(r2);
    } else problem(f, r, 'Those details do not match. Check them and try again.');
  });
});

F('register').addEventListener('submit', e => { e.preventDefault(); const f = e.target;
  submit(f, async () => {
    const name = f.elements.name.value.trim(), email = f.elements.email.value.trim(), phone = f.elements.phone.value.trim(), pw = f.elements.pw.value;
    if (!name) return say(f, 'Enter your full name.');
    if (!email && !phone) return say(f, 'Enter an email address or a phone number.');
    if (email && !isEmail(email)) return say(f, 'Enter a valid email address.');
    if (phone && !isPhone(phone)) return say(f, 'Enter a valid phone number.');
    if (!strong(pw)) return say(f, 'Use at least 8 characters, with a letter and a number.');
    if (!f.elements.consent.checked) return say(f, 'Please accept the privacy notice to continue.');
    const r = await api('/auth/register', { name, email, phone, password: pw, consent: true });
    if (r.ok) {
      state.id = email || phone; state.purpose = 'register';
      document.getElementById('v-lede').textContent = 'We sent a 6-digit code to ' + state.id + '. Enter it to confirm your account.';
      show('verify'); countdown();
      demo(r);
    } else problem(f, r, 'We could not create your account. Please try again.');
  });
});

F('verify').addEventListener('submit', e => { e.preventDefault(); const f = e.target;
  submit(f, async () => {
    const code = f.elements.code.value.trim();
    if (!/^\d{6}$/.test(code)) return say(f, 'Enter the 6-digit code.');
    const r = await api('/auth/verify', { identifier: state.id, code, purpose: state.purpose });
    if (!r.ok) return problem(f, r, 'That code is not correct or has expired.');
    if (state.purpose === 'login') location.href = 'app/';
    else { f.reset(); show('login', 'Your account is confirmed. Sign in to continue.'); }
  });
});

F('otp').addEventListener('submit', e => { e.preventDefault(); const f = e.target;
  submit(f, async () => {
    const id = f.elements.id.value.trim();
    if (!validId(id)) return say(f, 'Enter a valid email address or phone number.');
    const r0 = await api('/auth/otp/request', { identifier: id });
    state.id = id; state.purpose = 'login';
    document.getElementById('v-lede').textContent = 'If an account exists for ' + id + ', we have sent a 6-digit code.';
    show('verify'); countdown(); demo(r0);
  });
});

F('forgot').addEventListener('submit', e => { e.preventDefault(); const f = e.target;
  submit(f, async () => {
    const id = f.elements.id.value.trim();
    if (!validId(id)) return say(f, 'Enter a valid email address or phone number.');
    const r0 = await api('/auth/password/forgot', { identifier: id });
    state.id = id;
    show('reset', 'If an account exists for ' + id + ', we have sent a reset code.');
    demo(r0, 'reset');
  });
});

F('reset').addEventListener('submit', e => { e.preventDefault(); const f = e.target;
  submit(f, async () => {
    const code = f.elements.code.value.trim(), pw = f.elements.pw.value;
    if (!/^\d{6}$/.test(code)) return say(f, 'Enter the 6-digit code.');
    if (!strong(pw)) return say(f, 'Use at least 8 characters, with a letter and a number.');
    if (pw !== f.elements.pw2.value) return say(f, 'The two passwords do not match.');
    const r = await api('/auth/password/reset', { identifier: state.id, code, newPassword: pw });
    if (r.ok) { f.reset(); show('login', 'Your password has been updated. Sign in with it now.'); }
    else problem(f, r, 'That code is not correct or has expired.');
  });
});

const resend = document.getElementById('resend');
function countdown() {
  clearInterval(timer); let s = 60; resend.disabled = true;
  const tick = () => { resend.textContent = s > 0 ? 'Resend code in ' + s + 's' : 'Resend code'; if (s-- <= 0) { clearInterval(timer); resend.disabled = false; } };
  tick(); timer = setInterval(tick, 1000);
}
resend.addEventListener('click', async () => {
  resend.disabled = true;
  const r1 = await api('/auth/resend', { identifier: state.id, purpose: state.purpose });
  say(F('verify'), 'A new code has been sent.', true); countdown(); demo(r1);
});

const start = location.hash.slice(1);
show(views.some(v => v.dataset.view === start) && ['login','register','otp','forgot'].includes(start) ? start : 'login');
