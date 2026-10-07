'use strict';
// token totals per surface syntax over the corpus. usage: node tools/measure.js py ak [..]
const fs = require('fs'), path = require('path'); const t = require('./tok.js');
const dir = path.join(__dirname, '..', 'corpus');
const exts = process.argv.slice(2); const tot = {};
const names = fs.readdirSync(dir).filter(f => f.endsWith('.py')).map(f => f.slice(0, -3)).sort();
console.log('task'.padEnd(18), exts.map(e => e.padStart(10)).join(''));
for (const n of names) {
  const row = exts.map(e => { const f = path.join(dir, n + '.' + e); if (!fs.existsSync(f)) return null; const s = fs.readFileSync(f, 'utf8'); const c = t.claude(s); tot[e] = (tot[e] || 0) + c; return c; });
  console.log(n.padEnd(18), row.map(c => String(c ?? '-').padStart(10)).join(''));
}
console.log('TOTAL(claude)'.padEnd(18), exts.map(e => String(tot[e]).padStart(10)).join(''));
const base = tot[exts[0]]; console.log('vs ' + exts[0].padEnd(15), exts.map(e => ((tot[e] / base * 100).toFixed(0) + '%').padStart(10)).join(''));
