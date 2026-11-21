import { q } from './db.js';

// Duplicate-idea detection: TF-IDF cosine similarity over title, category, summary, problem and solution.
// Runs entirely on the portal server, so idea text never leaves Botswana.
const STOP = new Set('a an and are as at be but by for from has have in into is it its of on or our that the their this to we will with you your can who which they them was were been more most such than then these those use using used make makes help helps new idea project people business businesses botswana'.split(' '));
const stem = w => (w.length > 5 ? w.replace(/(ations?|ings?|ed|es|s|ly)$/, '') : w.length > 3 ? w.replace(/s$/, '') : w);
export const tokens = t => (String(t || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !STOP.has(w)).map(stem);
const textOf = i => [i.title, i.title, i.category, i.summary, i.problem, i.solution].join(' '); // title counts double

export const levelOf = s => (s >= 60 ? 'high' : s >= 35 ? 'possible' : 'none');

// Returns submitted ideas most similar to `query` (an object with title/summary/problem/solution), best first.
export function findSimilar(query, { excludeId = null, limit = 5, minScore = 25 } = {}) {
  const docs = q.all("SELECT id,title,category,stage,owner_id,summary,problem,solution FROM ideas WHERE stage!='draft' AND id!=?", excludeId ?? -1);
  const qt = tokens(textOf(query));
  if (qt.length < 4 || !docs.length) return [];
  const toks = docs.map(d => tokens(textOf(d)));
  const N = docs.length + 1, df = new Map();
  for (const t of [qt, ...toks]) for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1);
  const idf = w => Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 1;
  const vec = t => { const m = new Map(); for (const w of t) m.set(w, (m.get(w) || 0) + 1); for (const [w, c] of m) m.set(w, (1 + Math.log(c)) * idf(w)); return m; };
  const norm = v => Math.sqrt([...v.values()].reduce((a, b) => a + b * b, 0));
  const qv = vec(qt), qn = norm(qv);
  return docs.map((d, k) => {
    const dv = vec(toks[k]); let dot = 0;
    for (const [w, x] of qv) if (dv.has(w)) dot += x * dv.get(w);
    return { id: d.id, title: d.title, stage: d.stage, owner_id: d.owner_id, score: Math.round(dot / ((qn * norm(dv)) || 1) * 100) };
  }).filter(x => x.score >= minScore).sort((a, b) => b.score - a.score).slice(0, limit);
}
