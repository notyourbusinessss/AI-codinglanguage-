'use strict';
const { parse } = require('../syntax.js');
const { Sym } = require('../ast.js');
const dump = x => x === null ? 'nil' : x === true ? 'true' : x === false ? 'false' : x instanceof Sym ? x.n : typeof x === 'string' ? JSON.stringify(x) : typeof x === 'bigint' ? x + 'n' : Array.isArray(x) ? '(' + x.map(dump).join(' ') + ')' : String(x);
const P = s => parse(s, '<t>').map(dump).join(' ; ');
const OK = [
  // atoms
  ['42', '42'], ['-5', '-5'], ['1.5e3', '1500'], ['0xff', '255'], ['0b101', '5'], ['1_000', '1000'], ['10n', '10n'], ['.5', '0.5'],
  ['true false nil', 'true ; false ; nil'], ['"a\\nb"', '"a\\nb"'], [':ok', '"ok"'], ['x', 'x'],
  // forms
  ['(f a b)', '(f a b)'], ['(f)', '(f)'], ['()', '()'], ['(+ 1 2)', '(+ 1 2)'], ['(~? f xs)', '(~? f xs)'], ['(<@! a i v)', '(<@! a i v)'],
  ['(? c a b)', '(? c a b)'], ['(\\ (x) x)', '(\\ (x) x)'], ['(= (f x) x)', '(= (f x) x)'],
  // infix chunks
  ['a+b', '(+ a b)'], ['a+b*c', '(+ a (* b c))'], ['(a+b)*c', '(* (+ a b) c)'], ['a-b-c', '(- (- a b) c)'], ['a**b**c', '(** a (** b c))'],
  ['!!x', '(! (! x))'], ['!!(f x)', '(! (! (f x)))'], ['--x', '(- (- x))'], ['-(a+b)', '(- (+ a b))'], ['!(a||b)', '(! (|| a b))'], ['~~x', '(bnot (bnot x))'],
  ['-x', '(- x)'], ['-x*y', '(* (- x) y)'], ['-2**2', '(- (** 2 2))'], ['!a&&b', '(&& (! a) b)'], ['a||b&&c', '(|| a (&& b c))'],
  ['n%i==0', '(== (% n i) 0)'], ['i*i<=n', '(<= (* i i) n)'], ['a//b', '(// a b)'], ['a<<2', '(<< a 2)'], ['a>>>1', '(>>> a 1)'],
  ['a&b|c^d', '(| (& a b) (^ c d))'], ['n&n-1==0', '(== (& n (- n 1)) 0)'], ['a|b==c', '(== (| a b) c)'], ['x^y<<1', '(^ x (<< y 1))'], ['a<b==c', '(%cmp a "<" b "==" c)'], ['(a<b)<c', '(< (< a b) c)'], ['a==(b==c)', '(== a (== b c))'], ['~x', '(bnot x)'], ['#xs', '(# xs)'], ['#xs+1', '(+ (# xs) 1)'], ['#xs[0]', '(# (@ xs 0))'],
  ['0<=x<n', '(%cmp 0 "<=" x "<" n)'], ['1<=x==y', '(%cmp 1 "<=" x "==" y)'], ['a<b', '(< a b)'], ['a==b', '(== a b)'], ['a!=b', '(!= a b)'], ['a==-1', '(== a -1)'], ['x*-1', '(* x -1)'],
  // calls, index, field
  ['f(x)', '(f x)'], ['f(a b)', '(f a b)'], ['f(a,b)', '(f a b)'], ['fib(n-1)+fib(n-2)', '(+ (fib (- n 1)) (fib (- n 2)))'],
  ['f(x)(y)', '((f x) y)'], ['p()', '(p)'],
  ['a[0]', '(@ a 0)'], ['a[i][j]', '(@ (@ a i) j)'], ['a[i j]', '(@ (@ a i) j)'], ['a[i+1]', '(@ a (+ i 1))'], ['a[-1]', '(@ a -1)'],
  ['a[1..3]', '(@ a 1 3)'], ['a[1..]', '(@ a 1 nil)'], ['a[..3]', '(@ a nil 3)'], ['a[..n-1]', '(@ a nil (- n 1))'], ['a[..#a-1]', '(@ a nil (- (# a) 1))'], ['a[i+1..#a-1]', '(@ a (+ i 1) (- (# a) 1))'], ['[..xs+ys]', '(%list (+ (%spread xs) ys))'], ['a[i+1..#a]', '(@ a (+ i 1) (# a))'],
  ['m.k', '(.@ m "k")'], ['m.a.b', '(.@ (.@ m "a") "b")'], ['s.toUpperCase()', '(. s "toUpperCase")'], ['Math.max(1 2)', '(. Math "max" 1 2)'], ['xs.length', '(.@ xs "length")'],
  ['f(x).y', '(.@ (f x) "y")'], ['a[0].b', '(.@ (@ a 0) "b")'], ['m[:k]', '(@ m "k")'],
  // assignment
  ['x=5', '(= x 5)'], ['x=y=0', '(= x (= y 0))'], ['x+=1', '(+= x 1)'], ['x-=a*2', '(-= x (* a 2))'], ['x||=[]', '(||= x (%list))'], ['a??b', '(?? a b)'], ['m[k]??=0', '(??= (@ m k) 0)'], ['a??b??c', '(?? (?? a b) c)'],
  ['a[i]=v', '(<@ a i v)'], ['a[i j]=v', '(<@ (@ a i) j v)'], ['o.k=v', '(.= o "k" v)'], ['a[i]+=1', '(+= (@ a i) 1)'], ['[a b]=[b a]', '(= (%list a b) (%list b a))'],
  ['x=f(y)+1', '(= x (+ (f y) 1))'],
  // lambda
  ['x=>x*2', '(\\ (x) (* x 2))'], ['(a b)=>a+b', '(\\ (a b) (+ a b))'], ['()=>1', '(\\ () 1)'], ['f=x=>y=>x+y', '(= f (\\ (x) (\\ (y) (+ x y))))'],
  ['[a b]=>a', '(\\ ((%list a b)) a)'], ['(a b=1 ..r)=>a', '(\\ (a (= b 1) (%spread r)) a)'], ['(~ x=>x*x xs)', '(~ (\\ (x) (* x x)) xs)'], ['x=>(f x)', '(\\ (x) (f x))'],
  // literals / spread / ranges
  ['[1 2 3]', '(%list 1 2 3)'], ['[1,2,3]', '(%list 1 2 3)'], ['[]', '(%list)'], ['{}', '(%map)'], ['{"a" 1 :b 2}', '(%map "a" 1 "b" 2)'], ['[..xs 1]', '(%list (%spread xs) 1)'], ['(p ..xs)', '(p (%spread xs))'],
  ['0..n', '(.. 0 n)'], ['1..n+1', '(.. 1 (+ n 1))'], ['(.. 1 5)', '(.. 1 5)'], ['(for i 0..n (p i))', '(for i (.. 0 n) (p i))'],
  // operator symbols as values
  ['(~/ + 0 xs)', '(~/ + 0 xs)'], ['(~ - xs)', '(~ - xs)'], ['(sort - xs)', '(sort - xs)'],
  // comments / commas / whitespace
  ['; hi\n(f 1) ; trailing\n(g 2)', '(f 1) ; (g 2)'], ['(f 1,2)', '(f 1 2)'],
  ['#!/usr/bin/env ak\n(p 1)', '(p 1)'],
  ['(= x 1)\n(p x)', '(= x 1) ; (p x)'],
];
const ERR = [
  ['(f a', "missing ')'"], ['(f a]', "expected ')' but found ']'"], [')', "unexpected ')'"], ['a+ b', 'dangling operator'], ['a +b', ''], ['a+', 'dangling operator'],
  ['"abc', 'unterminated string'], ['x=', ''], ['1=2', 'invalid assignment'], ['{"a"}', 'key/value'], ['a[]', 'empty index'], ['+(f x)', "operator '+' must be followed by a space"],
  ['(x)=>', ''], ['a"b"', 'unexpected'], ['"\\q"', 'bad escape'], ['f(a b', "missing ')'"],
];
let bad = 0, n = 0;
for (const [src, want] of OK) { n++; let got; try { got = P(src); } catch (e) { got = 'ERR ' + e.message; } if (got !== want) { bad++; console.log('FAIL', JSON.stringify(src), '\n   got ', got, '\n   want', want); } }
for (const [src, frag] of ERR) { n++; let got; try { got = 'NOERR ' + P(src); } catch (e) { got = e.message; } if (!got.includes(frag) || got.startsWith('NOERR')) { bad++; console.log('FAIL (error expected)', JSON.stringify(src), '->', got, 'wanted', JSON.stringify(frag)); } }
console.log(`syntax: ${n - bad}/${n} passed`); process.exit(bad ? 1 : 0);
