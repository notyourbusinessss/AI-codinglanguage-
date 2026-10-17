# Roadmap to Ak 1.0

Ak is at 0.6.0. This file says what has to happen before the project calls itself 1.0, in the order it should happen. Every item is a GitHub issue (priority labels are in [docs/LABELS.md](docs/LABELS.md)); the milestones are a plan, not a promise of dates.

## What 1.0 means

1.0 is a promise, not a feature count:

1. **Stable language.** The syntax and builtins in SPEC.md, the `ak` command line, `use`/`as` and the error kinds do not change in a breaking way without a deprecation period (#72).
2. **The two targets agree.** The same program gives the same output on the native compiler and the JS target, except for the differences written down in SPEC-extra.md (native-only sockets, JS-only Node modules). No silent divergence: invalid input is rejected the same way on both.
3. **Fails loudly.** No segfault on a wrong argument, no invalid value accepted silently, no write that fails but reports success.
4. **Real programs are comfortable.** Dates, paths, command-line flags, an HTTP server, a formatter that keeps comments, editor highlighting.
5. **Still cheap.** Core stays small; extras are libraries in `lib/`. The token budget (`tools/token-budget.json`) only goes down, and SPEC.md stays under its ceiling. Anything that adds to SPEC.md needs a reason; new text goes in SPEC-extra.md.
6. **Verified.** `npm test` green, `bin/ak` reproducible with `./build.sh --boot`, the self-hosting fixpoint holds.

Platform for 1.0: Linux x86-64. Other platforms come after (see "After 1.0").

## 0.7: One language on both targets

Goal: remove every known place where the targets disagree or bad input slips through. This is the work that decides whether 1.0 can honestly be called stable, so it goes first.

| issue | what | priority |
|---|---|---|
| #72 | Write the 1.0 stability policy, deprecation rule, `CHANGELOG.md` | P3 |
| #13 | Decide and test string semantics (bytes vs UTF-16) across targets, document in SPEC.md | P2 |
| #46 | `up` / `lo` for non-ASCII text, or document them as ASCII only | P3 |
| #47 | Native `unjson` rejects invalid numbers like the JS target | P3 |
| #63 | File builtins raise a type error instead of segfaulting on a non-string path | P3 |
| #14 | Native math accuracy: regression cases and stated tolerances for `pow`, large `sin`/`cos`/`tan` | P3 |
| #49 | `exit` validates its argument | P4 |
| #21, #22, #29, #30 | Parser and runtime input validation: empty `0x`/`0b`, bad `\x`/`\u` escapes, JSON surrogates, regex `{3,1}` | P4 |
| #43 | Each of the above lands with a regression test (a rule, not separate work) | P4 |

Exit criteria: no open `bug` issue at P3 or above; a cross-target test for every item in this table.

## 0.8: Tooling you can trust

Goal: the tools around the language are as reliable as the compiler.

| issue | what | priority |
|---|---|---|
| #34 | `ak fmt` keeps comments; then add `ak fmt -w` | P4 |
| #44 | Golden-file tests for `ak fmt` (layout, comments, idempotent) | P4 |
| #40 | REPL tests: `use`, `use as`, `embed`, stack traces | P3 |
| #38 | Stack traces through `use ... as` code | P3 |
| #41 | `ak test` with `use as`, uncaught errors and stdin | P4 |
| #42 | Directory tests fail when they find nothing | P4 |

Exit criteria: `ak fmt` can be run on any file in the repository without losing a comment; the test suite cannot pass by running nothing.

Open question for this milestone: a stateful REPL (not replaying definitions) needs an interpreter, which is not small. Decide whether it is worth it or whether replay stays for 1.0.

## 0.9: Batteries, as libraries

Goal: the things nearly every program needs exist in `lib/`, documented with tested samples, without growing the core.

| issue | what | priority |
|---|---|---|
| #73 | `lib/time`, `lib/path`, `lib/cli` (dates, paths, flags) | P3 |
| #15 | Finish the networking story from 0.6: TLS tested against public servers; decide whether TLS 1.2 is needed. Re-scope or close the issue once decided | P3 |
| #58 | `lib/httpd`: a reusable HTTP server | P4 |
| #57 | Read and write timeouts, line helpers for sockets | P4 |
| #56 | IPv6, DNS over TCP, DNS cache | P4 |
| #59 | Sockets on the JS target, or one clear "native only" error | P4 |
| #75 | How libraries are shared: standard `lib/` found from any directory, vendoring or `ak get` | P4 |
| #74 | Editor support: syntax highlighting, then `ak lsp` | P4 |
| #27 | Comparison with other languages (docs) | P5 |

Exit criteria: a 100-line command-line tool and a 100-line web service can be written using only `lib/` and the builtins, with no copy-pasted helpers.

## 1.0 release candidate

- Freeze: run the stability policy (#72) against SPEC.md, `docs/` and the CLI. Anything not meant to be stable is marked experimental in the docs.
- Documentation pass: SPEC.md, SPEC-extra.md and `docs/` agree with the code (`tests/docs.test.js` already runs the samples).
- Re-measure and publish the token numbers, speed table and correctness table in the README on the release commit.
- Two weeks with no new P1 to P3 bug before tagging 1.0.
- 1.0 release notes from `CHANGELOG.md`.

## After 1.0

Not needed to call it 1.0; each stays an issue.

| issue | what | priority |
|---|---|---|
| #76 | ARM64 Linux backend, then macOS | P4 |
| #60 | WebSocket library and Unix-socket listener | P5 |
| ideas | A `lib/table` SQL-like query library; a stateful REPL; GUI resizing, clipboard and non-ASCII text | not filed |

## How this file is kept

Update it in the pull request that moves an item. When an issue closes, strike it here and note the version. New gaps get an issue (with a P label and a short Priority section) before they get a line in this file.
