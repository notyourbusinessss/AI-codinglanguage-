# Ak — spec (whole language, ~1 page)
Compiles to JavaScript, runs on V8 JIT (native-class speed) with full Node/npm access.
Syntax: `(f a b)` call · `[a b]` list · `{k v k v}` map · `;` comment · commas = whitespace. No precedence, no infix.
Atoms: `12` `1.5` `0xff` `0b101` `10n`(BigInt) `"str"` `:kw` `T` `F` `_`(nil). Falsy: only `F` and `_`. Calls on out-of-range/missing give `_`, never crash.
## Forms (special)
- `(= x v)` bind · `(= (f a b) body..)` fn · `(<- x v)` rebind · `(<- (@ c i) v)` in-place set · `(<- a.b v)` JS property set
- `(\ (a b) body..)` lambda · `(\ (a .. r) ..)` varargs · last expr is the result (no `return`)
- `(? c a)` `(? c a else)` `(? c1 a c2 b .. else)` if/cond · `(: e..)` sequence · `(& ..)` `(| ..)` short-circuit, return deciding value
- `(let (a 1 b (+ a 1)) body..)` · `(wh c body..)` · `(for (v coll) ..)` `(for (k v coll) ..)` (map/list pairs) · `(for (i (.. n)) ..)` compiles to a raw numeric loop
- `(sw x v1 r1 [v2 v3] r2 .. else)` switch (`[..]` = any-of) · `(try body (\ (e) ..))` e = message string · `(q x)` quote · `(use "file")` include at compile time
- Self tail calls become loops; other recursion is fine to ~millions deep (512MB stack).
## JS interop (everything in Node/npm is reachable)
`(req "mod")` require · `(imp "mod")` dynamic import (promise) · dotted symbols = property paths: `(Math.max 1 2)` `(fs.readFileSync "f" "utf8")` `process.argv` (first segment: your var, a builtin, or any JS global)
`(. obj :method args..)` call · `(.@ obj :prop)` get · `(.= obj :prop v)` set · `(new Class args..)` · `(js "raw expr")`
`(aw promise)` await — any function (or the top level) containing `aw` becomes async automatically. `(delay ms)` promise · `(sleep ms)` blocking.
## Builtins
math `+ - * / % // ** < > <= >= == != !` (`==` is deep structural, no coercion; `%` is floored; `/` by 0 errors) `abs min max sum sqrt int flr cel rnd rand`; bits `band bor bxor bnot shl shr ushr`
seq `(# x)` len · `(@ c i)` index (neg ok) · `(@ c a b)` slice · `(c i)` / `(:k m)` calling a list/map/str/keyword indexes it · `(@! a i)` `(<@! a i v)` unchecked fast array access
`(+> l x..)` pure append · `(<< l x..)` in-place push · `(>> l)` pop · `(set c k v)` pure · `(del c k)` pure · `(<@ c k v)` in-place · `(.. n)` `(.. a b)` `(.. a b step)`
`(~ f l..)` map · `(~? f l)` filter · `(~~ f l)` flatmap · `(~/ f init l)` `(~/ f l)` reduce · `sort`/`(sort keyfn l)` `rev zip uniq flat grp idx has any all keys vals prs sub take drop fst lst ap`
typed arrays `f64 f32 i32 u32 i16 u16 i8 u8` `(f64 n)` or `(f64 [..])` — use with `@!`/`<@!` for numeric speed
str `(++ a b..)` concat (lists too) · `$` tostr · `show` · `split join trim up lo rep starts ends padl padr chr ord num` · `(re pat flags)` `(match re s)`→groups|`_` · `rep` accepts a regex
io `p pr ep`(print / no newline / stderr) `rd wr app ls ex in inall args env exit sh now clock sleep delay` · `json unjson` · `(ty x)`→`:num :str :kw :list :map :bool :nil :fn :arr :obj` · `(is :t x)` · `(err msg..)` · `(ev "src")`
## CLI
`node ak.js file.ak [args]` run · `-e 'code'` · `js file.ak` print generated JS · `build file.ak [out.js]` standalone bundle (needs only node)
Errors: compile errors `file:line: msg`, exit 1; runtime `error: msg`, exit 1; `AK_DEBUG=1` adds JS stack.
