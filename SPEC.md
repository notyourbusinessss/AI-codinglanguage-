# Ak — spec (whole language, ~1 page)
Syntax: `(f a b)` call. `[a b]` list. `{k v k v}` map. `;` comment. Whitespace-insensitive. No precedence, no infix.
Atoms: `12` `1.5` `"str"` `:kw` `T` `F` `_`(nil). Falsy: only `F` and `_` (0, "", [] are truthy).
## Forms (special)
- `(= x v)` bind · `(= (f a b) body..)` define fn (implicit `:` body; last expr = return) · `(<- x v)` rebind existing
- `(\ (a b) body..)` lambda · `(\ (a .. r) ..)` varargs (`r` is list) · fns are TCO'd
- `(? c a)`, `(? c a else)`, `(? c1 a c2 b .. else)` if/cond · `(: e1 e2 ..)` sequence
- `(& ..)` `(| ..)` short-circuit and/or (return deciding value)
- `(let (a 1 b (+ a 1)) body..)` sequential local scope
- `(wh c body..)` while · `(for (v coll) body..)` · `(try body (\ (e) ..))` e is message string
- `(q x)` quote
## Builtins
math `+ - * / % ** < > <= >= == != !` (variadic; `!` = not; `/` int-exact else float) `abs min max sum sqrt int`
seq `(# x)` len · `(@ c i)` index (neg ok, miss→`_`, maps by key) · `(@ c a b)` slice · `(c i)` calling a list/map/str indexes it
`(+> l x..)` append (pure) · `(set c k v)` pure update · `(<@ c k v)` in-place · `(.. n)` `(.. a b)` `(.. a b step)` range
`(~ f l..)` map · `(~? f l)` filter · `(~/ f init l)` / `(~/ f l)` reduce · `sort`/`(sort keyfn l)` `rev zip uniq flat idx has any all`
`keys vals prs sub ap`  str `(++ a b..)` concat (lists too; non-str shown) · `$` tostr · `split join trim up lo rep num`
io `p` print(returns last) · `rd wr in args use` · `json unjson` · `(ty x)`→`:num :str :kw :list :map :bool :nil :fn` · `(is :t x)` · `(err msg)` · `show`
Run: `python3 ak.py file.ak` · REPL: `python3 ak.py`
