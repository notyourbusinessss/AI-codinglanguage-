# Ak

A language built for an LLM to write and read, not for humans.

Design goals (each chosen to cut tokens or remove ambiguity):
- **One syntax**: every construct is `(head args..)`. No precedence, indentation, or statement/expression split → fewer generation errors, trivial parse.
- **Short heads, one token each**: `= ? \ : & | ~ ~? ~/ @ # ++ ..` instead of `def/if/lambda/map/filter/reduce/len`.
- **Everything is an expression**; last expression is the return value, so no `return`.
- **Tiny truth rules** (only `F`/`_` falsy), no implicit coercion in `==` (`1 != T`).
- **Safe by default**: out-of-range index → `_` not crash; pure collection ops; TCO so recursion = loops.
- **Whole spec fits in ~1 page** (`SPEC.md`) so it can be pasted as context.

Example — same program, Python vs Ak:
```
def fib(n,a=0,b=1):               (= (fib n a b) (? (== n 0) a (fib (- n 1) b (+ a b))))
    return a if n==0 else fib(n-1,b,a+b)
```
Files: `ak.py` (interpreter), `SPEC.md`, `examples/`, `tests/test_ak.py`.
Run: `python3 ak.py examples/demo.ak` · test: `python3 tests/test_ak.py`
