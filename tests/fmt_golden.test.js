'use strict';
// Golden files for `ak fmt`: tests/fmt_golden/NAME.aklang is formatted by the native formatter and by the JS one; both must print NAME.golden exactly,
// and formatting the golden text again must change nothing. A roundtrip test proves the meaning survives; this one pins the layout.
// (Comments are not covered: `ak fmt` drops them, see #34. Add them here when it keeps them.)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const dir = path.join(__dirname, 'fmt_golden'), root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akfmtg-'));
const fmts = [['native', f => cp.spawnSync(path.join(root, 'bin', 'ak'), ['fmt', f], { encoding: 'utf8', timeout: 60000 })],
              ['js', f => cp.spawnSync('node', [path.join(root, 'boot', 'ak.js'), 'fmt', f], { encoding: 'utf8', timeout: 60000 })]];
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };
const cases = fs.readdirSync(dir).filter(f => f.endsWith('.aklang')).sort();
t('at least 5 golden cases found (found ' + cases.length + ')', cases.length >= 5);
for (const c of cases) {
  const gp = path.join(dir, c.replace(/\.aklang$/, '.golden'));
  if (!fs.existsSync(gp)) { t(c + ' has a .golden file', false); continue; }
  const want = fs.readFileSync(gp, 'utf8');
  const again = path.join(tmp, c); fs.writeFileSync(again, want);
  for (const [label, run] of fmts) {
    const r = run(path.join(dir, c)); t(`${c}: ${label} output matches the golden file`, r.status === 0 && r.stdout === want, r.status === 0 ? { got: r.stdout, want } : r);
    const r2 = run(again); t(`${c}: ${label} formatting the golden text changes nothing`, r2.status === 0 && r2.stdout === want, r2.status === 0 ? r2.stdout : r2);
  }
}
const strayGold = fs.readdirSync(dir).filter(f => f.endsWith('.golden') && !cases.includes(f.replace(/\.golden$/, '.aklang')));
t('every .golden file has its input', strayGold.length === 0, strayGold);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? bad + ' of ' + n + ' fmt golden checks failed' : n + ' fmt golden checks passed');
process.exit(bad ? 1 : 0);
