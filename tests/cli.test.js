'use strict';
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const AK = path.join(__dirname, '..', 'boot', 'ak.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akcli-'));
const w = (n, s) => { const f = path.join(tmp, n); fs.writeFileSync(f, s); return f; };
const ak = (args, input) => cp.spawnSync('node', [AK, ...args], { encoding: 'utf8', input: input || '', timeout: 60000, maxBuffer: 1 << 28 });
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };

let r = ak(['-e', '(p (args))', 'x', 'y z']);               t('args', r.stdout === '["x" "y z"]\n' && r.status === 0, r);
r = ak(['-e', '(p (in) (in) (in))'], 'one\ntwo\n');         t('stdin lines + eof nil', r.stdout === 'one two nil\n', r);
r = ak(['-e', '(p (inall))'], 'a\nb\n');                    t('inall', r.stdout === 'a\nb\n\n', r);
const f1 = w('e1.ak', '(= (f x)\n  y=x*2\n  z=nil\n  y+z)\n(p "start")\n(f 3)\n');
r = ak([f1]);                                                 t('runtime error: output flushed first, position, exit 1', r.stdout === 'start\n' && r.status === 1 && r.stderr === `error: cannot add num and nil (${f1}:4:4)\n`, r);
r = ak(['-e', '(p undefinedname)']);                         t('compile error', r.status === 1 && r.stderr === 'error: <-e>:1:4: undefined: undefinedname\n' && r.stdout === '', r);
r = ak(['-e', '(p (+ 1']);                                    t('syntax error', r.status === 1 && /missing '\)'/.test(r.stderr), r);
r = ak(['-e', '(p 1) (exit 3) (p 2)']);                      t('exit code + flush', r.status === 3 && r.stdout === '1\n', r);
r = ak(['-e', '(err "bad" 1)']);                              t('err exits 1', r.status === 1 && r.stderr.startsWith('error: bad 1'), r);
r = ak(['-e', '(aw (Promise.reject "late"))']);               t('async rejection', r.status === 1 && r.stderr.startsWith('error: late'), r);
r = ak(['-e', '(= (f) (aw (delay 10)) (err "inside")) (f)']); t('async fn error', r.status === 1 && r.stderr.startsWith('error: inside'), r);
r = ak(['-e', '(= (d n) (? n==0 0 1+d(n-1))) (p d(1000000))']); t('1M-deep non-tail recursion', r.stdout === '1000000\n', r.stderr.slice(0, 200));
r = ak(['-e', '(for i 200000 (p i))']);                      t('200k lines', r.stdout.length === Array.from({ length: 200000 }, (_, i) => String(i) + '\n').join('').length && r.status === 0);
r = ak(['-e', '(p (try [].zz() e=>e))']);                    t('js TypeError message', /TypeError/.test(r.stdout), r);
// use (include)
const lib = w('lib.ak', '(= (sq x) x*x)\nk=10\n');
const main = w('main.ak', `(use "lib.ak")\n(use "lib")\n(p sq(k))\n`);
r = ak([main]);                                               t('use (relative, idempotent, .ak optional)', r.stdout === '100\n', r);
// check / fmt / js / build
r = ak(['check', main]);                                      t('check ok', r.stdout === 'ok\n' && r.status === 0, r);
r = ak(['check', f1.replace('e1', 'nope')]);                  t('check missing file', r.status === 1, r);
const prog = w('p.ak', '; comment\n(= (fib n) (? n<2 n fib(n-1)+fib(n-2)))\n(p fib(20))\n');
r = ak(['fmt', prog]);                                        t('fmt', r.stdout === 'fib n =\n (? n<2 n fib(n-1)+fib(n-2))\np fib(20)\n', r);
const fmtd = w('fmt.ak', r.stdout); r = ak([fmtd]);          t('fmt output runs', r.stdout === '6765\n', r);
r = ak(['js', prog]);                                         t('js emits code', /function \$fib/.test(r.stdout), r.stdout.slice(0, 100));
const out = path.join(tmp, 'p.js');
r = ak(['build', prog, out]);                                 t('build', r.status === 0 && fs.existsSync(out), r);
r = cp.spawnSync('node', [out], { encoding: 'utf8' });       t('bundle runs standalone', r.stdout === '6765\n', r);
const out2 = path.join(tmp, 'e1.js'); ak(['build', f1, out2]);
r = cp.spawnSync('node', [out2], { encoding: 'utf8' });     t('bundle error position', r.status === 1 && /\(.*e1\.ak:4:4\)/.test(r.stderr), r.stderr);
// usage
r = ak([]);                                                   t('usage', r.status === 2, r);
console.log(`cli: ${n - bad}/${n} passed`); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
