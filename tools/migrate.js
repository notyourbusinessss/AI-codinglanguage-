#!/usr/bin/env node
'use strict';
// v1 -> v2 migration: parse with the legacy parser, rewrite the AST to v2 forms, print with fmt.js
const fs = require('fs');
const P1 = require('../v1/parse1.js'); const { S, Sym } = require('../ast.js'); const { fmt } = require('../fmt.js');

const isS1 = (x, n) => x instanceof P1.Sym && (n === undefined || x.n === n);
const HEAD = { '&': '&&', '|': '||', '<<': 'push', '>>': 'pop', band: '&', bor: '|', bxor: '^', shl: '<<', shr: '>>', ushr: '>>>' };
const ARITH = new Set(['+', '-', '*', '/', '%']);

function dotted(name) {   // 'a.b.c' -> (.@ (.@ a "b") "c")
  const parts = name.split('.'); let e = S(parts[0]);
  for (const p of parts.slice(1)) e = [S('.@'), e, p];
  return e;
}
const isDotted = n => n.includes('.') && !n.startsWith('.') && !n.endsWith('.') && !n.includes('..') && !/^\d/.test(n);

function params(list) {
  if (!Array.isArray(list)) return list;
  const out = [], n = list.length;
  for (let i = 0; i < n; i++) {
    if (isS1(list[i], '..') && i + 1 < n) { out.push([S('%spread'), conv(list[i + 1])]); i++; } else out.push(conv(list[i]));
  }
  return out;
}

// v1 allowed names like `prime?` and `sum-all`; v2 identifiers are [A-Za-z0-9_$]
function rename(n) {
  if (/^[A-Za-z_$][\w$?!-]*$/.test(n) && /[?!-]/.test(n)) {
    let r = n.replace(/-/g, '_');
    if (r.endsWith('?')) r = 'is_' + r.slice(0, -1);
    return r.replace(/[?!]/g, '_');
  }
  return n;
}
function conv(x) {
  if (x instanceof P1.Kw) return x.n;
  if (x instanceof P1.Sym) { if (isDotted(x.n)) return dotted(x.n); return S(HEAD[x.n] || rename(x.n)); }
  if (!Array.isArray(x)) return x;
  if (!x.length) return [];
  const h = x[0];
  if (isS1(h)) {
    const n = h.n, a = x.slice(1);
    if (n === '<-') {
      const t = a[0], v = conv(a[1]);
      if (isS1(t) && Array.isArray(a[1]) && isS1(a[1][0]) && ARITH.has(a[1][0].n) && a[1].length === 3 && isS1(a[1][1], t.n))
        return [S(a[1][0].n + '='), conv(t), conv(a[1][2])];
      if (Array.isArray(t) && isS1(t[0], '@') && t.length === 3) return [S('<@'), conv(t[1]), conv(t[2]), v];
      return [S('='), conv(t), v];
    }
    if (n === '|' && a.length === 2 && Array.isArray(a[0]) && isS1(a[0][0], '@')) return [S('??'), ...a.map(conv)];   // map-lookup default idiom
    if (n === 'for') {
      const hd = a[0];
      const body = a.slice(1).map(conv);
      if (hd.length === 2) return [S('for'), conv(hd[0]), conv(hd[1]), ...body];
      return [S('for'), [S('%list'), conv(hd[0]), conv(hd[1])], conv(hd[2]), ...body];
    }
    if (n === '\\') return [S('\\'), params(a[0]), ...a.slice(1).map(conv)];
    if (n === '=' && Array.isArray(a[0])) return [S('='), params(a[0].map(y => y)).map((y, i) => i === 0 ? conv(a[0][0]) : y), ...a.slice(1).map(conv)];
    if (n === 'let') return [S('let'), a[0].map(conv), ...a.slice(1).map(conv)];
    if (n === 'q') return x.map(conv);
    // dotted call head: (Math.max 1 2) -> (. Math "max" 1 2)
    if (isDotted(n)) {
      const parts = n.split('.'); let obj = S(parts[0]);
      for (const p of parts.slice(1, -1)) obj = [S('.@'), obj, p];
      return [S('.'), obj, parts[parts.length - 1], ...a.map(conv)];
    }
    return [S(HEAD[n] || rename(n)), ...a.map(conv)];
  }
  return x.map(conv);
}

function loadV1(file) { return P1.parse(fs.readFileSync(file, 'utf8'), file).map(conv); }
module.exports = { loadV1, conv };

if (require.main === module) {
  const [file, layout] = process.argv.slice(2);
  process.stdout.write(fmt(loadV1(file), { layout: layout || 'lines' }));
}
