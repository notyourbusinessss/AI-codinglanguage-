'use strict';
const { compile } = require('../boot/ak.js');
const RT = require('../boot/runtime.js');
const run = src => RT.show(RT.evalCode(compile(src, { file: '<t>', ret: true, dir: process.cwd() })));
const CASES = [
  // --- arithmetic, precedence, literals
  ['1+2*3', '7'], ['(1+2)*3', '9'], ['10-4-3', '3'], ['2**3**2', '512'], ['-2**2', '-4'], ['7/2', '3.5'], ['6/3', '2'], ['7//2', '3'], ['-7//2', '-4'],
  ['-7%3', '2'], ['7%-3', '-2'], ['x=-7 x%3', '2'], ['5%0.5', '0'], ['0xff+0b11', '258'], ['1_000*2', '2000'], ['1e3', '1000'],
  ['(+ 1 2 3)', '6'], ['(- 5)', '-5'], ['(* )', '1'], ['(+)', '0'],
  ['5&3|8^1', '9'], ['1<<4', '16'], ['-16>>2', '-4'], ['-1>>>28', '15'], ['~5', '-6'],
  // --- strings & polymorphic +
  ['"a"+"b"', '"ab"'], ['"n="+5', '"n=5"'], ['5+"x"', '"5x"'], ['[1]+[2]', '[1 2]'], ['s="x" s+=s s', '"xx"'], ['(++ "a" 1 "b")', '"a1b"'],
  // --- truthiness (Python style)
  ['(? 0 1 2)', '2'], ['(? "" 1 2)', '2'], ['(? [] 1 2)', '2'], ['(? {} 1 2)', '2'], ['(? nil 1 2)', '2'], ['(? false 1 2)', '2'], ['(? [0] 1 2)', '1'], ['(? "a" 1 2)', '1'], ['(? 1 1 2)', '1'],
  ['!0', 'true'], ['![]', 'true'], ['![1]', 'false'], ['x=0 (? x 1 2)', '2'], ['(&& 1 2)', '2'], ['(|| 0 "" 3)', '3'], ['(&& 1 0 3)', '0'], ['1&&0||5', '5'],
  ['0??5', '0'], ['nil??5', '5'], ['m={} m.a??7', '7'], ['nil??nil??9', '9'], ['f=()=>nil f()??"d"', '"d"'],
  // --- equality / comparison / chains
  ['1==1', 'true'], ['1==true', 'false'], ['[1 {"a" 2}]==[1 {"a" 2}]', 'true'], ['"a"!="b"', 'true'], ['nil==nil', 'true'], ['x=nil x==nil', 'true'], ['0==nil', 'false'],
  ['0<=5<10', 'true'], ['0<=15<10', 'false'], ['1<2<3<4', 'true'], ['1<3>2', 'true'], ['f=()=>5 1<f()<9', 'true'],
  ['c=0 g=()=>(<- c c+1) 0<=g()<2 c', '1'],            // middle operand evaluated once
  ['c=0 g=()=>(<- c c+1) 5<g()<9 c', '1'],             // short-circuit: third not evaluated
  ['"a"<"b"', 'true'],
  // --- assignment scope (Python-like)
  ['x=1 f=()=>(: x=2 x) f() x', '1'],                  // function-local; global untouched
  ['x=1 f=()=>(<- x 5) f() x', '5'],                   // <- rebinds outer
  ['n=0 (for i 5 n+=i) n', '10'],                      // blocks are not function scopes
  ['(for i 3 y=i) y', '2'],                            // assigned in loop, visible after
  ['f=()=>(: t=0 (for i 4 t+=i) t) f()', '6'],
  ['mk=()=>(: n=0 ()=>(<- n n+1)) c=mk() c() c() c()', '3'],
  ['x=5 (let (x 1) x=2 x) ', '2'], ['x=5 (let (x 1) x=2 x) x', '5'],
  ['a=b=3 a+b', '6'], ['x=(= y 4) x+y', '8'],
  // --- op=
  ['x=5 x+=2 x*=3 x-=1 x', '20'], ['x=7 x%=4 x', '3'], ['x=2 x**=3 x', '8'], ['x=nil x??=4 x', '4'], ['x=1 x??=4 x', '1'], ['x=0 x||=9 x', '9'], ['x=7 x//=2 x', '3'], ['x=9 x/=3 x', '3'],
  ['a=[1 2] a[0]+=10 a', '[11 2]'], ['m={"k" 1} m["k"]+=1 m.k', '2'], ['m={} m.k??=[] m.k.push(1) m', '{"k" [1]}'], ['g=[[1 2] [3 4]] g[1 0]*=5 g', '[[1 2] [15 4]]'],
  ['i=0 a=[0 0] a[(: i+=1 i)-1]+=5 a', '[5 0]'],           // index expression evaluated once
  // --- functions
  ['(= (f x) x*2) f(4)', '8'], ['(= (f x) x*2) (f 4)', '8'], ['((x)=>x+1)(2)', '3'], ['((a b)=>a+b)(1 2)', '3'], ['(\\ (x) x*x)(5)', '25'],
  ['(= (f a b=10) a+b) [f(1) f(1 2)]', '[11 3]'], ['(= (f a ..r) r) [f(1) f(1 2 3)]', '[[] [2 3]]'], ['(= (f ..r) #r) f(1 2 3)', '3'],
  ['(= (f [a b]) a+b) f([3 4])', '7'], ['((a [b c])=>a+b+c)(1 [2 3])', '6'], ['(= (f a b=a*2) b) f(4)', '8'],
  ['(= (f) 7) f()', '7'], ['(= (f a b=0) a+b) [f(1) f(1 2)]', '[1 3]'], ['(= (f a b=false) b) f(1)', 'false'], ['(= (f a b="") b) f(1)', '""'], ['(= (f a b=nil) b) f(1)', 'nil'],
  ['s=0 (for 3 s+=2) s', '6'], ['s=0 (for 0 s+=2) s', '0'], ['(= (f x) (? x>0 "pos" x<0 "neg" "zero")) [f(1) f(-1) f(0)]', '["pos" "neg" "zero"]'],
  ['(= (fact n) (? n<2 1 n*fact(n-1))) fact(10)', '3628800'],
  ['(= (c i) (? i<5000000 (c i+1) i)) (c 0)', '5000000'],                            // self tail call -> loop
  ['(= (c i a) (? i==0 a (c i-1 a+i))) (c 1000000 0)', '500000500000'],
  ['f=x=>y=>x+y f(1)(2)', '3'], ['compose=(f g)=>x=>f(g(x)) h=compose(x=>x+1 x=>x*2) h(5)', '11'],
  ['(= (f x) x) f(1 2)', 'ERR takes 1 argument, got 2'], ['(= (f x y) x) f(1)', 'ERR takes 2 arguments, got 1'], ['(= (f a b=1) a) f()', 'ERR takes 1-2 arguments, got 0'],
  // --- lists / maps / indexing / slices
  ['s=0 (for i 1..=4 s+=i) s', '10'], ['xs=[1 2 3 4 5] xs[1..=2]', '[2 3]'], ['n=3 0..=n', '[0 1 2 3]'], ['sq x = x*x\nsq(5)', '25'], ['f a b = c=a+b c*2\nf(1 2)', '6'], ['k = 7\nk()', '7'],
  ['[1 2 3][1]', '2'], ['[1 2 3][-1]', '3'], ['[1 2 3][9]', 'nil'], ['xs=[1 2 3 4 5] xs[1..3]', '[2 3]'], ['xs=[1 2 3 4 5] xs[2..]', '[3 4 5]'], ['xs=[1 2 3 4 5] xs[..2]', '[1 2]'], ['xs=[1 2 3 4 5] xs[-2..]', '[4 5]'], ['"hello"[1..3]', '"el"'],
  ['t=[[1 2] [3 4]] t[1 0]', '3'], ['t=[[1 2] [3 4]] t[1][0]', '3'], ['t=[[1 2] [3 4]] t[0 1]=9 t', '[[1 9] [3 4]]'], ['m={"a" {"b" 5}} m.a.b', '5'], ['m={"a" [10 20]} m.a[1]', '20'],
  ['m={:a 1 :b 2} [m.a m["b"] m[:a]]', '[1 2 1]'], ['m={"a" 1} m.zz', 'nil'], ['m={} m["k"]=3 m', '{"k" 3}'], ['m={} m.k=3 m', '{"k" 3}'], ['o=nil o[0]', 'nil'],
  ['xs=[1 2 3] #xs', '3'], ['#"abc"', '3'], ['#{"a" 1}', '1'], ['#[]', '0'], ['xs=[3 4] #xs+1', '3'],
  ['xs=[1 2] [..xs 3 ..xs]', '[1 2 3 1 2]'], ['(= (f a b c) a+b+c) xs=[1 2] f(..xs 3)', '6'], ['(p ..[])', 'nil'],
  ['[a b]=[1 2] a+b', '3'], ['[a b]=[1 2] [a b]=[b a] [a b]', '[2 1]'], ['[a ..r]=[1 2 3] r', '[2 3]'], ['[a [b c]]=[1 [2 3]] a+b+c', '6'], ['[_ b]=[1 2] b', '2'], ['[a b]="xy" a+b', '"xy"'], ['[a b c]=[1] [a b c]', '[1 nil nil]'],
  ['(= (gcd a b) (? b==0 a (: [a b]=[b a%b] (gcd a b)))) gcd(48 18)', '6'],
  ['a=1 b=2 [a b]=[b a+b] [a b]', '[2 3]'],
  // --- loops
  ['s=0 (for i 5 s+=i) s', '10'], ['s=0 (for i 2..5 s+=i) s', '9'], ['s=0 n=4 (for i n s+=i) s', '6'], ['s=0 (for x [1 2 3] s+=x) s', '6'], ['s="" (for c "abc" s+=c+c) s', '"aabbcc"'],
  ['s=0 (for [k v] {"a" 1 "b" 2} s+=v) s', '3'], ['r=[] (for [k v] {"a" 1} r.push(k)) r', '["a"]'], ['r=[] (for [i x] (enum ["a" "b"]) r.push(i+x)) r', '["0a" "1b"]'], ['s=0 (for [a b] [[1 2] [3 4]] s+=a*b) s', '14'],
  ['s=0 (for i (.. 1 4) s+=i) s', '6'], ['s=0 xs=(.. 3) (for i xs s+=i) s', '3'], ['s=0 (for i 0 s+=1) s', '0'], ['s=0 (for i #[1 2 3] s+=i) s', '3'],
  ['fs=[] (for i 3 fs.push(()=>i)) fs.map(f=>f())', '[0 1 2]'],
  ['i=0 (wh i<5 i+=1) i', '5'], ['q=[1 2 3] s=0 (wh q s+=q.pop()) s', '6'], ['i=0 (wh (: i+=1 i<5) nil) i', '5'], ['i=0 r=[] (wh i<3 r.push(i) i+=1) r', '[0 1 2]'],
  ['(for i 3 (? i==1 nil)) 5', '5'],
  // --- sw / try / errors
  ['(sw 3 1 :a [2 3] :b :z)', '"b"'], ['(sw 9 1 :a :z)', '"z"'], ['(sw "x" "x" 1)', '1'], ['(sw 5 1 2)', 'nil'],
  ['(try (err "boom") (\\ (e) e))', '"boom"'], ['(try 1/0 (\\ (e) e))', '"division by zero"'], ['(try 5 (\\ (e) 0))', '5'], ['(try (err "a" "b") e=>e)', '"a b"'],
  ['(try (: x=1 (err "z")) (\\ (e) x))', '1'], ['(try [].zz() (\\ (e) "caught"))', '"caught"'], ['(try (+ [] {}) (\\ (e) e))', '"cannot add list and map"'],
  ['(= (f) (try (err "x") (\\ (e) 7))) f()', '7'],
  // --- tail calls inside try must not become loops that skip the handler
  ['(= (f n) (? n==0 (err "end") (try (f n-1) (\\ (e) e+"!")))) f(3)', '"end!"'],
  // --- JS interop
  ['Math.max(1 5 3)', '5'], ['Math.PI>3', 'true'], ['"abc".toUpperCase()', '"ABC"'], ['[3 1 2].sort().join("-")', '"1-2-3"'], ['path.basename("/a/b.txt")', '"b.txt"'],
  ['(new Date 0).getTime()', '0'], ['(new Set [1 2 2]).size', '2'], ['(js "1+2")', '3'], ['xs=[1 2 3] xs.length', '3'], ['JSON.stringify({"a" 1})', '"{}"'],
  ['m=(new Map) m.set("a" 1) m.get("a")', '1'], ['os.EOL.length', '1'],
  // --- builtins
  ['(~ x=>x*2 [1 2 3])', '[2 4 6]'], ['(~? x=>x%2==0 (.. 10))', '[0 2 4 6 8]'], ['(~/ + 0 [1 2 3])', '6'], ['(~/ (a b)=>a*b [1 2 3 4])', '24'], ['(~ + [1 2] [10 20])', '[11 22]'], ['(~~ x=>[x x] [1 2])', '[1 1 2 2]'],
  ['(sort x=>-x [1 3 2])', '[3 2 1]'], ['(sort ["b" "a"])', '["a" "b"]'], ['(sort x=>[-x[1] x[0]] [["a" 1] ["b" 2] ["c" 2]])', '[["b" 2] ["c" 2] ["a" 1]]'],
  ['(join (rev [1 2 3]) "-")', '"3-2-1"'], ['(split "a,b" ",")', '["a" "b"]'], ['(trim " x ")', '"x"'], ['(up "a")+(lo "B")', '"Ab"'], ['(rep "a-b" "-" "+")', '"a+b"'], ['(has [1 2] 2)', 'true'], ['(has "abc" "b")', 'true'], ['(has {"a" 1} "a")', 'true'],
  ['(keys {"a" 1 "b" 2})', '["a" "b"]'], ['(sum [1 2 3])', '6'], ['(max 1 5 3)', '5'], ['(min [4 2 8])', '2'], ['(set {"a" 1} "b" 2)', '{"a" 1 "b" 2}'], ['(del {"a" 1 "b" 2} "a")', '{"b" 2}'],
  ['(uniq [1 2 1 3 2])', '[1 2 3]'], ['(zip [1 2] ["a" "b"])', '[[1 "a"] [2 "b"]]'], ['(flat [[1] [2 3]])', '[1 2 3]'], ['(num "12")', '12'], ['(num "x")', 'nil'], ['(chr 65)+(ord "a")', '"A97"'], ['(padl 5 3 "0")', '"005"'], ['(rpt "ab" 2)', '"abab"'],
  ['(ty 1)', '"num"'], ['(ty "s")', '"str"'], ['(ty [])', '"list"'], ['(ty {})', '"map"'], ['(ty nil)', '"nil"'], ['(is "list" [])', 'true'],
  ['(json {"a" [1 2]})', '"{\\"a\\":[1,2]}"'], ['(unjson "{\\"a\\":1}")', '{"a" 1}'], ['(match (re "(\\\\d+)-(\\\\d+)") "x 10-20 y")', '["10-20" "10" "20"]'], ['(ev "(+ 1 2)")', '3'],
  ['(+ 10000000000000000000n 1n)', '10000000000000000001n'], ['(** 2n 70n)', '1180591620717411303424n'],
  ['(f64 3)', '[0 0 0]'], ['a=(i32 [1 2 3]) (<@! a 0 9) (@! a 0)', '9'], ['a=(u8 4) a[1]=300 a[1]', '44'],
  ['(@ [1 2 3] 1)', '2'], ['(+> [1] 2 3)', '[1 2 3]'], ['xs=[1] (push xs 2 3) xs', '[1 2 3]'], ['xs=[1 2] (pop xs)', '2'], ['(fst [5 6])+(lst [5 6])', '11'], ['(take 2 [1 2 3])', '[1 2]'], ['(drop 2 [1 2 3])', '[3]'],
  // --- strictness: no silent coercion; numeric inference must stay sound
  ['(try nil+1 e=>e)', '"cannot add nil and num"'], ['(try nil-1 e=>e)', '"expected number, got nil"'], ['(try "5"*2 e=>e)', '"expected number, got str"'], ['(try nil<1 e=>e)', '"cannot compare nil and num"'],
  ['(try (sum ["a"]) e=>e)', '"expected number, got str"'], ['(try (abs nil) e=>e)', '"expected number, got nil"'], ['(try "x"%5 e=>e)', '"expected number, got str"'], ['(try -"x" e=>e)', '"expected number, got str"'],
  ['(try #5 e=>e)', '"len of num"'], ['(try [1]<[2] e=>e)', 'true'], ['"a"<"b"', 'true'], ['(try 1<"b" e=>e)', '"cannot compare num and str"'],
  ['s=0 f=()=>(<- s nil) f() (try s-1 e=>e)', '"expected number, got nil"'],                       // numeric var reassigned via closure: not statically numeric
  ['(= (g) t=(try y-1 e=>e) y=5 t) g()', '"expected number, got nil"'],                           // read before assignment
  ['r=[] (for i 2 (r.push((try prev-1 e=>"E"))) prev=i) r', '["E" -1]'],                           // loop-carried
  ['x=1 x="s" (try x-1 e=>e)', '"expected number, got str"'],
  ['(= (f n) s=0 (for i n s+=i) s) f(5)', '10'], ['(= (f) s=0 (for i 4 s+=i*2) s) f()', '12'], ['s=0 (for i 1..4 s+=i) s*2', '12'],
  ['n=3 s=0 (for i n s+=i) s', '3'], ['s=1 (wh s<100 s*=2) s', '128'], ['a=2 b=3 a=a*b b=a+1 [a b]', '[6 7]'],
  // --- integer overflow is loud (exact integers only up to 2^53); genuine float math is unaffected
  ['2**52', '4503599627370496'], ['(try 2**60 e=>e)', '"integer overflow: ** exceeds 2^53 (use BigInt, e.g. 10n)"'], ['(try 3037000500*3037000500 e=>e)', '"integer overflow: * exceeds 2^53 (use BigInt, e.g. 10n)"'],
  ['(= (fib n a=0 b=1) (? n==0 a (fib n-1 b a+b))) [fib(70) (try fib(80) e=>"ovf")]', '[190392490709135 "ovf"]'],
  ['1e20*3', '300000000000000000000'], ['(try 0.5*2**70 e=>"ovf")', '"ovf"'], ['0.5*2**40', '549755813888'], ['9007199254740991+0', '9007199254740991'], ['(try 9007199254740991+9007199254740991 e=>"ovf")', '"ovf"'],
  ['2n**100n', '1267650600228229401496703205376n'], ['(try (- -9007199254740991 9007199254740991) e=>"ovf")', '"ovf"'], ['1.5*1e300', '1.5e+300'],
  // --- symbols (code as data), bytes, embed
  ['(q x)', 'x'], ['(ty (q x))', '"sym"'], ['(== (q a) (sym "a"))', 'true'], ['(q (a "s" 1 [b c]))', '[a "s" 1 [b c]]'], ['(++ "x" (q y))', '"xy"'], ['(== (q a) "a")', 'false'],
  ['m={} m[(q k)]=1 m[(sym "k")]', '1'], ['(ty (sym "x"))', '"sym"'], ['(bytes "é!")', '[195 169 33]'], ['#(embed "SPEC.md")>1000', 'true'], ['(json [(q a)])', '"[\\"a\\"]"'],
  // --- compile errors (must be caught at compile time with a useful message)
  ['(p undefinedthing)', 'ERR undefined: undefinedthing'], ['(= f 1) (<- g 2)', 'ERR undefined variable g'],
  ['x=1 f=()=>(x+=1) f()', 'ERR belongs to an enclosing'], ['x=1 f=()=>(: x=x+1 x) f()', 'ERR local to this function'],
  ['(f a', "ERR missing ')'"], ['(p ..x)', 'ERR undefined: x'], ['a+ b', 'ERR dangling'], ['x=..y', 'ERR spread'], ['(for)', 'ERR for'], ['(let (a) a)', 'ERR let'], ['5()', 'ERR cannot call'],
  ['(= (f ..a b) 1)', 'ERR rest parameter must be last'], ['[a ..b c]=[1 2 3]', 'ERR rest pattern'],
];
let bad = 0;
for (const [src, want] of CASES) {
  let got;
  try { got = run(src); } catch (e) { got = 'ERR ' + e.message.split('\n')[0]; }
  const ok = want.startsWith('ERR ') ? got.startsWith('ERR ') && got.includes(want.slice(4)) : got === want;
  if (!ok) { bad++; console.log('FAIL', JSON.stringify(src), '\n   got ', got, '\n   want', want); }
}
console.log(`lang: ${CASES.length - bad}/${CASES.length} passed`); process.exit(bad ? 1 : 0);
