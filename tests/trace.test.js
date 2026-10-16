'use strict';
// native uncaught errors: first line is unchanged, outer call sites follow as "  called from" lines
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const AK = path.join(__dirname, '..', 'bin', 'ak');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aktrace-'));
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };
const run = (name, src) => { const f = path.join(tmp, name); fs.writeFileSync(f, src); return { f, r: cp.spawnSync(AK, [f], { encoding: 'utf8', timeout: 60000 }) }; };

let { f, r } = run('a.aklang', 'g x =\n (err "bad" x)\nf n =\n y=g(n)\n y+1\np f(2)\n');
t('two frames', r.status === 1 && r.stderr === `error: bad 2 (${f}:4:5)\n  called from ${f}:6:4\n`, r);
({ f, r } = run('b.aklang', '(err "top")\n'));
t('top level: no extra lines', r.stderr === `error: top (${f}:1:1)\n`, r);
({ f, r } = run('c.aklang', 'd n =\n (? n==0 (+ 1 nil) 1+d(n-1))\np d(50)\n'));
t('recursion is collapsed', r.stderr === `error: cannot add num and nil (${f}:2:10)\n  called from ${f}:2:23\n  called from ${f}:3:4\n`, r);
let src = ''; for (let i = 0; i < 15; i++) src += `f${i} x =\n 1+f${i + 1}(x)\n`; src += 'f15 x =\n (err "deep")\np f0(1)\n';
({ f, r } = run('d.aklang', src));
const lines = r.stderr.trim().split('\n');
t('at most 10 callers, then ...', lines.length === 12 && lines[10].startsWith('  called from ') && lines[11] === '  ...', r);
({ f, r } = run('e.aklang', '(p (try (err "x") e=>"caught"))\n'));
t('a caught error prints nothing', r.status === 0 && r.stderr === '' && r.stdout === 'caught\n', r);
console.log(bad ? bad + ' of ' + n + ' trace checks failed' : n + ' trace checks passed');
process.exit(bad ? 1 : 0);
