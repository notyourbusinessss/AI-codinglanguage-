'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs');
const { compile } = require('../ak.js');
const RT = require('../runtime.js');
const run = src => RT.show(RT.evalCode(compile(src, { file: '<t>', ret: true, dir: process.cwd() })));

const CASES = [
  ['(+ 1 2 3)', '6'], ['(- 5)', '-5'], ['(/ 6 3)', '2'], ['(/ 1 2)', '0.5'], ['(* )', '1'],
  ['(? F 1 T 2)', '2'], ['(? F 1 9)', '9'], ['(? F 1)', '_'], ['(? 0 :y :n)', ':y'],
  ['(= (f x) (* x 2)) (f 4)', '8'],
  ['((\\ (a .. r) r) 1 2 3)', '[2 3]'],
  ['(~ + [1 2] [10 20])', '[11 22]'],
  ['(~/ + 0 [1 2 3])', '6'], ['(~/ + [1 2 3])', '6'],
  ['(@ [1 2 3] -1)', '3'], ['(@ [1 2 3 4] 1 3)', '[2 3]'], ['(@ {:a 1} :a)', '1'], ['(@ [1] 9)', '_'], ['(@ _ 1)', '_'],
  ['(:a {:a 7})', '7'], ['([5 6 7] 1)', '6'],
  ['(set {:a 1} :b 2)', '{:a 1 :b 2}'], ['(del {:a 1 :b 2} :a)', '{:b 2}'],
  ['(let (x 1 y (+ x 1)) y)', '2'], ['(= x 10) (let (x (+ x 1)) x)', '11'],
  ['(= i 0) (wh (< i 5) (<- i (+ i 1))) i', '5'],
  ['(= (c i) (? (< i 5000000) (c (+ i 1)) i)) (c 0)', '5000000'],
  ['(try (err "boom") (\\ (e) e))', '"boom"'],
  ['(try (/ 1 0) (\\ (e) e))', '"division by zero"'],
  ['(try (@ [1] "x") (\\ (e) e))', '"@: index must be a number, got \\"x\\""'],
  ['(== 1 T)', 'F'], ['(== [1 {:a 2}] [1 {:a 2}])', 'T'], ['(!= "a" "b")', 'T'], ['(== _ _)', 'T'],
  ['(& 1 2)', '2'], ['(| F _ 3)', '3'], ['(& 1 F 3)', 'F'], ['(! 0)', 'F'],
  ['(++ "a" 1 :k)', '"a1:k"'], ['(++ [1] [2])', '[1 2]'],
  ['(sort (\\ (x) (- x)) [1 3 2])', '[3 2 1]'], ['(sort ["b" "a"])', '["a" "b"]'],
  ['(ty :a)', ':kw'], ['(is :num 3)', 'T'], ['(ty [])', ':list'],
  ['(= c 0) (for (i (.. 4)) (<- c (+ c i))) c', '6'],
  ['(= c 0) (for (i (.. 10 0 -3)) (<- c (+ c i))) c', '22'],
  ['(= c 0) (for (x [1 2 3]) (<- c (+ c x))) c', '6'],
  ['(= s 0) (for (k v {:a 1 :b 2}) (<- s (+ s v))) s', '3'],
  ['(= fs []) (for (i (.. 3)) (<< fs (\\ () i))) (~ (\\ (f) (f)) fs)', '[0 1 2]'],
  ['(% -7 3)', '2'], ['(// 7 2)', '3'], ['(** 2 10)', '1024'], ['(band 12 10)', '8'], ['(shl 1 4)', '16'],
  ['(sw 3 1 :a [2 3] :b :z)', ':b'], ['(sw 9 1 :a :z)', ':z'],
  ['(= (f x) (? (> x 0) (: (= y (* x 2)) (+ y 1)) 0)) (f 5)', '11'],
  ['(+ 1 (? T (: (= q 5) q) 0) 2)', '8'],
  ['(= a 1) (+ a (: (<- a 10) a))', '11'],
  ['(& (> 3 2) (: (= z 4) (> z 3)))', 'T'],
  ['(Math.max 1 5 3)', '5'], 
  ['(. "abc" :toUpperCase)', '"ABC"'], ['(.@ [1 2 3] :length)', '3'], 
  ['(js "1+2")', '3'], ['(. (req "path") :basename "/a/b.txt")', '"b.txt"'], 
  ['(json {:a [1 2]})', '"{\\"a\\":[1,2]}"'], ['(unjson "{\\"a\\":1}")', '{"a" 1}'],
  ['(split "a b  c")', '["a" "b" "c"]'], ['(join [1 2 3] "-")', '"1-2-3"'], ['(rep "a-b-c" "-" "+")', '"a+b+c"'],
  ['(match (re "(\\\\d+)-(\\\\d+)") "x 10-20 y")', '["10-20" "10" "20"]'],
  ['(ev "(+ 1 2)")', '3'], 
  ['(+ 10000000000000000000n 1n)', '10000000000000000001n'],
  ['(= (sum-all .. xs) (sum xs)) (sum-all 1 2 3 4)', '10'],
  ['(= f (\\ (n) (? (< n 1) 0 (+ n (f (- n 1)))))) (f 100)', '5050'],
  ['(f64 3)', '[0 0 0]'], ['(= a (i32 [1 2 3])) (<@! a 0 9) (@! a 0)', '9'],
];
let bad = 0;
for (const [src, want] of CASES) {
  let got; try { got = run(src); } catch (e) { got = 'EXC ' + e.message.split('\n')[0]; }
  if (got !== want) { bad++; console.log('FAIL', src, '->', got, '!=', want); }
}
// end-to-end examples: stdout must match .out file
const dir = path.join(__dirname, '..', 'examples');
let n = CASES.length;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ak') && fs.existsSync(path.join(dir, f.replace(/\.ak$/, '.out'))))) {
  n++;
  const r = cp.spawnSync('node', [path.join(__dirname, '..', 'ak.js'), path.join(dir, f)], { encoding: 'utf8', input: 'hello\nworld\n' });
  const want = fs.readFileSync(path.join(dir, f.replace(/\.ak$/, '.out')), 'utf8');
  if (r.stdout !== want || r.status !== 0) { bad++; console.log('FAIL example', f, '\n--got--\n' + r.stdout + r.stderr + '\n--want--\n' + want); }
}
console.log(`${n - bad}/${n} passed`); process.exit(bad ? 1 : 0);
