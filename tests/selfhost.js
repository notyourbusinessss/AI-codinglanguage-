'use strict';
// Bootstrap fixpoint: stage0 (JS) builds ak1; ak1 builds ak2; ak2 builds ak3. ak1, ak2, ak3 must be byte-identical.
// A GC-stress run (collect every 2MB) must also reproduce the same bytes.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
const run = (cmd, args, env) => {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', timeout: 300000, env: { ...process.env, ...env } });
  if (r.status !== 0) { console.log('FAIL', cmd, args.join(' '), '\n', (r.stderr || r.stdout).slice(0, 500)); process.exit(1); }
};
const same = (a, b) => Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0;
const src = path.join(root, 'src/main.ak');
const [a1, a2, a3, a4] = ['ak1', 'ak2', 'ak3', 'ak4'].map(n => path.join(tmp, n));
let t = Date.now();
run('node', [path.join(root, 'ak.js'), src, 'build', src, a1]); console.log(`stage0 -> ak1 (${Date.now() - t}ms, ${fs.statSync(a1).size} bytes)`);
t = Date.now(); run(a1, ['build', src, a2]); console.log(`ak1 -> ak2 (${Date.now() - t}ms)`);
t = Date.now(); run(a2, ['build', src, a3]); console.log(`ak2 -> ak3 (${Date.now() - t}ms)`);
run(a3, ['build', src, a4], { AK_GCMIN: '2000000' });
const ok12 = same(a1, a2), ok23 = same(a2, a3), ok34 = same(a3, a4);
console.log(`fixpoint: ak1==ak2 ${ok12}, ak2==ak3 ${ok23}, GC-stress ak3==ak4 ${ok34}`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(ok12 && ok23 && ok34 ? 0 : 1);
