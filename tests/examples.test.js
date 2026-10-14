'use strict';
// examples/*.aklang with an .out file: stdout must match
const fs = require('fs'), path = require('path'), cp = require('child_process');
const dir = path.join(__dirname, '..', 'examples'); let bad = 0, n = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.aklang') && fs.existsSync(path.join(dir, f.replace(/\.aklang$/, '.out'))))) {
  n++;
  const r = cp.spawnSync('node', [path.join(__dirname, '..', 'boot', 'ak.js'), path.join(dir, f)], { encoding: 'utf8', input: 'hello\nworld\n', timeout: 60000 });
  const want = fs.readFileSync(path.join(dir, f.replace(/\.aklang$/, '.out')), 'utf8');
  if (r.stdout !== want || r.status !== 0) { bad++; console.log('FAIL example', f, '\n--got--\n' + r.stdout + r.stderr + '\n--want--\n' + want); }
}
console.log(`examples: ${n - bad}/${n} passed`); process.exit(bad ? 1 : 0);
