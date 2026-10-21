# Changelog

All notable changes, newest first. The rules for what may change between versions are in [docs/stability.md](docs/stability.md).
Each release PR adds its section here; `tests/version.test.js` fails when the current version has no section.

## Unreleased

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
