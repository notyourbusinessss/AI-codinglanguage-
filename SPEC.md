# Ak spec
Native x86-64 Linux executables from a self-hosted compiler (default, `ak`), or JS on V8 (`node boot/ak.js`). Statements are S-forms; expressions are **tight infix chunks: no spaces inside a chunk** (`a+b`, never `a + b`; spaces/commas separate elements).
## Syntax
`12 1.5 0xff 1_000 10n(BigInt) "s" :key(="key") true false nil ; comment`
`(f a b)` or `f(a b)` call · `[1 2]` list · `{:k v}` map (keys are expressions) · `a[i]` `a[i j]`(=a[i][j]) `a[1..3]` `a[2..]` `a[..n]` · `m.k` `m.k=v` `o.method(x)` · `..xs` spread · `0..n` range [0,n) · `#x` len · `!x` `-x` `~x`
Infix, Python precedence (tight→loose): `**` · unary · `* / // %` · `+ -` · `<< >>` · `&` · `^` · `|` · `..` · `< > <= >= == !=`(chains: `0<=i<n`) · `&&` · `|| ??` · `= += -= *= /= %= **= //= ||= ??=` · `=>`
Lambda: `x=>x*2` `(a b)=>a+b` `[a b]=>a` `()=>1`; several statements: `(\ (x) s1 s2 result)`
## Forms
`(= x v)`=`x=v` · `(= (f a b=1 ..r) body..)` fn (last expr returned; patterns ok: `(= (f [x l r]) ..)`) · `[a [b ..c]]=v` destructure (`[a b]=[b a]` swaps; `_` ignores) · `(<- x v)` rebind an OUTER variable
`(? c a)` `(? c a else)` `(? c1 a c2 b else)` · `(: a b c)` seq · `(&& ..)` `(|| ..)` `(?? ..)` return the deciding value · `(wh c body..)`
`(for x coll body..)` · `(for [k v] map ..)` · `(for i 0..n ..)` · `(for 3 body)` · `(let (x 1 y 2) body..)` · `(sw v 1 a [2 3] b else)`
`(try body e=>handler)` `(err "msg" ..)` · `(aw promise)`(async inferred) · `(req "mod")` `(new C args)` `(js "raw js")` `(use "file.ak")`(include) `(embed "file")`(file contents as a string, at compile time) `(q x)`(quote: symbols are a type, `ty`="sym", `(sym "x")`) · Node built-in modules and JS globals are in scope: `fs.readFileSync(f)` `Math.max(1 2)` `path.basename(p)`
## Semantics
- Truthiness is Python's: false nil 0 "" [] {} are falsy. `??` replaces only nil: use `m[k]??0` for defaults (`||` would also replace a real 0).
- `=` is function-local like Python and never changes an outer variable. `x+=1` on an outer variable is a compile error → use `(<- x x+1)`. Only `let` makes a block scope. Closures capture variables; loop variables are per-iteration.
- Strict, no silent coercion: `nil+1` `"a"-1` `nil<1` throw. `+` also concatenates str+str, str+any, list+list; bools count as 0/1. `==` is deep structural. `/` true division, `//` floor, `%` floored, `x/0` throws.
- Numbers are doubles: integers are exact to 2^53; beyond that `+ - * **` on integers throw `integer overflow` — use BigInt (`10n`, `2n**100n`). `ak --fast` skips these checks.
- `for`: list → elements (length fixed at loop start); map → `[k v]`; number n → 0..n-1; string → chars. Out-of-range index / missing key → nil. Self tail calls become loops; recursion depth is large (512MB stack).
- Arity of direct calls to known functions is checked at compile time. Errors print `error: msg (file:line:col)`, exit 1.
## Builtins
math `+ - * / % // ** < > <= >= == != !` `& | ^ << >> >>> bnot` `abs sqrt flr cel rnd int min max sum rand sin cos tan asin acos atan atan2 exp log log2 log10 pow cbrt hypot sinh cosh tanh sign` (min/max/sum take args or a list)
list `# @ push pop enum set del +> .. ~ ~? ~~ ~/ sort rev zip uniq flat grp idx has any all keys vals prs sub take drop fst lst ap` — `(~ f xs)` map · `(~? f xs)` filter · `(~~ f xs)` flatmap · `(~/ f init xs)` reduce · `(sort xs)` `(sort keyfn xs)` (maps sort as `[k v]` entries) · `(+> l x)` pure append · `(set c k v)` pure update · `(has c x)` in
typed arrays `f64 f32 i32 u32 i16 u16 i8 u8 bcat` (`(u8 n)`, `(bcat a b ..)` joins byte lists/arrays into one `u8`) · fast unchecked access `(@! a i)` `(<@! a i v)`
text `++ $ show split join trim up lo rep starts ends rpt padl padr chr ord num re match fmt` — `(fmt "%-8s%4d%6.2f%03b" ..)` · `(rep s from to)`(regex ok) · `(rpt x n)` string/list repeat
io `p pr ep in inall rd wr wrx app ls ex rm mkdir mv isdir runx args env exit sh now clock sleep delay err` (`wr`/`app`/`wrx` take a string or a list of byte values; `wrx` makes the file executable) · `sym mksym symline symcol bytes f64bits` · `(p a b)` prints space-joined · `json unjson` · `ty is` · `ev` · `imp`
## CLI
`ak f.ak [args]` compile+run · `ak -e 'code' [args]` · `ak build f.ak out` native executable · `ak check f.ak` · `ak fmt f.ak` (canonical, drops comments) · `ak --version`. The JS target: `node boot/ak.js f.ak` (also `js` generated JS · `build f.ak out.js` bundle · `exe` embeds node).
## Targets
Native (default): no libc, no JS; strings are UTF-8 bytes (`#s` counts bytes; `chr`/`ord`/regex handle code points); `o.f(x)` calls the function stored under key `f` of map `o`. Not available natively: `aw req js new imp ev delay`, host objects, Node modules (`fs.readFileSync`, `fetch`, `Math.max` → use `rd wr ex ... max sin`). Native-only TCP sockets, `pow`/`**` precision, GC debugging knobs: SPEC-extra.md. Uncaught errors print `error: msg (file:line:col)` and exit 1.
## Cheap style (fewer tokens)
One top-level form per line, no indentation. `f(x)` inside expressions. Use truthiness (`(wh q ..)`), destructuring, `..xs` spread (`(p ..xs)`), ranges (`(for i 0..n ..)`), `x+=1`, `??`, and `fmt`. Prefer short common-word names (1 token): rare names split into several.
