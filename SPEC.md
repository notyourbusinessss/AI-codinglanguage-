# Ak spec
Native x86-64 Linux compiler `ak` (JS target: `node boot/ak.js`). Expressions are **tight infix chunks: no spaces inside a chunk** (`a+b`, never `a + b`; spaces/commas separate elements).
## Syntax
`12 1.5 0xff 1_000 10n(BigInt) "s" :key(="key") true false nil ; comment`
`f(a b)` or `(f a b)` call · `[1 2]` list · `{:k v}` map · `a[i]` `a[i j]`(=a[i][j]) `a[1..3]` `a[2..]` `a[..n]` · `m.k` `m.k=v` `o.method(x)` · `..xs` spread · `0..n` range [0,n) `0..=n` · `#x` len · `!x` `-x` `~x`
Infix, Python precedence (`**` `* / // %` `+ -` `<< >>` `&` `^` `|` `..` comparisons(chain: `0<=i<n`) `&&` `|| ??` assignment `=` `+=` .. `=>`). Lambda: `x=>x*2` `(a b)=>a+b` `[a b]=>a` `()=>1`
## Forms
Lines: `head a b` = `(head a b)` · `f a b =` + indented lines (one statement each) = `(= (f a b) ..)`; a one-line body may follow the `=` · `x=1 y=2` = two statements. `ak fmt` prints this cheapest layout.
`(= (f a b=1 ..r) body..)` fn (last expr returned; patterns ok: `(= (f [x l r]) ..)`) · `[a [b ..c]]=v` destructure (`_` ignores) · `(<- x v)` rebind an OUTER variable
`(? c a)` `(? c a else)` `(? c1 a c2 b else)` · `(: a b c)` seq · `(&& ..)` `(|| ..)` `(?? ..)` return the deciding value · `(wh c body..)` · `(for x coll body..)` `(for [k v] map ..)` `(for i 0..n ..)` `(for 3 body)` · `(let (x 1) body..)` · `(sw v 1 a [2 3] b else)`
`(try body e=>handler)` `(err "msg" ..)` `(assert cond "msg" ..)` · `(use "f.aklang")` · `(embed "file")`
## Semantics
- Truthiness is Python's: false nil 0 "" [] {} are falsy. `??` replaces only nil: `m[k]??0`.
- `=` is function-local and never changes an outer variable (`x+=1` on one is a compile error → `(<- x x+1)`). Only `let` makes a block scope. Closures capture variables.
- Strict: `nil+1` `"a"-1` `nil<1` `x/0` throw. `+` also concatenates str/list; `==` is deep. `/` true division, `//` floor, `%` floored.
- Numbers are doubles, exact to 2^53; beyond that integer `+ - * **` throw `integer overflow`: use BigInt (`2n**100n`).
- `for`: list → elements; map → `[k v]`; number n → 0..n-1; string → chars. Bad index / missing key → nil. Self tail calls become loops.
- Errors print `error: msg (file:line:col)`, exit 1.
## Builtins
math `abs sqrt flr cel rnd int min max sum rand` (min/max/sum take args or a list); more (trig, log, pow, bit ops): SPEC-extra.md
list `# @ push pop enum set del +> .. ~ ~? ~~ ~/ sort rev zip uniq flat grp idx has any all keys vals prs sub take drop fst lst ap` — `(~ f xs)` map · `(~? f xs)` filter · `(~~ f xs)` flatmap · `(~/ f init xs)` reduce · `(sort xs)` `(sort keyfn xs)` · `(+> l x)` append · `(set c k v)` update (both return a copy) · `(has c x)` in · `(join xs sep)` `(split s sep)`
text `++ $ show split join trim up lo rep starts ends rpt padl padr chr ord num re match fmt` — `(fmt "%-8s%4d%6.2f%03b" ..)` · `(rep s from to)`(regex ok) · `(rpt x n)` repeat
io `p pr ep in inall rd wr app ls ex rm mkdir mv isdir args env exit sh now clock sleep err assert json unjson ty is` · `(p a b)` prints space-joined · rest (typed arrays, symbols, errors kinds, sockets..): SPEC-extra.md
## CLI
`ak f.aklang [args]` · `ak -e 'code'` · `ak build f.aklang out` · `ak fmt f.aklang` · `ak test [paths]` · `ak repl` · `ak --version`. JS-only and native-only features: SPEC-extra.md.
## Cheap style (fewer tokens)
Write what `ak fmt` prints. Use truthiness, destructuring, `..xs` spread, ranges, `x+=1`, `??`, `fmt`. Name things with short common words (1 token).
