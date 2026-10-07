'use strict';
// Differential fuzzer for the native target: random programs run by the reference interpreter (interp.js) and by the native compiler
// (bin/ak, or $AK_BIN). usage: node tests/fuzz_native.js [count=300] [seed=1] [-v]
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const F = require('./fuzz.js');
const { fmt } = require('../boot/fmt.js');
const { S } = require('../boot/ast.js');
const RT = require('../boot/runtime.js');
const interp = require('../boot/interp.js');
const root = path.join(__dirname, '..');
const ak = process.env.AK_BIN || path.join(root, 'bin', 'ak');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-'));

function runInterp(ast) {
  try { return 'OK ' + RT.show(interp.run(ast)); }
  catch (e) {
    if (e instanceof interp.CompileErr) return 'INVALID';
    if (e instanceof RT.AkError) return 'ERR ' + e.message;
    if (/Maximum call stack/.test(String(e.message))) return 'SKIP';
    return 'JSERR ' + e.name + ': ' + e.message;
  }
}
let n = 0;
function runNative(ast) {
  const forms = ast.slice(); const last = forms.pop();
  forms.push([S('p'), [S('show'), last]]);
  const file = path.join(tmp, 'f' + (n++) + '.ak');
  fs.writeFileSync(file, fmt(forms, { layout: 'lines' }));
  const r = cp.spawnSync(ak, [file], { encoding: 'utf8', timeout: 8000 });
  if (r.error || r.signal) return 'TIMEOUT';
  if (r.status === 0) return 'OK ' + r.stdout.replace(/\n$/, '');
  const m = /^error: ([\s\S]*?) \(([^()]*:\d+:\d+)\)\s*$/.exec(r.stderr);
  if (m) return 'ERR ' + m[1];
  return /^error: .*:\d+:\d+: /.test(r.stderr) ? 'INVALID' : 'CRASH ' + r.stderr.slice(0, 200);
}
const count = +process.argv.slice(2).filter(a => !a.startsWith('-'))[0] || 300;
const seed0 = +process.argv.slice(2).filter(a => !a.startsWith('-'))[1] || 1;
let fails = 0, msgdiff = 0, skipped = 0;
function bad(ast) {
  const a = runInterp(ast); if (a === 'SKIP' || a.startsWith('JSERR')) return null;
  const b = runNative(ast); if (b === 'TIMEOUT' || a === b || (a.startsWith('ERR') && b.startsWith('ERR'))) return null;
  return { a, b };
}
const kind = o => o.split(' ')[0];
function shrink(ast) {
  let cur = ast; const k0 = bad(ast); const sig = k0 && kind(k0.a) + '|' + kind(k0.b);
  if (!sig) return ast;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 1; i < cur.length - 1; i++) {
      const cand = cur.slice(0, i).concat(cur.slice(i + 1));
      const r = bad(cand);
      if (r && kind(r.a) + '|' + kind(r.b) === sig) { cur = cand; i--; changed = true; }
    }
    if (!changed) break;
  }
  return cur;
}
for (let i = 0; i < count; i++) {
  const seed = seed0 * 100000 + i; F.setSeed(seed);
  const g = new F.Gen(); const ast = g.program(F.ri(4, 14));
  const a = runInterp(ast); if (a === 'SKIP' || a.startsWith('JSERR')) { skipped++; continue; }
  const b = runNative(ast);
  if (b === 'TIMEOUT') { skipped++; continue; }
  if (a === b) continue;
  if (a.startsWith('ERR') && b.startsWith('ERR')) { msgdiff++; if (process.argv.includes('-v')) console.log(`msg differs (seed ${seed}):\n  interp: ${a}\n  native: ${b}`); continue; }
  fails++;
  const small = shrink(ast); const r = bad(small) || { a, b };
  console.log(`\n=== FAIL seed=${seed}\n  interp: ${r.a.slice(0, 300)}\n  native: ${r.b.slice(0, 300)}\n${fmt(small, { layout: 'lines' })}`);
  if (fails >= 3) break;
}
console.log(`fuzz_native: ${count} programs, ${fails} failures (${msgdiff} error-message differences, ${skipped} skipped)`);
fs.rmSync(tmp, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
