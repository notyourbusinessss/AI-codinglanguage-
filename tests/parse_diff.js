'use strict';
// Differential test: the parser written in Ak (src/parse.ak, run by the JS bootstrap compiler) vs syntax.js.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { parse } = require('../syntax.js'); const { Sym } = require('../ast.js');
const F = require('./fuzz.js'); const { fmt } = require('../fmt.js');
const root = path.join(__dirname, '..');
const dump = x => x === null ? 'nil' : x === true ? 'true' : x === false ? 'false' : x instanceof Sym ? x.n : typeof x === 'string' ? JSON.stringify(x) : typeof x === 'bigint' ? x + 'n' : Array.isArray(x) ? '(' + x.map(dump).join(' ') + ')' : String(x);
const jsDump = (file) => { try { return parse(fs.readFileSync(file, 'utf8'), file).map(dump).join('\n'); } catch (e) { return 'ERR ' + e.message; } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdiff-'));
const files = [];
const add = (name, text) => { const f = path.join(tmp, name); fs.writeFileSync(f, text); files.push(f); };
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!['node_modules', '.git'].includes(f)) walk(p); } else if (f.endsWith('.ak')) files.push(p); } };
['corpus', 'examples', 'bench', 'src', 'tests'].forEach(d => { if (fs.existsSync(path.join(root, d))) walk(path.join(root, d)); });
// parser unit cases (valid and erroneous) from syntax.test.js
const src = fs.readFileSync(path.join(__dirname, 'syntax.test.js'), 'utf8');
const m1 = /const OK = (\[[\s\S]*?\n\]);/.exec(src), m2 = /const ERR = (\[[\s\S]*?\n\]);/.exec(src);
const OK = eval(m1[1]), ERRS = eval(m2[1]);
OK.forEach(([s], i) => add(`ok${i}.ak`, s)); ERRS.forEach(([s], i) => add(`err${i}.ak`, s));
// fuzz-generated programs, printed by the canonical formatter (stresses precedence/associativity/chains/patterns)
const N = +process.argv[2] || 1500;
for (let n = 0; n < N; n++) { F.setSeed(7000000 + n); const g = new F.Gen(); add(`fz${n}.ak`, fmt(g.program(F.ri(4, 14)), { layout: n % 2 ? 'lines' : 'flat' })); }

fs.writeFileSync(path.join(tmp, 'list.txt'), files.join('\n'));
const r = cp.spawnSync('node', [path.join(root, 'ak.js'), path.join(__dirname, 'parse_dump.ak')], { input: files.join('\n'), encoding: 'utf8', maxBuffer: 1 << 30 });
if (r.status !== 0) { console.log('driver failed', r.stderr.slice(0, 500)); process.exit(1); }
const got = new Map(); let cur = null;
for (const line of r.stdout.split('\n')) { if (line.startsWith('--- ')) { cur = line.slice(4); got.set(cur, []); } else if (cur !== null) got.get(cur).push(line); }
let bad = 0;
for (const f of files) {
  const want = jsDump(f), have = (got.get(f) || ['<missing>']).join('\n').replace(/\n$/, '');
  if (want !== have) { bad++; if (bad <= 5) console.log('MISMATCH', f, '\n  js:', want.slice(0, 300), '\n  ak:', have.slice(0, 300)); }
}
console.log(`parse_diff: ${files.length - bad}/${files.length} files identical (Ak parser vs JS parser)`);
fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
