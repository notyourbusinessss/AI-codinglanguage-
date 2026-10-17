# Libraries and native features

Everything here is native-only (Linux x86-64) unless it says "both targets", and written in Ak itself: the runtime in `rt/` is always available, the libraries in `lib/` are included with `(use ..)`. Programs that `use` a library with `as name` get its functions as `name.fn`; two libraries can never clash. Paths in `use` are relative to the file that contains them; the examples below are written for a file in the repository root.

| you want | use |
|---|---|
| a function that can pause and continue | [coroutines](#coroutines) (built in) |
| many things happening at once without threads | [`lib/async.aklang`](#tasks-and-channels-libasyncaklang) |
| TCP, UDP, DNS | [sockets](#sockets-dns-udp) (built in) |
| fetch a web page, call an API | [`lib/http.aklang`](#http-client-libhttpaklang) |
| hashes, encryption, random bytes | [`lib/crypto.aklang`](#cryptography-libcryptoaklang) |
| read certificates, verify signatures | [`lib/pki.aklang`](#certificates-libpkiaklang) |
| a TLS connection | [`lib/tls.aklang`](#tls-libtlsaklang) |
| a window, drawing, mouse and keyboard | [`lib/x11.aklang` + `lib/canvas.aklang`](#windows-and-drawing) |
| a terminal UI | [terminal](#terminal) (built in) |
| file names: join, split, extension | [`lib/path.aklang`](#file-paths-libpathaklang) (both targets) |
| dates and times, ISO 8601, durations | [`lib/time.aklang`](#dates-and-times-libtimeaklang) (both targets) |
| `--flags` and `--option value` | [`lib/cli.aklang`](#command-line-options-libcliaklang) (both targets) |

## Coroutines
A coroutine is a function with its own stack, so it can stop from any depth (inside loops and calls, not just at the top) and be continued later. `(co f)` makes one, `(resume c v)` runs it until it `yield`s, `(alive c)` says whether it has finished, `(drain c)` collects everything it yields.
```ak
walk t = (? t (: walk(t[0]) (yield t[1]) walk(t[2])))     ; in-order walk of [left value right] trees
tree=[[nil 1 nil] 2 [[nil 3 nil] 4 nil]]
p (drain (co ()=>walk(tree)))

c=(co n=>(: (yield n) (yield n*2) "done"))
p (resume c 5) (resume c nil) (resume c nil) (alive c)
```
```output
[1 2 3 4]
5 10 done false
```
The argument of the first `resume` becomes the argument of the function; the argument of later ones is what `yield` returns inside. An error that is not caught inside the coroutine ends it and is thrown again by the `resume`, with its kind and data. Tens of thousands of coroutines can be alive at once (each has 8 MB of address space, used only as touched).

## Tasks and channels: `lib/async.aklang`
Cooperative tasks on top of coroutines: code that looks blocking but lets other tasks run while it waits. `a.spawn f args..` starts a task, `a.sleep ms` waits, `a.pause()` lets the others run, `a.wait fd` waits until a socket is readable, `a.chan()` makes a channel (`a.send`, `a.recv`, `a.close`), and `a.run()` runs everything until no task can progress.
```ak
(use "lib/async.aklang" as a)
ch=a.chan()
(a.spawn ()=>(: (for i 3 (a.send ch i*i) (a.sleep 10)) (a.close ch)))      ; producer
(a.spawn ()=>(: v=(a.recv ch) (wh v!=nil (p "got" v) v=(a.recv ch))))      ; consumer: recv gives nil once closed and empty
(a.spawn n=>(: (a.sleep n) (p "slept" n)) 60)
a.run()
```
```output
got 0
got 1
got 4
slept 60
```
(The producer sleeps 10 ms between sends, so all three values arrive well before the 60 ms sleeper wakes.)

A server is one task per connection, each written as plain sequential code. This program is a server and 20 clients in one process:
```ak
(use "lib/async.aklang" as a)
l=(tcpl 0 "127.0.0.1")
port=(tcpp l)
handle fd =
 (a.wait fd)
 (fdw fd (up (fdr fd)))
 (fdc fd)
(a.spawn ()=>(for 20 (a.wait l) (a.spawn handle (tcpa l))))
replies=[]
client i =
 c=(tcpc "127.0.0.1" port)
 (fdw c (++ "hello " i))
 (a.wait c)
 (push replies (fdr c))
 (fdc c)
(for i 20 (a.spawn client i))
a.run()
p #replies (has replies "HELLO 7")
(fdc l)
```
```output
20 true
```
A task that throws prints `task error: msg` and ends; the others continue.

## Sockets, DNS, UDP
Built in, no `use` needed. Descriptors are plain numbers.

| call | meaning |
|---|---|
| `(tcpl port host="0.0.0.0")` | listen; port 0 picks a free one, `(tcpp fd)` tells which |
| `(tcpa fd)` | accept a connection |
| `(tcpc host port ms=nil)` | connect; `host` may be an IPv4 address, `localhost`, a name in `/etc/hosts`, or any name DNS resolves |
| `(fdr fd n=65536)` | read up to n bytes; `""` means the other side closed |
| `(fdw fd s)` | write all of `s` (a string, byte list or `u8`) |
| `(fdc fd)` | close |
| `(fdwait [fd ..] ms)` | the readable descriptors among them (`ms` < 0 waits forever) |
| `(dns name)` | the IPv4 addresses of a name, as dotted strings |
| `(udp)`, `(udpto fd ip port s)`, `(udpfrom fd n ms)` | UDP sockets |

```ak
l=(tcpl 0 "127.0.0.1")
c=(tcpc "127.0.0.1" (tcpp l))
s=(tcpa l)
(fdw c "ping")
p (fdr s)
(fdw s "pong")
p (fdr c)
p (dns "localhost")
u=(udp)
(udpto u "127.0.0.1" 9 "nobody is listening")
p (udpfrom u 100 50)
```
```output
ping
pong
["127.0.0.1"]
nil
```
DNS asks the nameservers in `/etc/resolv.conf` over UDP (set `AK_DNS=ip[:port]` to use another). `examples/httpd.aklang` is a small web server using `fdwait`.

## HTTP client: `lib/http.aklang`
`http://` and `https://` (TLS 1.3, certificate verified against the system CA bundle). Redirects are followed, and content-length, chunked and read-until-close bodies work. The result is `{:status :headers :body}` with lower-case header names.
```ak no-run
(use "lib/http.aklang" as h)
r=(h.get "https://example.com/")
p r.status r.headers["content-type"] #r.body

r=(h.post "http://localhost:8080/echo" "hello" {"content-type" "text/plain"})
p r.status r.body

r=(try (h.get "https://expired.badssl.com/") e=>(++ "failed: " e))   ; certificate errors raise kind "io"
```
`(h.req method url body headers opts)` is the general form; `opts` is `{:roots certs :ms connect-timeout}`; header names with a dash are written as strings: `{"content-type" "text/plain"}`.

## Cryptography: `lib/crypto.aklang`
Written in Ak, checked against Node's `crypto` on random inputs. Byte data is a string going in and coming out; `c.hex` and `c.unhex` convert to and from hex.
```ak
(use "lib/crypto.aklang" as c)
p (c.hex (c.sha256 "abc"))
p (c.hex (c.hmac "sha256" "key" "msg"))
key=(c.random 32) nonce=(c.random 12)
sealed=(c.chacha_seal key nonce "header" "attack at dawn")
p #sealed (c.chacha_open key nonce "header" sealed) (c.chacha_open key nonce "other" sealed)
pub=(c.x25519_base (c.random 32))
p #pub
```
```output
ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
2d93cbc1be167bcb1637a4a23cbff01a7878f0c50ee833954ea5221bb1b8c628
30 attack at dawn nil
32
```
Available: `sha256 sha384`, `hmac`, `hkdf_extract hkdf_expand`, `chacha_seal/open` (ChaCha20-Poly1305), `aes_gcm_seal/open` (16 or 32 byte keys), `x25519`, `random`. The `open` functions return `nil` when the authentication tag does not match, and an empty message is `""`, so test the result with `nil`, not truthiness.

The code is **not constant-time**: it is fine for protocols over a network, not a defence against a local attacker timing the process.

## Certificates: `lib/pki.aklang`
X.509 parsing, signature verification (RSA PKCS#1 v1.5 and PSS, ECDSA P-256/P-384 with SHA-256/384) and chain checking. Used by the TLS client, and usable on its own.
```ak no-run
(use "lib/pki.aklang" as k)
roots=(k.trust_roots)                              ; the system CA bundle (SSL_CERT_FILE overrides)
ders=(k.pem_certs (rd "chain.pem"))                 ; leaf first, then the intermediates
leaf=(k.check_chain ders "example.com" roots (flr (/ (now) 1000)))   ; raises "certificate: why" when it does not verify
p leaf.subject leaf.san leaf.na
```
`check_chain` verifies signatures up to a root, validity dates, the CA flag and keyCertSign, and the host name against subjectAltName (the CN is ignored). It does **not** check revocation, name constraints or path length, and rejects SHA-1 and SHA-512 signatures. See [`SPEC-extra.md`](../SPEC-extra.md) for the exact signatures.

## TLS: `lib/tls.aklang`
A TLS 1.3 client. It always verifies the certificate chain and the host name, and there is deliberately no switch to turn that off.
```ak no-run
(use "lib/tls.aklang" as t)
cn=(t.connect "example.com" 443 {:ms 5000})
(t.write cn "GET / HTTP/1.0\r\nHost: example.com\r\n\r\n")
d=(t.read cn)
p d[..15]
(t.close cn)
```
`t.read` returns `""` at the end of the stream; `t.fd cn` gives the descriptor for `fdwait`. Failures raise `tls: ...`. Supported: x25519, the three TLS 1.3 cipher suites (AES-128-GCM, AES-256-GCM, ChaCha20-Poly1305), RSA-PSS and ECDSA server signatures, KeyUpdate. Not supported: TLS 1.2 and older, client certificates, resumption, 0-RTT, ALPN, a server side. It is tested against Node's TLS server and OpenSSL, not yet against public servers, so treat it as young code.

## Windows and drawing
Ak speaks the X11 protocol itself (`lib/x11.aklang`) and draws in software (`lib/canvas.aklang`): no GUI library, no browser. It needs a Linux X11 or XWayland display of depth 24; windows have a fixed size and text is ASCII.
```ak no-run
(use "lib/x11.aklang")                       ; includes the canvas as well
cv=(canvas 320 200)
(fill cv (rgb 30 30 40))
(circle cv 160 100 60 (rgb 240 180 40))
(text cv 110 96 "Ak" 34 (rgb 20 20 20))
w=(gui_open "hello" 320 200)
(gui_present w cv)
ev=(gui_event w)
(wh ev.type!="close"
  (? ev.type=="mouse" ev.down (: (rect cv ev.x ev.y 8 8 (rgb 255 255 255)) (gui_present w cv)))
  ev=(gui_event w))
(gui_close w)
```
`(gui_event w ms)` returns the next key, mouse, motion, wheel or close event as a map, or `nil` after `ms` milliseconds; with no `ms` it sleeps until an event comes, using no CPU. A headless check is possible too: `(gui_snapshot w)` returns what the window really shows, and `(save_ppm cv "out.ppm")` writes a canvas to a file. The full drawing API is in [`SPEC-extra.md`](../SPEC-extra.md); `examples/connect4gui.aklang` is a complete game in about 125 lines.

![Connect Four in an Ak window](connect4gui-start.png)

## Terminal
`(isatty)`, `(termsize)` → `[rows cols]`, `(rawmode f)` runs `f` with the terminal in raw mode and always restores it, `(getkey ms)` returns `"up" "down" "left" "right" "enter" "esc" "tab" "backspace" "ctrl-c"` or the typed character. Draw with ANSI escape sequences written by `(fdw 1 s)`, one write per frame. `examples/connect4.aklang` is a complete terminal game with colour and animation.

## File paths: `lib/path.aklang`
POSIX path helpers that give the same results as Node's `path.posix` (both targets). They only work on strings and never touch the disk, except `abs`, which asks for the current directory.
```ak
(use "lib/path.aklang" as path)
p path.join("a" "b/../c") path.norm("/a//b/./c/..") path.dir("/a/b.txt") path.base("/a/b.txt") path.base("/a/b.txt" ".txt")
p path.ext("archive.tar.gz") path.ext(".bashrc") path.isabs("/x") path.rel("/a/b" "/a/c") path.abs("/x/./y/../z/")
p path.join()
```
```output
a/c /a/b /a b.txt b
.gz  true ../c /x/z
.
```
`(path.join)` without parentheses around the call is the function itself; call it with no arguments as `path.join()`.

## Dates and times: `lib/time.aklang`
UTC only, seconds since 1970 (`now` is in milliseconds: `(t.iso (now)/1000)`), proleptic Gregorian calendar (both targets). `civil` splits a time into `{:y :mo :d :h :mi :s :ms :wd :yd}` (`wd` 0 is Sunday, `yd` is the day of the year), `epoch` goes back, `iso` and `parse` read and write ISO 8601 (`2023-11-14T22:13:20Z`, also a date alone, a space instead of `T`, fractions, `Z`, `+hh:mm`), `fmtdur` and `pardur` convert durations like `1h2m3s`. Bad input raises `bad time: ...`. Local time zones are not supported.
```ak
(use "lib/time.aklang" as t)
c=(t.civil 1700000000)
p c.y c.mo c.d c.h c.wd c.yd
p (t.iso 1700000000) (t.iso 1700000000.25)
p (t.parse "2023-11-14T23:13:20+01:00") (t.epoch 2023 11 14 22 13 20)
p (t.fmtdur 90061) (t.pardur "1d2h") (try (t.parse "yesterday") e=>e)
```
```output
2023 11 14 22 2 318
2023-11-14T22:13:20Z 2023-11-14T22:13:20.250Z
1700000000 1700000000
1d1h1m1s 93600 bad time: "yesterday"
```

## Command-line options: `lib/cli.aklang`
Flags, options with values, positional arguments and a generated `--help` (both targets). A spec is a list of `[short long kind help default]` (`kind` is `"flag"` or `"value"`; `short` may be `nil`). `(cli.parse spec (args))` returns `{:opts .. :args ..}`. Accepted forms: `--long`, `--long=value`, `--long value`, `-s`, `-svalue`, `-s value`, bundled flags `-vq`, `--` to end the options, `-` as a positional. A mistake raises an error of kind `"usage"`, so a program can print the message and the help.
```ak
(use "lib/cli.aklang" as cli)
spec=[["v" "verbose" "flag" "print more"] ["o" "out" "value" "output file" "a.out"]]
r=(cli.parse spec ["-v" "in.txt" "--out=x.bin" "more"])
p r.opts.verbose r.opts.out r.args
r=(try (cli.parse spec ["--nope"]) e=>(++ (errkind e) ": " e))
p r
pr (cli.help "tool" spec)
```
```output
true x.bin ["in.txt" "more"]
usage: unknown option --nope
usage: tool [options] [args]
  -v, --verbose           print more
  -o, --out VALUE         output file (default a.out)
  -h, --help              show this help
```
`-h` and `--help` are implicit: `r.opts.help` is true. A negative number looks like an option; write it after `--`.
