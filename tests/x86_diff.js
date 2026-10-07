'use strict';
// Byte-exact differential test: src/x86.ak (run on the bootstrap compiler) vs GNU as (dev-time oracle only).
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.join(__dirname, '..');
const R64 = ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15'];
const R8 = ['al', 'cl', 'dl', 'bl', 'spl', 'bpl', 'sil', 'dil', 'r8b', 'r9b', 'r10b', 'r11b', 'r12b', 'r13b', 'r14b', 'r15b'];
let seed = +process.argv[2] || 1; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const reg = () => pick(R64);
const DISPS = [0, 1, -1, 8, 127, 128, -128, -129, 255, 1000, -1000, 65536, 0x7fffffff, -0x80000000];
const mem = (size = 'qword') => {
  const k = Math.floor(rnd() * 5); const d = pick(DISPS);
  const base = reg(); const ix = pick(R64.filter(r => r !== 'rsp'));
  const sc = pick([1, 2, 4, 8]);
  const dd = d === 0 ? '' : (d < 0 ? `${d}` : `+${d}`);
  let m;
  if (k === 0) m = `[${base}]`;
  else if (k === 1) m = `[${base}${dd}]`;
  else if (k === 2) m = `[${base}+${ix}*${sc}]`;
  else if (k === 3) m = `[${base}+${ix}*${sc}${dd}]`;
  else m = `[${Math.abs(d) < 0x7fffffff && d >= 0 ? d : 4096}]`;
  return `${size} ptr ${m}`;
};
const imm = () => pick([0, 1, -1, 5, 127, 128, -128, -129, 1000, -1000, 70000, 0x7fffffff, -0x80000000]);
const imm8 = () => pick([0, 1, 2, 3, 7, 31, 63, 100, 127]);
const cc = ['o', 'no', 'b', 'ae', 'e', 'ne', 'be', 'a', 's', 'ns', 'p', 'np', 'l', 'ge', 'le', 'g'];
const gens = [];
for (const op of ['add', 'or', 'adc', 'sbb', 'and', 'sub', 'xor', 'cmp']) {
  gens.push(() => `${op} ${reg()}, ${reg()}`, () => `${op} ${reg()}, ${mem()}`, () => `${op} ${mem()}, ${reg()}`,
    () => `${op} ${reg()}, ${imm()}`, () => `${op} ${mem()}, ${imm()}`, () => `${op} ${mem('byte')}, ${imm8()}`, () => `${op} ${mem('dword')}, ${imm()}`);
}
gens.push(() => `mov ${reg()}, ${reg()}`, () => `mov ${reg()}, ${mem()}`, () => `mov ${mem()}, ${reg()}`, () => `mov ${reg()}, ${pick([0, 1, -1, 5, 1000, -1000, 0x7fffffff, -0x80000000])}`,
  () => `mov ${mem()}, ${pick([0, 1, -1, 5, 1000, -1000, 0x7fffffff])}`, () => `mov ${mem('byte')}, ${pick(R8)}`,
  () => `movabs ${reg()}, ${pick(['0x123456789a', '0xfff9000000000000', '0x7ff8000000000000', '-5000000000'])}`,
  () => `lea ${reg()}, ${mem()}`, () => `test ${reg()}, ${reg()}`, () => `test ${reg()}, ${pick([1, 255, 1000])}`, () => `test ${mem()}, ${reg()}`,
  () => `imul ${reg()}, ${reg()}`, () => `imul ${reg()}, ${mem()}`, () => `imul ${reg()}, ${reg()}, ${pick([3, 100, 1000, -5])}`,
  () => `push ${reg()}`, () => `pop ${reg()}`, () => `push ${pick([1, 100, 1000, -1])}`, () => `push ${mem()}`,
  () => `call ${reg()}`, () => `call ${mem()}`, () => `jmp ${reg()}`, () => `jmp ${mem()}`,
  () => `movzx ${reg()}, byte ptr ${mem('byte').replace('byte ptr ', '')}`, () => `movzx ${reg()}, ${pick(R8)}`, () => `movzx ${reg()}, word ptr ${mem('word').replace('word ptr ', '')}`,
  () => `set${pick(cc)} ${pick(R8)}`, () => `cmov${pick(cc)} ${reg()}, ${reg()}`, () => `cmov${pick(cc)} ${reg()}, ${mem()}`);
for (const op of ['not', 'neg', 'mul', 'div', 'idiv', 'inc', 'dec']) gens.push(() => `${op} ${reg()}`, () => `${op} qword ptr ${mem().replace('qword ptr ', '')}`);
for (const op of ['shl', 'shr', 'sar']) gens.push(() => `${op} ${reg()}, ${imm8()}`, () => `${op} ${reg()}, 1`, () => `${op} ${reg()}, cl`, () => `${op} ${mem()}, ${imm8()}`);
const xmm = () => `xmm${Math.floor(rnd() * 16)}`;
for (const op of ['addsd', 'subsd', 'mulsd', 'divsd', 'sqrtsd', 'minsd', 'maxsd', 'ucomisd']) gens.push(() => `${op} ${xmm()}, ${xmm()}`, () => `${op} ${xmm()}, ${mem('qword')}`);
for (const op of ['xorpd', 'andpd', 'andnpd', 'orpd']) gens.push(() => `${op} ${xmm()}, ${xmm()}`, () => `${op} ${xmm()}, ${mem('xmmword')}`);
gens.push(() => `movq ${xmm()}, ${reg()}`, () => `movq ${reg()}, ${xmm()}`, () => `movsd ${xmm()}, ${xmm()}`, () => `movsd ${xmm()}, ${mem()}`, () => `movsd ${mem()}, ${xmm()}`,
  () => `cvtsi2sd ${xmm()}, ${reg()}`, () => `cvttsd2si ${reg()}, ${xmm()}`, () => `roundsd ${xmm()}, ${xmm()}, ${pick([8, 9, 10, 11])}`);
for (const i of ['ret', 'syscall', 'cqo', 'nop', 'int3', 'ud2', 'leave', 'cld', 'hlt', 'rep movsb', 'rep stosb', 'rep movsq', 'rep stosq', 'repe cmpsb']) gens.push(() => i);

const N = +process.argv[3] || 3000;
const lines = new Set(); let guard = 0;
while (lines.size < N && guard++ < N * 20) lines.add(pick(gens)());
const list = [...lines];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x86d-'));
// oracle: GNU as + objdump
fs.writeFileSync(path.join(tmp, 't.s'), '.intel_syntax noprefix\n.text\n' + list.map(l => l.replace(/^movabs /, 'movabs ')).join('\n') + '\n');
let r = cp.spawnSync('as', ['--64', '-o', path.join(tmp, 't.o'), path.join(tmp, 't.s')], { encoding: 'utf8' });
if (r.status !== 0) { console.log('oracle assembly failed:\n' + r.stderr.split('\n').slice(0, 8).join('\n')); process.exit(2); }
r = cp.spawnSync('objdump', ['-d', '-w', '-M', 'intel', path.join(tmp, 't.o')], { encoding: 'utf8', maxBuffer: 1 << 28 });
const want = []; for (const l of r.stdout.split('\n')) { const m = /^\s*[0-9a-f]+:\t((?:[0-9a-f]{2} )+)\s*\t?(.*)$/.exec(l); if (m) want.push(m[1].trim()); }
// merge continuation lines are not produced with -w; instructions map 1:1
// ours
const o = cp.spawnSync('node', [path.join(root, 'ak.js'), path.join(__dirname, 'x86_dump.ak')], { input: list.join('\n'), encoding: 'utf8', maxBuffer: 1 << 28 });
if (o.status !== 0) { console.log('driver failed', o.stderr.slice(0, 400)); process.exit(1); }
const have = o.stdout.trim().split('\n');
let bad = 0;
if (want.length !== list.length) { console.log(`oracle produced ${want.length} instructions for ${list.length} lines`); }
for (let i = 0; i < list.length; i++) {
  const w = (want[i] || '').trim(), h = (have[i] || '').trim();
  if (w !== h) { bad++; if (bad <= 12) console.log(`MISMATCH  ${list[i]}\n   as: ${w}\n   ak: ${h}`); }
}
console.log(`x86_diff: ${list.length - bad}/${list.length} instruction encodings identical to GNU as`);
fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
