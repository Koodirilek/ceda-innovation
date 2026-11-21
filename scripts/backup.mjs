// Consistent database backup (safe while the portal is running). Usage: node scripts/backup.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data'), dir = path.join(dataDir, 'backups'), keep = Number(process.env.KEEP_BACKUPS || 96);
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16), file = path.join(dir, `portal-${stamp}.db`);
const src = new DatabaseSync(process.env.DB_FILE || path.join(dataDir, 'portal.db'));
if (fs.existsSync(file)) fs.rmSync(file);
src.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); src.close();
const chk = new DatabaseSync(file); const res = Object.values(chk.prepare('PRAGMA integrity_check').get())[0]; chk.close();
if (res !== 'ok') { console.error('Backup failed its integrity check:', res); process.exit(1); }
const old = fs.readdirSync(dir).filter(f => /^portal-.*\.db$/.test(f)).sort().reverse().slice(keep);
old.forEach(f => fs.rmSync(path.join(dir, f)));
console.log(`Backup OK: ${file} (${fs.statSync(file).size} bytes, integrity ${res}, ${old.length} old removed)`);
