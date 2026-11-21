// Simple response-time benchmark: node scripts/bench.mjs [baseUrl]   (start the server first; on a live server set SKIP_SIGNIN=1 because sign-in is rate limited)
const base = process.argv[2] || 'http://localhost:3000', N = Number(process.env.N || 400), C = Number(process.env.C || 20);
const H = { 'X-Requested-With': 'portal', 'content-type': 'application/json' };
async function login(email) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ identifier: email, password: 'Demo@1234' }) });
  if (!r.ok) throw new Error('Demo login failed (' + r.status + '). Start the server with demo data.'); return r.headers.get('set-cookie').split(';')[0];
}
const admin = await login('admin@demo.bw'), sub = await login('submitter@demo.bw');
const cases = [
  ['Landing page (static)', '/', {}, N], ['App script (static)', '/app/app.js', {}, N], ['Health check', '/api/health', {}, N],
  ['Idea list (submitter)', '/api/ideas', { cookie: sub }, N], ['Idea detail (admin)', '/api/ideas/3', { cookie: admin }, N],
  ['Dashboard summary (admin)', '/api/reports/summary', { cookie: admin }, N], ['FAQs and content (public)', '/api/content', {}, N],
  ...(process.env.SKIP_SIGNIN ? [] : [['Sign in (password hashing)', '/api/auth/login', { post: JSON.stringify({ identifier: 'admin@demo.bw', password: 'Demo@1234' }) }, Math.min(N, 100)]]),
];
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log(`Concurrency ${C}, ${base}\n` + 'Request'.padEnd(30) + 'req/s'.padStart(8) + 'p50 ms'.padStart(9) + 'p95 ms'.padStart(9) + 'p99 ms'.padStart(9));
for (const [name, path, o, n] of cases) {
  const lat = []; let next = 0; const t0 = performance.now();
  await Promise.all(Array.from({ length: C }, async () => {
    while (next++ < n) {
      const s = performance.now();
      const r = await fetch(base + path, o.post ? { method: 'POST', headers: H, body: o.post } : { headers: o.cookie ? { cookie: o.cookie } : {} });
      await r.arrayBuffer(); if (r.status >= 400) throw new Error(name + ' returned ' + r.status);
      lat.push(performance.now() - s);
    }
  }));
  lat.sort((a, b) => a - b); const secs = (performance.now() - t0) / 1000;
  console.log(name.padEnd(30) + String(Math.round(lat.length / secs)).padStart(8) + pct(lat, .5).toFixed(1).padStart(9) + pct(lat, .95).toFixed(1).padStart(9) + pct(lat, .99).toFixed(1).padStart(9));
}
