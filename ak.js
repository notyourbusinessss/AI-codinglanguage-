#!/usr/bin/env node
'use strict';
// Ak compiler: Ak source -> JavaScript (run on V8 JIT). See SPEC.md.
const fs = require('fs'), path = require('path');
const RT = require('./runtime.js');
const { B } = RT;

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

function expandUse(x, dir, seen) {
  if (!Array.isArray(x)) return x;
  if (x[0] instanceof Sym && x[0].n === 'use' && typeof x[1] === 'string') {
    let f = path.resolve(dir, x[1]);
    if (!fs.existsSync(f) && fs.existsSync(f + '.ak')) f += '.ak';
    if (!fs.existsSync(f)) throw new CErr(`${x.line}: use: file not found: ${x[1]}`);
    if (seen.has(f)) return null;
    seen.add(f);
    const forms = parse(fs.readFileSync(f, 'utf8'), f).map(y => expandUse(y, path.dirname(f), seen));
    const r = [new Sym(':'), ...forms]; r.line = x.line; return r;
  }
  const r = x.map(y => expandUse(y, dir, seen)); r.line = x.line; return r;
}

// ================================================================== compiler state
class Scope { constructor(p) { this.p = p; this.v = new Map(); this.hoist = []; } }
let S;
const RET = { k: 'ret' }, DROP = { k: 'drop' };

const emit = s => S.buf.push(s);
function capture(f) {
  const sv = S.buf; const mine = S.buf = []; let r;
  try { r = f(); } finally { S.buf = sv; }
  return [mine, r];
}
function cerr(m) { throw new CErr(`${S.file}:${S.line}: ${m}`); }

const mg = n => '$' + n.replace(/[^A-Za-z0-9]/g, c => c === '_' ? '__' : '_' + c.charCodeAt(0).toString(16) + '_');
const bj = n => 'R_' + n.replace(/[^A-Za-z0-9]/g, c => '_' + c.charCodeAt(0).toString(16) + '_');
const bref = n => { S.usedB.add(n); return bj(n); };
const href = n => { S.usedH.add(n); return 'H_' + n; };
function kwc(n) { let k = S.kws.get(n); if (!k) { k = 'K' + (S.kws.size + 1); S.kws.set(n, k); } return k; }
function tmp() { const t = 't' + (++S.uid); S.fn.tmps.push(t); return t; }

function lookup(n) { for (let s = S.scope; s; s = s.p) { const i = s.v.get(n); if (i) return i; } return null; }
function declare(n, extra) { const i = { js: mg(n), fn: false, ...extra }; S.scope.v.set(n, i); return i; }
function declareUniq(n, extra) {
  const vis = lookup(n);
  const i = { js: vis ? mg(n) + '_' + (++S.uid) : mg(n), fn: false, ...extra };
  S.scope.v.set(n, i); return i;
}
function scoped(f) {
  const sc = new Scope(S.scope); S.scope = sc; const idx = S.buf.length; let r;
  try { r = f(sc); } finally { S.scope = sc.p; }
  if (sc.hoist.length) S.buf.splice(idx, 0, `let ${sc.hoist.join(',')};`);
  return r;
}
function predeclare(m) {
  for (const [name, isFn] of m) {
    if (!S.scope.v.has(name)) { const i = declare(name, { fn: isFn }); S.scope.hoist.push(i.js); }
  }
}
const isLam = x => Array.isArray(x) && x[0] instanceof Sym && x[0].n === '\\';
const isLit = x => !(x instanceof Sym) && !Array.isArray(x);

// names bound by `=` in this scope level (not inside nested lambdas/let/for)
function decls(forms) {
  const m = new Map();
  const walk = x => {
    if (!Array.isArray(x)) return;
    if (!(x[0] instanceof Sym)) { x.forEach(walk); return; }
    switch (x[0].n) {
      case '\\': case 'q': case 'let': case 'for': return;
      case '=': {
        const t = x[1];
        if (Array.isArray(t)) { if (t[0] instanceof Sym) m.set(t[0].n, true); return; }
        if (t instanceof Sym) m.set(t.n, isLam(x[2]) || m.get(t.n) || false);
        walk(x[2]); return;
      }
      case 'try': walk(x[1]); return;
      default: for (let i = 1; i < x.length; i++) walk(x[i]);
    }
  };
  forms.forEach(walk);
  return m;
}
function hasClosure(x) {
  if (!Array.isArray(x)) return false;
  if (x[0] instanceof Sym && (x[0].n === '\\' || (x[0].n === '=' && Array.isArray(x[1])))) return true;
  return x.some(hasClosure);
}

// ================================================================== symbols / literals
function propAcc(p) { return /^[A-Za-z_$][\w$]*$/.test(p) ? '.' + p : `[${JSON.stringify(p)}]`; }
const isDotted = n => n.includes('.') && !n.startsWith('.') && !n.endsWith('.') && !n.includes('..');

function ref(name) {
  const info = lookup(name);
  if (info) return info.js;
  if (Object.prototype.hasOwnProperty.call(B, name)) return bref(name);
  if (isDotted(name)) {
    const i = name.indexOf('.');
    return ref(name.slice(0, i)) + name.slice(i + 1).split('.').map(propAcc).join('');
  }
  if (name === 'require') return 'require';
  if (name in globalThis) return name;
  cerr(`undefined: ${name}`);
}

function lit(x) {
  if (x === null || x === undefined) return 'null';
  if (x === true) return 'true';
  if (x === false) return 'false';
  if (typeof x === 'number') return (x < 0 || Object.is(x, -0)) ? `(${Object.is(x, -0) ? '-0' : x})` : String(x);
  if (typeof x === 'bigint') return x < 0n ? `(${x}n)` : `${x}n`;
  if (typeof x === 'string') return JSON.stringify(x);
  if (x instanceof Kw) return kwc(x.n);
  cerr('bad literal');
}

function quote(x) {
  if (x instanceof Sym) return kwc(x.n);
  if (Array.isArray(x)) return `[${x.map(quote).join(',')}]`;
  return lit(x);
}

// ================================================================== expressions
function exprs(xs) {
  const parts = xs.map(x => capture(() => expr(x)));
  let last = -1; parts.forEach((p, i) => { if (p[0].length) last = i; });
  const out = [];
  parts.forEach(([pre, e], i) => {
    pre.forEach(emit);
    if (i < last && !isLit(xs[i])) { const t = tmp(); emit(`${t}=${e};`); out.push(t); } else out.push(e);
  });
  return out;
}

const BOOLH = new Set(['<', '>', '<=', '>=', '==', '!=', '!', 'has', 'any', 'all', 'is', 'starts', 'ends', 'ex']);
function cond(x) {
  if (x === true) return 'true';
  if (x === false || x === null) return 'false';
  if (isLit(x)) return 'true';
  if (Array.isArray(x) && x.length && x[0] instanceof Sym && !lookup(x[0].n)) {
    const n = x[0].n;
    if (n === '&' || n === '|') return andOr(n === '&', x.slice(1), 'cond');
    if (BOOLH.has(n) && Object.prototype.hasOwnProperty.call(B, n)) return expr(x);
  }
  return `${href('tr')}(${expr(x)})`;
}

function andOr(isAnd, xs, mode) {
  if (!xs.length) return isAnd ? 'true' : 'false';
  const one = x => mode === 'cond' ? cond(x) : expr(x);
  if (xs.length === 1) return one(xs[0]);
  const parts = xs.map(x => capture(() => one(x)));
  if (parts.slice(1).every(p => !p[0].length)) {
    parts[0][0].forEach(emit);
    const es = parts.map(p => p[1]);
    if (mode === 'cond') return `(${es.join(isAnd ? '&&' : '||')})`;
    const t = tmp(); let r = es[es.length - 1]; const tr = href('tr');
    for (let i = es.length - 2; i >= 0; i--)
      r = isAnd ? `(${tr}(${t}=${es[i]})?${r}:${t})` : `(${tr}(${t}=${es[i]})?${t}:${r})`;
    return r;
  }
  const t = tmp(); const test = mode === 'cond' ? t : `${href('tr')}(${t})`; let depth = 0;
  parts.forEach(([pre, e], i) => {
    pre.forEach(emit); emit(`${t}=${e};`);
    if (i < parts.length - 1) { emit(`if(${isAnd ? test : '!' + test}){`); depth++; }
  });
  emit('}'.repeat(depth));
  return t;
}

function exprIf(args) {
  if (args.length === 0) return 'null';
  if (args.length === 1) return expr(args[0]);
  const c = cond(args[0]);
  const A = capture(() => expr(args[1]));
  const R = capture(() => exprIf(args.slice(2)));
  if (!A[0].length && !R[0].length) return `(${c}?${A[1]}:${R[1]})`;
  const t = tmp();
  emit(`if(${c}){`); A[0].forEach(emit); emit(`${t}=${A[1]};`); emit('}else{'); R[0].forEach(emit); emit(`${t}=${R[1]};`); emit('}');
  return t;
}

function viaTemp(x) { const t = tmp(); stmt(x, { k: 'var', v: t }); return t; }

function params(list) {
  if (!Array.isArray(list)) cerr('parameter list must be (a b ..)');
  let rest = null, ps = list;
  if (list.length >= 2 && list[list.length - 2] instanceof Sym && list[list.length - 2].n === '..') {
    rest = list[list.length - 1]; ps = list.slice(0, -2);
    if (!(rest instanceof Sym)) cerr('bad rest parameter');
  }
  for (const p of ps) if (!(p instanceof Sym)) cerr('parameter must be a symbol');
  return { ps: ps.map(p => p.n), rest: rest && rest.n };
}

function compileFn(jsName, ps, rest, body, selfName, selfInfo) {
  const sv = { buf: S.buf, fn: S.fn, scope: S.scope };
  const fn = { tmps: [], async: false, tryDepth: 0, tco: false, tcoUsed: false, label: 'L' + (++S.uid), params: [], selfName, selfInfo };
  S.fn = fn; S.buf = [];
  let lines;
  try {
    scoped(() => {
      for (const p of ps) declare(p);
      if (rest) declare(rest);
      fn.params = ps.map(mg);
      fn.tco = !!selfName && !rest && !body.some(hasClosure);
      predeclare(decls(body));
      seqStmt(body, RET);
    });
    lines = S.buf;
  } finally { S.buf = sv.buf; S.fn = sv.fn; S.scope = sv.scope; }
  let inner = fn.tmps.length ? [`let ${fn.tmps.join(',')};`, ...lines] : lines;
  if (fn.tcoUsed) inner = [`${fn.label}:for(;;){`, ...inner, '}'];
  const plist = [...ps.map(mg), ...(rest ? ['...' + mg(rest)] : [])].join(',');
  return `(${fn.async ? 'async ' : ''}function ${jsName || ''}(${plist}){\n${inner.join('\n')}\n})`;
}

function doAssign(x) {
  const t = x[1];
  if (Array.isArray(t)) { // (= (f a b) body..)
    if (!(t[0] instanceof Sym)) cerr('function name must be a symbol');
    const name = t[0].n;
    let info = S.scope.v.get(name);
    if (!info) { info = declare(name, { fn: true }); S.scope.hoist.push(info.js); }
    info.fn = true;
    const { ps, rest } = params(t.slice(1));
    return `(${info.js}=${compileFn(info.js, ps, rest, x.slice(2), name, info)})`;
  }
  if (!(t instanceof Sym)) cerr('= target must be a symbol or (name params..)');
  if (x.length !== 3) cerr('(= name value) takes exactly one value');
  let info = S.scope.v.get(t.n);
  if (!info) { info = declare(t.n); S.scope.hoist.push(info.js); }
  if (isLam(x[2])) {
    info.fn = true;
    const { ps, rest } = params(x[2][1]);
    return `(${info.js}=${compileFn(info.js, ps, rest, x[2].slice(2), t.n, info)})`;
  }
  return `(${info.js}=${expr(x[2])})`;
}

function doSet(x) {
  const t = x[1];
  if (Array.isArray(t) && t[0] instanceof Sym && t[0].n === '@' && t.length === 3) {
    const es = exprs([t[1], t[2], x[2]]); return `${bref('<@')}(${es.join(',')})`;
  }
  if (!(t instanceof Sym)) cerr('<- target must be a symbol or (@ c i)');
  const info = lookup(t.n);
  let target;
  if (info) target = info.js;
  else if (isDotted(t.n)) target = ref(t.n);
  else cerr(`<-: undefined variable ${t.n} (use = to create it)`);
  return `(${target}=${expr(x[2])})`;
}

const BIN = { band: '&', bor: '|', bxor: '^', shl: '<<', shr: '>>', ushr: '>>>' };
function litEq(x) { return x === true || x === false || typeof x === 'number' || typeof x === 'string' || x instanceof Kw; }

function inlineOp(n, args) {
  const k = args.length;
  switch (n) {
    case '+': case '*': {
      if (k === 0) return n === '+' ? '0' : '1';
      const es = exprs(args); return k === 1 ? `(${n}${es[0]})` : `(${es.join(n)})`;
    }
    case '-': {
      if (k === 0) return '0';
      const es = exprs(args); return k === 1 ? `(-${es[0]})` : `(${es.join('-')})`;
    }
    case '/': {
      if (k === 0) return undefined;
      const es = exprs(args); const d = href('div');
      if (k === 1) return `${d}(1,${es[0]})`;
      return es.slice(1).reduce((a, e) => `${d}(${a},${e})`, es[0]);
    }
    case '%':
      if (k === 2 && typeof args[1] === 'number' && args[1] > 0 && Number.isFinite(args[1])) {
        const es = exprs(args), t = tmp();
        return `((${t}=${es[0]})%${es[1]}+(${t}%${es[1]}<0?${es[1]}:0))`;
      }
    // fallthrough
    case '//': if (k === 2) return `${href(n === '%' ? 'mod' : 'fdiv')}(${exprs(args).join(',')})`; return;
    case '**': if (k === 2) { const es = exprs(args); return `(${es[0]}**${es[1]})`; } return;
    case '<': case '>': case '<=': case '>=': if (k === 2) { const es = exprs(args); return `(${es[0]}${n}${es[1]})`; } return;
    case '==': case '!=': {
      if (k !== 2) return;
      const es = exprs(args); const neg = n === '!=';
      let r;
      if (args[0] === null || args[1] === null) r = `(${args[0] === null ? es[1] : es[0]}==null)`;
      else if (litEq(args[0]) || litEq(args[1])) r = `(${es[0]}===${es[1]})`;
      else r = `${href('eq')}(${es[0]},${es[1]})`;
      return neg ? `(!${r})` : r;
    }
    case '!': if (k === 1) return `(!${cond(args[0])})`; return;
    case 'band': case 'bor': case 'bxor': if (k >= 2) return `(${exprs(args).join(BIN[n])})`; return;
    case 'shl': case 'shr': case 'ushr': if (k === 2) return `(${exprs(args).join(BIN[n])})`; return;
    case 'bnot': if (k === 1) return `(~${exprs(args)[0]})`; return;
    case '#': if (k === 1) return `${href('len')}(${exprs(args)[0]})`; return;
    case '@!': if (k === 2) { const es = exprs(args); return `(${es[0]}[${es[1]}]??null)`; } return;
    case '<@!': if (k === 3) { const es = exprs(args); return `(${es[0]}[${es[1]}]=${es[2]})`; } return;
    case 'list': return `[${exprs(args).join(',')}]`;
  }
}

function call(x) {
  const h = x[0], args = x.slice(1);
  if (h instanceof Kw) {
    if (args.length !== 1) cerr('(:key map) takes one argument');
    return `${bref('@')}(${exprs(args)[0]},${kwc(h.n)})`;
  }
  if (h instanceof Sym) {
    const info = lookup(h.n);
    if (info) { const a = exprs(args).join(','); return info.fn ? `${info.js}(${a})` : `${href('fn')}(${info.js})(${a})`; }
    if (Object.prototype.hasOwnProperty.call(B, h.n)) {
      const r = inlineOp(h.n, args);
      return r !== undefined ? r : `${bref(h.n)}(${exprs(args).join(',')})`;
    }
    const f = ref(h.n);
    return `${f}(${exprs(args).join(',')})`;
  }
  const es = exprs([h, ...args]);
  return isLam(h) ? `${es[0]}(${es.slice(1).join(',')})` : `${href('fn')}(${es[0]})(${es.slice(1).join(',')})`;
}

function swClauses(x) {
  const g = '%sw' + (++S.uid);
  const t = tmp();
  emit(`${t}=${expr(x[1])};`);
  S.scope.v.set(g, { js: t, fn: false });
  const rest = x.slice(2), out = [];
  let i = 0;
  for (; i + 1 < rest.length; i += 2) {
    const c = rest[i];
    const test = (Array.isArray(c) && c[0] instanceof Sym && c[0].n === '%list')
      ? [new Sym('|'), ...c.slice(1).map(v => [new Sym('=='), new Sym(g), v])]
      : [new Sym('=='), new Sym(g), c];
    out.push(test, rest[i + 1]);
  }
  if (i < rest.length) out.push(rest[i]);
  return out;
}

function expr(x) {
  if (x instanceof Sym) return ref(x.n);
  if (!Array.isArray(x)) return lit(x);
  if (x.line) S.line = x.line;
  if (!x.length) return 'null';
  const h = x[0];
  if (h instanceof Sym) {
    switch (h.n) {
      case '%list': return `[${exprs(x.slice(1)).join(',')}]`;
      case '%map': {
        const a = x.slice(1); if (a.length % 2) cerr('map literal needs key/value pairs');
        if (!a.length) return 'new Map()';
        const es = exprs(a); const ps = [];
        for (let i = 0; i < es.length; i += 2) ps.push(`[${es[i]},${es[i + 1]}]`);
        return `new Map([${ps.join(',')}])`;
      }
      case '?': return exprIf(x.slice(1));
      case ':': {
        const f = x.slice(1); if (!f.length) return 'null';
        f.slice(0, -1).forEach(y => stmt(y, DROP));
        return expr(f[f.length - 1]);
      }
      case '=': return doAssign(x);
      case '<-': return doSet(x);
      case '\\': { const { ps, rest } = params(x[1]); return compileFn('', ps, rest, x.slice(2), null, null); }
      case '&': return andOr(true, x.slice(1), 'val');
      case '|': return andOr(false, x.slice(1), 'val');
      case 'wh': case 'for': case 'try': case 'let': case 'sw': return viaTemp(x);
      case 'q': return quote(x[1]);
      case 'aw': S.fn.async = true; return `(await ${expr(x[1])})`;
      case 'req': return `require(${expr(x[1])})`;
      case 'js': if (typeof x[1] !== 'string') cerr('(js "code") needs a string literal'); return `(${x[1]})`;
      case 'new': { const es = exprs(x.slice(1)); return `(new (${es[0]})(${es.slice(1).join(',')}))`; }
      case '.': {
        if (x.length < 3) cerr('(. obj :method args..)');
        const es = exprs([x[1], ...x.slice(3)]); const m = x[2];
        if (typeof m === 'string' || m instanceof Kw) return `(${es[0]})${propAcc(typeof m === 'string' ? m : m.n)}(${es.slice(1).join(',')})`;
        const em = exprs([x[1], m, ...x.slice(3)]);
        return `${href('mcall')}(${em[0]},${em[1]},[${em.slice(2).join(',')}])`;
      }
      case '.@': {
        if (x.length !== 3) cerr('(.@ obj :prop) takes exactly 2 args; to call a method use (. obj :method args..)');
        const k = x[2];
        if (typeof k === 'string' || k instanceof Kw) return `(${expr(x[1])}${propAcc(typeof k === 'string' ? k : k.n)}??null)`;
        const es = exprs([x[1], k]); return `(${es[0]}[${es[1]}]??null)`;
      }
      case '.=': {
        if (x.length !== 4) cerr('(.= obj :prop value)');
        const k = x[2];
        if (typeof k === 'string' || k instanceof Kw) { const es = exprs([x[1], x[3]]); return `(${es[0]}${propAcc(typeof k === 'string' ? k : k.n)}=${es[1]})`; }
        const es = exprs([x[1], k, x[3]]); return `(${es[0]}[${es[1]}]=${es[2]})`;
      }
      case 'use': cerr('(use "file") needs a string literal');
    }
  }
  return call(x);
}

// ================================================================== statements
function deliver(d, e) {
  if (d.k === 'ret') emit(`return ${e};`);
  else if (d.k === 'var') emit(`${d.v}=${e};`);
  else if (!/^[\w$.]+$/.test(e)) emit(`${e};`);
}

function seqStmt(forms, d) {
  if (!forms.length) return deliver(d, 'null');
  for (let i = 0; i < forms.length - 1; i++) stmt(forms[i], DROP);
  stmt(forms[forms.length - 1], d);
}

function ifStmt(args, d) {
  if (args.length === 0) return deliver(d, 'null');
  if (args.length === 1) return stmt(args[0], d);
  const c = cond(args[0]);
  emit(`if(${c}){`); stmt(args[1], d); emit('}');
  const rest = args.slice(2);
  if (rest.length) { emit('else{'); ifStmt(rest, d); emit('}'); }
  else if (d.k !== 'drop') { emit('else{'); deliver(d, 'null'); emit('}'); }
}

function letStmt(x, d) {
  const b = x[1];
  if (!Array.isArray(b) || b.length % 2) cerr('(let (name value ..) body..)');
  emit('{');
  scoped(() => {
    const names = new Set(); for (let i = 0; i < b.length; i += 2) if (b[i] instanceof Sym) names.add(b[i].n);
    const pd = decls([...b.filter((_, i) => i % 2), ...x.slice(2)]);
    for (const n of names) pd.delete(n);
    predeclare(pd);
    for (let i = 0; i < b.length; i += 2) {
      const name = b[i], val = b[i + 1];
      if (!(name instanceof Sym)) cerr('let: name must be a symbol');
      const own = S.scope.v.get(name.n);
      if (own && own.inline) { emit(`${own.js}=${expr(val)};`); continue; }
      if (isLam(val)) {
        const info = declareUniq(name.n, { fn: true, inline: true });
        const { ps, rest } = params(val[1]);
        emit(`let ${info.js}=${compileFn(info.js, ps, rest, val.slice(2), name.n, info)};`);
      } else {
        const e = expr(val);
        const info = declareUniq(name.n, { inline: true });
        emit(`let ${info.js}=${e};`);
      }
    }
    seqStmt(x.slice(2), d);
  });
  emit('}');
}

function whStmt(x) {
  const [pre, c] = capture(() => cond(x[1]));
  if (!pre.length) emit(`while(${c}){`);
  else { emit('for(;;){'); pre.forEach(emit); emit(`if(!${c})break;`); }
  scoped(() => { predeclare(decls(x.slice(2))); seqStmt(x.slice(2), DROP); });
  emit('}');
}

function forStmt(x) {
  const hd = x[1];
  if (!Array.isArray(hd) || hd.length < 2 || hd.length > 3 || !hd.every((s, i) => i === hd.length - 1 || s instanceof Sym)) cerr('(for (v coll) body..) or (for (k v coll) body..)');
  const body = x.slice(2), c = hd[hd.length - 1];
  const vars = hd.slice(0, -1);
  const isRange = vars.length === 1 && Array.isArray(c) && c[0] instanceof Sym && c[0].n === '..' && !lookup('..') &&
    c.length >= 2 && c.length <= 4 && (c.length < 4 || (typeof c[3] === 'number' && c[3] !== 0));
  if (isRange) {
    const a = c.slice(1); let lo, hi;
    if (a.length === 1) { hi = exprs(a)[0]; lo = '0'; } else [lo, hi] = exprs(a.slice(0, 2));
    const step = a.length === 3 ? a[2] : 1;
    const ci = 'i' + (++S.uid), ce = 'e' + S.uid;
    emit(`for(let ${ci}=${lo},${ce}=${hi};${ci}${step > 0 ? '<' : '>'}${ce};${ci}+=${step}){`);
    scoped(() => {
      const js = declareUniq(vars[0].n, { inline: true }).js;
      emit(`let ${js}=${ci};`);
      predeclare(decls(body)); seqStmt(body, DROP);
    });
    emit('}');
    return;
  }
  if (vars.length === 1) {
    const e = expr(c);
    emit(`for(const ${'c' + (++S.uid)} of ${href('it')}(${e})){`);
    const cv = 'c' + S.uid;
    scoped(() => {
      const js = declareUniq(vars[0].n, { inline: true }).js;
      emit(`let ${js}=${cv};`);
      predeclare(decls(body)); seqStmt(body, DROP);
    });
    emit('}');
  } else {
    const e = expr(c); const cv = 'c' + (++S.uid);
    emit(`for(const ${cv} of ${href('ents')}(${e})){`);
    scoped(() => {
      const [a, b] = vars.map(v => declareUniq(v.n, { inline: true }).js);
      emit(`let ${a}=${cv}[0],${b}=${cv}[1];`);
      predeclare(decls(body)); seqStmt(body, DROP);
    });
    emit('}');
  }
}

function tryStmt(x, d) {
  if (x.length !== 3) cerr('(try body handler)');
  const ex = 'ex' + (++S.uid);
  emit('try{');
  S.fn.tryDepth++;
  try { stmt(x[1], d); } finally { S.fn.tryDepth--; }
  emit(`}catch(${ex}){`);
  const h = x[2];
  if (isLam(h) && Array.isArray(h[1]) && h[1].length <= 1 && h[1].every(p => p instanceof Sym)) {
    scoped(() => {
      const body = h.slice(2);
      if (h[1].length) { const info = declareUniq(h[1][0].n, { inline: true }); emit(`let ${info.js}=${href('msg')}(${ex});`); }
      predeclare(decls(body));
      seqStmt(body, d);
    });
  } else {
    deliver(d, `${href('fn')}(${expr(h)})(${href('msg')}(${ex}))`);
  }
  emit('}');
}

function tailSelf(x) {
  const f = S.fn;
  if (!f.tco || f.tryDepth) return false;
  const h = x[0];
  if (h.n !== f.selfName || lookup(h.n) !== f.selfInfo) return false;
  const args = x.slice(1);
  if (args.length > f.params.length) return false;
  const es = exprs(args), ps = f.params;
  if (ps.length === 1 && es.length <= 1) emit(`${ps[0]}=${es.length ? es[0] : 'null'};`);
  else {
    const ts = es.map(e => { const t = tmp(); emit(`${t}=${e};`); return t; });
    ps.forEach((p, i) => emit(`${p}=${i < ts.length ? ts[i] : 'null'};`));
  }
  f.tcoUsed = true; emit(`continue ${f.label};`);
  return true;
}

function stmt(x, d) {
  if (Array.isArray(x) && x.length && x[0] instanceof Sym) {
    if (x.line) S.line = x.line;
    switch (x[0].n) {
      case '?': return ifStmt(x.slice(1), d);
      case ':': return seqStmt(x.slice(1), d);
      case 'let': return letStmt(x, d);
      case 'wh': whStmt(x); return deliver(d, 'null');
      case 'for': forStmt(x); return deliver(d, 'null');
      case 'try': return tryStmt(x, d);
      case 'sw': return ifStmt(swClauses(x), d);
      default: if (d.k === 'ret' && tailSelf(x)) return;
    }
  }
  deliver(d, expr(x));
}

// ================================================================== driver
function compile(src, opts = {}) {
  const file = opts.file || '<ak>';
  const dir = opts.dir || (fs.existsSync(file) ? path.dirname(path.resolve(file)) : process.cwd());
  S = { buf: [], usedB: new Set(), usedH: new Set(), kws: new Map(), uid: 0, fn: null, scope: null, line: 0, file };
  const seen = new Set([path.resolve(file)]);
  const forms = parse(src, file).map(f => expandUse(f, dir, seen)).filter(f => f !== null);
  S.fn = { tmps: [], async: false, tryDepth: 0, tco: false, tcoUsed: false, label: 'L0', params: [], selfName: null, selfInfo: null };
  S.scope = null;
  scoped(() => { predeclare(decls(forms)); seqStmt(forms, opts.ret ? RET : DROP); });
  const head = [];
  for (const [n, k] of S.kws) head.push(`const ${k}=Symbol.for(${JSON.stringify(n)});`);
  for (const n of S.usedH) head.push(`const H_${n}=R.H[${JSON.stringify(n)}];`);
  for (const n of S.usedB) head.push(`const ${bj(n)}=R.B[${JSON.stringify(n)}];`);
  const tm = S.fn.tmps.length ? `let ${S.fn.tmps.join(',')};\n` : '';
  const code = `"use strict";\n${head.join('\n')}\nreturn (${S.fn.async ? 'async ' : ''}function main(){\n${tm}${S.buf.join('\n')}\n})();`;
  return code;
}

function bundle(code) {
  const rt = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8').replace(/^#!.*\n/, '');
  return `#!/usr/bin/env node\n'use strict';\nconst R=(function(module,exports){\n${rt}\n;return module.exports})({exports:{}},{});\n` +
    `R.standalone(__filename,function(R,require){\n${code.replace(/^"use strict";\n/, '')}\n});\n`;
}

function usage() {
  console.error(`ak - fast Ak compiler/runner
  ak file.ak [args..]        compile and run
  ak -e 'code' [args..]      run code
  ak js file.ak              print generated JavaScript
  ak build file.ak [out.js]  standalone executable JS bundle`);
  process.exit(2);
}

function main(argv) {
  const a = argv.slice(2);
  if (!a.length) usage();
  try {
    if (a[0] === 'js' || a[0] === 'build') {
      if (!a[1]) usage();
      const code = compile(fs.readFileSync(a[1], 'utf8'), { file: a[1] });
      if (a[0] === 'js') { console.log(code); return; }
      const outf = a[2] || a[1].replace(/\.ak$/, '') + '.js';
      fs.writeFileSync(outf, bundle(code)); fs.chmodSync(outf, 0o755);
      console.error('wrote ' + outf); return;
    }
    if (a[0] === '-e') RT.launch(compile(a[1], { file: '<-e>', dir: process.cwd() }), a.slice(2));
    else RT.launch(compile(fs.readFileSync(a[0], 'utf8'), { file: a[0] }), a.slice(1));
  } catch (e) {
    if (e instanceof CErr || e.code === 'ENOENT') { console.error('error: ' + e.message); process.exit(1); }
    throw e;
  }
}

module.exports = { compile, parse, bundle };
if (require.main === module) main(process.argv);
