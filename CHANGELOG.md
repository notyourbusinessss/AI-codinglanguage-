# Changelog

All notable changes, newest first. The rules for what may change between versions are in [docs/stability.md](docs/stability.md).
Each release PR adds its section here; `tests/version.test.aklang` fails when the current version has no section.

## Unreleased

### Added
- `lib/tls`: ALPN (`opts.alpn` on the client, `:alpn` in `t.creds`, `cn.alpn` for the result) and client certificates on both sides: `opts.cert`/`opts.key` on `t.connect`, `:clientca` and `:optional` in `t.creds`, `cn.peer` for the verified peer certificate (part of #102)
- `k.check_chain` accepts `nil` as the host to skip the name check (used for client certificates)

### Changed
- Tests written in Ak (part of #120): `tests/*.test.aklang` run with `bin/ak test tests` (helper `tests/lib/run.aklang`); the version, directory-floor, native ELF and corpus checks moved there from `tests/*.js`. The corpus check skips the two Node-only programs (`17-http`, `22-async`), which `tests/native_diff.js` still runs on the JS target.

## 0.7.7 (2026-10-23)

### Added
- TLS server side: `(t.creds {:cert :key})` and `(t.accept fd cr)` in `lib/tls.aklang` serve TLS 1.3 with an RSA or EC P-256/P-384 certificate chain, answering curl, `openssl s_client` and the Ak client; `lib/pki` gained `priv_parse`, `sign` and `key_matches` (#101)

## 0.7.6 (2026-10-23)

### Added
- UDP servers: `(udpl port host)` binds a UDP socket and `(udpfrom2 fd n ms)` returns `[data ip port]` of the sender, so a server can answer with `udpto` (#100)
- `lib/x11` windows can be resized: a `{:type "resize" :w :h}` event, a smallest size of half the opening size, `gui_open title w h minw minh` to change it (#105)

### Changed
- `udpto` raises an io error for a destination that is not an IPv4 address (it returned nil without sending) (#100)
- `(fdr fd)` and `udpfrom` with the default size read into one reused 64 KB buffer instead of allocating one per call: 50,000 one-byte round trips over loopback take 0.29 s instead of 0.71 s (#104)

### Fixed
- `sh` reports `sh killed by signal N` when its command dies from a signal; it said `failed (0)` (#130)
- A regex that backtracks past a step budget raises `regex too complex` instead of hanging (`(a+)+b` on 26 `a`s took over 30 s); the limit is documented in the README and SPEC-extra.md (#129)
- A single expression with thousands of operators compiles in linear time: 16000 terms of `x+x+...` took over a minute, now about 1.5 s (#128)
- `(!)`, `(-)`, `(<)` and other operators with too few operands are a normal `file:line:col` error instead of `internal: unknown IR node nil` (the native half of #118; the JS target is unchanged)

## 0.7.0 (2026-10-21)

Native runtime hardening and the first parallel workers. The patch sections below (0.6.26 to 0.6.35) have the details and issue numbers.

### Added
- Parallel workers on the native target: `par`, `shared`, `cores`, a shared canvas (0.6.26, #112)
- `lib/async` `a.write` and the builtins `fdwp` and `fdpoll`: a task can send more than a socket buffer without freezing the others (#103)

### Changed
- `ty(10n)` is `"big"`; `abs min max sum int flr cel` and `fmt "%d"` accept BigInts (#109)
- `fmt` raises on missing, leftover and unknown arguments or specifiers (#107)
- `json` raises an `arith` error for `NaN` and infinities instead of writing `null` (#108)
- Integer overflow past 2^53 is detected exactly, and integer literals above 2^53 are a syntax error that points to BigInt (#117)

### Fixed
- Unbounded recursion raises a catchable `stack overflow` instead of a segmentation fault; a list or map that contains itself raises in `p`, `show`, `json` and `==` instead of hanging (#81, #110)
- Destructuring a non-list raises a type error (#119)
- Unknown command line options are reported instead of being read as file names (#115)
- List builtins reject non-lists, `up` and `lo` keep invalid UTF-8, and `lib/time` `parse` checks the days of a month (#106, #99, #111)

## 0.6.35 (2026-10-21)

### Added
- `lib/async` `a.write fd s` writes without blocking the other tasks; new builtins `(fdwp fd s off n)` (write what fits now) and `(fdpoll rfds wfds ms)` (wait for readable and writable descriptors). A server task that sent more than a socket buffer used to freeze the whole process (#103)

### Fixed
- `ak --versoin` and `ak -x` print `unknown option ...` and the usage line and exit 2, instead of `cannot read --versoin`; `ak ./-name.aklang` still runs such a file (#115)

## 0.6.33 (2026-10-21)

### Changed
- `ty(10n)` is `"big"` (it was `"num"`), and `abs min max sum int flr cel` and `fmt "%d"` accept a BigInt; the other number builtins say `expected number, got big` (was `got num`) (#109)
- `fmt` raises on missing or leftover arguments, an unfinished specifier and an unknown specifier (before: `nil`, the text passed through) (#107)
- `json` raises an `arith` error for `NaN` and infinities (before: `null`) (#108)

## 0.6.30 (2026-10-21)

### Fixed
- Unbounded recursion raises a catchable `error: stack overflow` with the call-site trace instead of crashing with a segmentation fault, in the main program and in coroutines (#81)
- `show`, `p`, `json` and `==` on a list or map that contains itself raise `cyclic structure or nesting deeper than 10000` instead of hanging or crashing (#110, #81)

## 0.6.28 (2026-10-21)

### Fixed
- Destructuring (`[a b]=v`, function parameter patterns, `for [k v]`, `let`, nested patterns) raises `expected list, got num` when the value is not a list; nil still gives nils and `[a b]=[1]` still gives `1 nil`. Native target only; before, `[a b]=5` gave `5 nil` and a string was split into characters (#119)

## 0.6.27 (2026-10-21)

### Fixed
- Integer `+ - * **` raise `integer overflow` when the exact result is 2^53+1, which used to round to 2^53 and pass (`9007199254740991+2`, `2**53+1`); 2^53 itself still works (`9007199254740991+1`) (#117)
- Integer literals above 2^53 (decimal, `0x` and `0b`) are a syntax error that points to BigInt (`10n`) instead of being rounded silently (#117)

## 0.6.26 (2026-10-21)

### Added
- Parallel workers on the native target (#112): `(par n f w)` runs `f(0)` .. `f(n-1)` in worker processes (forked copies of the program, at most `w` at once, default `(cores)`) and returns their results in order; `(shared kind n)` makes a typed array in shared memory that workers can write to; `(cores)` is the number of CPUs the process may use. Errors, exits and kills of workers are reported in the parent, every worker is collected, and workers die with their parent
- `(canvas w h true)` keeps the pixels in shared memory, so workers can draw into one canvas; `examples/mandelbrot.aklang` renders with 1 worker and with every core and reports the speed-up

## 0.6.25 (2026-10-21)

### Fixed
- `rev`, `sort`, `flat`, `join` and `uniq` raise `expected list, got num` for a value that is not a list, string, map or nil, and `keys`, `vals`, `up`, `lo` and `trim` raise a type error on the JS target too (before: native wrapped the value, JS returned `[]` or leaked a `TypeError`) (#106)
- `up` and `lo` leave bytes that are not valid UTF-8 unchanged instead of raising `chr: invalid code point` (#99)
- `lib/time` `parse` rejects days that do not exist in the month, such as `2023-02-29` and `2024-04-31` (#111)

## 0.6.22 (2026-10-17)

### Added
- `lib/path.aklang` (as Node's `path.posix`), `lib/time.aklang` (UTC dates, ISO 8601, durations) and `lib/cli.aklang` (flags, options, generated help); all work on both targets
- On the JS target the socket functions (`tcpc`, `fdr`, `dns`, ...) raise `name: sockets are native only` instead of `undefined: tcpc`

### Fixed
- Number literals `0x`, `0b` and the escapes `\xNN`, `\uNNNN`, `\u{...}` are checked: a missing digit, a non-hex digit or a missing `}` is a syntax error on both targets (before: the native parser produced a wrong value, the JS parser a NUL character)
- `unjson` rejects unpaired and mismatched `\uD800`..`\uDFFF` escapes on both targets
- `(exit x)` accepts nil or an integer only; anything else raises (before: native exited 0)
- Huge sizes raise `invalid length: N` at once instead of hanging or being killed: `rpt`, `padl`, `padr`, ranges with a step, the indent of `json`, and the byte count of `fdr` and `udpfrom`; `fdr`, `udpfrom` and `fdwait` check their other arguments
- `up` and `lo` map Latin-1, Latin Extended-A, Greek and Cyrillic letters natively (before: ASCII only); special casing such as `ß` or a final sigma stays JS-only
- Native `(abs -0.0)` is `+0` and `(pow 0 -1)` is `Infinity` instead of raising `division by zero`, as on the JS target
- `ak --version` works on the JS target (it printed an `ENOENT` error)
- String semantics are defined and tested the same on both targets
- `rm` removes a symbolic link itself instead of following it, and reports failures
- Fractional counts, slice bounds and delete positions are truncated the same way on both targets; slice bounds that are not numbers raise an index error
- `%` on fractions is exact, and `rnd` and `exp(1)` match the JS target
- String and path builtins raise a type error when given another type (before: the native target could segfault)
- The native parser accepts non-ASCII identifiers and skips a byte order mark
- Regex rejects out-of-order ranges and counts, repeated assertions and a trailing backslash
- `http` resolves relative redirects, keeps credentials on their own host, and has no body on HEAD, 204, 304 and 1xx replies
- `pki` refuses an ECDSA signature whose INTEGER tags are wrong
- Native `unjson` rejects numbers outside the JSON grammar
- `mkdir` raises on failure; `install.sh` also writes the shell rc file so `ak` is found; the 32-bit wrap of bit operators is documented

### Docs and tests
- README no longer says that no release exists
- SPEC.md is now a core spec: 1806 to 1291 tokens, the rarer details moved to SPEC-extra.md
- `CHANGELOG.md` and `docs/stability.md`; `tests/version.test.js` keeps `package.json`, `ak --version` and the changelog in step
- `tests/math_accuracy.test.js` measures `pow`, `sin`, `cos` and `tan` against V8: within 1 ulp, special values exact; the README limits are updated to the measured rates
- New tests: input validation on both targets, golden files for `ak fmt`, stack traces through `use ... as`, the REPL with `use` and `embed`, `ak test` with `use ... as` and stdin, a floor on the program directories

## 0.6.0 (2026-10-17)

### Language
- Errors carry a kind and data (`errkind`, `errdata`, `raise`)
- Coroutines (`co`, `resume`, `yield`) and cooperative tasks in `lib/async`
- Namespaced includes: `(use "lib" as g)`, with a warning when two files define the same function
- Compact printing: one-line function bodies stay on the header line, inclusive `a..=b` ranges

### Tooling
- `ak test` runs `*.test.aklang` files and adds `assert`
- `ak repl` is an interactive session with persistent definitions
- `ak -` reads a program from stdin
- Compile and syntax errors show the source line with a caret
- Uncaught errors list the outer call sites (`called from file:line:col`)

### Libraries
- Native DNS, UDP sockets, connect timeouts, a plain HTTP client, and an HTTP server example
- `lib/crypto`: SHA-2, HMAC, HKDF, ChaCha20-Poly1305, AES-GCM, X25519
- `lib/pki`: X.509, RSA and ECDSA verification, chain and host name checks
- `lib/tls`: TLS 1.3 client, and `https://` in `lib/http`

### Fixes
- JSON writes BigInt values as exact digits
- `chr` validates its argument
- Fractional indexes and typed-array lengths are rejected on both targets
- Failed native reads and writes now raise
- The release workflow attaches to an existing release

### Project
- User guide in `docs/` with tested code samples
- Token budget check in CI; SPEC.md cut from 2245 to 1794 tokens
- Apache 2.0 license
- Issue labels and priorities documented

## 0.5.0 (2026-10-14)

- Source files use the extension `.aklang` (the old `.ak` still works)
- Line forms: `head a b` statement lines and `f a b =` function blocks
- Ak's own GUI: a pure-Ak X11 client, software canvas and a native-window Connect Four
- `ak --help`, and `ak -` to read a program from stdin
- `install.sh`: installs `bin/ak`, or downloads a release and checks its SHA-256
- Release workflow: pushing a `vX.Y.Z` tag publishes `bin/ak` with its checksum
