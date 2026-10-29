# Changelog

All notable changes, newest first. The rules for what may change between versions are in [docs/stability.md](docs/stability.md).
Each release PR adds its section here; `tests/version.test.aklang` fails when the current version has no section.

## Unreleased

### Changed
- Tests written in Ak (part of #120): `tests/*.test.aklang` run with `bin/ak test tests` (helper `tests/lib/run.aklang`); the version, directory-floor, native ELF and corpus checks moved there from `tests/*.js`. The corpus check skips the two Node-only programs (`17-http`, `22-async`), which `tests/native_diff.js` still runs on the JS target.
- More tests written in Ak (part of #120): `tests/examples.test.aklang`, `json_numbers`, `fmt_golden`, `docs` and `trace` replace their `.js` versions (no JS target runs in them any more). `examples/demo.aklang` and `examples/everything.aklang` no longer use Node (`req`, `fetch`, `aw`, `new`, `Math.max`): they run natively, `everything` through `lib/httpd.aklang` and `lib/http.aklang`. `lib/httpd.aklang` gained `s.spawn f args..` to start a task in the server's own queue.

## 0.7.61 (2026-10-29)

### Fixed
- `chr` and the `\u{..}` escape raise `chr: invalid code point` for the surrogate range 0xD800-0xDFFF instead of producing invalid UTF-8 that `json` then refuses (#201)

## 0.7.60 (2026-10-29)

### Fixed
- The DNS client ignores a reply that does not answer its query: the question section must match the name, type and class asked, records must be owned by the queried name or a name on its CNAME chain, and a datagram from an address or port other than the nameserver asked is dropped. A forged reply with a guessed id can no longer poison a lookup or the TTL cache (#199)

## 0.7.59 (2026-10-29)

### Fixed
- `rand` raises a `type` error for a non-number (`expected number, got str`) and for 0, negative or NaN; `rep` with an empty pattern returns the text unchanged on the JS target too, as native does (#156)

## 0.7.58 (2026-10-29)

### Fixed
- `ak build`, `exe` and `compile` refuse to write the executable over the source file (same file, also through a link) or to a name ending in `.aklang` or `.ak`; the source stays untouched (#182)
- A repeated name in a parameter list or destructuring pattern (`(= (f a a) ..)`, `(\ (x x) ..)`, `[a a]=..`, `(for [a a] ..)`) is a compile error `duplicate parameter a` with a position; `_` may repeat (#192)
- A function of your own named `req`, `js`, `new` or `aw` is called normally instead of hitting the JS-target error, so `ak check lib/http.aklang` passes; a test checks every file in `lib/` (#183)
- `json` and `unjson` reject strings (and keys) that are not valid UTF-8 instead of writing or accepting them (#188)
- File errors say why: `cannot read /x: no such file or directory`, `is a directory`, `permission denied`, `not a directory`, `file exists` and so on, for `rd wr app wrx ls mkdir rm mv` (#184)
- `(mkdir "")` raises instead of doing nothing (#176)
- `sleep` raises for NaN, negative, infinite and above 2^40 ms, and goes on sleeping after a signal interrupts it (#175)
- `lib/time`: `parse` rejects a UTC offset above 23:59, and `iso` raises for years outside 0..9999 (#193)

### Added
- `(run argv opts)`: start a program without a shell with `:in` (stdin), `:env`, `:cwd`; returns `{:code :out :err}` and never raises for a non-zero exit (#187)
- `stat cp chmod cwd chdir` (#189)
- `fmt` knows `%e %E %g %G %c` and the `+` and space flags (#177)

## 0.7.47 (2026-10-29)

### Fixed
- `lib/httpd` refuses a handler's response with CR, LF or NUL in a header name or value, a header name that is empty or holds a space or colon, or a status that is not an integer from 100 to 599: the client gets 500 and the error goes to stderr (#190)
- `lib/httpd` resolves `.` and `..` segments (also as `%2e`) before decoding, keeps `%2F` inside one segment (`req.segs`, and `req.path` writes it as `%2F`), routes on the segments, and answers 400 for an encoded NUL; `req.path` never holds a `..` segment (#191)
- `lib/http` skips interim 1xx replies (100 Continue, 103 Early Hints; up to 8) and returns the final reply; 101 is final and its connection is not reused (#185)
- `lib/ws` closes with 1007 for a text message or close reason that is not valid UTF-8, and with 1002 for a close code RFC 6455 forbids on the wire or a 1-byte close payload (#180)
- Host names are case-insensitive and a final dot is accepted: `LocalHost` and `localhost.` resolve like `localhost`, and `/etc/hosts` names match in any case (#181). Short IPv4 forms such as `127.1` stay unsupported.
- Sockets are created with `SOCK_CLOEXEC` and accepted with `accept4`, and `rd`, `wr`, `ls` open with `O_CLOEXEC`, so a program started with `sh` no longer inherits listening or connected sockets and a closed port can be bound again at once (#186)
- While `lib/async` runs its tasks, `tcpc`, `dns`, `hostips` and reads with a timeout (`fdr`, `fdline`, `udpfrom`, ..) let the other tasks run instead of freezing them; this also covers `lib/http` and `lib/httpd` handlers that call out (#179)

## 0.7.40 (2026-10-26)

### Fixed
- `lib/http` keeps repeated response headers (joined with ", ", `set-cookie` with a newline; the same in `lib/h2`) and raises `bad Content-Length in the response` when the values differ (#170)
- `lib/httpd` answers 400 and closes for Content-Length together with Transfer-Encoding, a Transfer-Encoding other than chunked, and an HTTP/1.1 request without exactly one Host (#171)
- `fdwait` raises `fdwait: bad file descriptor N` for an fd that is not open instead of reporting it readable (#172)

### Added
- `sockopt` options `rcvbuf`, `sndbuf`, `linger`, `v6only`, `mcastttl`, `mcastloop`, `mcastif`; `(getsockopt fd name)`; `(mcastjoin fd group iface)` and `(mcastleave ..)` for IPv4 and IPv6 groups (#173)
- `(dnsrr name type)` looks up A, AAAA, CNAME, MX, NS, PTR, SRV and TXT records (#174)

## 0.7.35 (2026-10-24)

### Added
- `lib/h2.aklang`: an HTTP/2 client with HPACK (static and dynamic tables, Huffman), flow control and SETTINGS/PING/GOAWAY handling; `lib/http` option `{:h2 true}` offers `h2` by ALPN and uses it when the server picks it (#167)

## 0.7.34 (2026-10-24)

### Added
- `lib/httpd` serves https: `(s.listen port handler {:tls {:cert pem :key pem}})` (or a `t.creds` result with several names); the handshake runs on the connection's task under `:headms`, `req.sni` is the client's server name, a failed handshake is logged; `t.accept fd cr stream` reads and writes through a stream (#165)

## 0.7.33 (2026-10-24)

### Added
- `lib/ws` follows `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` and `{:proxy ..}` like `lib/http`: `ws://` and `wss://` go through `CONNECT`; `h.dial sec host port opts` gives any raw protocol the same (#166)

## 0.7.32 (2026-10-24)

### Added
- `https://` proxies: `lib/http` talks TLS to the proxy, `CONNECT`s through it and runs TLS to the target inside; `t.connect host port {:stream s}` runs TLS over any byte stream (#164)

## 0.7.31 (2026-10-24)

### Added
- `lib/inflate.aklang`: gzip, zlib and raw DEFLATE decoding with checksums and an output limit; `lib/http` option `{:gzip true}` asks for and decodes compressed bodies (#162)

## 0.7.30 (2026-10-24)

### Added
- `(rdns ip)` returns the names of an address from `/etc/hosts` or PTR records (IPv4 and IPv6), `(arpa ip)` the reverse-lookup name (#161)

## 0.7.29 (2026-10-24)

### Added
- The TLS server picks its certificate by server name: `t.creds {:names {"a.test" {..} "*.b.test" {..}} :default {..}}`; an unknown name without a default gets an `unrecognized_name` alert (#160)

## 0.7.28 (2026-10-24)

### Added
- `lib/http` connection reuse: `pool=h.session()` and `{:pool pool}` keep keep-alive connections between requests; `(h.release pool)` closes them (#159)

## 0.7.27 (2026-10-24)

### Changed
- Documented that `(rm p)` removes a directory with everything inside it and ignores a missing path (#139)

## 0.7.26 (2026-10-24)

### Fixed
- Writing to stdout ignored errors: `p`, `pr` and `ak fmt` exited 0 on a full disk. A failed write now raises `write failed` and the program exits 1 (#138)

## 0.7.25 (2026-10-24)

### Fixed
- `lib/pki` accepted any certificate purpose: `check_chain` now requires `serverAuth` (or `anyEKU`, or no EKU) for servers and `clientAuth` for client certificates (the TLS server asks for it), and enforces `pathLenConstraint` and DNS / IP `nameConstraints` (#154)

## 0.7.24 (2026-10-24)

### Added
- `lib/httpd` timeouts `:headms`, `:idlems`, `:bodyms` (a half-sent request gets 408, an idle connection is closed) and `:maxconn` (503) (#153)

## 0.7.23 (2026-10-24)

### Added
- UDP over IPv6: `(udp)` is dual-stack where the machine has IPv6, `udpl` binds IPv6 addresses (`"::"` hears both families), `udpto` takes IPv6 addresses and host names, `udpfrom2` returns 16 numbers for an IPv6 sender (#152)

## 0.7.22 (2026-10-24)

### Fixed
- `lib/http` raises `bad status line`, `bad Content-Length` and `too many redirects` instead of an internal comparison error, a silent empty body or a 3xx answer returned as success (#151)

## 0.7.21 (2026-10-24)

### Added
- The resolver applies `search` / `domain` and `options ndots:N` of `/etc/resolv.conf`: short names are tried under each search domain, a trailing dot is absolute; `AK_RESOLV=path` reads another file (#149)

## 0.7.20 (2026-10-24)

### Added
- `lib/http` honours `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` (`https://` through `CONNECT`, proxy credentials), `{:proxy url}` / `{:proxy false}`; loopback hosts never use a proxy (#148)

## 0.7.19 (2026-10-24)

### Added
- `(peer fd)`, `(sockname fd)`, `(shutw fd)`, `(shutr fd)` and `(sockopt fd name on)` for native sockets; `lib/httpd` requests carry `req.peer` (#147)

## 0.7.18 (2026-10-24)

### Added
- `lib/http`: bodies over `:max` bytes (default 64 MiB) and response heads over 1 MiB raise; `(h.download url path)` streams a 2xx body to a file (#146)

## 0.7.17 (2026-10-24)

### Fixed
- `lib/pki`: IPv6 `subjectAltName` entries were read as 16 dotted numbers, so a certificate for `::1` never matched; they are IPv6 text now and an IPv6 literal host is matched in any notation (#145)

## 0.7.16 (2026-10-24)

### Fixed
- `lib/http` refuses CR, LF and NUL in the method, URL and headers (and a space or colon in a header name) instead of sending them, closing a request-injection hole (#144)

## 0.7.15 (2026-10-24)

### Added
- Native sockets speak IPv6: `tcpl`/`tcpc` take IPv6 addresses (`"::1"`, `"::"` also serves IPv4 clients), `(dns name)` returns AAAA records after the IPv4 ones, `tcpc` tries IPv4 addresses before IPv6, and the resolver repeats a truncated answer over TCP, honours `options timeout: attempts:` of `/etc/resolv.conf` and caches answers for their TTL (#56)

## 0.7.14 (2026-10-24)

### Added
- `lib/tls`: TLS 1.2 session tickets (RFC 5077) in the client, resumed with the same `{:session s}` option (`cn.resumed`), and TLS 1.3 0-RTT early data on both sides: `:early n` in `t.creds`, `{:early data}` in the client options (always delivered, as ordinary data when 0-RTT is not possible); each ticket is accepted for 0-RTT once, within 11 s of its real age, never after a HelloRetryRequest (#141)

### Changed
- The server ticket format gained the `ticket_age_add` value; tickets issued by 0.7.8 no longer resume (clients fall back to a full handshake)

## 0.7.13 (2026-10-24)

### Added
- `lib/ws.aklang`: WebSocket (RFC 6455) client and server over any stream, with subprotocols, fragments, ping/pong, close codes and size limits; `(unixl path)` listens on a Unix-domain socket; `c.sha1` in `lib/crypto` for the handshake (#60)

## 0.7.12 (2026-10-24)

### Added
- `lib/httpd.aklang`: an HTTP/1.1 server library (one task per connection, router, keep-alive, chunked request bodies, limits, 400/413/431/500 instead of crashes); `examples/httpd_async.aklang` now uses it (#58)

## 0.7.11 (2026-10-24)

### Added
- `(fdr fd n ms)` returns nil after `ms` milliseconds without data, `(fdw fd s ms)` raises `write timed out`, and `(fdline fd ms)` / `(fdreadn fd n ms)` read a line or exactly n bytes with per-descriptor buffering; `lib/http` and `lib/tls` use `:rms` / `:wms` (default 60 s) so a stalled server cannot hang a client (#57)

## 0.7.10 (2026-10-24)

### Fixed
- `lib/http` parses URLs per RFC 3986: a `#fragment` is no longer sent, `user:pass@` becomes Basic authentication instead of the host, `http://host?x=1` works, schemes are case-insensitive, bracketed IPv6 hosts parse and a bad port is an error (#136)

## 0.7.9 (2026-10-24)

### Fixed
- Socket ports are validated: `tcpl`, `tcpc`, `udpl` and `udpto` raise `invalid port: n` for a value that is not an integer from 0 (1 for `tcpc`/`udpto`) to 65535 instead of using its low 16 bits (#137)

## 0.7.8 (2026-10-23)

The TLS work of #102: TLS 1.2 client, ALPN, client certificates, more key exchange groups, HelloRetryRequest and session resumption.

### Added
- `lib/tls`: TLS 1.3 session resumption on both sides: the server issues stateless tickets (`:tkey` of `t.creds`), the client keeps them (`t.session`) and offers one with `{:session s}`; `cn.resumed` reports it. No tickets when client certificates are required (part of #102)
- `lib/tls`: key exchange on secp256r1 and secp384r1 besides x25519 (TLS 1.3 and 1.2 client, TLS 1.3 server), and HelloRetryRequest on both sides (cookie echo included); `lib/pki` gained `ecdh_pair`, `ecdh` and `curve_by_id` (part of #102)
- `lib/tls` client speaks TLS 1.2 when the server has no TLS 1.3: ECDHE (x25519) with AES-128/256-GCM or ChaCha20-Poly1305, RSA or ECDSA certificates, extended master secret, ALPN and client certificates; the ClientHello also lists secp256r1/secp384r1 so servers accept certificates on those curves (part of #102)
- `lib/tls`: ALPN (`opts.alpn` on the client, `:alpn` in `t.creds`, `cn.alpn` for the result) and client certificates on both sides: `opts.cert`/`opts.key` on `t.connect`, `:clientca` and `:optional` in `t.creds`, `cn.peer` for the verified peer certificate (part of #102)
- `k.check_chain` accepts `nil` as the host to skip the name check (used for client certificates)

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
