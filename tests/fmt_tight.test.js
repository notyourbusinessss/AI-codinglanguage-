'use strict';
// The tight layout (cheapest canonical text, boot/fmt.js and src/fmt.aklang): parse(fmt(ast)) == ast for every .aklang file in the repository, and
// `ak fmt` (the Ak formatter in the native compiler) prints exactly what the JS formatter prints.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { parse } = require('../boot/syntax.js'); const { fmt } = require('../boot/fmt.js');
const { same: same0 } = require('./roundtrip.test.js'); const { Sym } = require('../boot/ast.js');
const neg = x => !Array.isArray(x) ? x : (r => r.length === 2 && r[0] instanceof Sym && r[0].n === '-' && (typeof r[1] === 'number' || typeof r[1] === 'bigint') ? -r[1] : r)(x.map(neg));   // (- 5) prints as the literal -5
const same = (a, b) => same0(neg(a), neg(b));
const root = path.join(__dirname, '..');
const ak = process.env.AK_BIN || path.join(root, 'bin', 'ak');
const files = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!['node_modules', '.git', 'docs'].includes(f)) walk(p); } else if (f.endsWith('.aklang')) files.push(p); } };
['corpus', 'examples', 'bench', 'src', 'rt', 'lib', 'tests'].forEach(d => { if (fs.existsSync(path.join(root, d))) walk(path.join(root, d)); });
let bad = 0, n = 0, same2 = 0, checkedAk = 0;
for (const f of files) {
  let ast; try { ast = parse(fs.readFileSync(f, 'utf8'), f); } catch (e) { continue; }          // error-case fixtures
  n++;
  const txt = fmt(ast, { layout: 'tight' });
  let back; try { back = parse(txt, f); } catch (e) { bad++; console.log('FAIL parse of tight output', path.relative(root, f), e.message); continue; }
  if (!same(ast, back)) { bad++; console.log('FAIL roundtrip', path.relative(root, f)); continue; }
  if (fmt(parse(txt, f), { layout: 'tight' }) !== txt) { bad++; console.log('FAIL not idempotent', path.relative(root, f)); continue; }
  if (fs.existsSync(ak)) {                                                                      // and through the native formatter
    checkedAk++; const r = cp.spawnSync(ak, ['fmt', f], { encoding: 'utf8' });
    if (r.stdout !== txt) { bad++; console.log('FAIL ak fmt differs from the JS formatter', path.relative(root, f), '\n', r.stderr.slice(0, 300)); }
  }
}
console.log(`fmt_tight: ${n} files, ${bad} failures (round trip, idempotence, ${checkedAk} compared with ak fmt)`); process.exit(bad ? 1 : 0);
