# Language tour

This page walks through the language by example. [`SPEC.md`](../SPEC.md) is the complete one-page reference.

## Two shapes of code
A *statement* is either an S-expression, `(head a b)`, or a *line*, `head a b`; the two mean the same thing. An *expression* is a **tight infix chunk with no spaces inside**: `a+b`, `fib(n-1)+fib(n-2)`, `t[i j]`. Spaces and commas separate elements, so `p a+b c` prints two things. `ak fmt` prints the cheapest layout; write what it prints.

```ak
x=2 y=3
p x+y x*y x**y
p (+ x y)
(p "calls" f(x) (f y))
f n = n*10
```
```output
5 6 8
5
calls 20 30
```
A function may be called before it is defined in the file. Comments start with `;`.

## Values
```ak
p 12 1.5 0xff 1_000 10n "text" :key true false nil
p ty(1) ty("s") ty([1]) ty({:a 1}) ty(nil) ty(x=>x)
p #"héllo" #[1 2 3] #{:a 1}
```
```output
12 1.5 255 1000 10 text key true false nil
num str list map nil fn
6 3 1
```
Numbers are doubles. `10n` is an arbitrary-size integer (`2n**100n` is 1267650600228229401496703205376). `:key` is the string `"key"`. Strings are UTF-8 bytes: `#"héllo"` is 6 because `é` is two bytes (`chr` and `ord` work on code points).

**Truthiness is Python's**: `false nil 0 "" [] {}` are false, everything else true. `??` replaces only `nil`, so it is the right way to write a default: `m[k]??0`. `||` would also replace a real 0.

```ak
m={:seen 0}
p (|| m.seen 5) (?? m.seen 5) (?? m.nope 5)
```
```output
5 0 5
```

## Variables and scope
`=` creates a variable local to the current function, like Python, and never changes an outer one. To rebind an outer variable say so with `<-`. Only `let` makes a block scope. Loop variables are fresh for each iteration, so closures made in a loop capture their own.

```ak
count=0
tick = (<- count count+1)
tick() tick() tick()
p count
fs=[]
(for i 3 (push fs ()=>i))
p (~ f=>f() fs)
(let (a 1 b 2) (p a+b))
```
```output
3
[0 1 2]
3
```
`count+=1` inside `tick` would be a compile error with a hint to use `<-`: silently making a new local would be a trap.

## Lists, maps, and the usual functions
```ak
xs=[5 3 8 1]
p xs[0] xs[-1] xs[1..3] xs[2..] xs[..2] #xs
p (sort xs) (rev xs) (sort x=>-x xs) (sum xs) (max xs) (min 4 9)
p (~ x=>x*x xs)               ; map
p (~? x=>x>2 xs)              ; filter
p (~/ (a b)=>a+b 0 xs)        ; reduce
p (+> xs 9) xs                ; pure append: xs is unchanged
push(xs 9)                    ; in-place append
p xs (has xs 8) (idx xs 8) (zip [1 2] ["a" "b"])
[first ..rest]=xs
p first rest
[a b]=[1 2]
[a b]=[b a]                   ; swap
p a b
```
```output
5 1 [3 8] [8 1] [5 3] 4
[1 3 5 8] [1 8 3 5] [8 5 3 1] 17 8 4
[25 9 64 1]
[5 3 8]
17
[5 3 8 1 9] [5 3 8 1]
[5 3 8 1 9] true 2 [[1 "a"] [2 "b"]]
5 [3 8 1 9]
2 1
```
Out-of-range indexes and missing keys give `nil`, never an error. `a[i j]` is `a[i][j]`.

Maps are written `{:k v}` (keys are expressions, so `{(++ "a" "b") 1}` works). Use `m.k` or `m[k]`; assignment works on both.
```ak
m={:name "ak" :n 1}
m.n+=1
m["tags"]=["a" "b"]
(for [k v] m (p k v))
p (keys m) (vals m) (has m "name") (json m)
p (unjson "{\"a\":[1,2,{\"b\":null}]}")
```
```output
name ak
n 2
tags ["a" "b"]
["name" "n" "tags"] ["ak" 2 ["a" "b"]] true {"name":"ak","n":2,"tags":["a","b"]}
{"a" [1 2 {"b" nil}]}
```
`for` takes a list (elements), a map (`[k v]` pairs), a number `n` (0 to n-1), a range `0..n`, a string (characters) or just a count: `(for 3 body)`. `(sw v 1 "one" [2 3] "few" "many")` is a switch.

## Functions and closures
```ak
add a b=10 = a+b
p add(1) add(1 2)
adder n = x=>x+n
p (adder(5) 1)
sum_all ..xs = (~/ (a b)=>a+b 0 xs)
p sum_all(1 2 3) (sum_all ..[4 5])
depth [x l r] = (? x (+ 1 (max depth(l) depth(r))) 0)   ; patterns in the header
p depth([1 [2 nil nil] [3 [4 nil nil] nil]])
(= (loop n acc) (? n==0 acc (loop n-1 acc+n)))           ; the classic form of the same thing
p (loop 1000000 0)
```
```output
11 3
6
6 9
3
500000500000
```
A lambda is `x=>x*2`, `(a b)=>a+b`, `[a b]=>a` (destructures) or `()=>1`. For several statements use `(\ (x) s1 s2 result)`. The arity of calls to known functions is checked when the program is compiled.

## Strings
```ak
s="  Hello, World  "
p (trim s) (up (trim s)) (lo (trim s)) (split "a,b,c" ",") (join ["x" "y"] "-")
p (starts "foobar" "foo") (ends "foobar" "bar") (rep "banana" "an" "AN") (rpt "ab" 3)
p (++ "n=" 5 true) (fmt "%-6s|%4d|%6.2f|%03b" "ab" 7 3.14159 5)
p (num "3.5") (int 3.9) ($ 42) (padl "7" 3 "0")
p (match "(\\d+)-(\\d+)" "tel 555-1234") (rep "a1b22" (re "\\d+") "#")
```
```output
Hello, World HELLO, WORLD hello, world ["a" "b" "c"] x-y
true true bANANa ababab
n=5true ab    |   7|  3.14|101
3.5 3 42 007
["555-1234" "555" "1234"] a#b#
```
`+` also concatenates (`"a"+1` is `"a1"`), but it is strict about the rest: `nil+1` and `"a"-1` raise errors rather than quietly producing `NaN`. Regular expressions (`re`, `match`, `rep`) are written in Ak itself, with no library underneath.

## Files, processes, environment
```ak
(wr "/tmp/ak-tour.txt" "one\ntwo\n")
(app "/tmp/ak-tour.txt" "three\n")
p (split (trim (rd "/tmp/ak-tour.txt")) "\n")
p (trim (sh "echo $((6*7))"))
(rm "/tmp/ak-tour.txt")
p (?? (env "AK_UNSET_VARIABLE") "not set")
```
```output
["one" "two" "three"]
42
not set
```
`rd` reads a file, `wr` writes (a string or a list of byte values), `app` appends, `ls` lists a directory, `mkdir`, `mv`, `rm`, `isdir`, `ex` tests that a file exists, `sh` runs a shell command and returns its output, `in` reads a line of standard input (`nil` at the end), `inall` reads all of it, `now` is the time in milliseconds, `exit` ends the program.

## Typed arrays and speed
Ordinary lists hold anything. For numeric work use typed arrays: `(u8 n)`, `i32`, `f64` and friends. A sieve of 20 million numbers takes well under a second.
```ak
sieve n =
 s=(u8 n+1)
 c=0
 (for i 2..n+1
  (? !s[i] (: c+=1 j=i*i (wh j<=n s[j]=1 j+=i))))
 c
p sieve(100)
```
```output
25
```
Integer arithmetic is overflow-checked (a few times slower than unchecked in tight loops); `ak --fast` skips the checks.

## Where next
Errors, tests and the REPL: [errors-and-tests.md](errors-and-tests.md). Networking, TLS, windows: [libraries.md](libraries.md).
