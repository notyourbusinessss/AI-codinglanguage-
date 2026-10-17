'use strict';
// The program-directory tests run whatever they find, so an empty or half-renamed directory would pass while testing nothing.
// This fails when tests/native/ or tests/native_only/ shrink below a floor, or when a .out has no program (or the other way round).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };
const list = (d, ext) => fs.readdirSync(path.join(root, d)).filter(f => f.endsWith(ext)).map(f => f.slice(0, -ext.length)).sort();
// floors: raise them when programs are added, never lower them to make a failure go away
for (const [dir, floor] of [['tests/native', 35], ['tests/native_only', 5], ['corpus', 20], ['examples', 8]]) {
  const progs = list(dir, '.aklang');
  t(`${dir} holds at least ${floor} programs (found ${progs.length})`, progs.length >= floor);
}
for (const dir of ['tests/native_only', 'examples']) {
  const progs = new Set(list(dir, '.aklang')), outs = list(dir, '.out');
  const orphans = outs.filter(o => !progs.has(o));
  t(`${dir}: every .out file has its .aklang program`, orphans.length === 0, orphans);
}
// native_only programs are checked against their .out: none may lack one
const noOut = list('tests/native_only', '.aklang').filter(p => !fs.existsSync(path.join(root, 'tests/native_only', p + '.out')));
t('tests/native_only: every program has its .out file', noOut.length === 0, noOut);
t('tests/native: no stray .out files (those programs are compared with the JS target)', list('tests/native', '.out').length === 0);
if (n < 7) { console.log('FAIL: only ' + n + ' checks ran'); process.exit(1); }
console.log(bad ? bad + ' of ' + n + ' directory checks failed' : n + ' directory checks passed');
process.exit(bad ? 1 : 0);
