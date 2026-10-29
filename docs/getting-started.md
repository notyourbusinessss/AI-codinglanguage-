# Getting started

## Install
Ak is one static executable for x86-64 Linux, with no libc. There is nothing else to install.
```
git clone https://github.com/notyourbusinessss/AI-codinglanguage-.git
cd AI-codinglanguage-
./bin/ak -e '(p 1+2)'
```
That prints `3`. To run it from anywhere, put `bin/ak` on your `PATH`:
```
sudo install -m 755 bin/ak /usr/local/bin/ak       # for everyone
install -D -m 755 bin/ak ~/.local/bin/ak           # just for you
```
On Windows use WSL2; on macOS or ARM use a Linux x86-64 VM or container. To update, `git pull`.

## Your first program
Source files end in `.aklang`. Save this as `hello.aklang`:

```ak
name=(?? (fst (args)) "world")
p "hello" name
```
Run it with `ak hello.aklang`, with an argument as `ak hello.aklang Max`. Here `p` prints its arguments separated by a space, `args` is the list of command-line arguments, `fst` takes the first element (`nil` for an empty list), and `??` supplies the default when the left side is `nil`.

A longer one, with a function. Numbers are doubles, so integers are exact up to 2^53 and larger results raise an error instead of silently losing digits (use BigInt, `10n`, beyond that):

```ak
fib n a=0 b=1 =
 (? n==0 a fib(n-1 b a+b))
p ..(~ i=>fib(i) 0..10)
p fib(60)
p (try fib(90) e=>e)
```
```output
0 1 1 2 3 5 8 13 21 34
1548008755920
integer overflow: exceeds 2^53 (use BigInt, e.g. 10n)
```
`f a b =` followed by indented lines defines a function (the last expression is returned, `b=0` is a default), `(? c a b)` is if/else, and `..xs` spreads a list into arguments. The self-call in tail position becomes a loop, so `fib` can recurse as deep as it likes.

## The `ak` command
```
ak prog.aklang [args]        compile in memory and run (about 7 ms for a small program)
ak -e '(p 1+2)'              run a snippet
ak build prog.aklang out     write a standalone native executable (runs anywhere on x86-64 Linux, Ak not needed)
ak check prog.aklang         parse and resolve only: undefined names, wrong arity of direct calls
ak fmt prog.aklang           print the program in canonical (cheapest) layout; comments are dropped
ak test [paths]              run every *.test.aklang under the paths
ak repl                      interactive prompt
ak --version
```
Errors from the compiler look like `file:line:col: message`. A runtime error prints `error: message (file:line:col)`, then one `called from` line per caller, and exits with status 1. Exit codes of your own come from `(exit n)`.

`(use "other.aklang")` includes another file, relative to the file that says so, and `(use "other.aklang" as o)` includes it under a namespace (`o.name`), which is what the libraries use. `(embed "file")` puts a file's contents into the program as a string at compile time, so a built executable can carry its data.

## Where to go next
- [Language tour](language-tour.md) for the whole language by example.
- [Libraries](libraries.md) for networking, TLS, windows and the rest of what ships in `lib/`.
- `examples/` for complete programs: `tictactoe.aklang` (a game against a minimax computer), `httpd.aklang` (a web server), `connect4gui.aklang` (a game in its own window).
- Run `npm test` in a checkout to check everything, or `bin/ak test tests/docs.test.aklang` to check just these pages.
