'use strict';
// builds tests/elf_demo.ak's native program with the Ak assembler and runs it
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const out = path.join(os.tmpdir(), 'ak_elf_demo_' + process.pid);
const b = cp.spawnSync('node', [path.join(__dirname, '..', 'ak.js'), path.join(__dirname, 'elf_demo.ak'), out], { encoding: 'utf8' });
if (b.status !== 0) { console.log('FAIL build', b.stderr); process.exit(1); }
const r = cp.spawnSync(out, [], { encoding: 'utf8' });
const ok = r.stdout === 'hello from Ak\n' && r.status === 62;
console.log(`native_elf: ${ok ? 'ok' : 'FAIL'} (stdout ${JSON.stringify(r.stdout)}, exit ${r.status})`);
fs.rmSync(out, { force: true }); process.exit(ok ? 0 : 1);
