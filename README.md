# Ak

A language built for an LLM to write and read — and to **run fast** and **do everything**.

**Fast.** Ak compiles to JavaScript and runs on V8's JIT. Self tail calls become loops, `(for (i (.. n)))` becomes a raw numeric loop, arithmetic and comparisons are emitted inline, typed arrays give unboxed numeric arrays.

| benchmark | Ak | Python 3.13 |
|---|---|---|
| naive `fib(38)` (126M calls) | 0.5 s | 4.7 s |
| sieve of 20M (typed array) | 0.28 s | — |
| 1,000,000,000-iteration loop | 2.3 s | — |

**Does everything.** `(req "mod")`, dotted paths (`(fs.readFileSync "f" "utf8")`), `(. obj :method ..)`, `(new Class ..)`, `(aw promise)` (auto-async), `(js "raw")` — the entire Node stdlib and npm are callable (`examples/everything.ak`: an HTTP server + fetch client, files, subprocess, regex in ~20 lines). Also BigInt, typed arrays, standalone builds, `ev`.

**Easy for an LLM.** One syntax `(head args..)`, no precedence/indentation, short one-token heads (`= ? \ : & | ~ ~? ~/ @ # ++ ..`), everything is an expression (no `return`), only `F`/`_` falsy, no coercing `==`, safe indexing (`_` not crash), compile-time `undefined: name` errors with line numbers. Whole spec fits one page: `SPEC.md`.

```
(= (fib n) (? (< n 2) n (+ (fib (- n 1)) (fib (- n 2)))))
(p (fib 38))
```
Run: `node ak.js file.ak` · `node ak.js js file.ak` (see generated JS) · `node ak.js build file.ak out.js` · tests: `node tests/test.js` · benchmarks: `bench/`
Files: `ak.js` (compiler+CLI), `runtime.js` (builtins, launcher), `SPEC.md`, `examples/`, `tests/test.js`.
