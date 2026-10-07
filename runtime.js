'use strict';
// Ak runtime: builtins (B), compiler helpers (H), launcher. See SPEC.md.
const fs = require('fs'), path = require('path');
const { StringDecoder } = require('string_decoder');
const WT = require('worker_threads');

class AkError extends Error { constructor(m) { super(m); this.name = 'AkError'; } }

// ---------------------------------------------------------------- core helpers
// Python-style truthiness: false nil 0 0n NaN "" [] {} are falsy
function tr(x) {
  if (!x) return false;
  if (typeof x === 'object') {
    if (Array.isArray(x)) return x.length > 0;
    if (x instanceof Map) return x.size > 0;
    if (ArrayBuffer.isView(x)) return x.length > 0;
  }
  return true;
}

function eq(a, b) {
  if (a === b) return true;
  if (a == null) return b == null;
  if (b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !eq(v, b.get(k))) return false;
    return true;
  }
  if (ArrayBuffer.isView(a)) {
    if (!ArrayBuffer.isView(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return false;
}

function demangle(s) {
  return s.replace(/^\$/, '').replace(/__|_([0-9a-f]+)_/g, (m, h) => h ? String.fromCharCode(parseInt(h, 16)) : '_');
}

function fmtNum(x) { return Object.is(x, -0) ? '0' : String(x); }

function show(x) {
  if (x == null) return 'nil';
  switch (typeof x) {
    case 'boolean': return x ? 'true' : 'false';
    case 'number': return fmtNum(x);
    case 'bigint': return x + 'n';
    case 'string': return JSON.stringify(x);
    case 'function': return '<fn ' + (demangle(x.name || '') || '\\') + '>';
  }
  if (Array.isArray(x) || ArrayBuffer.isView(x)) return '[' + Array.from(x, show).join(' ') + ']';
  if (x instanceof Map) { const o = []; for (const [k, v] of x) o.push(show(k) + ' ' + show(v)); return '{' + o.join(' ') + '}'; }
  if (x instanceof Promise) return '<promise>';
  if (x instanceof Error) return '<error ' + x.message + '>';
  return require('util').inspect(x, { depth: 4, breakLength: Infinity });
}
const tostr = x => typeof x === 'string' ? x : typeof x === 'bigint' ? String(x) : show(x);

function msg(e) {
  if (e instanceof AkError) return e.message;
  if (e instanceof Error) return e.name + ': ' + e.message;
  return tostr(e);
}

function fn(f) {
  if (typeof f === 'function') return f;
  if (Array.isArray(f) || f instanceof Map || typeof f === 'string' || ArrayBuffer.isView(f)) return i => at(f, i);
  throw new AkError('not callable: ' + show(f));
}

function at(c, i, j) {
  if (c == null) return null;
  if (Array.isArray(c) || ArrayBuffer.isView(c) || typeof c === 'string') {
    if (arguments.length > 2) return j == null ? c.slice(i) : c.slice(i, j);
    if (typeof i !== 'number') throw new AkError('@: index must be a number, got ' + show(i));
    if (i < 0) i += c.length;
    const v = c[i];
    return v === undefined ? null : v;
  }
  if (c instanceof Map) { const v = c.get(i); return v === undefined ? null : v; }
  const v = c[i];
  return v === undefined ? null : v;
}

function put(c, k, v) {
  if (c instanceof Map) c.set(k, v);
  else {
    if (typeof k === 'number' && k < 0) k += c.length;
    c[k] = v;
  }
  return v;
}

function len(c) {
  if (c == null) return 0;
  if (typeof c === 'number' || typeof c === 'boolean' || typeof c === 'function') throw new AkError('len of ' + tyOf(c));
  if (c.length !== undefined) return c.length;
  if (c instanceof Map || c instanceof Set) return c.size;
  return Object.keys(c).length;
}

function it(c) {
  if (Array.isArray(c) || typeof c === 'string' || ArrayBuffer.isView(c)) return c;
  if (c instanceof Map) return Array.from(c);          // maps iterate as [key, value] entries
  if (c == null) return [];
  if (typeof c[Symbol.iterator] === 'function') return Array.from(c);
  return Object.entries(c);
}
// destructuring source: array-like -> array
const toArr = c => Array.isArray(c) ? c : (c == null ? [] : Array.from(it(c)));
// field access: maps look up the key (string); everything else is a JS property
function dot(o, k) {
  if (o == null) return null;
  if (o instanceof Map) { const v = o.get(k); if (v !== undefined) return v; const p = o[k]; return typeof p === 'function' ? p.bind(o) : (p === undefined ? null : p); }
  const v = o[k]; return v === undefined ? null : v;
}
function setdot(o, k, v) { if (o instanceof Map) o.set(k, v); else o[k] = v; return v; }
// polymorphic +: numbers add, strings concat (other side stringified), lists concat
function add(a, b) { return (typeof a === 'number' && typeof b === 'number') ? a + b : slowAdd(a, b); }
function slowAdd(a, b) {
  const ta = typeof a, tb = typeof b;
  if (ta === 'string') return a + tostr(b);
  if (tb === 'string') return tostr(a) + b;
  if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
  if ((ta === 'number' || ta === 'bigint' || ta === 'boolean') && (tb === 'number' || tb === 'boolean') && ta !== 'bigint') return a + b;
  if (ta === 'bigint' && tb === 'bigint') return a + b;
  throw new AkError('cannot add ' + tyOf(a) + ' and ' + tyOf(b));
}

// strict arithmetic: operands must be numbers (or bigints); nil/strings/lists never silently coerce
function bad(x) { throw new AkError('expected number, got ' + tyOf(x)); }
const n = x => (typeof x === 'number' || typeof x === 'bigint' || typeof x === 'boolean') ? x : bad(x);   // booleans count as 0/1 (like Python)
// integer overflow detection: doubles are exact integers only up to 2^53. A result beyond that whose operands were
// exact integers is a silent-corruption hazard (Python would be exact), so it throws; genuine float math is untouched.
const MAXI = 9007199254740992;
function over(r, a, b, op) {
  if (Number.isSafeInteger(a) && Number.isSafeInteger(b)) throw new AkError('integer overflow: ' + op + ' exceeds 2^53 (use BigInt, e.g. 10n)');
  return r;
}
function ckadd(a, b) {
  if (typeof a === 'number' && typeof b === 'number') { const r = a + b; return (r > MAXI || r < -MAXI) ? over(r, a, b, '+') : r; }
  return slowAdd(a, b);
}
function cksub(a, b) { n(a); n(b); const r = a - b; return (typeof r === 'number' && (r > MAXI || r < -MAXI)) ? over(r, a, b, '-') : r; }
function ckmul(a, b) { n(a); n(b); const r = a * b; return (typeof r === 'number' && (r > MAXI || r < -MAXI)) ? over(r, a, b, '*') : r; }
function ckpow(a, b) { n(a); n(b); const r = a ** b; return (typeof r === 'number' && (r > MAXI || r < -MAXI)) ? over(r, a, b, '**') : r; }
function div(a, b) {
  n(a); n(b);
  if (b == 0) throw new AkError('division by zero');
  return a / b;
}
function mod(a, b) {
  n(a); n(b);
  if (b == 0) throw new AkError('division by zero');
  const r = a % b;
  return (r != 0 && (r < 0) !== (b < 0)) ? r + b : r;
}
function fdiv(a, b) {
  n(a); n(b);
  if (b == 0) throw new AkError('division by zero');
  if (typeof a === 'bigint') { const q = a / b; return (a % b != 0n && ((a < 0n) !== (b < 0n))) ? q - 1n : q; }
  return Math.floor(a / b);
}

function cmp(a, b) {
  const ta = typeof a, tb = typeof b;
  if ((ta === 'number' || ta === 'bigint' || ta === 'string') && ta === tb) return a < b ? -1 : a > b ? 1 : 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { const c = cmp(a[i], b[i]); if (c) return c; }
    return a.length - b.length;
  }
  const x = show(a), y = show(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function slowCmp(a, b, op) {
  const ta = typeof a, tb = typeof b;
  if ((ta === 'string' && tb === 'string') || ((ta === 'number' || ta === 'bigint') && (tb === 'number' || tb === 'bigint'))) {
    switch (op) { case '<': return a < b; case '>': return a > b; case '<=': return a <= b; default: return a >= b; }
  }
  if (Array.isArray(a) && Array.isArray(b)) { const c = cmp(a, b); switch (op) { case '<': return c < 0; case '>': return c > 0; case '<=': return c <= 0; default: return c >= 0; } }
  throw new AkError('cannot compare ' + tyOf(a) + ' and ' + tyOf(b));
}
const lt = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a < b : slowCmp(a, b, '<');
const gt = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a > b : slowCmp(a, b, '>');
const le = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a <= b : slowCmp(a, b, '<=');
const ge = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a >= b : slowCmp(a, b, '>=');
function chain(op) {
  return (...a) => { for (let i = 0; i < a.length - 1; i++) if (!op(a[i], a[i + 1])) return false; return true; };
}

// ---------------------------------------------------------------- stdout / stdin
let ob = [], obn = 0;
function wfd(fd, s) {
  const b = Buffer.from(s, 'utf8'); let o = 0;
  while (o < b.length) {
    try { o += fs.writeSync(fd, b, o); }
    catch (e) { if (e.code === 'EAGAIN') continue; if (e.code === 'EPIPE') return; throw e; }
  }
}
function flush() { if (!ob.length) return; const s = ob.join(''); ob = []; obn = 0; wfd(1, s); }
function out(s) { ob.push(s); obn += s.length; if (obn > 65536) flush(); }
function eout(s) { flush(); wfd(2, s); }

let inbuf = '', ineof = false; const dec = new StringDecoder('utf8');
function fill() {
  const b = Buffer.allocUnsafe(65536); let n;
  for (;;) {
    try { n = fs.readSync(0, b, 0, 65536, null); break; }
    catch (e) { if (e.code === 'EAGAIN') continue; if (e.code === 'EOF') { n = 0; break; } throw e; }
  }
  if (n === 0) { ineof = true; inbuf += dec.end(); } else inbuf += dec.write(b.subarray(0, n));
}
function inLine() {
  flush();
  for (;;) {
    const i = inbuf.indexOf('\n');
    if (i >= 0) { const l = inbuf.slice(0, i); inbuf = inbuf.slice(i + 1); return l.endsWith('\r') ? l.slice(0, -1) : l; }
    if (ineof) { if (inbuf === '') return null; const l = inbuf; inbuf = ''; return l; }
    fill();
  }
}
function inAll() { flush(); while (!ineof) fill(); const s = inbuf; inbuf = ''; return s; }

// ---------------------------------------------------------------- json
function toJ(x) {
  if (x === undefined) return null;
  if (x instanceof Map) { const o = {}; for (const [k, v] of x) o[String(k)] = toJ(v); return o; }
  if (Array.isArray(x) || ArrayBuffer.isView(x)) return Array.from(x, toJ);
  if (typeof x === 'bigint') return Number(x);
  return x;
}
function fromJ(x) {
  if (Array.isArray(x)) return x.map(fromJ);
  if (x && typeof x === 'object') { const m = new Map(); for (const k of Object.keys(x)) m.set(k, fromJ(x[k])); return m; }
  return x;
}

// ---------------------------------------------------------------- builtins
let ARGV = [];
const tyOf = x => {
  if (x == null) return 'nil';
  switch (typeof x) {
    case 'boolean': return 'bool'; case 'number': case 'bigint': return 'num';
    case 'string': return 'str'; case 'function': return 'fn';
  }
  if (Array.isArray(x)) return 'list';
  if (x instanceof Map) return 'map';
  if (ArrayBuffer.isView(x)) return 'arr';
  if (x instanceof Promise) return 'promise';
  return 'obj';
};
const arr = l => Array.isArray(l) ? l : Array.from(it(l));
const num = s => { if (typeof s === 'number') return s; const t = String(s).trim(); if (t === '') return null; const n = Number(t); return Number.isNaN(n) ? null : n; };

function rng(a, b, s) {
  if (b === undefined) { b = a; a = 0; }
  if (s === undefined) s = 1;
  if (s == 0) throw new AkError('..: zero step');
  const o = [];
  if (s > 0) for (let i = a; i < b; i += s) o.push(i); else for (let i = a; i > b; i += s) o.push(i);
  return o;
}

function mapf(f, l, ...more) {
  f = fn(f); l = arr(l);
  const n = l.length, o = new Array(n);
  if (!more.length) { for (let i = 0; i < n; i++) o[i] = f(l[i]); return o; }
  const ls = more.map(arr); let m = n; for (const x of ls) if (x.length < m) m = x.length;
  o.length = m;
  for (let i = 0; i < m; i++) o[i] = f(l[i], ...ls.map(x => x[i]));
  return o;
}
function red(f, a, b) {
  f = fn(f);
  if (b === undefined) { const l = arr(a); if (!l.length) return null; let r = l[0]; for (let i = 1; i < l.length; i++) r = f(r, l[i]); return r; }
  const l = arr(b); let r = a; for (let i = 0; i < l.length; i++) r = f(r, l[i]); return r;
}
function minmax(sign) {
  return (...a) => {
    const l = a.length === 1 && a[0] != null && typeof a[0] === 'object' ? a[0] : a;
    let r; let first = true;
    for (const x of l) { n(x); if (first || (sign < 0 ? x < r : x > r)) r = x; first = false; }
    return first ? null : r;
  };
}

const B = {
  // math (also inlined by the compiler when called directly)
  '+': (...a) => { if (!a.length) return 0; let r = a[0]; for (let i = 1; i < a.length; i++) r = ckadd(r, a[i]); return r; },
  '-': (...a) => { if (!a.length) return 0; if (a.length === 1) return -n(a[0]); let r = n(a[0]); for (let i = 1; i < a.length; i++) r = cksub(r, a[i]); return r; },
  '*': (...a) => { let r = 1; for (let i = 0; i < a.length; i++) r = ckmul(r, a[i]); return r; },
  '/': (...a) => { if (a.length === 1) return div(1, a[0]); let r = a[0]; for (let i = 1; i < a.length; i++) r = div(r, a[i]); return r; },
  '%': mod, '//': fdiv, '**': ckpow,
  '<': chain(lt), '>': chain(gt), '<=': chain(le), '>=': chain(ge),
  '==': eq, '!=': (a, b) => !eq(a, b), '!': a => !tr(a),
  '&': (...a) => a.reduce((x, y) => n(x) & n(y)), '|': (...a) => a.reduce((x, y) => n(x) | n(y)), '^': (...a) => a.reduce((x, y) => n(x) ^ n(y)),
  '<<': (a, b) => n(a) << n(b), '>>': (a, b) => n(a) >> n(b), '>>>': (a, b) => n(a) >>> n(b), bnot: a => ~n(a),
  abs: x => Math.abs(n(x)), sqrt: x => Math.sqrt(n(x)), flr: x => Math.floor(n(x)), cel: x => Math.ceil(n(x)), rnd: x => Math.round(n(x)),
  int: x => typeof x === 'bigint' ? x : Math.trunc(n(x)),
  min: minmax(-1), max: minmax(1),
  sum: l => { let s = 0; for (const x of it(l)) s += n(x); return s; },
  rand: (n) => n === undefined ? Math.random() : Math.floor(Math.random() * n),
  // data
  list: (...a) => a,
  map: (...a) => { const m = new Map(); for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); return m; },
  '@': at, '@!': (c, i) => c[i] ?? null, '<@': put, '<@!': (c, i, v) => c[i] = v,
  '#': len,
  '+>': (l, ...x) => l.concat(x),
  push: (l, ...x) => { for (let i = 0; i < x.length; i++) l.push(x[i]); return l; },
  pop: l => { const v = l.pop(); return v === undefined ? null : v; },
  enum: l => Array.from(it(l), (v, i) => [i, v]),
  set: (c, k, v) => {
    if (c instanceof Map) { const m = new Map(c); m.set(k, v); return m; }
    if (Array.isArray(c) || ArrayBuffer.isView(c)) { const l = c.slice(); put(l, k, v); return l; }
    const o = { ...c }; put(o, k, v); return o;
  },
  del: (c, k) => {
    if (c instanceof Map) { const m = new Map(c); m.delete(k); return m; }
    if (Array.isArray(c)) { const l = c.slice(); l.splice(k < 0 ? k + l.length : k, 1); return l; }
    const o = { ...c }; delete o[k]; return o;
  },
  '..': rng,
  '~': mapf,
  '~?': (f, l) => { f = fn(f); const o = []; l = arr(l); for (let i = 0; i < l.length; i++) if (tr(f(l[i]))) o.push(l[i]); return o; },
  '~~': (f, l) => { f = fn(f); const o = []; l = arr(l); for (let i = 0; i < l.length; i++) { const r = f(l[i]); if (Array.isArray(r)) for (const y of r) o.push(y); else o.push(r); } return o; },
  '~/': red,
  sort: (a, b) => {
    if (b === undefined) return arr(a).slice().sort(cmp);
    const f = fn(a), l = arr(b), ks = l.map(x => f(x));
    return l.map((x, i) => i).sort((i, j) => cmp(ks[i], ks[j]) || i - j).map(i => l[i]);
  },
  rev: l => typeof l === 'string' ? Array.from(l).reverse().join('') : arr(l).slice().reverse(),
  zip: (...ls) => { ls = ls.map(arr); let m = Infinity; for (const x of ls) m = Math.min(m, x.length); const o = []; for (let i = 0; i < m; i++) o.push(ls.map(x => x[i])); return o; },
  uniq: l => {
    const seen = new Set(), o = [];
    for (const x of arr(l)) {
      if (x === null || typeof x !== 'object') { if (!seen.has(x)) { seen.add(x); o.push(x); } }
      else if (!o.some(y => eq(x, y))) o.push(x);
    }
    return o;
  },
  flat: l => { const o = []; for (const x of arr(l)) { if (Array.isArray(x)) for (const y of x) o.push(y); else o.push(x); } return o; },
  grp: (f, l) => { f = fn(f); const m = new Map(); for (const x of arr(l)) { const k = f(x); const g = m.get(k); if (g) g.push(x); else m.set(k, [x]); } return m; },
  idx: (c, x) => { if (typeof c === 'string') return c.indexOf(x); const l = arr(c); for (let i = 0; i < l.length; i++) if (eq(l[i], x)) return i; return -1; },
  has: (c, x) => {
    if (c == null) return false;
    if (typeof c === 'string') return c.includes(x);
    if (c instanceof Map || c instanceof Set) return c.has(x);
    if (Array.isArray(c) || ArrayBuffer.isView(c)) { for (let i = 0; i < c.length; i++) if (eq(c[i], x)) return true; return false; }
    return Object.prototype.hasOwnProperty.call(c, x);
  },
  any: (f, l) => { f = fn(f); for (const x of arr(l)) if (tr(f(x))) return true; return false; },
  all: (f, l) => { f = fn(f); for (const x of arr(l)) if (!tr(f(x))) return false; return true; },
  keys: m => m instanceof Map ? Array.from(m.keys()) : Object.keys(m ?? {}),
  vals: m => m instanceof Map ? Array.from(m.values()) : Object.values(m ?? {}),
  prs: m => m instanceof Map ? Array.from(m, ([k, v]) => [k, v]) : Object.entries(m ?? {}),
  sub: (c, a, b) => c.slice(a, b == null ? undefined : b),
  take: (n, l) => l.slice(0, n), drop: (n, l) => l.slice(n),
  fst: l => l == null || !len(l) ? null : l[0], lst: l => l == null || !len(l) ? null : l[l.length - 1],
  ap: (f, l) => fn(f)(...arr(l)),
  f64: n => Array.isArray(n) ? Float64Array.from(n) : new Float64Array(n), f32: n => Array.isArray(n) ? Float32Array.from(n) : new Float32Array(n),
  i32: n => Array.isArray(n) ? Int32Array.from(n) : new Int32Array(n), u32: n => Array.isArray(n) ? Uint32Array.from(n) : new Uint32Array(n),
  i16: n => Array.isArray(n) ? Int16Array.from(n) : new Int16Array(n), u16: n => Array.isArray(n) ? Uint16Array.from(n) : new Uint16Array(n),
  i8: n => Array.isArray(n) ? Int8Array.from(n) : new Int8Array(n), u8: n => Array.isArray(n) ? Uint8Array.from(n) : new Uint8Array(n),
  // strings
  '++': (...a) => {
    if (a.length && Array.isArray(a[0])) { const o = []; for (const x of a) for (const y of x) o.push(y); return o; }
    let s = ''; for (let i = 0; i < a.length; i++) s += tostr(a[i]); return s;
  },
  '$': tostr, show,
  split: (s, d) => d === undefined ? (s.trim() === '' ? [] : s.trim().split(/\s+/)) : s.split(d),
  join: (l, d) => arr(l).map(tostr).join(d === undefined ? '' : d),
  trim: s => s.trim(), up: s => s.toUpperCase(), lo: s => s.toLowerCase(),
  rep: (s, a, b) => a instanceof RegExp ? s.replace(a.global ? a : new RegExp(a.source, a.flags + 'g'), b) : s.split(a).join(b),
  starts: (s, p) => s.startsWith(p), ends: (s, p) => s.endsWith(p),
  rpt: (s, k) => { k = Math.max(0, n(k)); if (typeof s === 'string') return s.repeat(k); const o = []; for (let i = 0; i < k; i++) for (const x of s) o.push(x); return o; },
  fmt: (f, ...a) => { let i = 0; return f.replace(/%(-?)(0?)(\d*)(?:\.(\d+))?([sdfxXbo%])/g, (m, left, zero, w, prec, t) => {
      if (t === '%') return '%';
      const v = a[i++]; let s;
      switch (t) {
        case 's': s = tostr(v); break; case 'd': s = String(Math.trunc(n(v))); break;
        case 'f': s = n(v).toFixed(prec === undefined ? 6 : +prec); break;
        case 'x': s = n(v).toString(16); break; case 'X': s = n(v).toString(16).toUpperCase(); break; case 'b': s = n(v).toString(2); break; default: s = n(v).toString(8);
      }
      if (prec !== undefined && t === 's') s = s.slice(0, +prec);
      const width = +w || 0;
      return left ? s.padEnd(width) : (zero ? (s[0] === '-' ? '-' + s.slice(1).padStart(width - 1, '0') : s.padStart(width, '0')) : s.padStart(width));
    }); },
  padl: (s, n, c) => tostr(s).padStart(n, c === undefined ? ' ' : c), padr: (s, n, c) => tostr(s).padEnd(n, c === undefined ? ' ' : c),
  chr: n => String.fromCodePoint(n), ord: s => s.codePointAt(0),
  num,
  re: (p, f) => new RegExp(p, f), match: (r, s) => { const m = (r instanceof RegExp ? r : new RegExp(r)).exec(s); return m ? Array.from(m, x => x === undefined ? null : x) : null; },
  // types / errors
  ty: tyOf, is: (t, x) => tyOf(x) === t,
  err: (...a) => { throw new AkError(a.map(tostr).join(' ')); },
  // io / system
  p: (...a) => { out(a.map(tostr).join(' ') + '\n'); return a.length ? a[a.length - 1] : null; },
  pr: (...a) => { out(a.map(tostr).join(' ')); return a.length ? a[a.length - 1] : null; },
  ep: (...a) => { eout(a.map(tostr).join(' ') + '\n'); return a.length ? a[a.length - 1] : null; },
  rd: f => fs.readFileSync(f, 'utf8'), wr: (f, s) => { fs.writeFileSync(f, s); return s; }, app: (f, s) => { fs.appendFileSync(f, s); return s; },
  ls: d => fs.readdirSync(d === undefined ? '.' : d), ex: f => fs.existsSync(f),
  in: inLine, inall: inAll, args: () => ARGV.slice(),
  env: k => k === undefined ? new Map(Object.entries(process.env)) : (process.env[k] ?? null),
  exit: c => { flush(); process.exit(c || 0); },
  sh: cmd => {
    flush();
    try { return require('child_process').execSync(cmd, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], maxBuffer: 1 << 30 }); }
    catch (e) { throw new AkError('sh failed (' + e.status + '): ' + cmd); }
  },
  now: () => Date.now(), clock: () => performance.now(),
  sleep: ms => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); return null; },
  delay: ms => new Promise(r => setTimeout(r, ms)),
  imp: m => import(m),
  json: (x, ind) => JSON.stringify(toJ(x), null, ind), unjson: s => fromJ(JSON.parse(s)),
  ev: src => {
    const { compile } = require('./ak.js');
    const code = compile(src, { file: '<ev>', ret: true });
    return new Function('R', 'require', code)(api, require);
  },
};

const H = { tr, eq, fn, at, put, len, it, toArr, dot, setdot, add, ckadd, cksub, ckmul, ckpow, n, lt, gt, le, ge, div, mod, fdiv, msg,
  // two-operand strict helpers: both operands are evaluated first, then type-checked (used when a later operand may have effects)
  sub: (a, b) => n(a) - n(b), mul: (a, b) => n(a) * n(b), pow: (a, b) => n(a) ** n(b),
  band: (a, b) => n(a) & n(b), bor: (a, b) => n(a) | n(b), bxor: (a, b) => n(a) ^ n(b),
  shl: (a, b) => n(a) << n(b), shr: (a, b) => n(a) >> n(b), ushr: (a, b) => n(a) >>> n(b),
  mcall: (o, m, a) => o[m](...a) };
const api = { B, H };

// ---------------------------------------------------------------- launcher
const LIMITS = { stackSizeMb: 512, maxOldGenerationSizeMb: 16384 };

// map an error back to an Ak source position using the //@line:col markers the compiler leaves in the generated JS
function locate(e, body, file) {
  try {
    const stack = String(e && e.stack || '');
    let genLine = 0, src = null;
    for (const ln of stack.split('\n')) {
      let m = /<anonymous>:(\d+):\d+\)?$/.exec(ln);
      if (m && body) { genLine = +m[1]; src = body.toString().split('\n'); break; }
      m = /\(?((?:\/|[A-Za-z]:)[^()]*?):(\d+):\d+\)?$/.exec(ln);
      if (m && !m[1].endsWith('runtime.js') && !m[1].startsWith('node:') && fs.existsSync(m[1])) {
        const lines = fs.readFileSync(m[1], 'utf8').split('\n');
        const start = lines.indexOf('//@@PROGRAM');          // bundles inline the runtime: skip frames before the program
        if (start >= 0 && +m[2] <= start) continue;
        genLine = +m[2]; src = lines; break;
      }
    }
    if (!src) return '';
    for (let i = Math.min(genLine, src.length) - 1; i >= 0; i--) {
      const m = /^\/\/@(\d+):(\d+)$/.exec(src[i]);
      if (m) return ' (' + (file || '') + ':' + m[1] + ':' + m[2] + ')';
    }
  } catch (_) { /* best effort */ }
  return '';
}
let CUR = { body: null, file: '' };

function fail(e) {
  flush(); wfd(2, 'error: ' + msg(e) + locate(e, CUR.body, CUR.file) + '\n');
  if (process.env.AK_DEBUG && e && e.stack) wfd(2, e.stack + '\n');
  process.exit(1);
}

function exec(body, argv, dir, file) {
  ARGV = argv; CUR = { body, file: file || '' };
  process.on('exit', flush);
  process.on('unhandledRejection', fail);
  const req = require('module').createRequire(path.join(dir, 'x.js'));
  try {
    const r = body(api, req);
    if (r && typeof r.then === 'function') r.then(() => { }, fail);
  } catch (e) { fail(e); }
}

function spawn(file, data) {
  const w = new WT.Worker(file, { workerData: data, resourceLimits: LIMITS });
  w.on('error', e => { wfd(2, 'error: ' + msg(e) + '\n'); process.exit(1); });
  w.on('exit', c => process.exit(c));
}

// run compiled code string (from the CLI)
function launch(code, argv, file) {
  if (process.env.AK_NOWORKER) {
    exec(new Function('R', 'require', code), argv, process.cwd(), file);
  } else spawn(__filename, { akcode: code, argv, dir: process.cwd(), file });
}
// entry for bundled standalone programs (also works inside a Node single-executable app, where the
// worker is started from the embedded script text because the executable cannot be re-run as a script)
function standalone(file, body, name) {
  if (WT.isMainThread) {
    const argv = process.argv.slice(2);
    if (process.env.AK_NOWORKER) return exec(body, argv, process.cwd(), name);
    let sea = null; try { const m = require('node:sea'); if (m.isSea()) sea = m; } catch (_) { /* not a SEA */ }
    if (sea) {
      const w = new WT.Worker(sea.getAsset('main.js', 'utf8'), { eval: true, workerData: { standalone: true, argv, dir: process.cwd(), name }, resourceLimits: LIMITS });
      w.on('error', e => { wfd(2, 'error: ' + msg(e) + '\n'); process.exit(1); });
      w.on('exit', c => process.exit(c));
    } else spawn(file, { standalone: true, argv, dir: process.cwd(), name });
  } else exec(body, WT.workerData.argv, WT.workerData.dir, WT.workerData.name);
}
// for tests/embedding: compile+run in-process, return value
function evalCode(code) { return new Function('R', 'require', code)(api, require); }

if (!WT.isMainThread && WT.workerData && WT.workerData.akcode !== undefined) {
  const d = WT.workerData;
  exec(new Function('R', 'require', d.akcode), d.argv, d.dir, d.file);
}

module.exports = { B, H, AkError, launch, standalone, evalCode, show, eq, flush };
