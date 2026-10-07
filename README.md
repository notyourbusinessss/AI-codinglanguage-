# Ak

A programming language designed for an LLM to write and read: **cheap in tokens, fast at runtime, able to do everything Node can, and verified for correctness.**

```
(= (fib n a=0 b=1) (? n==0 a (fib n-1 b a+b)))
(= (qs [p ..r]) (? p==nil [] [..(qs (~? x=>x<p r)) p ..(qs (~? x=>x>=p r))]))
(for [w n] (sort kv=>[-kv[1] kv[0]] c) (p w n))
```

Statements are S-expression forms; expressions are *tight infix chunks* (`fib(n-1)+fib(n-2)`, `t[i j]`, `x+=1`, `x=>x*2`, `a[1..]`, `#xs`). The whole language reference is one page: [`SPEC.md`](SPEC.md) (~1,500 tokens).

## Results (all measured, all reproducible)

### Token cost — 24 realistic programs, same behaviour as the Python reference
| | Anthropic tokenizer | GPT o200k |
|---|---|---|
| Python | 3078 (100%) | 2948 (100%) |
| **Ak** | **2570 (83.5%)** | **2430 (82.4%)** |
| Ak v1 (my first design) | 3257 (106%) | 3354 (114%) |

My first version was actually *more* expensive than Python (the cryptic `~?` and `<@` heads cost more tokens than the words they replaced). The v2 design came from measuring: single-character heads fuse with the paren into one token while words and 2-char operators cost two; tight infix saves parens; compound assignment (`x+=1`: 3 tokens vs 7), multi-index (`t[i j]`), destructuring, truthiness (`(wh q ..)` vs `(wh (> (# q) 0) ..)`) and `fmt` removed most of the rest. See `tools/tok.js`, `tools/measure.js`.
*Caveat: counts use the `@anthropic-ai/tokenizer` package (a legacy Claude tokenizer) and GPT's o200k as proxies; a current Claude tokenizer may differ somewhat.*

### Speed (compiled to JS, run on V8)
| benchmark | Ak (default, overflow-checked) | Ak `--fast` | Python 3.13 |
|---|---|---|---|
| naive `fib(38)` | 0.75 s | 0.60 s | 5.0 s |
| sieve of 20M (typed array) | 0.39 s | 0.34 s | — |
| 10⁹-iteration loop `s+=i%7` | 6.2 s | 2.2 s | — |

Integer-overflow checking (see below) is on by default because silent wrong answers are the worst failure for a reader that can't see them; `ak --fast` turns it off.

### Correctness
| check | |
|---|---|
| 24 corpus programs vs **independent Python reference outputs** | 24/24 |
| Differential fuzzing: random programs, compiled vs a separate reference interpreter of the language spec | 20,000 on the final build (>70,000 during development), 0 mismatches |
| Language tests (semantics, scoping, errors, strictness, overflow) | 297 |
| Parser tests / `parse(print(ast)) == ast` round-trips | 139 / 24 programs × 3 layouts |
| CLI tests (exit codes, stdin/args, positions, `use`, build) | 23 |
| Spec test: every builtin documented, every documented builtin exists | ✔ |

The fuzzer found real bugs I would not have written tests for: a spread operand aliasing a later mutation, silent `NaN` from an unchecked fast path, left-operand type checks running before right-operand side effects, falsy default parameters (`b=0`) being dropped, and a `!!x` parse error.

## Design decisions (and why)
- **Python truthiness** (`false nil 0 "" [] {}` falsy) + **`??`** for nil-only defaults (`m[k]??0`) — the `||`-eats-zero trap bit one of the first corpus programs.
- **`=` is function-local like Python**, never silently clobbers an outer variable; `x+=1` on an outer variable is a *compile error with a hint* (`(<- x x+1)`).
- **No silent coercion**: `nil+1`, `"a"-1`, `nil<1` throw (`null<1` is `true` in JS). Bools count as 0/1.
- **Integers exact to 2^53; beyond that `+ - * **` throw** `integer overflow` (use BigInt `10n`).
- Chained comparisons evaluate each operand once with exact short-circuit (`0<=f(x)<n`).
- Python's operator precedence (not C's: `n&n-1==0` means what you think).
- Compile-time checks: undefined names, arity of direct calls, rest/pattern misuse, misplaced spreads, dangling infix operators — all as `file:line:col: message`.

## Usage
```
node ak.js prog.ak [args]      run                    ak --fast prog.ak   skip overflow checks
node ak.js -e '(p 1+2)'        run code               ak check prog.ak    compile only
node ak.js js prog.ak          show generated JS      ak fmt prog.ak      canonical source (drops comments)
node ak.js build prog.ak out.js   standalone bundle   ak exe prog.ak out  native executable (embeds node)
npm test                       everything             npm run fuzz        20,000-program fuzz run
```
Everything in Node/npm is callable: `fs.readFileSync(f)`, `Math.max(1 2)`, `(req "pkg")`, `(aw (fetch u))` (async inferred), `(new Map)`, typed arrays, BigInt. Programs run in a worker thread with a 512 MB stack (1M-deep recursion works); self tail calls become loops.

## Layout
`syntax.js` parser · `fmt.js` canonical printer · `ak.js` compiler + CLI · `runtime.js` builtins/launcher · `interp.js` reference interpreter · `tests/` · `corpus/` (24 programs: `.py` reference, `.out` expected, `.ak` native, `.ak1`/`.akm` older forms) · `tools/` (token meter, v1→v2 migrator).

## Known limits
Strings are UTF-16 (like JS: `#"😀"` is 2). No static types. Not self-hosting. The 123 MB native `exe` embeds the Node runtime. Overflow-checked arithmetic is ~1.3–2.4× slower than `--fast` on arithmetic-bound loops.
