'use strict';
// Bootstrap fixpoint. Path A: the JS bootstrap builds ak1; ak1 builds ak2; ak2 builds ak3; a GC-stress run builds ak4. All must be byte-identical.
// Path B (if bin/ak, the committed seed, exists): seed -> b1 -> b2; b2 must equal ak2 (the seed may be older than the sources).
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
const run = (cmd, args, env) => {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', timeout: 300000, env: { ...process.env, ...env } });
  if (r.status !== 0) { console.log('FAIL', cmd, args.join(' '), '\n', (r.stderr || r.stdout).slice(0, 500)); process.exit(1); }
};
const same = (a, b) => Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0;
const src = path.join(root, 'src/main.ak');
const f = n => path.join(tmp, n);
let t = Date.now();
run('node', [path.join(root, 'boot', 'ak.js'), src, 'build', src, f('ak1')]); console.log(`bootstrap (JS) -> ak1   ${Date.now() - t}ms  ${fs.statSync(f('ak1')).size} bytes`);
t = Date.now(); run(f('ak1'), ['build', src, f('ak2')]); console.log(`ak1 -> ak2              ${Date.now() - t}ms`);
t = Date.now(); run(f('ak2'), ['build', src, f('ak3')]); console.log(`ak2 -> ak3              ${Date.now() - t}ms`);
run(f('ak3'), ['build', src, f('ak4')], { AK_GCMIN: '2000000', AK_GCVERIFY: '1' });
const ok = [same(f('ak1'), f('ak2')), same(f('ak2'), f('ak3')), same(f('ak3'), f('ak4'))];
console.log(`fixpoint: ak1==ak2 ${ok[0]}, ak2==ak3 ${ok[1]}, GC-stress ak3==ak4 ${ok[2]}`);
let seedOk = true;
const seed = path.join(root, 'bin', 'ak');
if (fs.existsSync(seed)) {
  t = Date.now(); run(seed, ['build', src, f('b1')]); run(f('b1'), ['build', src, f('b2')]);
  seedOk = same(f('b2'), f('ak2'));
  console.log(`seed bin/ak -> b1 -> b2 (${Date.now() - t}ms): b2==ak2 ${seedOk}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(ok.every(Boolean) && seedOk ? 0 : 1);
