'use strict';
// Every ```ak block in docs/*.md runs; a ```output block right after it must match the program's stdout.
// ```ak no-run is for examples that need a network or a display. `node tests/docs.test.js -v` prints each block's output.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..'), ak = path.join(root, 'bin', 'ak'), verbose = process.argv.includes('-v');
const files = fs.readdirSync(path.join(root, 'docs')).filter(f => f.endsWith('.md')).sort();
let ran = 0, skipped = 0, bad = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(root, 'docs', f), 'utf8');
  const re = /```ak( no-run)?\n([\s\S]*?)```(?:\n```output\n([\s\S]*?)```)?/g;
  let m, n = 0;
  while ((m = re.exec(text))) {
    n++;
    const label = `docs/${f} block ${n}`;
    if (m[1]) { skipped++; continue; }
    const tmp = path.join(root, `.docs-test-${process.pid}.aklang`); // in the repo root, so (use "lib/..") works as written
    fs.writeFileSync(tmp, m[2]);
    const r = spawnSync(ak, [tmp], { cwd: root, encoding: 'utf8', timeout: 30000 });
    fs.unlinkSync(tmp);
    ran++;
    if (verbose) console.log(`--- ${label}\n${r.stdout}${r.stderr}`);
    const want = m[3];
    if (r.status !== 0) { bad++; console.log(`FAIL ${label}: exit ${r.status}\n${r.stdout}${r.stderr}`); }
    else if (want !== undefined && r.stdout !== want) { bad++; console.log(`FAIL ${label}: output differs\n--- expected\n${want}--- got\n${r.stdout}`); }
  }
}
// the docs must not claim that no release exists (releases are published; the README once said otherwise after v0.5.0)
for (const f of ['README.md', ...files.map(f => path.join('docs', f))]) {
  const m = /none exists yet|no release (exists|has been|is published)|not (yet )?released|for now use a clone/i.exec(fs.readFileSync(path.join(root, f), 'utf8'));
  if (m) { bad++; console.log(`FAIL ${f}: says "${m[0]}", but releases are published`); }
}
if (ran === 0) { console.log('FAIL docs: found no ak blocks to run'); process.exit(1); }
console.log(`docs: ${bad ? 'FAILED' : 'ok'} (${ran} blocks run, ${skipped} skipped, ${files.length} pages)`); process.exit(bad ? 1 : 0);
