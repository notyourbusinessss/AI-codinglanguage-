'use strict';
// Native backend vs the JS backend (and the Python-checked expected outputs): every tests/native/*.aklang and corpus program is compiled by the
// self-hosted compiler (built here by the JS bootstrap), run, and must print exactly what the JS backend prints. Then the same programs run
// again under GC stress (a collection after every 1 KB of allocation, heap verification on); the stress pass must really collect.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.join(__dirname, '..');
const JS_ONLY = new Set(['17-http.aklang', '22-async.aklang']);          // use Node modules / promises: JS target only
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-'));
const ak = process.env.AK_BIN || path.join(tmp, 'ak');
if (!process.env.AK_BIN) {
  const b = cp.spawnSync('node', [path.join(root, 'boot', 'ak.js'), path.join(root, 'src/main.aklang'), 'build', '--image', path.join(root, 'src/main.aklang'), ak], { encoding: 'utf8' });
  if (b.status !== 0) { console.log('FAIL: bootstrap build\n', b.stderr); process.exit(1); }
}
const progs = [];
for (const f of fs.readdirSync(path.join(root, 'tests/native')).sort()) if (f.endsWith('.aklang')) progs.push({ name: f, file: path.join(root, 'tests/native', f) });
for (const f of fs.readdirSync(path.join(root, 'corpus')).sort()) if (f.endsWith('.aklang') && !JS_ONLY.has(f)) progs.push({ name: f, file: path.join(root, 'corpus', f), input: fs.existsSync(path.join(root, 'corpus', f.replace(/\.aklang$/, '.in'))) ? fs.readFileSync(path.join(root, 'corpus', f.replace(/\.aklang$/, '.in'))) : '' });
// native-only programs (sockets, ...): expected output in a .out file next to the source
for (const f of fs.readdirSync(path.join(root, 'tests/native_only')).sort()) if (f.endsWith('.aklang')) progs.push({ name: f, file: path.join(root, 'tests/native_only', f), expect: fs.readFileSync(path.join(root, 'tests/native_only', f.replace(/\.aklang$/, '.out')), 'utf8') });
let bad = 0, stressGcs = 0, naturalGcs = -1;
const only = process.argv[2];
for (const p of progs) {
  if (only && !p.name.includes(only)) continue;
  const want = p.expect !== undefined ? { stdout: p.expect, status: 0, stderr: '' } : cp.spawnSync('node', [path.join(root, 'boot', 'ak.js'), p.file], { encoding: 'utf8', input: p.input || '', timeout: 60000 });
  const exe = path.join(tmp, p.name.replace(/\.aklang$/, ''));
  const c = cp.spawnSync(ak, ['build', p.file, exe], { encoding: 'utf8', timeout: 120000 });
  if (c.status !== 0) { bad++; console.log('FAIL compile', p.name, '\n  ', (c.stderr || c.stdout).split('\n').slice(0, 3).join('\n   ')); continue; }
  const stressMin = (/^; gcmin: (\d+)/m.exec(fs.readFileSync(p.file, 'utf8')) || [])[1] || '1024';     // per-program override for allocation-heavy tests
  for (const mode of [{ AK_GCSTATS: '1' }, { AK_GCMIN: stressMin, AK_GCVERIFY: '1', AK_GCSTATS: '1' }]) {
    const got = cp.spawnSync(exe, [], { encoding: 'utf8', input: p.input || '', timeout: 120000, env: { ...process.env, ...mode } });
    const gcs = +((/gc: (\d+) collections/.exec(got.stderr) || [])[1] || 0);
    if (mode.AK_GCMIN) stressGcs += gcs; else if (p.name === 'gcnatural.aklang') naturalGcs = gcs;
    const ok = got.stdout === want.stdout && got.status === want.status;
    if (!ok) { bad++; console.log('FAIL', p.name, mode.AK_GCMIN ? '(gc stress)' : '', `\n   js    (${want.status}): ${JSON.stringify(want.stdout.slice(0, 200))}${want.stderr ? ' ' + want.stderr.trim().slice(0, 100) : ''}\n   native(${got.status}${got.signal ? ' ' + got.signal : ''}): ${JSON.stringify(got.stdout.slice(0, 200))} ${got.stderr.trim().slice(0, 150)}`); break; }
  }
}
// the stress pass must really collect (a dead AK_GCMIN knob once made it a no-op), and gcnatural must trigger the default collector
if (!only && stressGcs < 20000) { bad++; console.log(`FAIL: GC stress pass ran only ${stressGcs} collections`); }
if (!only && naturalGcs < 1) { bad++; console.log('FAIL: gcnatural.aklang did not trigger a collection without stress settings'); }
if (!only) console.log(`native_diff: ${stressGcs} collections under stress, ${naturalGcs} natural`);
console.log(`native_diff: ${progs.length - bad}/${progs.length} programs identical to the JS backend (normal and GC-stress runs)`);
fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
