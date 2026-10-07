'use strict';
// v1 (legacy) parser, kept only so tools/migrate.js can convert old programs to v2.
const fs = require('fs'), path = require('path');
class Sym { constructor(n) { this.n = n; } }
class Kw { constructor(n) { this.n = n; } }
class CErr extends Error { constructor(m) { super(m); this.name = 'CompileError'; } }

// ================================================================== parser
function unesc(s, file, line) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (m, c) => {
    switch (c[0]) {
      case 'n': return '\n'; case 't': return '\t'; case 'r': return '\r'; case '0': return '\0';
      case 'e': return '\x1b'; case '\\': return '\\'; case '"': return '"'; case "'": return "'";
      case 'u': return c[1] === '{' ? String.fromCodePoint(parseInt(c.slice(2, -1), 16)) : String.fromCharCode(parseInt(c.slice(1), 16));
      case 'x': return String.fromCharCode(parseInt(c.slice(1), 16));
      default: throw new CErr(`${file}:${line}: bad escape \\${c}`);
    }
  });
}

const NUM = /^[+-]?(\d[\d_]*\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
function atom(a) {
  if (a === 'T') return true;
  if (a === 'F') return false;
  if (a === '_') return null;
  if (a.length > 1 && a[0] === ':') return new Kw(a.slice(1));
  if (/^[+-]?\d[\d_]*n$/.test(a)) return BigInt(a.slice(0, -1).replace(/_/g, ''));
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(a)) { const neg = a[0] === '-'; const v = Number(a.replace(/^[+-]/, '')); return neg ? -v : v; }
  if (/^[+-]?0[bB][01]+$/.test(a)) { const neg = a[0] === '-'; const v = parseInt(a.replace(/^[+-]?0[bB]/, ''), 2); return neg ? -v : v; }
  if (NUM.test(a)) return Number(a.replace(/_/g, ''));
  return new Sym(a);
}

function parse(src, file) {
  const toks = []; let i = 0, line = 1; const n = src.length;
  const delim = c => c === '(' || c === ')' || c === '[' || c === ']' || c === '{' || c === '}';
  const ws = c => c === ' ' || c === '\t' || c === '\r' || c === ',';
  if (src.startsWith('#!')) while (i < n && src[i] !== '\n') i++;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (ws(c)) { i++; continue; }
    if (c === ';') { while (i < n && src[i] !== '\n') i++; continue; }
    if (delim(c)) { toks.push({ k: 'p', v: c, line }); i++; continue; }
    if (c === '"') {
      const l0 = line; let j = i + 1;
      while (j < n && src[j] !== '"') { if (src[j] === '\\') j++; if (src[j] === '\n') line++; j++; }
      if (j >= n) throw new CErr(`${file}:${l0}: unterminated string`);
      toks.push({ k: 's', v: unesc(src.slice(i + 1, j), file, l0), line: l0 }); i = j + 1; continue;
    }
    let j = i;
    while (j < n && !ws(src[j]) && src[j] !== '\n' && !delim(src[j]) && src[j] !== '"' && src[j] !== ';') j++;
    toks.push({ k: 'a', v: src.slice(i, j), line }); i = j;
  }
  let pos = 0;
  const close = { '(': ')', '[': ']', '{': '}' };
  function rd() {
    if (pos >= toks.length) throw new CErr(`${file}: unexpected end of input`);
    const t = toks[pos++];
    if (t.k === 's') return t.v;
    if (t.k === 'a') return atom(t.v);
    if (t.v === ')' || t.v === ']' || t.v === '}') throw new CErr(`${file}:${t.line}: unexpected ${t.v}`);
    const cl = close[t.v], xs = [];
    for (;;) {
      if (pos >= toks.length) throw new CErr(`${file}:${t.line}: missing ${cl} for ${t.v}`);
      const u = toks[pos];
      if (u.k === 'p' && (u.v === ')' || u.v === ']' || u.v === '}')) {
        if (u.v !== cl) throw new CErr(`${file}:${u.line}: expected ${cl} but found ${u.v} (opened at line ${t.line})`);
        pos++; break;
      }
      xs.push(rd());
    }
    const r = t.v === '[' ? [new Sym('%list'), ...xs] : t.v === '{' ? [new Sym('%map'), ...xs] : xs;
    r.line = t.line; return r;
  }
  const out = [];
  while (pos < toks.length) out.push(rd());
  return out;
}


module.exports = { parse, Sym, Kw, CErr };
