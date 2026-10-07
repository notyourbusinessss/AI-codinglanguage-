'use strict';
// Native backend vs the JS backend (and the Python-checked expected outputs): every tests/native/*.ak and corpus program is compiled by the
// self-hosted compiler (built here by the JS bootstrap), run, and must print exactly what the JS backend prints. Then the same programs run
// again under GC stress (collect every ~64KB, heap verification on).
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.join(__dirname, '..');
const JS_ONLY = new Set(['17-http.ak', '22-async.ak']);          // use Node modules / promises: JS target only
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-'));
const ak = process.env.AK_BIN || path.join(tmp, 'ak');
if (!process.env.AK_BIN) {
  const b = cp.spawnSync('node', [path.join(root, 'boot', 'ak.js'), path.join(root, 'src/main.ak'), 'build', '--image', path.join(root, 'src/main.ak'), ak], { encoding: 'utf8' });
  if (b.status !== 0) { console.log('FAIL: bootstrap build\n', b.stderr); process.exit(1); }
}
const progs = [];
for (const f of fs.readdirSync(path.join(root, 'tests/native')).sort()) if (f.endsWith('.ak')) progs.push({ name: f, file: path.join(root, 'tests/native', f) });
for (const f of fs.readdirSync(path.join(root, 'corpus')).sort()) if (f.endsWith('.ak') && !JS_ONLY.has(f)) progs.push({ name: f, file: path.join(root, 'corpus', f), input: fs.existsSync(path.join(root, 'corpus', f.replace(/\.ak$/, '.in'))) ? fs.readFileSync(path.join(root, 'corpus', f.replace(/\.ak$/, '.in'))) : '' });
// native-only programs (sockets, ...): expected output in a .out file next to the source
for (const f of fs.readdirSync(path.join(root, 'tests/native_only')).sort()) if (f.endsWith('.ak')) progs.push({ name: f, file: path.join(root, 'tests/native_only', f), expect: fs.readFileSync(path.join(root, 'tests/native_only', f.replace(/\.ak$/, '.out')), 'utf8') });
let bad = 0;
const only = process.argv[2];
for (const p of progs) {
  if (only && !p.name.includes(only)) continue;
  const want = p.expect !== undefined ? { stdout: p.expect, status: 0, stderr: '' } : cp.spawnSync('node', [path.join(root, 'boot', 'ak.js'), p.file], { encoding: 'utf8', input: p.input || '', timeout: 60000 });
  const exe = path.join(tmp, p.name.replace(/\.ak$/, ''));
  const c = cp.spawnSync(ak, ['build', p.file, exe], { encoding: 'utf8', timeout: 120000 });
  if (c.status !== 0) { bad++; console.log('FAIL compile', p.name, '\n  ', (c.stderr || c.stdout).split('\n').slice(0, 3).join('\n   ')); continue; }
  for (const mode of [{}, { AK_GCMIN: '65536', AK_GCVERIFY: '1' }]) {
    const got = cp.spawnSync(exe, [], { encoding: 'utf8', input: p.input || '', timeout: 60000, env: { ...process.env, ...mode } });
    const ok = got.stdout === want.stdout && got.status === want.status;
    if (!ok) { bad++; console.log('FAIL', p.name, mode.AK_GCMIN ? '(gc stress)' : '', `\n   js    (${want.status}): ${JSON.stringify(want.stdout.slice(0, 200))}${want.stderr ? ' ' + want.stderr.trim().slice(0, 100) : ''}\n   native(${got.status}${got.signal ? ' ' + got.signal : ''}): ${JSON.stringify(got.stdout.slice(0, 200))} ${got.stderr.trim().slice(0, 150)}`); break; }
  }
}
console.log(`native_diff: ${progs.length - bad}/${progs.length} programs identical to the JS backend (normal and GC-stress runs)`);
fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
