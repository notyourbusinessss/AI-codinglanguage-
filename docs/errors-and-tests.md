# Errors, tests and the REPL

## Catching errors
`(try body handler)` runs `body`; if it throws, the handler (a function of the message) supplies the value of the whole `try`.
```ak
r=(try 10/0 e=>"never mind")
p r
p (try (err "boom" 1 2) e=>(++ "caught: " e))
p (try (num "x")[0] e=>"nil index is not an error")
```
```output
never mind
caught: boom 1 2
nil
```
(The last line prints `nil`: `(num "x")` is `nil`, and indexing `nil` gives `nil`. Only operations that cannot make sense, like `nil+1`, throw.)

## Error kinds
Every error has a kind, available inside the handler with `(errkind e)`:

| kind | thrown by |
|---|---|
| `"assert"` | `(assert cond msg)` when `cond` is falsy |
| `"arith"` | division by zero, integer overflow |
| `"type"` | wrong operand or argument type (`nil+1`, `"a"-1`), calling a non-function |
| `"io"` | files, `sh`, sockets, DNS, HTTP, TLS |
| `"index"` | a bad or out-of-range index where that is an error |
| `"error"` | `err` and everything else |

```ak
kind thunk = (try (thunk) e=>(errkind e))
p kind(()=>1/0) kind(()=>nil+1) kind(()=>(assert false)) kind(()=>(rd "/no/such/file")) kind(()=>(err "x"))
```
```output
arith type assert io error
```

## Your own kinds
`(raise "kind" "message" data)` throws an error of a kind you choose, with any value attached; `(errdata e)` returns it in the handler. Call `errkind` and `errdata` first in the handler, before code that might throw again, because they describe the error being handled.
```ak
withdraw bal n =
 (? n>bal (raise "funds" "insufficient funds" {:short n-bal}))
 bal-n
r=(try withdraw(10 25) e=>(? (errkind e)=="funds" (++ e ", short by " errdata(e).short) (raise "error" e)))
p r
```
```output
insufficient funds, short by 15
```
Re-raise what you do not handle (here `(raise "error" e)`), so real bugs are not swallowed.

## Stack traces
An uncaught error prints the message and the innermost call site, then one `called from` line per caller (at most 10), and exits with status 1:
```
error: division by zero (prog.aklang:2:11)
  called from prog.aklang:4:6
  called from prog.aklang:5:1
```
Errors inside a coroutine keep their kind and data when they surface in the `resume` (see [libraries](libraries.md#coroutines)).

## Tests: `ak test`
`ak test` runs every `*.test.aklang` file under the paths you give (default: the current directory; `node_modules` and dot directories are skipped). A test is simply a program that exits 0: use `assert`. It prints `PASS` or `FAIL` per file, and for a failure the output of the program. The exit status is 1 if anything failed, or if it found no test files at all (a test run that tests nothing should not look green).

Save as `math.test.aklang`:
```ak no-run
sq x = x*x
(assert (== sq(7) 49))
(assert (== (~ sq [1 2 3]) [1 4 9]) "map of sq")
(assert (== (try (assert false "nope") e=>(errkind e)) "assert"))
```
```
$ ak test
PASS math.test.aklang
1 passed, 0 failed, 1 files
```
`(assert cond)` throws "assertion failed" and `(assert cond "message")` throws your message.

## The REPL: `ak repl`
Type an expression and its value is printed. A definition (`x=1`, `f n = ..`, `(use ..)`) is remembered by *replaying* it before every later entry, which means its side effects run again each time (a stateful interpreter would be a different design). Commands: `:defs` shows what is remembered, `:reset` forgets it, `:q` quits.
```
$ ak repl
ak> x=21
ak> x*2
42
ak> sq n = n*n
ak> sq(x)
441
```
