'use strict';
// Differential test: native executable (compiled by src/native.ak running on the bootstrap) vs the JS backend.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.join(__dirname, '..');
const dir = path.join(__dirname, 'native');
const files = (process.argv[2] ? [process.argv[2]] : fs.readdirSync(dir).filter(f => f.endsWith('.ak')).sort());
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-')); let bad = 0;
for (const f of files) {
  const src = path.isAbsolute(f) ? f : path.join(dir, f);
  const want = cp.spawnSync('node', [path.join(root, 'ak.js'), src], { encoding: 'utf8', timeout: 60000 });
  const exe = path.join(tmp, path.basename(f, '.ak'));
  const c = cp.spawnSync('node', [path.join(root, 'ak.js'), path.join(root, 'src/native.ak'), 'compile', src, exe], { encoding: 'utf8', timeout: 120000 });
  if (c.status !== 0) { bad++; console.log('FAIL compile', f, '\n  ', (c.stderr || c.stdout).split('\n').slice(0, 3).join('\n   ')); continue; }
  const got = cp.spawnSync(exe, [], { encoding: 'utf8', timeout: 20000 });
  const ok = got.stdout === want.stdout && got.status === want.status;
  if (!ok) { bad++; console.log('FAIL', f, `\n   js    (${want.status}): ${JSON.stringify(want.stdout.slice(0, 300))}${want.stderr ? ' ' + want.stderr.trim().slice(0, 100) : ''}\n   native(${got.status}${got.signal ? ' ' + got.signal : ''}): ${JSON.stringify(got.stdout.slice(0, 300))} ${got.stderr.trim().slice(0, 150)}`); }
  else console.log('ok  ', f);
}
console.log(`native_diff: ${files.length - bad}/${files.length} programs identical to the JS backend`);
fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
