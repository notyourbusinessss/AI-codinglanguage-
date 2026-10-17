'use strict';
// ak test: discovery, per-file pass/fail, summary, exit codes; same behaviour from the JS CLI and the native compiler
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aktest-'));
const w = (n, s) => { const f = path.join(tmp, n); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };

w('a.test.aklang', '(assert (== (+ 1 2) 3))\n(p "quiet")\n');
w('sub/b.test.aklang', '(p "before")\n(assert (== 1 2) "one is not two")\n');
w('sub/c.test.ak', '(assert 1)\n');
w('sub/helper.aklang', '(err "not a test: must not run")\n');
w('node_modules/x.test.aklang', '(err "node_modules is skipped")\n');
w('.hidden/h.test.aklang', '(err "hidden dirs are skipped")\n');
w('exit3.aklang', '(exit 3)\n');
w('bare.aklang', '(assert false)\n');
w('empty/readme.txt', 'no tests here\n');
w('.u/lib.aklang', '(= (sq x) x*x)\n(= (bad x) (err "lib failure" x))\n');
w('.u/ok.test.aklang', '(use "lib.aklang" as g)\n(assert (== (g.sq 3) 9))\n');
w('.u/fail.test.aklang', '(use "lib.aklang" as g)\n(= (f x) 1+(g.bad x))\n(f 1)\n');
w('.u/stdin.test.aklang', '(assert (== (in) nil) "a test must see an empty stdin")\n');

for (const [label, cmd, pre] of [['js', 'node', [path.join(root, 'boot', 'ak.js')]], ['native', path.join(root, 'bin', 'ak'), []]]) {
  const ak = (args, cwd) => cp.spawnSync(cmd, [...pre, 'test', ...args], { encoding: 'utf8', cwd: cwd || tmp, timeout: 60000 });
  let r = ak([]);
  t(label + ' discovery: only *.test.aklang / *.test.ak, sorted, skips node_modules and dot dirs', r.stdout === 'PASS a.test.aklang\nFAIL sub/b.test.aklang (exit 1)\n  before\n  error: one is not two (sub/b.test.aklang:2:1)\nPASS sub/c.test.ak\n2 passed, 1 failed, 3 files\n', r);
  t(label + ' failure: exit 1', r.status === 1, r);
  r = ak(['a.test.aklang', 'sub/c.test.ak']);
  t(label + ' all pass: exit 0', r.status === 0 && r.stdout === 'PASS a.test.aklang\nPASS sub/c.test.ak\n2 passed, 0 failed, 2 files\n', r);
  r = ak(['bare.aklang']);
  t(label + ' an explicit file runs whatever its name, assert without a message', r.status === 1 && /^FAIL bare\.aklang \(exit 1\)\n {2}error: assertion failed/.test(r.stdout), r);
  r = ak(['exit3.aklang']);
  t(label + ' reports the exit code', r.status === 1 && r.stdout.startsWith('FAIL exit3.aklang (exit 3)\n'), r);
  r = ak(['sub']);
  t(label + ' a directory is searched', r.stdout.includes('sub/c.test.ak') && r.stdout.includes('sub/b.test.aklang') && !r.stdout.includes('helper'), r);
  r = ak(['empty']);
  t(label + ' zero test files is a failure, not a pass', r.status === 1 && r.stdout === '' && /no test files found/.test(r.stderr), r);
  r = ak(['missing.test.aklang']);
  t(label + ' missing path: error, exit 1', r.status === 1 && /no such file or directory: missing\.test\.aklang/.test(r.stderr), r);
  r = ak([], path.join(tmp, 'sub'));
  t(label + ' runs from a subdirectory', r.stdout.startsWith('FAIL b.test.aklang (exit 1)') && r.stdout.includes('PASS c.test.ak'), r);
  // use ... as with a relative path, run from a directory other than the test's own; an uncaught error inside a function shows its message and location
  r = ak(['.u/ok.test.aklang']);
  t(label + ' a test can use a library with as (relative path, run from another directory)', r.status === 0 && r.stdout === 'PASS .u/ok.test.aklang\n1 passed, 0 failed, 1 files\n', r);
  r = ak(['.u/fail.test.aklang']);
  t(label + ' an uncaught error inside a function: message and location in the output', r.status === 1 && /^FAIL \.u\/fail\.test\.aklang \(exit 1\)\n {2}error: lib failure 1 \(\.u\/fail\.test\.aklang:\d+:\d+\)/.test(r.stdout), r);
  // stdin: the runner must neither hang nor take the terminal's input; a test reads nothing from it
  r = cp.spawnSync(cmd, [...pre, 'test', '.u/stdin.test.aklang'], { encoding: 'utf8', cwd: tmp, timeout: 20000, input: 'typed by the user\n' });
  t(label + ' stdin: does not hang, a test sees end of input', r.status === 0 && r.stdout === 'PASS .u/stdin.test.aklang\n1 passed, 0 failed, 1 files\n', r);
  w('q\'uote.test.aklang', '(p 1)\n');
  r = ak(['q\'uote.test.aklang']);
  t(label + ' odd file names', r.status === 0 && r.stdout.startsWith("PASS q'uote.test.aklang"), r);
  fs.rmSync(path.join(tmp, 'q\'uote.test.aklang'));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `aktest: ${bad} of ${n} FAILED` : `aktest: ${n} checks passed`);
process.exit(bad ? 1 : 0);
