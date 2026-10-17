'use strict';
// String semantics across targets (SPEC-extra.md, "Strings across targets"). One program is run on the JS target and on the native
// compiler. "same" lines must print identically on both; "differs" lines print the documented value of each target, so a change
// in either direction (a difference that disappears or a new one) fails here and the spec has to be updated on purpose.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const ak = process.env.AK_BIN || path.join(root, 'bin', 'ak');
// [source, expected on both] or [source, native, js]
const bytes = (...b) => Buffer.from(b);
const CASES = [
  // --- same on both targets
  ['(++ "é" "😀" "a")', 'é😀a'], ['("é"=="é")', 'true'], ['("é"!="e")', 'true'],
  ['(split "a,é,😀" ",")', '["a" "é" "😀"]'], ['(join ["é" "😀"] "-")', 'é-😀'],
  ['(starts "éa" "é")', 'true'], ['(ends "a😀" "😀")', 'true'], ['(has "aé" "é")', 'true'],
  ['(rep "aéb" "é" "e")', 'aeb'], ['(rpt "é" 2)', 'éé'], ['(trim " é ")', 'é'],
  ['(chr 233)', 'é'], ['(chr 8364)', '€'], ['(chr 128512)', '😀'], ['(ord "é")', '233'], ['(ord "€x")', '8364'], ['(ord "😀")', '128512'],
  ['(show "é😀")', '"é😀"'], ['(json "é😀")', '"é😀"'], ['(unjson "\\"\\\\u00e9\\\\ud83d\\\\ude00\\"")', 'é😀'],
  ['(# "abc")', '3'], ['"abc"[1]', 'b'], ['(for c "abc" (p c))', 'a\nb\nc'], ['(idx "aé😀b" "é")', '1'],
  ['(match "^.$" "é")', '["é"]'], ['(match "^é+$" "éé")', '["éé"]'],
  // --- length, indexing, slicing, iteration: UTF-8 bytes natively, UTF-16 units on JS (ASCII is identical)
  ['(# "é")', '2', '1'], ['(# "€")', '3', '1'], ['(# "😀")', '4', '2'], ['(# "aé😀b")', '8', '5'],
  ['(take 2 "aé😀")', bytes(0x61, 0xc3), 'aé'], ['(drop 1 "aé")', 'é', 'é'],
  ['(idx "aé😀b" "b")', '7', '4'], ['(idx "aé😀b" "😀")', '3', '2'],
  ['(# (split "é" ""))', '2', '1'], ['(~ ord "é😀")', '[195 169 240 159 152 128]', '[233 128512]'],
  ['(padl "é" 3)', ' é', '  é'], ['(fmt "%4s|" "é")', '  é|', '   é|'],
  // --- regex: `.` is one code point natively; on JS pass the u flag to get the same
  ['(match "^.$" "😀")', '["😀"]', 'nil'], ['(match (re "^.$" "u") "😀")', '["😀"]'],
  // --- case mapping: one-to-one mappings agree (#46); special casing (ß -> SS, final sigma) is JS only
  ['(up "éa")', 'ÉA'], ['(lo "ÀÉÎ")', 'àéî'], ['(up "жзяёў")', 'ЖЗЯЁЎ'], ['(lo "ΩΑΒΆ")', 'ωαβά'], ['(up "ĀāŁł")', 'ĀĀŁŁ'],
  ['(up "ß")', 'ß', 'SS'], ['(lo "ΑΣ")', 'ασ', 'ας'],
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'str-'));
const file = path.join(tmp, 's.aklang');
const run = (cmd, args) => cp.spawnSync(cmd, args, { timeout: 60000 });
let bad = 0;
if (!CASES.length) { console.log('FAIL strings: no cases'); process.exit(1); }
for (const [code, a, b] of CASES) {                               // one program per case so a failing form cannot hide the rest
  fs.writeFileSync(file, code.startsWith('(for ') ? code + '\n' : `(p ${code})\n`);
  const nat = run(ak, [file]), js = run('node', [path.join(root, 'boot', 'ak.js'), file]);
  if (nat.status !== 0 || js.status !== 0) { bad++; console.log('FAIL', code, '\n  native:', nat.stderr.toString(), '\n  js:    ', js.stderr.toString()); continue; }
  const is = (o, w) => o.stdout.equals(Buffer.concat([w, Buffer.from('\n')]));
  const wantN = typeof a === 'string' ? Buffer.from(a) : a, wantJ = b === undefined ? wantN : Buffer.from(b);
  if (!is(nat, wantN) || !is(js, wantJ)) { bad++; console.log('FAIL', code, '\n  native:', nat.stdout, 'want', wantN, '\n  js:    ', js.stdout, 'want', wantJ); }
}
console.log(`strings: ${bad ? bad + ' FAILED' : 'all ' + CASES.length + ' cases match the documented semantics on both targets'}`);
process.exit(bad ? 1 : 0);
