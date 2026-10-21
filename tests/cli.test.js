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
const f1 = w('e1.aklang', '(= (f x)\n  y=x*2\n  z=nil\n  y+z)\n(p "start")\n(f 3)\n');
r = ak([f1]);                                                 t('runtime error: output flushed first, position, exit 1', r.stdout === 'start\n' && r.status === 1 && r.stderr === `error: cannot add num and nil (${f1}:4:4)\n`, r);
r = ak(['-e', '(p undefinedname)']);                         t('compile error', r.status === 1 && r.stderr === 'error: <-e>:1:4: undefined: undefinedname\n  (p undefinedname)\n     ^\n' && r.stdout === '', r);
r = ak(['-e', '(p (+ 1']);                                    t('syntax error', r.status === 1 && /missing '\)'/.test(r.stderr), r);
r = ak(['-e', '(p 1) (exit 3) (p 2)']);                      t('exit code + flush', r.status === 3 && r.stdout === '1\n', r);
r = ak(['-e', '(err "bad" 1)']);                              t('err exits 1', r.status === 1 && r.stderr.startsWith('error: bad 1'), r);
r = ak(['-e', '(aw (Promise.reject "late"))']);               t('async rejection', r.status === 1 && r.stderr.startsWith('error: late'), r);
r = ak(['-e', '(= (f) (aw (delay 10)) (err "inside")) (f)']); t('async fn error', r.status === 1 && r.stderr.startsWith('error: inside'), r);
r = ak(['-e', '(= (d n) (? n==0 0 1+d(n-1))) (p d(1000000))']); t('1M-deep non-tail recursion', r.stdout === '1000000\n', r.stderr.slice(0, 200));
r = ak(['-e', '(for i 200000 (p i))']);                      t('200k lines', r.stdout.length === Array.from({ length: 200000 }, (_, i) => String(i) + '\n').join('').length && r.status === 0);
r = ak(['-e', '(p (try [].zz() e=>e))']);                    t('js TypeError message', /TypeError/.test(r.stdout), r);
// use (include)
const lib = w('lib.aklang', '(= (sq x) x*x)\nk=10\n');
const main = w('main.aklang', `(use "lib.aklang")\n(use "lib")\n(p sq(k))\n`);
r = ak([main]);                                               t('use (relative, idempotent, .aklang optional)', r.stdout === '100\n', r);
// the old extension .ak keeps working, on both targets: as a program, and as the target of (use "name") when there is no name.aklang
const oldlib = w('oldlib.ak', '(= (cube x) x*x*x)\n');
const oldmain = w('oldmain.ak', '(use "oldlib")\n(use "lib")\n(p cube(3) sq(4))\n');
r = ak([oldmain]);                                            t('legacy .ak (JS target): program and (use "oldlib")', r.stdout === '27 16\n', r);
const nat = cp.spawnSync(path.join(__dirname, '..', 'bin', 'ak'), [oldmain], { encoding: 'utf8' });
t('legacy .ak (native): program and (use "oldlib")', nat.stdout === '27 16\n', nat);
const nat2 = cp.spawnSync(path.join(__dirname, '..', 'bin', 'ak'), [main], { encoding: 'utf8' });
t('native: (use "lib") finds lib.aklang', nat2.stdout === '100\n', nat2);
// namespaced use: (use "f" as g) keeps two libraries with the same names apart, on both targets
const NAT = path.join(__dirname, '..', 'bin', 'ak');
const nsA = w('nsa.aklang', 'count=0\n(= (inc) (<- count count+1) count)\n(= (hello n) (++ "a:" n))\n');
const nsB = w('nsb.aklang', 'count=100\n(= (inc) (<- count count+1) count)\n(= (hello n) (++ "b:" n))\n');
const nsMain = w('nsmain.aklang', '(use "nsa.aklang" as a)\n(use "nsb.aklang" as b)\n(= (hello n) "mine")\n(p a.hello(1) b.hello(2) hello(3) a.inc() a.inc() b.inc())\n(p a.count b.count (~ b.hello [1 2]))\n');
const nsWant = 'a:1 b:2 mine 1 2 101\n2 101 ["b:1" "b:2"]\n';
r = ak([nsMain]);                                             t('use as: two libraries with the same names (JS target)', r.stdout === nsWant && r.stderr === '', r);
r = cp.spawnSync(NAT, [nsMain], { encoding: 'utf8' });        t('use as: two libraries with the same names (native)', r.stdout === nsWant && r.stderr === '', r);
const nsBad = w('nsbad.aklang', '(use "nsa.aklang" as a)\n(p a.nope)\n');
r = ak([nsBad]);                                              t('use as: unknown name (JS target)', r.status === 1 && r.stderr.startsWith(`error: ${nsBad}:2:4: a has no definition named nope`), r);
r = cp.spawnSync(NAT, [nsBad], { encoding: 'utf8' });         t('use as: unknown name (native)', r.status === 1 && r.stderr.includes('nsbad.aklang:2:4: a has no definition named nope'), r);
const nsTwice = w('nstwice.aklang', '(use "nsa.aklang" as a)\n(use "nsb.aklang" as a)\n');
r = ak([nsTwice]);                                            t('use as: alias already taken (JS target)', r.status === 1 && /the alias a is already taken/.test(r.stderr), r);
r = cp.spawnSync(NAT, [nsTwice], { encoding: 'utf8' });       t('use as: alias already taken (native)', r.status === 1 && /the alias a is already taken/.test(r.stderr), r);
const nsNested = w('nsnested.aklang', '(? true (use "nsa.aklang" as a))\n');
r = ak([nsNested]);                                           t('use as: only at the top level (JS target)', r.status === 1 && /top level/.test(r.stderr), r);
r = cp.spawnSync(NAT, [nsNested], { encoding: 'utf8' });      t('use as: only at the top level (native)', r.status === 1 && /top level/.test(r.stderr), r);
// plain use of two files defining the same function: still works (the later one wins) but warns
const clash = w('clash.aklang', '(use "nsa.aklang")\n(use "nsb.aklang")\n(p hello(1))\n');
r = ak([clash]);                                              t('plain use clash warns (JS target)', r.stdout === 'b:1\n' && /warning: .*nsb\.aklang:3:5: hello is also defined in .*nsa\.aklang/.test(r.stderr), r);
r = cp.spawnSync(NAT, [clash], { encoding: 'utf8' });         t('plain use clash warns (native)', r.stdout === 'b:1\n' && /warning: .*nsb\.aklang:3:5: hello is also defined in .*nsa\.aklang/.test(r.stderr), r);
r = cp.spawnSync(NAT, [main], { encoding: 'utf8' });          t('plain use twice of one file: no warning', r.stderr === '', r);
r = ak(['check', nsMain]);                                    t('check accepts use as', r.stdout === 'ok\n', r);
// check / fmt / js / build
r = ak(['check', main]);                                      t('check ok', r.stdout === 'ok\n' && r.status === 0, r);
r = ak(['check', f1.replace('e1', 'nope')]);                  t('check missing file', r.status === 1, r);
const prog = w('p.aklang', '; comment\n(= (fib n) (? n<2 n fib(n-1)+fib(n-2)))\n(p fib(20))\n');
r = ak(['fmt', prog]);                                        t('fmt', r.stdout === 'fib n = (? n<2 n fib(n-1)+fib(n-2))\np fib(20)\n', r);
const fmtd = w('fmt.aklang', r.stdout); r = ak([fmtd]);          t('fmt output runs', r.stdout === '6765\n', r);
r = ak(['js', prog]);                                         t('js emits code', /function \$fib/.test(r.stdout), r.stdout.slice(0, 100));
const out = path.join(tmp, 'p.js');
r = ak(['build', prog, out]);                                 t('build', r.status === 0 && fs.existsSync(out), r);
r = cp.spawnSync('node', [out], { encoding: 'utf8' });       t('bundle runs standalone', r.stdout === '6765\n', r);
const out2 = path.join(tmp, 'e1.js'); ak(['build', f1, out2]);
r = cp.spawnSync('node', [out2], { encoding: 'utf8' });     t('bundle error position', r.status === 1 && /\(.*e1\.aklang:4:4\)/.test(r.stderr), r.stderr);
// usage
r = ak([]);                                                   t('usage', r.status === 2, r);
for (const h of ['-h', '--help', 'help']) {
  r = ak([h]);                                                t('js ' + h + ': usage on stdout, exit 0', r.status === 0 && /ak fmt/.test(r.stdout) && r.stderr === '', r);
  const nh = cp.spawnSync(path.join(__dirname, '..', 'bin', 'ak'), [h], { encoding: 'utf8' });
  t('native ' + h + ': usage on stdout, exit 0', nh.status === 0 && /^usage: ak .*ak fmt .*--help\n$/.test(nh.stdout) && nh.stderr === '', nh);
}
const nu = cp.spawnSync(path.join(__dirname, '..', 'bin', 'ak'), [], { encoding: 'utf8' });
t('native no args: usage on stderr, exit 2', nu.status === 2 && /^usage: ak /.test(nu.stderr) && nu.stdout === '', nu);
// an unknown option is not a file name (#115); a file whose name starts with - still runs by path
for (const o of ['--versoin', '-x']) {
  const nr = cp.spawnSync(path.join(__dirname, '..', 'bin', 'ak'), [o], { encoding: 'utf8' });
  t('native ' + o + ': unknown option, usage, exit 2', nr.status === 2 && nr.stderr.startsWith('unknown option ' + o + '\nusage: ak ') && nr.stdout === '', nr);
}
const dashf = w('-dash.aklang', '(p "ran")\n');
const nd = cp.spawnSync(path.join(__dirname, '..', 'bin', 'ak'), ['./-dash.aklang'], { encoding: 'utf8', cwd: tmp });
t('native ./-name.aklang runs', nd.status === 0 && nd.stdout === 'ran\n', nd);
// program on stdin: `ak -`, `ak check -`, `ak fmt -`, on both targets
for (const [label, cmd, pre] of [['js', 'node', [AK]], ['native', path.join(__dirname, '..', 'bin', 'ak'), []]]) {
  const sh = (args, input) => cp.spawnSync(cmd, [...pre, ...args], { encoding: 'utf8', input, timeout: 60000 });
  r = sh(['-'], '(p 1+2)\n(p (args))');                     t(label + ' ak -: runs stdin', r.status === 0 && r.stdout === '3\n[]\n', r);
  r = sh(['-', 'x'], '(p (args))');                           t(label + ' ak - args', r.stdout === '["x"]\n', r);
  r = sh(['check', '-'], '(p 1)');                            t(label + ' check -', r.status === 0 && r.stdout === 'ok\n', r);
  r = sh(['fmt', '-'], '(p   1)');                            t(label + ' fmt -', r.status === 0 && r.stdout === 'p 1\n', r);
  r = sh(['-'], '(p (');                                      t(label + ' stdin syntax error names <stdin>', r.status === 1 && r.stderr.startsWith('error: <stdin>:1:'), r);
  r = sh(['-'], '');                                          t(label + ' empty stdin runs nothing', r.status === 0 && r.stdout === '', r);
}
// compile errors show the source line and a caret under the column, on both targets
for (const [label, cmd, pre] of [['js', 'node', [AK]], ['native', path.join(__dirname, '..', 'bin', 'ak'), []]]) {
  const sh = (args, input) => cp.spawnSync(cmd, [...pre, ...args], { encoding: 'utf8', input: input || '', timeout: 60000 });
  r = sh(['-e', '(p 1']);                                     t(label + ' caret: unclosed paren', r.stderr === "error: <-e>:1:5: missing ')' for '(' opened at 1:1\n  (p 1\n      ^\n", r);
  r = sh(['-e', '(p 1\n']);                                   t(label + ' caret: error past the last line shows no empty source line', r.status === 1 && r.stderr.split('\n').length === 2, r);
  r = sh(['-e', '(p 1)\n(p  zz)']);                          t(label + ' caret: undefined name, second line', r.stderr === 'error: <-e>:2:5: undefined: zz\n  (p  zz)\n      ^\n', r);
  r = sh(['-'], '(p 1)\r\n(p  zz)\r\n');                      t(label + ' caret: stdin, CRLF source', r.stderr === 'error: <stdin>:2:5: undefined: zz\n  (p  zz)\n      ^\n', r);
  const bad = w('bad-' + label + '.aklang', '(p 1)\n(p  zz)\n');
  r = sh([bad]);                                              t(label + ' caret: file', r.stderr === `error: ${bad}:2:5: undefined: zz\n  (p  zz)\n      ^\n`, r);
  r = sh(['check', bad]);                                     t(label + ' caret: check', r.status === 1 && r.stderr.endsWith('(p  zz)\n      ^\n'), r);
  r = sh(['-e', '(p (+ 1 nil))']);                            t(label + ' no caret on runtime errors', r.status === 1 && r.stderr.split('\n').length === 2, r);
}
console.log(`cli: ${n - bad}/${n} passed`); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
