'use strict';
// How far the native math functions may be from V8's (the JS target uses Math.*): pow with fractional exponents and sin/cos/tan of large
// arguments are within 1 ulp (the last bit of the double), everything else listed here is bit-identical. A fixed pseudo-random sample, so a run is reproducible.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const exact = [], close = [];   // [fn, args]
// special values and boundaries: exact
for (const [b, e] of [[0, 0.5], [0, -0.5], [0, -1], [0, 2], [-0.0, -1], [-0.0, 3], [-0.0, -3], [-0.0, 2], [-8, 1 / 3], [-8, 2.5], [-8, 2], [-8, 3], [Infinity, 0.5], [Infinity, -0.5], [NaN, 0.5], [2, NaN], [1, 0.5], [1, Infinity], [0.5, Infinity], [2, Infinity], [2, -Infinity], [2, 1e10], [2, -1e10], [-0.0, 0.5], [4, 0.5], [8, 1 / 3], [2, 0], [1e-300, 0.5], [1e300, 0.5], [1e300, 2]]) exact.push(['pow', [b, e]]);
for (const f of ['sin', 'cos', 'tan']) for (const x of [0, -0.0, Infinity, -Infinity, NaN, 1, -1, 1e-300, 0.5, 100, 1e5]) exact.push([f, [x]]);
// accuracy: within 1 ulp
for (const b of [0.5, 2, 3.7, 10, 123.456, 1e-3, 1e5, 7, 0.1, 1.0000001]) for (const e of [0.5, 1 / 3, 2.5, -0.5, 0.1, 1.5, -2.5, 0.75, 0.3333, 7.25]) close.push(['pow', [b, e]]);
for (let i = 0; i < 400; i++) close.push(['pow', [rnd() * 100, (rnd() - 0.5) * 20]]);
for (const x of [1e6, 1e6 + 0.5, 3.3e6, 1e7, 1e9, 1.234e12, 1e15, 1e22, 1e100, 1e300, 2 ** 53, Number.MAX_VALUE, -1e6, -1e22, -1e300]) for (const f of ['sin', 'cos', 'tan']) close.push([f, [x]]);
for (let i = 0; i < 3000; i++) close.push([['sin', 'cos', 'tan'][i % 3], [Math.pow(10, 6 + rnd() * 294) * (rnd() < 0.5 ? -1 : 1)]]);
exact.push(['abs', [-0.0]], ['abs', [0]], ['abs', [-3.5]]);
const all = [...exact, ...close];
const lit = x => Object.is(x, -0) ? '-0.0' : x === Infinity ? '(exp 1000)' : x === -Infinity ? '(- (exp 1000))' : Number.isNaN(x) ? '(- (exp 1000) (exp 1000))' : /^-?\d{17,}$/.test(String(x)) ? String(x) + '.0' : String(x);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akmath-')), file = path.join(tmp, 'm.aklang');
fs.writeFileSync(file, all.map(([f, a]) => `(p (f64bits (${f} ${a.map(lit).join(' ')})))`).join('\n') + '\n');
const r = cp.spawnSync(path.join(root, 'bin', 'ak'), [file], { encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26 });
fs.rmSync(tmp, { recursive: true, force: true });
const got = r.stdout.trim().split('\n');
let bad = 0, n = 0, off = 0, maxUlp = 0n;
const view = new DataView(new ArrayBuffer(8));
const bits = x => { view.setFloat64(0, x); return (BigInt(view.getUint32(0)) << 32n) | BigInt(view.getUint32(4)); };
if (r.status !== 0 || got.length !== all.length) { console.log('FAIL: the native run did not print one line per case', r.status, r.stderr.slice(0, 300), got.length, all.length); process.exit(1); }
all.forEach(([f, a], i) => {
  n++;
  const m = /\[(\d+) (\d+)\]/.exec(got[i]); const g = (BigInt(m[1]) << 32n) | BigInt(m[2]); const w = bits(Math[f](...a));
  const nan = x => (x >> 52n & 0x7ffn) === 0x7ffn && (x & 0xfffffffffffffn) !== 0n;      // any NaN equals any NaN
  const same = g === w || (nan(g) && nan(w));
  const d = g > w ? g - w : w - g;
  if (i < exact.length) { if (!same) { bad++; console.log('FAIL exact', f, a, 'got', got[i], 'want', w); } }
  else { if (!same) off++; if (d > maxUlp) maxUlp = d; if (d > 1n) { bad++; console.log('FAIL', f, a, 'is', d + ' ulp away'); } }
});
if (close.length < 3000 || exact.length < 40) { console.log('FAIL: the sample is too small'); process.exit(1); }
console.log(bad ? bad + ' math accuracy checks failed' : `math accuracy: ${exact.length} special values exact, ${close.length} samples within 1 ulp of V8 (${off} differ by 1, max ${maxUlp} ulp)`);
process.exit(bad ? 1 : 0);
