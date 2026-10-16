'use strict';
// Edge cases of (use "f" as g), each run on the JS target, the native binary and `ak check` where it applies.
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const AK = path.join(__dirname, '..', 'boot', 'ak.js'), NAT = path.join(__dirname, '..', 'bin', 'ak');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akuseas-'));
const w = (n, s) => { const f = path.join(tmp, n); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };
const js = (args, cwd) => cp.spawnSync('node', [AK, ...args], { encoding: 'utf8', cwd, timeout: 60000 });
const nat = (args, cwd) => cp.spawnSync(NAT, args, { encoding: 'utf8', cwd, timeout: 60000 });
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };
// both targets must agree on stdout and exit status; the error check is done on stderr
const both = (name, file, want, cwd) => {
  for (const [tn, run] of [['JS target', js], ['native', nat]]) {
    const r = run([file], cwd);
    const ok = want.err ? r.status === 1 && want.err.test(r.stderr) && r.stdout === (want.out || '') : r.status === 0 && r.stdout === want.out && r.stderr === (want.stderr || '');
    t(`${name} (${tn})`, ok, r);
  }
};

const x = w('x.aklang', '(= (f) "xf")\nv=5\n');
const b = w('b.aklang', '(use "x.aklang" as y)\n(= (g) y.f())\n');

// a library that itself uses "as": its own alias is private, so the outside sees only its definitions
const m1 = w('m1.aklang', '(use "b.aklang" as b)\n(p b.g())\n');
both('library with its own use as: b.g() works', m1, { out: 'xf\n' });
const m1b = w('m1b.aklang', '(use "b.aklang" as b)\n(p b.y.f())\n');
both('library with its own use as: b.y.f is a clean error', m1b, { err: /b has no definition named y/ });

// the same file plain and with an alias
const m2 = w('m2.aklang', '(use "x.aklang")\n(use "x.aklang" as y)\n(p f() y.f() v y.v)\n');
both('same file plain and as', m2, { out: 'xf xf 5 5\n' });
const m2b = w('m2b.aklang', '(use "x.aklang" as y)\n(use "x.aklang")\n(p f() y.f() v y.v)\n');
both('same file as first, then plain', m2b, { out: 'xf xf 5 5\n' });

// a parameter or local named like the alias shadows it only inside its function
const m3 = w('m3.aklang', '(use "x.aklang" as y)\n(= (h y) y+1)\n(= (k) (= y 3) y)\n(p h(2) k() y.f())\n');
both('parameter and local named like the alias', m3, { out: '3 3 xf\n' });

// assignment through the alias, from inside a function and a closure
const m4 = w('m4.aklang', '(use "x.aklang" as y)\n(<- y.v 9)\n(p y.v)\n(= (z) (<- y.v y.v+1) y.v)\n(p z() y.v)\n(p (~ n=>y.v+n [1 2]))\n(= (mk) n=>y.v+n)\n(p mk()(5))\n');
both('assign y.v, read it inside a function and closures', m4, { out: '9\n10 10\n[11 12]\n15\n' });

// a library in another folder, found relative to the file that uses it and not to the working directory
w('sub/lib.aklang', '(= (hi) "hi")\n(= (bad) (err "boom"))\n');
const m5 = w('m5.aklang', '(use "sub/lib.aklang" as s)\n(p s.hi())\n');
both('library in a subfolder', m5, { out: 'hi\n' });
both('library in a subfolder, run from another directory', m5, { out: 'hi\n' }, os.tmpdir());
const m5b = w('m5b.aklang', '(use "sub/lib.aklang" as s)\n(s.bad())\n');
both('error inside a namespaced library exits 1', m5b, { err: /error: boom/ });

// the same errors under ak check
const chk = (name, file, re) => { const r = js(['check', file]); t(name, r.status === 1 && re.test(r.stderr) && r.stdout === '', r); };
chk('check: unknown name', w('c1.aklang', '(use "x.aklang" as y)\n(p y.nope)\n'), /c1\.aklang:2:4: y has no definition named nope/);
chk('check: alias already taken', w('c2.aklang', '(use "x.aklang" as y)\n(use "b.aklang" as y)\n'), /the alias y is already taken/);
chk('check: only at the top level', w('c3.aklang', '(? true (use "x.aklang" as y))\n'), /top level/);
chk('check: nested alias of a library', m1b, /b has no definition named y/);
for (const f of [m1, m2, m3, m4, m5]) { const r = js(['check', f]); t(`check accepts ${path.basename(f)}`, r.stdout === 'ok\n' && r.status === 0, r); }

console.log(n - bad, '/', n, 'ok');
process.exit(bad ? 1 : 0);
