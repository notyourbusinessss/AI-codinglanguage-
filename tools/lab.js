'use strict';
// Syntax lab: render the corpus AST under different surface options and measure tokens.
const fs = require('fs'), path = require('path');
const { parse } = require('../ak.js'); const tok = require('./tok.js');
const Sym = class { constructor(n) { this.n = n; } };
// get the real Sym/Kw classes by parsing a sample
const probe = parse('(a :b)', 'p')[0]; const SymC = probe[0].constructor, KwC = probe[1].constructor;
const S = n => new SymC(n);
const isSym = (x, n) => x instanceof SymC && (n === undefined || x.n === n);

const PREC = { '|': 1, '&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '//': 6, '**': 7 };
const WORDS = { '~': 'map', '~?': 'filter', '~/': 'reduce', '#': 'len', '++': 'cat', '..': 'range', '@': 'get', '<@': 'put', '+>': 'append', '<<': 'push', '>>': 'pop', '<-': 'set', '?': 'if', ':': 'do', '=': 'def', '\\': 'fn', 'wh': 'while', 'sw': 'case', '~~': 'flatmap', '@!': 'at', '<@!': 'setat', 'prs': 'items', 'fst': 'first', 'lst': 'last', 'ap': 'apply' };

// ---- rewrites (AST -> AST)
function rw(x, o) {
  if (!Array.isArray(x)) return x;
  let r = x.map(y => rw(y, o)); r.line = x.line;
  if (!(r[0] instanceof SymC)) return r;
  const h = r[0].n;
  if (o.compound && h === '<-' && r.length === 3 && isSym(r[1]) && Array.isArray(r[2]) && isSym(r[2][0]) && ['+', '-', '*', '/', '%'].includes(r[2][0].n) && r[2].length === 3 && isSym(r[2][1], r[1].n))
    return [S(r[2][0].n + '='), r[1], r[2][2]];
  if (o.multiidx && h === '@' && r.length === 3 && Array.isArray(r[1]) && isSym(r[1][0], '@') && r[1].length >= 3) return [S('@'), ...r[1].slice(1), r[2]];
  if (o.multiidx && h === '<@' && r.length === 4 && Array.isArray(r[1]) && isSym(r[1][0], '@')) return [S('<@'), ...r[1].slice(1), r[2], r[3]];
  if (o.forrange && h === 'for' && Array.isArray(r[1]) && r[1].length === 2 && Array.isArray(r[1][1]) && isSym(r[1][1][0], '..') && r[1][1].length <= 3 && isSym(r[1][0]))
    return [r[0], r[1][0], ...r[1][1].slice(1), ...r.slice(2)].map((y, i) => i === 0 ? y : y);
  if (o.lamshort && h === '\\' && Array.isArray(r[1]) && r[1].length === 1 && isSym(r[1][0])) return [r[0], r[1][0], ...r.slice(2)];
  if (o.nodo && h === ':') return r; // placeholder
  return r;
}

// ---- printer
function atom(x, o) {
  if (x === true) return 'T'; if (x === false) return 'F'; if (x === null) return '_';
  if (typeof x === 'number') return String(x); if (typeof x === 'bigint') return x + 'n';
  if (typeof x === 'string') return JSON.stringify(x);
  if (x instanceof KwC) return ':' + x.n;
  if (x instanceof SymC) return o.words && WORDS[x.n] ? WORDS[x.n] : x.n;
  throw new Error('atom ' + x);
}
function pr(x, o, parentPrec = 0, right = false) {
  if (!Array.isArray(x)) return atom(x, o);
  if (!x.length) return '()';
  const h = x[0];
  if (isSym(h, '%list')) return '[' + x.slice(1).map(y => pr(y, o)).join(' ') + ']';
  if (isSym(h, '%map')) return '{' + x.slice(1).map(y => pr(y, o)).join(' ') + '}';
  if (o.infix && isSym(h) && PREC[h.n] && x.length >= 3 && (x.length === 3 || ['+', '*', '&', '|'].includes(h.n))) {
    const p = PREC[h.n]; const sp = o.infixSpace ? ' ' : '';
    const op = h.n;
    let s = x.slice(1).map((y, i) => pr(y, o, p, i > 0)).join(sp + op + sp);
    const need = p < parentPrec || (p === parentPrec && right);
    if (need) return '(' + s + ')';
    return (o.infixSpace && parentPrec === 0 && !o.top) ? '(' + s + ')' : s;
  }
  if (o.infix && isSym(h, '-') && x.length === 2) { const s = '-' + pr(x[1], o, 8); return parentPrec >= 8 ? '(' + s + ')' : s; }
  if (o.infix && isSym(h, '!') && x.length === 2) { const s = '!' + pr(x[1], o, 8); return s; }
  const args = x.slice(1).map(y => pr(y, o, 0));
  return '(' + [atom(h, o), ...args].join(' ') + ')';
}
function render(forms, o) {
  return forms.map(f => pr(rw(f, o), o)).join('\n') + '\n';
}

function load(ext = 'ak') {
  const dir = path.join(__dirname, '..', 'corpus');
  return fs.readdirSync(dir).filter(f => f.endsWith('.' + ext)).sort().map(f => ({ name: f.slice(0, -3), forms: parse(fs.readFileSync(path.join(dir, f), 'utf8'), f) }));
}
module.exports = { render, load, rw, pr, S, SymC, KwC };

if (require.main === module) {
  const progs = load();
  const V = [
    ['baseline (ak v1)', {}],
    ['+words', { words: 1 }],
    ['+compound', { compound: 1 }],
    ['+multiidx', { multiidx: 1 }],
    ['+forrange', { forrange: 1 }],
    ['+lamshort', { lamshort: 1 }],
    ['infix(nospace)', { infix: 1 }],
    ['infix(spaced)', { infix: 1, infixSpace: 1 }],
    ['ALL structural (nospace)', { compound: 1, multiidx: 1, forrange: 1, lamshort: 1, infix: 1 }],
    ['ALL + words', { words: 1, compound: 1, multiidx: 1, forrange: 1, lamshort: 1, infix: 1 }],
  ];
  let base;
  for (const [name, o] of V) {
    const t = progs.reduce((a, p) => a + tok.claude(render(p.forms, o)), 0);
    if (base === undefined) base = t;
    console.log(String(t).padStart(6), (t / base * 100).toFixed(1).padStart(6) + '%', name);
  }
  console.log('python ref:', fs.readdirSync(path.join(__dirname, '..', 'corpus')).filter(f => f.endsWith('.py')).reduce((a, f) => a + tok.claude(fs.readFileSync(path.join(__dirname, '..', 'corpus', f), 'utf8')), 0));
}
