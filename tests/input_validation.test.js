'use strict';
// Malformed input is rejected the same way on both targets: broken number literals and string escapes (#21, #22), unpaired JSON surrogates (#29),
// bad arguments to exit (#49), absurd sizes that must raise instead of hanging or being killed (#82). Case mapping of non-ASCII text (#46).
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..');
const TARGETS = [['js', 'node', [path.join(root, 'boot', 'ak.js')]], ['native', path.join(root, 'bin', 'ak'), []]];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akval-'));
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };
const run = (tg, src, timeout) => cp.spawnSync(tg[1], [...tg[2], '-e', src], { encoding: 'utf8', timeout: timeout || 20000 });

for (const tg of TARGETS) {
  const L = s => `${tg[0]}: ${s}`;
  // number literals and escapes: a syntax error naming the problem, exit 1, nothing printed
  for (const [src, frag] of [['(p 0x)', '0x needs'], ['(p 0X_)', '0x needs'], ['(p 0b)', '0b needs'], ['(p 0B__)', '0b needs'],
      ['(p "\\xGG")', 'bad hex'], ['(p "\\xA")', 'bad hex'], ['(p "\\x4")', 'bad hex'], ['(p "\\uGGGG")', 'bad hex'], ['(p "\\u12")', 'bad hex'], ['(p "\\u{41")', 'missing }'], ['(p "\\u{}")', 'bad hex'], ['(p "\\u{zz}")', 'bad hex']]) {
    const r = run(tg, src); t(L('rejects ' + src), r.status === 1 && r.stdout === '' && r.stderr.includes(frag), r);
  }
  let r = run(tg, '(p 0xFf 0b1_0 0x_1 "\\x41\\u0042\\u{43}\\u{1F600}")'); t(L('valid literals and escapes still work'), r.status === 0 && r.stdout === '255 2 1 ABC😀\n', r);
  // JSON surrogates
  for (const j of ['"\\ud83d"', '"\\ude00"', '"\\ud83d\\u0041"', '"\\ud83dx"', '"\\ude00\\ud83d"']) {
    r = run(tg, `(p (try (unjson ${JSON.stringify(j)}) e=>"caught"))`); t(L('unjson rejects ' + j), r.stdout === 'caught\n', r);
  }
  r = run(tg, '(p (unjson "\\"\\\\ud83d\\\\ude00 \\\\u00e9\\"") (unjson "[\\"\\\\ud83d\\\\ude00\\"]"))'); t(L('unjson accepts a valid pair'), r.stdout === '😀 é ["😀"]\n', r);
  // exit
  for (const bad of ['"x"', 'true', '[1]', '1.5', '{}']) { r = run(tg, `(exit ${bad})`); t(L('exit ' + bad + ' fails'), r.status === 1 && r.stderr.startsWith('error: exit'), r); }
  for (const [a, rc] of [['', 0], [' 0', 0], [' 3', 3], [' 300', 44]]) { r = run(tg, `(p "x") (exit${a})`); t(L('exit' + a + ' status'), r.status === rc && r.stdout === 'x\n', r); }
  // sizes: each must raise within the timeout, and the program must go on
  const huge = ['(rpt "a" 1e10)', '(rpt "a" 1e300)', '(rpt [1] 1e300)', '(padl "a" 1e10)', '(padr "a" 1e10)', '(0..1e10)', '(0..1e10 3)', '(json [1 2 3] 1e300)'];
  r = run(tg, huge.map((h, i) => `(p ${i} (try (: ${h} "no error") e=>"caught"))`).join('\n') + '\n(p "alive")', 30000);
  t(L('huge sizes raise'), r.stdout === huge.map((_, i) => `${i} caught\n`).join('') + 'alive\n', r);
  r = run(tg, '(p (rpt "" 1e300) (rpt [] 1e300) (rpt "ab" 3) (json [1] 2) (padl "7" 3 "0"))'); t(L('zero-length repeats and normal sizes still work'), r.stdout === ' [] ababab [\n  1\n] 007\n', r);
  // case mapping of non-ASCII letters (simple 1:1 mappings; ß, final sigma and other special casing are left to the JS target)
  r = run(tg, '(p (up "àéîõüÿ ĀāĂă Łł Ωα άέ жзя ёў") (lo "ÀÉÎÕÜŸ ĀĂ ŁŇ ΩΑ ΆΈ ЖЗЯ ЁЎ") (up "日本語a") (lo "×÷B"))');
  t(L('up/lo map Latin-1, Latin Extended-A, Greek and Cyrillic'), r.stdout === 'ÀÉÎÕÜŸ ĀĀĂĂ ŁŁ ΩΑ ΆΈ ЖЗЯ ЁЎ àéîõüÿ āă łň ωα άέ жзя ёў 日本語A ×÷b\n', r);
  // list builtins reject non-lists with the same type error on both targets (#106); case mapping leaves invalid UTF-8 bytes alone (#99)
  for (const f of ['rev', 'sort', 'flat', 'uniq']) for (const a of ['5', 'true']) { r = run(tg, `(${f} ${a})`); t(L(`${f} ${a} raises`), r.status === 1 && r.stderr.startsWith('error: expected list, got '), r); }
  r = run(tg, '(join 5 ",")'); t(L('join 5 raises'), r.status === 1 && r.stderr.startsWith('error: expected list, got num'), r);
  for (const f of ['keys', 'vals']) { r = run(tg, `(${f} 5)`); t(L(f + ' 5 raises'), r.status === 1 && r.stderr.startsWith(`error: ${f} of num`), r); }
  for (const f of ['up', 'lo', 'trim']) { r = run(tg, `(${f} 5)`); t(L(f + ' 5 raises'), r.status === 1 && r.stderr.startsWith('error: expected string, got num'), r); }
  r = run(tg, '(p (rev [1 2]) (rev "ab") (sort "ba") (join [1 2] "-") (flat [[1] 2]) (uniq [1 1]) (keys nil) (rev nil))'); t(L('valid list builtins still work'), r.stdout === '[2 1] ba ["a" "b"] 1-2 [1 2] [1] [] []\n', r);
  fs.writeFileSync(path.join(tmp, 'bin.dat'), Buffer.from([0x16, 3, 1, 2, 0, 1, 0, 1, 0xfc, 3, 3, 0xff, 0xfe, 0x80, 0x41, 0xc3, 0xa9, 0xc3]));
  r = run(tg, `s=(rd ${JSON.stringify(path.join(tmp, 'bin.dat'))})\n(p #(lo s) #(up s) (== (up (lo s)) (up s)))`); t(L('up/lo accept invalid UTF-8'), r.status === 0 && /^\d+ \d+ true\n$/.test(r.stdout), r);
}
// native only: the descriptor and length checks on sockets raise instead of crashing
const nat = run(TARGETS[1], '(= (t f) (try (: (f) "no error") e=>"caught"))\n(p (t ()=>(fdr 0 1e300)) (t ()=>(fdr nil 5)) (t ()=>(fdr 0 "ab")) (t ()=>(udpfrom 0 "ab")) (t ()=>(fdwait [0] "x")) (t ()=>(fdwait 5)))');
t('native fdr/udpfrom/fdwait check their arguments', nat.stdout === 'caught caught caught caught caught caught\n', nat);
// native only: integer literals above 2^53 are a syntax error (#117); 2^53, floats and exponents are fine
for (const lit of ['9007199254740993', '123456789012345678901', '0x20000000000001', '0xFFFFFFFFFFFFFFFF', '0b1' + '0'.repeat(53) + '1', '00009007199254740993']) {
  const r = run(TARGETS[1], `(p ${lit})`); t('native: literal ' + lit + ' is rejected', r.status === 1 && r.stdout === '' && r.stderr.includes('integer literal exceeds 2^53'), r);
}
{ const r = run(TARGETS[1], '(p 9007199254740992 0x20000000000000 0b1' + '0'.repeat(53) + ' 0009007199254740992 1e20 9007199254740993.5 12345678901234567890n)');
  t('native: literals up to 2^53, floats and BigInts still work', r.stdout === '9007199254740992 9007199254740992 9007199254740992 9007199254740992 100000000000000000000 9007199254740994 12345678901234567890\n', r); }
// the JS target says that sockets are native only (it used to report `undefined: tcpc`)
for (const f of ['tcpl', 'tcpp', 'tcpa', 'tcpc', 'fdr', 'fdw', 'fdc', 'fdwait', 'udp', 'udpto', 'udpfrom', 'unixc', 'dns']) {
  const r = run(TARGETS[0], `(p (try (${f} 1 2 3) e=>e))`); t('js: ' + f + ' says native only', r.stdout.startsWith(f + ': sockets are native only'), r);
}
fs.rmSync(tmp, { recursive: true, force: true });
if (n < 40) { console.log('FAIL: only ' + n + ' checks ran'); process.exit(1); }
console.log(bad ? bad + ' of ' + n + ' input validation checks failed' : n + ' input validation checks passed');
process.exit(bad ? 1 : 0);
