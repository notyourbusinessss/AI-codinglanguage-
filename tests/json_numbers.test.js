'use strict';
// unjson accepts exactly the JSON number grammar on both targets (#47): the malformed ones raise, the valid ones parse.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const ak = process.env.AK_BIN || path.join(root, 'bin', 'ak');
const BAD = ['01', '1.', '.5', '+1', '1.e3', '-01', '00', '-', '1e', '1e+', '-.5', '0x1'];
const GOOD = ['0', '-0', '1.5e3', '10', '1E+2', '0.5', '-1.5e-3', '123456789012345678'];
if (!BAD.length || !GOOD.length) { console.log('FAIL json_numbers: no cases'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jn-'));
const file = path.join(tmp, 'j.aklang');
const lit = s => JSON.stringify(s);
fs.writeFileSync(file, [...BAD.map(s => `(p (try (unjson ${lit(s)}) e=>"bad"))`), ...GOOD.map(s => `(p (unjson ${lit(s)}))`)].join('\n') + '\n');
const want = [...BAD.map(() => 'bad'), ...GOOD.map(s => String(JSON.parse(s)))];
let bad = 0;
for (const [name, cmd, args] of [['native', ak, [file]], ['js', 'node', [path.join(root, 'boot', 'ak.js'), file]]]) {
  const r = cp.spawnSync(cmd, args, { timeout: 60000 });
  const got = r.stdout.toString().trim().split('\n');
  if (r.status !== 0) { bad++; console.log('FAIL', name, r.stderr.toString()); continue; }
  got.forEach((g, i) => { if (g !== want[i]) { bad++; console.log('FAIL', name, i < BAD.length ? BAD[i] : GOOD[i - BAD.length], 'got', g, 'want', want[i]); } });
  if (got.length !== want.length) { bad++; console.log('FAIL', name, 'expected', want.length, 'lines, got', got.length); }
}
console.log(`json_numbers: ${bad ? bad + ' FAILED' : 'all ' + want.length + ' inputs agree on both targets'}`);
process.exit(bad ? 1 : 0);
