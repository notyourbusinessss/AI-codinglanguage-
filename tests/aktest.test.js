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
  w('q\'uote.test.aklang', '(p 1)\n');
  r = ak(['q\'uote.test.aklang']);
  t(label + ' odd file names', r.status === 0 && r.stdout.startsWith("PASS q'uote.test.aklang"), r);
  fs.rmSync(path.join(tmp, 'q\'uote.test.aklang'));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `aktest: ${bad} of ${n} FAILED` : `aktest: ${n} checks passed`);
process.exit(bad ? 1 : 0);
