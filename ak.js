#!/usr/bin/env node
'use strict';
// Ak compiler: Ak source -> JavaScript (runs on V8's JIT). See SPEC.md.
const fs = require('fs'), path = require('path');
const RT = require('./runtime.js');
const { B } = RT;
const { Sym, S, isSym, isForm } = require('./ast.js');
const { parse } = require('./syntax.js');
const NODE_MODS = new Set(require('module').builtinModules.filter(m => !m.startsWith('_') && !m.includes('/')));

class CErr extends Error { constructor(m) { super(m); this.name = 'CompileError'; } }
const hasB = n => Object.prototype.hasOwnProperty.call(B, n);

// ================================================================== `use` (compile-time include)
function expandUse(x, dir, seen, file) {
  if (!Array.isArray(x)) return x;
  if (x[0] instanceof Sym && x[0].n === 'use' && typeof x[1] === 'string') {
    let f = path.resolve(dir, x[1]);
    if (!fs.existsSync(f) && fs.existsSync(f + '.ak')) f += '.ak';
    if (!fs.existsSync(f)) throw new CErr(`${file}:${x.line}:${x.col}: use: file not found: ${x[1]}`);
    if (seen.has(f)) return null;
    seen.add(f);
    const forms = parse(fs.readFileSync(f, 'utf8'), f).map(y => expandUse(y, path.dirname(f), seen, f));
    const r = [S(':'), ...forms]; r.line = x.line; r.col = x.col; return r;
  }
  const r = x.map(y => expandUse(y, dir, seen, file)); r.line = x.line; r.col = x.col; return r;
}

// ================================================================== compiler state
class Scope { constructor(p, fn) { this.p = p; this.fn = fn; this.v = new Map(); this.hoist = []; } }
let ST;
const RET = { k: 'ret' }, DROP = { k: 'drop' };

const emit = s => ST.buf.push(s);
function capture(f) {
  const sv = ST.buf; const mine = ST.buf = []; let r;
  try { r = f(); } finally { ST.buf = sv; }
  return [mine, r];
}
function cerr(m, node) {
  const n = node && node.line ? node : null;
  throw new CErr(`${ST.file}:${n ? n.line : ST.line}:${n ? n.col : ST.col}: ${m}`);
}
const at_ = x => { if ((Array.isArray(x) || x instanceof Sym) && x.line) { ST.line = x.line; ST.col = x.col; } };

const mg = n => '$' + n.replace(/[^A-Za-z0-9]/g, c => c === '_' ? '__' : '_' + c.charCodeAt(0).toString(16) + '_');
const bj = n => 'R_' + n.replace(/[^A-Za-z0-9]/g, c => '_' + c.charCodeAt(0).toString(16) + '_');
const bref = n => { ST.usedB.add(n); return bj(n); };
const href = n => { ST.usedH.add(n); return 'H_' + n; };
function tmp() { const t = 't' + (++ST.uid); ST.fn.tmps.push(t); return t; }

function lookup(n) { for (let s = ST.scope; s; s = s.p) { const i = s.v.get(n); if (i) return i; } return null; }
function lookupLocal(n) { for (let s = ST.scope; s && s.fn === ST.fn; s = s.p) { const i = s.v.get(n); if (i) return i; } return null; }
function lookupOuter(n) { let s = ST.scope; while (s && s.fn === ST.fn) s = s.p; for (; s; s = s.p) { const i = s.v.get(n); if (i) return i; } return null; }
// function-level local (Python semantics): declared at the root of the current function, hoisted
function declareLocal(n, extra) {
  const i = { js: mg(n), fn: false, ...extra };
  ST.fn.root.v.set(n, i); ST.fn.root.hoist.push(i.js); return i;
}
function declareIn(scope, n, extra) { const i = { js: mg(n), fn: false, ...extra }; scope.v.set(n, i); return i; }
function declareUniq(n, extra) {   // block-scoped (let / for): unique JS name when shadowing
  const vis = lookup(n);
  const i = { js: vis ? mg(n) + '_' + (++ST.uid) : mg(n), fn: false, ...extra };
  ST.scope.v.set(n, i); return i;
}
function scoped(f) {
  const sc = new Scope(ST.scope, ST.fn); ST.scope = sc; const idx = ST.buf.length; let r;
  try { r = f(sc); } finally { ST.scope = sc.p; }
  if (sc.hoist.length) ST.buf.splice(idx, 0, `let ${sc.hoist.join(',')};`);
  return r;
}
const isLam = x => isForm(x, '\\');
const isLit = x => !(x instanceof Sym) && !Array.isArray(x);
const isSpread = x => isForm(x, '%spread');
const isPat = x => isForm(x, '%list');
const ASSIGN_OPS = new Set(['+=', '-=', '*=', '/=', '%=', '**=', '//=', '||=', '??=']);

// names assigned with `=` at this function level (descends into blocks, not into lambdas / function bodies)
function decls(forms) {
  const m = new Map();
  const leaves = p => { if (p instanceof Sym) { if (p.n !== '_') m.set(p.n, false); } else if (isPat(p)) p.slice(1).forEach(q => leaves(isSpread(q) ? q[1] : q)); };
  const walk = x => {
    if (!Array.isArray(x)) return;
    if (!(x[0] instanceof Sym)) { x.forEach(walk); return; }
    switch (x[0].n) {
      case '\\': case 'q': return;
      case '=': {
        const t = x[1];
        if (Array.isArray(t) && !isPat(t)) { if (t[0] instanceof Sym) m.set(t[0].n, true); return; }
        if (t instanceof Sym) m.set(t.n, isLam(x[2]) || m.get(t.n) || false); else leaves(t);
        walk(x[2]); return;
      }
      case 'let': walk(x[1]); for (let i = 2; i < x.length; i++) walk(x[i]); return;
      default: for (let i = 1; i < x.length; i++) walk(x[i]);
    }
  };
  forms.forEach(walk);
  return m;
}
function predeclare(m) {
  for (const [name, isFn] of m) if (!lookupLocal(name)) declareLocal(name, { fn: isFn, predecl: true });
}
function hasClosure(x) {
  if (!Array.isArray(x)) return false;
  if (x[0] instanceof Sym && (x[0].n === '\\' || (x[0].n === '=' && Array.isArray(x[1]) && !isPat(x[1])))) return true;
  return x.some(hasClosure);
}
function mentions(x, name) {
  if (x instanceof Sym) return x.n === name;
  if (Array.isArray(x)) return x.some(y => mentions(y, name));
  return false;
}

// ================================================================== symbols / literals
const idRe = /^[A-Za-z_$][\w$]*$/;
const propAcc = p => idRe.test(p) ? '.' + p : `[${JSON.stringify(p)}]`;

function ref(name, node) {
  const info = lookup(name);
  if (info) return info.js;
  if (hasB(name)) return bref(name);
  if (name === 'require') return 'require';
  if (name in globalThis) return name;
  if (NODE_MODS.has(name)) { ST.usedMods.add(name); return 'M_' + name; }
  cerr(`undefined: ${name}`, node);
}
// JS property path rooted at a free global/module (Math.max, process.argv, fs.readFileSync): returns JS text or null
function jsPath(x) {
  if (x instanceof Sym) {
    if (lookup(x.n) || hasB(x.n)) return null;
    if (x.n === 'require' || x.n in globalThis) return x.n;
    if (NODE_MODS.has(x.n)) { ST.usedMods.add(x.n); return 'M_' + x.n; }
    return null;
  }
  if (isForm(x, '.@') && x.length === 3 && typeof x[2] === 'string') { const b = jsPath(x[1]); return b === null ? null : b + propAcc(x[2]); }
  return null;
}

function lit(x) {
  if (x === null || x === undefined) return 'null';
  if (x === true) return 'true';
  if (x === false) return 'false';
  if (typeof x === 'number') return (x < 0 || Object.is(x, -0)) ? `(${Object.is(x, -0) ? '-0' : x})` : String(x);
  if (typeof x === 'bigint') return x < 0n ? `(${x}n)` : `${x}n`;
  if (typeof x === 'string') return JSON.stringify(x);
  cerr('bad literal');
}
function quote(x) {
  if (x instanceof Sym) return JSON.stringify(x.n);
  if (Array.isArray(x)) return `[${(isSym(x[0], '%list') ? x.slice(1) : x).map(quote).join(',')}]`;
  return lit(x);
}

// ---- static numeric knowledge (sound, conservative): is this expression certainly a number (or an exception)?
const NUMHEADS = new Set(['-', '*', '/', '//', '%', '**', '#', 'bnot', '&', '|', '^', '<<', '>>', '>>>', 'abs', 'sqrt', 'int', 'flr', 'cel', 'rnd', 'rand', 'sum', 'now', 'clock']);
// cand: optimistic candidate set (during fixpoint); otherwise consult variable info.num flags
function isNum(x, cand) {
  if (typeof x === 'number') return true;
  if (x instanceof Sym) { if (cand) return cand.has(x.n); const i = lookup(x.n); return !!(i && i.num); }
  if (!Array.isArray(x) || !(x[0] instanceof Sym)) return false;
  const n = x[0].n;
  if (!cand && lookup(n)) return false;
  switch (n) {
    case '+': return x.length > 1 && x.slice(1).every(a => isNum(a, cand));
    case '&&': case '||': return x.length > 1 && x.slice(1).every(a => isNum(a, cand));
    case '??': return x.length > 1 && isNum(x[1], cand);
    case '=': case '<-': return x[1] instanceof Sym && isNum(x[2], cand);
    case ':': return x.length > 1 && isNum(x[x.length - 1], cand);
    case '?': { for (let i = 2; i < x.length; i += 2) if (!isNum(x[i], cand)) return false; if (x.length % 2 === 0) return false; return x.length >= 3; }
    case '%loopvar': return x[1] === 'range' || isNum(x[1], cand);
    default: return NUMHEADS.has(n) && !Array.isArray(n);
  }
}
const UNK = { unknown: true };
// name -> list of right-hand sides assigned to it anywhere in these forms (UNK when not analyzable)
function collectAssigns(forms, ownParams) {
  const m = new Map();
  const add = (n, r) => { if (!m.has(n)) m.set(n, []); m.get(n).push(r); };
  const leaves = p => { if (p instanceof Sym) { if (p.n !== '_') add(p.n, UNK); } else if (isPat(p)) p.slice(1).forEach(q => leaves(isSpread(q) ? q[1] : q)); };
  const params = list => { const l = list instanceof Sym || isPat(list) ? [list] : (Array.isArray(list) ? list : []); l.forEach(p => { if (p instanceof Sym) add(p.n, UNK); else if (isForm(p, '=') && p[1] instanceof Sym) { add(p[1].n, UNK); walk(p[2]); } else if (isSpread(p) && p[1] instanceof Sym) add(p[1].n, UNK); else leaves(p); }); };
  const rangeLike = c => (isForm(c, '..') && !lookup('..')) || (typeof c === 'number' && Number.isInteger(c) && c >= 0);
  const walk = x => {
    if (!Array.isArray(x)) return;
    if (x[0] instanceof Sym) {
      const h = x[0].n;
      switch (h) {
        case 'q': return;
        case '=': {
          const t = x[1];
          if (Array.isArray(t) && !isPat(t)) { if (t[0] instanceof Sym) add(t[0].n, UNK); params(t.slice(1)); x.slice(2).forEach(walk); return; }
          if (t instanceof Sym) add(t.n, x[2]); else leaves(t);
          walk(x[2]); return;
        }
        case '<-': if (x[1] instanceof Sym) add(x[1].n, x[2]); else walk(x[1]); walk(x[2]); return;
        case '+=': case '-=': case '*=': case '/=': case '%=': case '**=': case '//=':
          if (x[1] instanceof Sym) add(x[1].n, [S(h.slice(0, -1)), x[1], x[2]]); else walk(x[1]); walk(x[2]); return;
        case '||=': case '??=': if (x[1] instanceof Sym) add(x[1].n, [S('??'), x[1], x[2]]); else walk(x[1]); walk(x[2]); return;
        case '\\': params(x[1]); x.slice(2).forEach(walk); return;
        case 'let': {
          const b = x[1];
          if (Array.isArray(b)) for (let i = 0; i < b.length; i += 2) { if (b[i] instanceof Sym) add(b[i].n, b[i + 1]); else leaves(b[i]); walk(b[i + 1]); }
          x.slice(2).forEach(walk); return;
        }
        case 'for': {
          const v = x[1], c = x[2];
          if (v instanceof Sym) add(v.n, [S('%loopvar'), rangeLike(c) ? 'range' : c]); else leaves(v);
          walk(c); x.slice(3).forEach(walk); return;
        }
      }
    }
    x.forEach(walk);
  };
  params(ownParams || []);
  forms.forEach(walk);
  return m;
}
function numCandidates(forms, ownParams) {
  const m = collectAssigns(forms, ownParams);
  const cand = new Set([...m].filter(([, rs]) => rs.every(r => r !== UNK)).map(([n]) => n));
  for (let ch = true; ch;) { ch = false; for (const n of [...cand]) if (!m.get(n).every(r => isNum(r, cand))) { cand.delete(n); ch = true; } }
  return cand;
}

// ================================================================== expressions
function exprs(xs, spreadOk) {
  const parts = xs.map(x => capture(() => {
    if (isSpread(x)) { if (!spreadOk) cerr('..x spread is only allowed in call arguments and list literals', x); return { sp: true, e: `${href('it')}(${expr(x[1])})` }; }
    return { sp: false, e: expr(x) };
  }));
  let last = -1; parts.forEach((p, i) => { if (p[0].length) last = i; });
  const out = [];
  parts.forEach(([pre, r], i) => {
    pre.forEach(emit);
    let e = r.e;
    if (i < last && !isLit(xs[i])) { const t = tmp(); emit(`${t}=${r.sp ? e + '.slice()' : e};`); e = t; }
    out.push(r.sp ? '...' + e : e);
  });
  return out;
}

const BOOLH = new Set(['<', '>', '<=', '>=', '==', '!=', '!', 'has', 'any', 'all', 'is', 'starts', 'ends', 'ex']);
function cond(x) {
  if (x === true) return 'true';
  if (x === false || x === null || x === 0 || x === '') return 'false';
  if (isLit(x)) return 'true';
  if (Array.isArray(x) && x.length && x[0] instanceof Sym && !lookup(x[0].n)) {
    const n = x[0].n;
    if (n === '&&' || n === '||') return andOr(n === '&&', x.slice(1), 'cond', x);
    if (n === '%cmp') return expr(x);
    if (BOOLH.has(n) && hasB(n)) return expr(x);
  }
  return `${href('tr')}(${expr(x)})`;
}

function andOr(isAnd, xs, mode, node) {
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

function nilOr(xs) {   // (?? a b c): first non-nil value
  if (!xs.length) return 'null';
  if (xs.length === 1) return expr(xs[0]);
  const parts = xs.map(x => capture(() => expr(x)));
  const t = tmp();
  if (parts.slice(1).every(p => !p[0].length)) {
    parts[0][0].forEach(emit);
    let r = parts[parts.length - 1][1];
    for (let i = parts.length - 2; i >= 0; i--) r = `((${t}=${parts[i][1]})!=null?${t}:${r})`;
    return r;
  }
  let depth = 0;
  parts.forEach(([pre, e], i) => {
    pre.forEach(emit); emit(`${t}=${e};`);
    if (i < parts.length - 1) { emit(`if(${t}==null){`); depth++; }
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

// ---- parameters / functions
function parseParams(list, node) {
  if (!Array.isArray(list) || (list.length && list[0] instanceof Sym && list[0].n === '%list')) {
    if (list instanceof Sym) list = [list]; else if (isPat(list)) list = [list]; else cerr('parameter list must be (a b ..)', node);
  }
  const ps = []; let rest = null, min = 0, seenDef = false;
  list.forEach((p, i) => {
    if (p instanceof Sym) { if (seenDef) cerr(`parameter ${p.n} without default follows a default`, node); ps.push({ name: p.n }); min++; }
    else if (isForm(p, '=') && p.length === 3 && p[1] instanceof Sym) { ps.push({ name: p[1].n, def: p[2], hasDef: true }); seenDef = true; }
    else if (isSpread(p) && p[1] instanceof Sym) { if (i !== list.length - 1) cerr('rest parameter must be last', node); rest = p[1].n; }
    else if (isPat(p)) { if (seenDef) cerr('pattern parameter follows a default', node); ps.push({ pat: p }); min++; }
    else cerr('bad parameter', node);
  });
  return { ps, rest, min, max: rest ? Infinity : ps.length };
}

function compileFn(jsName, plist, body, selfName, selfInfo, node) {
  const sv = { buf: ST.buf, fn: ST.fn, scope: ST.scope };
  const { ps, rest, min, max } = parseParams(plist, node);
  if (selfInfo) selfInfo.arity = [min, max];
  const fn = { tmps: [], async: false, tryDepth: 0, tco: false, tcoUsed: false, label: 'L' + (++ST.uid), params: [], selfName, selfInfo, root: null, numCand: null };
  ST.fn = fn; ST.buf = [];
  let lines, jsParams = [];
  try {
    scoped(sc => {
      fn.root = sc;
      const pro = [];
      for (const p of ps) {
        if (p.pat) { const t = 'p' + (++ST.uid); jsParams.push(t); pro.push(() => destructure(p.pat, t, assignLeaf)); }
        else { const i = declareIn(sc, p.name, { param: true }); jsParams.push(i.js); }
      }
      if (rest) { const i = declareIn(sc, rest, { param: true }); jsParams.push('...' + i.js); }
      fn.params = jsParams.slice();
      fn.tco = !!selfName && !rest && ps.every(p => !p.pat && !p.hasDef) && !body.some(hasClosure);
      fn.numCand = numCandidates(body, plist);
      predeclare(decls([...body, ...ps.filter(p => p.pat).map(p => [S('='), p.pat, null])]));
      for (const p of ps) if (p.hasDef) {
        const i = lookupLocal(p.name);
        const [pre, e] = capture(() => expr(p.def));
        emit(`if(${i.js}===undefined){`); pre.forEach(emit); emit(`${i.js}=${e};}`);
      }
      pro.forEach(f => f());
      rootSeq(body, RET);
    });
    lines = ST.buf;
  } finally { ST.buf = sv.buf; ST.fn = sv.fn; ST.scope = sv.scope; }
  let inner = fn.tmps.length ? [`let ${fn.tmps.join(',')};`, ...lines] : lines;
  if (fn.tcoUsed) inner = [`${fn.label}:for(;;){`, ...inner, '}'];
  return `(${fn.async ? 'async ' : ''}function ${jsName || ''}(${jsParams.join(',')}){\n${inner.join('\n')}\n})`;
}

// ---- assignment
function assignLeaf(name, val) {
  const info = lookupLocal(name) || declareLocal(name);
  emit(`${info.js}=${val};`);
}
function letLeaf(name, val) {
  const info = declareUniq(name, { inline: true });
  emit(`let ${info.js}=${val};`);
}
function destructure(pat, src, leaf) {
  const t = tmp(); emit(`${t}=${href('toArr')}(${src});`);
  const items = pat.slice(1);
  items.forEach((it, k) => {
    if (isSpread(it)) {
      if (k !== items.length - 1 || !(it[1] instanceof Sym)) cerr('rest pattern ..x must be last', pat);
      if (it[1].n !== '_') leaf(it[1].n, `${t}.slice(${k})`);
    } else if (it instanceof Sym) { if (it.n !== '_') leaf(it.n, `(${t}[${k}]??null)`); }
    else if (isPat(it)) destructure(it, `(${t}[${k}]??null)`, leaf);
    else cerr('bad destructuring pattern (use names, _, nested [..], ..rest)', pat);
  });
}

function doAssign(x) {
  const t = x[1];
  if (Array.isArray(t) && !isPat(t)) {            // (= (f a b) body..)
    if (!(t[0] instanceof Sym)) cerr('function name must be a symbol', x);
    const name = t[0].n;
    const info = lookupLocal(name) || declareLocal(name);
    info.fn = true;
    return `(${info.js}=${compileFn(info.js, t.slice(1), x.slice(2), name, info, x)})`;
  }
  if (x.length !== 3) cerr('(= name value) takes exactly one value', x);
  if (isPat(t)) {
    // swap/parallel assignment fast path: [a b]=[b a%b]
    const v = x[2];
    if (isPat(v) && v.length === t.length && !v.slice(1).some(isSpread) && !t.slice(1).some(y => !(y instanceof Sym))) {
      const es = exprs(v.slice(1)); const ts = es.map(e => { const k = tmp(); emit(`${k}=${e};`); return k; });
      t.slice(1).forEach((y, i) => { if (y.n !== '_') assignLeaf(y.n, ts[i]); });
      return `[${ts.join(',')}]`;
    }
    const e = expr(v); const k = tmp(); emit(`${k}=${e};`);
    destructure(t, k, assignLeaf);
    return k;
  }
  if (!(t instanceof Sym)) cerr('= target must be a name, a [pattern], or (name params..)', x);
  let info = lookupLocal(t.n);
  if (!info) info = declareLocal(t.n);
  if (info.predecl && !info.assigned && lookupOuter(t.n) && mentions(x[2], t.n))
    cerr(`${t.n} is local to this function (it is assigned here) but is read before assignment; to change the outer ${t.n} use (<- ${t.n} ..)`, x);
  if (isLam(x[2])) {
    info.fn = true;
    const v = x[2];
    const code = compileFn(info.js, v[1], v.slice(2), t.n, info, v);
    info.assigned = true;
    return `(${info.js}=${code})`;
  }
  const e = expr(x[2]);
  info.assigned = true;
  return `(${info.js}=${e})`;
}

function doSet(x) {   // (<- name v): rebind a variable of any enclosing scope
  const t = x[1];
  if (x.length !== 3) cerr('(<- name value)', x);
  if (isForm(t, '@') && t.length === 3) { const es = exprs([t[1], t[2], x[2]]); return `${href('put')}(${es.join(',')})`; }
  if (!(t instanceof Sym)) cerr('<- target must be a name', x);
  const info = lookup(t.n);
  if (!info) cerr(`<-: undefined variable ${t.n}`, x);
  return `(${info.js}=${expr(x[2])})`;
}

function doOpAssign(x) {   // (+= target v) ...
  const op = x[0].n.slice(0, -1), t = x[1], v = x[2];
  if (t instanceof Sym) {
    const info = lookupLocal(t.n);
    if (!info) {
      if (lookup(t.n)) cerr(`${t.n} belongs to an enclosing function/scope; assigning here would create a local. Use (<- ${t.n} ${t.n}${op}..) to modify it`, x);
      cerr(`undefined: ${t.n}`, x);
    }
    return expr([S('<-'), t, [S(op), t, v]]);
  }
  if (isForm(t, '@') && t.length === 3 || isForm(t, '.@') && t.length === 3) {
    const a = S('%o' + (++ST.uid)), i = S('%i' + ST.uid);
    const ta = tmp(), ti = tmp();
    ST.scope.v.set(a.n, { js: ta }); ST.scope.v.set(i.n, { js: ti });
    emit(`${ta}=${expr(t[1])};`);
    emit(`${ti}=${expr(t[2])};`);
    const cur = [t[0], a, i];
    const newv = [S(op), cur, v];
    return expr(isForm(t, '@') ? [S('<@'), a, i, newv] : [S('.='), a, i, newv]);
  }
  cerr(`invalid target for ${x[0].n}`, x);
}

// ---- operators
const BINJS = { '&': '&', '|': '|', '^': '^', '<<': '<<', '>>': '>>', '>>>': '>>>' };
const litEq = x => x === true || x === false || typeof x === 'number' || typeof x === 'string';

// wrap an operand with a number check unless statically known to be a number
function numArg(args) { return (e, i) => isNum(args[i]) ? e : `${href('n')}(${e})`; }

// inline type checks run left-to-right *before* later operands are evaluated; if a later operand can have effects or
// throw, we must evaluate everything first and check at operation time (like Python) -> use the two-operand helper
function orderSafe(args) {
  for (let i = 0; i < args.length; i++) if (!isNum(args[i])) for (let j = i + 1; j < args.length; j++) if (!(isLit(args[j]) || args[j] instanceof Sym)) return false;
  return true;
}
const HELP2 = { '-': 'sub', '*': 'mul', '**': 'pow', '&': 'band', '|': 'bor', '^': 'bxor', '<<': 'shl', '>>': 'shr', '>>>': 'ushr' };
function strictBin(n, args) {   // left fold of 2-operand helpers (checked variants when integer-overflow detection is on)
  const es = exprs(args);
  const hn = ST.safe && ['-', '*', '**'].includes(n) ? { '-': 'cksub', '*': 'ckmul', '**': 'ckpow' }[n] : HELP2[n];
  return es.slice(1).reduce((a, e) => `${href(hn)}(${a},${e})`, es[0]);
}

function inlineOp(n, args, node) {
  const k = args.length;
  switch (n) {
    case '+': {
      if (k === 0) return '0';
      if (k === 1) return numArg(args)(exprs(args)[0], 0);
      const es = exprs(args);
      let r = es[0], numeric = isNum(args[0]);
      for (let i = 1; i < k; i++) {
        numeric = numeric && isNum(args[i]);      // both sides statically numbers -> native +; otherwise strict polymorphic add
        r = (numeric && !ST.safe) ? `(${r}+${es[i]})` : `${href(ST.safe ? 'ckadd' : 'add')}(${r},${es[i]})`;
      }
      return r;
    }
    case '*': {
      if (k === 0) return '1';
      if (k >= 2 && (ST.safe || !orderSafe(args))) return strictBin(n, args);
      const es = exprs(args).map(numArg(args)); return k === 1 ? es[0] : `(${es.join('*')})`;
    }
    case '-': {
      if (k === 0) return '0';
      if (k >= 2 && (ST.safe || !orderSafe(args))) return strictBin(n, args);
      const es = exprs(args).map(numArg(args)); return k === 1 ? `(-${es[0]})` : `(${es.join('-')})`;
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
        return `((${t}=${numArg(args)(es[0], 0)})%${es[1]}+(${t}%${es[1]}<0?${es[1]}:0))`;
      }
      // fallthrough
    case '//': if (k === 2) return `${href(n === '%' ? 'mod' : 'fdiv')}(${exprs(args).join(',')})`; return;
    case '**': if (k === 2 && (ST.safe || !orderSafe(args))) return strictBin(n, args); if (k === 2) { const es = exprs(args).map(numArg(args)); return `(${es[0]}**${es[1]})`; } return;
    case '<': case '>': case '<=': case '>=': {
      if (k !== 2) return;
      const es = exprs(args);
      if (isNum(args[0]) && isNum(args[1])) return `(${es[0]}${n}${es[1]})`;
      return `${href({ '<': 'lt', '>': 'gt', '<=': 'le', '>=': 'ge' }[n])}(${es[0]},${es[1]})`;
    }
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
    case '&': case '|': case '^': if (k >= 2 && !orderSafe(args)) return strictBin(n, args); if (k >= 2) return `(${exprs(args).map(numArg(args)).join(BINJS[n])})`; return;
    case '<<': case '>>': case '>>>': if (k === 2 && !orderSafe(args)) return strictBin(n, args); if (k === 2) return `(${exprs(args).map(numArg(args)).join(BINJS[n])})`; return;
    case 'bnot': if (k === 1) return `(~${exprs(args).map(numArg(args))[0]})`; return;
    case '#': if (k === 1) return `${href('len')}(${exprs(args)[0]})`; return;
    case '@': if (k === 2) return `${href('at')}(${exprs(args).join(',')})`; return;
    case '@!': if (k === 2) { const es = exprs(args); return `(${es[0]}[${es[1]}]??null)`; } return;
    case '<@!': if (k === 3) { const es = exprs(args); return `(${es[0]}[${es[1]}]=${es[2]})`; } return;
    case 'list': return `[${exprs(args, true).join(',')}]`;
  }
}

function callArgs(info, name, args, node) {
  if (info && info.arity && !args.some(isSpread)) {
    const [mn, mx] = info.arity;
    if (args.length < mn || args.length > mx)
      cerr(`${name} takes ${mn === mx ? mn : mx === Infinity ? mn + '+' : mn + '-' + mx} argument${mx === 1 ? '' : 's'}, got ${args.length}`, node);
  }
  return exprs(args, true).join(',');
}

function call(x) {
  const h = x[0], args = x.slice(1);
  if (h instanceof Sym) {
    const info = lookup(h.n);
    if (info) { const a = callArgs(info, h.n, args, x); return info.fn ? `${info.js}(${a})` : `${href('fn')}(${info.js})(${a})`; }
    if (hasB(h.n)) {
      const r = args.some(isSpread) ? undefined : inlineOp(h.n, args, x);
      return r !== undefined ? r : `${bref(h.n)}(${exprs(args, true).join(',')})`;
    }
    const f = ref(h.n, x);
    return `${f}(${exprs(args, true).join(',')})`;
  }
  const p = jsPath(h);
  if (p !== null) return `${p}(${exprs(args, true).join(',')})`;
  if (typeof h === 'string' || typeof h === 'number' || h === true || h === false || h === null) cerr(`cannot call ${lit(h)}`, x);
  const es = exprs([h, ...args], true);
  return isLam(h) ? `${es[0]}(${es.slice(1).join(',')})` : `${href('fn')}(${es[0]})(${es.slice(1).join(',')})`;
}

function swClauses(x) {
  const g = '%sw' + (++ST.uid);
  const t = tmp();
  emit(`${t}=${expr(x[1])};`);
  ST.scope.v.set(g, { js: t, fn: false });
  const rest = x.slice(2), out = [];
  let i = 0;
  for (; i + 1 < rest.length; i += 2) {
    const c = rest[i];
    const test = isPat(c) ? [S('||'), ...c.slice(1).map(v => [S('=='), S(g), v])] : [S('=='), S(g), c];
    out.push(test, rest[i + 1]);
  }
  if (i < rest.length) out.push(rest[i]);
  return out;
}

function cmpChain(x) {   // (%cmp a op b op c) -> (&& (op a (= t b)) (op t c))  each operand evaluated once, short-circuit
  const operands = [], ops = [];
  for (let i = 1; i < x.length; i++) (i % 2 ? operands : ops).push(x[i]);
  const tests = []; let left = operands[0];
  for (let i = 0; i < ops.length; i++) {
    let right = operands[i + 1], nextLeft = right;
    if (i < ops.length - 1) { const g = '%c' + (++ST.uid); ST.scope.v.set(g, { js: tmp() }); right = [S('='), S(g), right]; nextLeft = S(g); }
    tests.push([S(ops[i]), left, right]);
    left = nextLeft;
  }
  const r = [S('&&'), ...tests]; r.line = x.line; r.col = x.col;
  return r;
}

function dynFieldGet(x) {  // (.@ o "k")
  const p = jsPath(x);
  if (p !== null) return `(${p}??null)`;
  return `${href('dot')}(${expr(x[1])},${typeof x[2] === 'string' ? JSON.stringify(x[2]) : expr(x[2])})`;
}

function expr(x) {
  if (x instanceof Sym) return ref(x.n, x);
  if (!Array.isArray(x)) return lit(x);
  at_(x);
  if (!x.length) return 'null';
  const h = x[0];
  if (h instanceof Sym) {
    switch (h.n) {
      case '%list': return `[${exprs(x.slice(1), true).join(',')}]`;
      case '%map': {
        const a = x.slice(1);
        if (!a.length) return 'new Map()';
        const es = exprs(a); const ps = [];
        for (let i = 0; i < es.length; i += 2) ps.push(`[${es[i]},${es[i + 1]}]`);
        return `new Map([${ps.join(',')}])`;
      }
      case '%spread': cerr('..x spread is only allowed in call arguments and list literals', x);
      case '%cmp': return expr(cmpChain(x));
      case '?': return exprIf(x.slice(1));
      case ':': {
        const f = x.slice(1); if (!f.length) return 'null';
        f.slice(0, -1).forEach(y => stmt(y, DROP));
        return expr(f[f.length - 1]);
      }
      case '=': return doAssign(x);
      case '<-': return doSet(x);
      case '+=': case '-=': case '*=': case '/=': case '%=': case '**=': case '//=': case '||=': case '??=': return doOpAssign(x);
      case '??': return nilOr(x.slice(1));
      case '\\': return compileFn('', x[1], x.slice(2), null, null, x);
      case '&&': return andOr(true, x.slice(1), 'val', x);
      case '||': return andOr(false, x.slice(1), 'val', x);
      case 'wh': case 'for': case 'try': case 'let': case 'sw': return viaTemp(x);
      case 'q': return quote(x[1]);
      case 'aw': ST.fn.async = true; return `(await ${expr(x[1])})`;
      case 'req': return `require(${expr(x[1])})`;
      case 'js': if (typeof x[1] !== 'string') cerr('(js "code") needs a string literal', x); return `(${x[1]})`;
      case 'new': {
        if (x.length < 2) cerr('(new Class args..)', x);
        const p = jsPath(x[1]);
        const es = exprs(x.slice(2), true);
        return `(new (${p !== null ? p : expr(x[1])})(${es.join(',')}))`;
      }
      case '.': {
        if (x.length < 3) cerr('(. obj "method" args..)', x);
        const m = x[2], p = jsPath(x[1]);
        if (typeof m === 'string') {
          if (p !== null) return `${p}${propAcc(m)}(${exprs(x.slice(3), true).join(',')})`;
          const es = exprs([x[1], ...x.slice(3)], true);
          return `(${es[0]})${propAcc(m)}(${es.slice(1).join(',')})`;
        }
        const em = exprs([x[1], m, ...x.slice(3)], true);
        return `${href('mcall')}(${em[0]},${em[1]},[${em.slice(2).join(',')}])`;
      }
      case '.@': if (x.length !== 3) cerr('(.@ obj "prop")', x); return dynFieldGet(x);
      case '.=': {
        if (x.length !== 4) cerr('(.= obj "prop" value)', x);
        const es = exprs([x[1], x[2], x[3]]);
        return `${href('setdot')}(${es.join(',')})`;
      }
      case 'use': cerr('(use "file") needs a string literal', x);
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

// function/program root: after an unconditional top-level `x=<numeric>`, later reads of x are statically numeric
function rootSeq(forms, d) {
  if (!forms.length) return deliver(d, 'null');
  for (let i = 0; i < forms.length; i++) {
    stmt(forms[i], i === forms.length - 1 ? d : DROP);
    const f = forms[i];
    if (isForm(f, '=') && f[1] instanceof Sym && ST.fn.numCand && ST.fn.numCand.has(f[1].n)) {
      const info = lookupLocal(f[1].n);
      if (info && !info.param) info.num = true;
    }
  }
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
  if (!Array.isArray(b) || b.length % 2) cerr('(let (name value ..) body..)', x);
  emit('{');
  scoped(() => {
    for (let i = 0; i < b.length; i += 2) {
      const name = b[i], val = b[i + 1];
      if (isPat(name)) { const k = tmp(); emit(`${k}=${expr(val)};`); destructure(name, k, letLeaf); continue; }
      if (!(name instanceof Sym)) cerr('let: name must be a symbol or [pattern]', x);
      const own = ST.scope.v.get(name.n);
      if (own && own.inline) { emit(`${own.js}=${expr(val)};`); continue; }
      if (isLam(val)) {
        const info = declareUniq(name.n, { fn: true, inline: true });
        emit(`let ${info.js}=${compileFn(info.js, val[1], val.slice(2), name.n, info, val)};`);
      } else {
        const e = expr(val);
        const num = isNum(val) && !!(ST.fn.numCand && ST.fn.numCand.has(name.n));
        const info = declareUniq(name.n, { inline: true, num });
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
  seqStmt(x.slice(2), DROP);
  emit('}');
}

function forStmt(x) {
  if (x.length >= 3 && typeof x[1] === 'number') x = [x[0], S('_'), ...x.slice(1)];     // (for 3 body..): repeat
  if (x.length < 3) cerr('(for var coll body..)', x);
  const v = x[1], c = x[2], body = x.slice(3);
  if (!(v instanceof Sym || isPat(v))) cerr('for: variable must be a name or [pattern]', x);
  let loopNum = false;
  const bindVar = el => {
    if (v instanceof Sym) { if (v.n !== '_') { letLeaf(v.n, el); if (loopNum && ST.fn.numCand && ST.fn.numCand.has(v.n)) lookupLocal(v.n).num = true; } }
    else destructure(v, el, letLeaf);
  };
  const loopBody = el => { scoped(() => { bindVar(el); seqStmt(body, DROP); }); };
  const isRangeCall = isForm(c, '..') && !lookup('..') && c.length >= 2 && c.length <= 3 && c.slice(1).every(a => !isSpread(a));
  const isNumLit = typeof c === 'number' && Number.isInteger(c) && c >= 0;
  if (isRangeCall || isNumLit || (v instanceof Sym && isNum(c))) {
    let lo = '0', hi;
    if (isRangeCall) { const a = c.slice(1); const chk = numArg(a); if (a.length === 1) hi = chk(exprs(a)[0], 0); else { const es = exprs(a).map(chk); lo = es[0]; hi = es[1]; } }
    else hi = expr(c);
    const ci = 'i' + (++ST.uid), ce = 'e' + ST.uid;
    loopNum = true;
    emit(`for(let ${ci}=${lo},${ce}=${hi};${ci}<${ce};${ci}++){`);
    loopBody(ci);
    emit('}');
    return;
  }
  // generic: number -> 0..n, otherwise iterate elements (maps iterate [key, value] entries)
  const e = expr(c);
  const cv = 'c' + (++ST.uid), xs = 'x' + ST.uid, k = 'k' + ST.uid, en = 'n' + ST.uid;
  emit(`{const ${cv}=${e},${xs}=typeof ${cv}==='number'?null:${href('it')}(${cv}),${en}=${xs}===null?${cv}:${xs}.length;`);
  emit(`for(let ${k}=0;${k}<${en};${k}++){`);
  loopBody(`(${xs}===null?${k}:${xs}[${k}])`);
  emit('}}');
}

function tryStmt(x, d) {
  if (x.length !== 3) cerr('(try body handler)', x);
  const ex = 'ex' + (++ST.uid);
  emit('try{');
  ST.fn.tryDepth++;
  try { stmt(x[1], d); } finally { ST.fn.tryDepth--; }
  emit(`}catch(${ex}){`);
  const h = x[2];
  const hp = isLam(h) ? h[1] : null;
  if (isLam(h) && Array.isArray(hp) && hp.length <= 1 && hp.every(p => p instanceof Sym) && !(hp.length && isPat(hp))) {
    scoped(() => {
      if (hp.length) { const info = declareUniq(hp[0].n, { inline: true }); emit(`let ${info.js}=${href('msg')}(${ex});`); }
      seqStmt(h.slice(2), d);
    });
  } else if (isLam(h) && hp instanceof Sym) {
    scoped(() => { const info = declareUniq(hp.n, { inline: true }); emit(`let ${info.js}=${href('msg')}(${ex});`); seqStmt(h.slice(2), d); });
  } else {
    deliver(d, `${href('fn')}(${expr(h)})(${href('msg')}(${ex}))`);
  }
  emit('}');
}

function tailSelf(x) {
  const f = ST.fn;
  if (!f.tco || f.tryDepth) return false;
  const h = x[0];
  if (h.n !== f.selfName || lookup(h.n) !== f.selfInfo) return false;
  const args = x.slice(1);
  if (args.length > f.params.length || args.some(isSpread)) return false;
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
  if (Array.isArray(x) && x.length) {
    if (x.line && x.line !== ST.lastMark) { ST.lastMark = x.line; emit(`//@${x.line}:${x.col}`); }
    at_(x);
    if (x[0] instanceof Sym) {
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
  }
  deliver(d, expr(x));
}

// ================================================================== driver
function compile(src, opts = {}) {
  const file = opts.file || '<ak>';
  const dir = opts.dir || (fs.existsSync(file) ? path.dirname(path.resolve(file)) : process.cwd());
  ST = { safe: opts.safe !== false, buf: [], usedB: new Set(), usedH: new Set(), usedMods: new Set(), uid: 0, fn: null, scope: null, line: 1, col: 1, file, lastMark: 0 };
  const seen = new Set([path.resolve(file)]);
  const forms = parse(src, file).map(f => expandUse(f, dir, seen, file)).filter(f => f !== null);
  ST.fn = { tmps: [], async: false, tryDepth: 0, tco: false, tcoUsed: false, label: 'L0', params: [], selfName: null, selfInfo: null, root: null };
  scoped(sc => { ST.fn.root = sc; ST.fn.numCand = numCandidates(forms, []); predeclare(decls(forms)); rootSeq(forms, opts.ret ? RET : DROP); });
  const head = [];
  for (const n of ST.usedMods) head.push(`const M_${n}=require(${JSON.stringify(n)});`);
  for (const n of ST.usedH) head.push(`const H_${n}=R.H[${JSON.stringify(n)}];`);
  for (const n of ST.usedB) head.push(`const ${bj(n)}=R.B[${JSON.stringify(n)}];`);
  const tm = ST.fn.tmps.length ? `let ${ST.fn.tmps.join(',')};\n` : '';
  return `"use strict";\n${head.join('\n')}\nreturn (${ST.fn.async ? 'async ' : ''}function main(){\n${tm}${ST.buf.join('\n')}\n})();`;
}

function bundle(code, name) {
  const rt = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8').replace(/^#!.*\n/, '');
  return `#!/usr/bin/env node\n'use strict';\nconst R=(function(module,exports){\n${rt}\n;return module.exports})({exports:{}},{});\n` +
    `R.standalone(__filename,function(R,require){\n//@@PROGRAM\n${code.replace(/^"use strict";\n/, '')}\n},${JSON.stringify(name || '')});\n`;
}

function usage() {
  console.error(`ak - fast Ak compiler/runner   (prefix any command with --fast to skip integer-overflow checks)
  ak file.ak [args..]        compile and run
  ak -e 'code' [args..]      run code
  ak js file.ak              print generated JavaScript
  ak build file.ak [out.js]  standalone JS bundle (needs only node)
  ak exe file.ak [out]       native single-file executable (embeds node; needs npm access once for 'postject')
  ak check file.ak           compile only; report errors
  ak fmt file.ak             print canonical, token-cheap source (comments are dropped)`);
  process.exit(2);
}

function main(argv) {
  let a = argv.slice(2);
  const fast = a[0] === '--fast'; if (fast) a = a.slice(1);      // --fast: skip integer-overflow checks (speed)
  const copts = { safe: !fast };
  if (!a.length) usage();
  try {
    if (a[0] === 'check') {
      if (!a[1]) usage();
      compile(fs.readFileSync(a[1], 'utf8'), { file: a[1] }); console.log('ok'); return;
    }
    if (a[0] === 'fmt') {
      if (!a[1]) usage();
      const forms = require('./syntax.js').parse(fs.readFileSync(a[1], 'utf8'), a[1]);
      process.stdout.write(require('./fmt.js').fmt(forms, { layout: 'lines' })); return;
    }
    if (a[0] === 'exe') {
      if (!a[1]) usage();
      const cp = require('child_process'), os = require('os');
      const out = path.resolve(a[2] || a[1].replace(/\.ak$/, ''));
      const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'akexe-'));
      const js = path.join(tmpd, 'main.js');
      fs.writeFileSync(js, bundle(compile(fs.readFileSync(a[1], 'utf8'), { file: a[1], ...copts }), a[1]));
      fs.writeFileSync(path.join(tmpd, 'sea.json'), JSON.stringify({ main: js, output: path.join(tmpd, 'sea.blob'), disableExperimentalSEAWarning: true, assets: { 'main.js': js } }));
      const run = (cmd, args) => { const r = cp.spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'], cwd: tmpd }); if (r.status !== 0) throw new CErr(`${cmd} ${args[0]} failed`); };
      run(process.execPath, ['--experimental-sea-config', path.join(tmpd, 'sea.json')]);
      fs.copyFileSync(process.execPath, out); fs.chmodSync(out, 0o755);
      run('npx', ['--yes', 'postject', out, 'NODE_SEA_BLOB', path.join(tmpd, 'sea.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2']);
      fs.rmSync(tmpd, { recursive: true, force: true });
      console.error('wrote ' + out); return;
    }
    if (a[0] === 'js' || a[0] === 'build') {
      if (!a[1]) usage();
      const code = compile(fs.readFileSync(a[1], 'utf8'), { file: a[1], ...copts });
      if (a[0] === 'js') { console.log(code); return; }
      const outf = a[2] || a[1].replace(/\.ak$/, '') + '.js';
      fs.writeFileSync(outf, bundle(code, a[1])); fs.chmodSync(outf, 0o755);
      console.error('wrote ' + outf); return;
    }
    if (a[0] === '-e') RT.launch(compile(a[1], { file: '<-e>', dir: process.cwd(), ...copts }), a.slice(2), '<-e>');
    else RT.launch(compile(fs.readFileSync(a[0], 'utf8'), { file: a[0], ...copts }), a.slice(1), a[0]);
  } catch (e) {
    if (e instanceof CErr || e.name === 'SyntaxError' && e.message.includes(':') || e.code === 'ENOENT') { console.error('error: ' + e.message); process.exit(1); }
    throw e;
  }
}

module.exports = { compile, bundle, CErr };
if (require.main === module) main(process.argv);
