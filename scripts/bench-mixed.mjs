// Does sign-in traffic slow everyone else down? node scripts/bench-mixed.mjs [baseUrl]  (server needs RATE_LIMIT=100000)
const base = process.argv[2] || 'http://localhost:3000', H = { 'X-Requested-With': 'portal', 'content-type': 'application/json' };
const lr = await fetch(base + '/api/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ identifier: 'submitter@demo.bw', password: 'Demo@1234' }) });
const cookie = lr.headers.get('set-cookie').split(';')[0];
let stop = false, logins = 0;
const load = () => (async () => { while (!stop) { await (await fetch(base + '/api/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ identifier: 'admin@demo.bw', password: 'Demo@1234' }) })).arrayBuffer(); logins++; } })();
const workers = Array.from({ length: 8 }, load); await new Promise(r => setTimeout(r, 500));
const lat = [];
for (let i = 0; i < 150; i++) { const s = performance.now(); await (await fetch(base + '/api/ideas', { headers: { cookie } })).arrayBuffer(); lat.push(performance.now() - s); }
stop = true; await Promise.all(workers); lat.sort((a, b) => a - b);
console.log(`While 8 users sign in at once: idea list p50 ${lat[75].toFixed(0)} ms, p95 ${lat[142].toFixed(0)} ms, worst ${lat[149].toFixed(0)} ms (${logins} sign-ins completed)`);
