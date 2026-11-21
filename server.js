import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser, PROD } from './src/lib.js';
import { seed } from './src/seed.js';
import auth from './src/routes/auth.js';
import ideas from './src/routes/ideas.js';
import chat from './src/routes/chat.js';
import misc from './src/routes/misc.js';

process.env.UV_THREADPOOL_SIZE ??= '8'; // more threads for password hashing under load
export const app = express();
const PUBLIC = path.join(import.meta.dirname, 'public');

// Static pages are compressed once and cached (re-compressed only when the file changes), so they cost almost no CPU per request.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const gzCache = new Map();
function staticGzip(req, res, next) {
  if (!['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api/') || !/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
  let rel; try { rel = decodeURIComponent(req.path); } catch { return next(); }
  if (rel.endsWith('/')) rel += 'index.html'; else if (!path.extname(rel)) rel += '.html';
  const file = path.resolve(PUBLIC, '.' + rel), type = TYPES[path.extname(file)];
  if (!type || !file.startsWith(PUBLIC + path.sep)) return next();
  let st; try { st = fs.statSync(file); } catch { return next(); }
  let e = gzCache.get(file);
  if (!e || e.mtime !== st.mtimeMs) { e = { mtime: st.mtimeMs, gz: zlib.gzipSync(fs.readFileSync(file), { level: 9 }), etag: `"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"` }; gzCache.set(file, e); }
  res.set({ 'Content-Type': type, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', ETag: e.etag, 'Cache-Control': PROD ? 'public, max-age=3600' : 'no-cache' });
  if (req.headers['if-none-match'] === e.etag) return res.status(304).end();
  res.send(e.gz);
}
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(PROD ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  });
  next();
});
app.use(staticGzip);
app.use(compression({ threshold: 512, filter: (req, res) => (req.path === '/api/events' ? false : compression.filter(req, res)) })); // gzip text responses
app.use(express.json({ limit: '200kb' }));
app.use(loadUser);
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) && req.get('x-requested-with') !== 'portal') return res.status(403).json({ message: 'Blocked request.' });
  res.set('Cache-Control', 'no-store'); next();
});
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', auth);
app.use('/api/ideas', ideas);
app.use('/api/chat', chat);
app.use('/api', misc);
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found.' }));
app.use(express.static(PUBLIC, { extensions: ['html'], maxAge: PROD ? '1h' : 0, etag: true }));
app.use((err, req, res, next) => {
  const s = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (s === 500) console.error(err);
  res.status(s).json({ message: s === 500 ? 'Something went wrong on our side. Please try again.' : err.message });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (seed()) console.log(process.env.SEED_DEMO === 'false' ? 'Created admin account.' : 'Demo data loaded. Demo password for all demo users: Demo@1234');
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => console.log(`CEDA Innovation Portal running on http://localhost:${port}`));
  server.keepAliveTimeout = 65000; server.headersTimeout = 66000; // stay above reverse-proxy idle timeouts
}
