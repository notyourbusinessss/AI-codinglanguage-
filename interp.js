'use strict';
// Reference interpreter for the Ak AST. A direct tree-walking implementation of the language *spec*
// (scoping, evaluation order, truthiness), independent of the code generator in ak.js.
// It shares only the primitive builtins (runtime.js B/H) with the compiled path. Used by the differential fuzzer.
const RT = require('./runtime.js');
const { B, H, AkError } = RT;
const { Sym, S, isSym, isForm } = require('./ast.js');

class Frame { constructor(parent) { this.parent = parent; this.vars = new Map(); } }
// Env: chain of scopes. `fn` marks function boundaries (a Frame root).
class Env {
  constructor(parent, isFn) { this.parent = parent; this.isFn = !!isFn; this.vars = new Map(); }
  // find within the current function (blocks + function root)
  findLocal(n) { for (let e = this; e; e = e.parent) { if (e.vars.has(n)) return e; if (e.isFn) return null; } return null; }
  find(n) { for (let e = this; e; e = e.parent) if (e.vars.has(n)) return e; return null; }
  root() { let e = this; while (!e.isFn) e = e.parent; return e; }
}
class Closure { constructor(params, body, env, name) { this.params = params; this.body = body; this.env = env; this.name = name; } }
class CompileErr extends Error { }

const isPat = x => isForm(x, '%list');
const isSpread = x => isForm(x, '%spread');

function decls(forms) {
  const m = new Set();
  const leaves = p => { if (p instanceof Sym) { if (p.n !== '_') m.add(p.n); } else if (isPat(p)) p.slice(1).forEach(q => leaves(isSpread(q) ? q[1] : q)); };
  const walk = x => {
    if (!Array.isArray(x)) return;
    if (!(x[0] instanceof Sym)) { x.forEach(walk); return; }
    switch (x[0].n) {
      case '\\': case 'q': return;
      case '=': {
        const t = x[1];
        if (Array.isArray(t) && !isPat(t)) { if (t[0] instanceof Sym) m.add(t[0].n); return; }
        if (t instanceof Sym) m.add(t.n); else leaves(t);
        walk(x[2]); return;
      }
      case 'let': walk(x[1]); for (let i = 2; i < x.length; i++) walk(x[i]); return;
      default: for (let i = 1; i < x.length; i++) walk(x[i]);
    }
  };
  forms.forEach(walk);
  return m;
}

function parseParams(list) {
  if (list instanceof Sym) list = [list]; else if (isPat(list)) list = [list];
  const ps = []; let rest = null;
  list.forEach(p => {
    if (p instanceof Sym) ps.push({ name: p.n });
    else if (isForm(p, '=') && p.length === 3) ps.push({ name: p[1].n, def: p[2] });
    else if (isSpread(p)) rest = p[1].n;
    else if (isPat(p)) ps.push({ pat: p });
  });
  return { ps, rest };
}

function makeFn(plist, body, env, name) { return new Closure(parseParams(plist), body, env, name); }

function callFn(f, args) {
  if (typeof f === 'function') return f(...args);
  if (!(f instanceof Closure)) { f = H.fn(f); return f(...args); }
  const e = new Env(f.env, true);
  const { ps, rest } = f.params;
  for (const n of decls([...f.body, ...ps.filter(p => p.pat).map(p => [S('='), p.pat, null])])) e.vars.set(n, null);
  ps.forEach((p, i) => {
    if (p.pat) { /* destructure after */ }
    else e.vars.set(p.name, args[i] === undefined ? null : args[i]);
  });
  ps.forEach((p, i) => { if (p.def && args[i] === undefined) e.vars.set(p.name, ev(p.def, e)); });
  if (rest) e.vars.set(rest, args.slice(ps.length));
  ps.forEach((p, i) => { if (p.pat) bindPat(p.pat, args[i], e, (n, v) => assign(e, n, v)); });
  return evSeq(f.body, e);
}
// wrap closures as real JS functions so builtins (map, sort...) can call them
function jsFn(c) { const f = (...a) => callFn(c, a); f.closure = c; return f; }

function assign(env, n, v) {
  const e = env.findLocal(n);
  if (e) e.vars.set(n, v); else env.root().vars.set(n, v);
  return v;
}
function rebind(env, n, v) {
  const e = env.find(n);
  if (!e) throw new CompileErr('undefined variable ' + n);
  e.vars.set(n, v); return v;
}
function bindPat(pat, val, env, leaf) {
  const arr = H.toArr(val);
  pat.slice(1).forEach((it, k) => {
    if (isSpread(it)) { if (it[1].n !== '_') leaf(it[1].n, arr.slice(k)); }
    else if (it instanceof Sym) { if (it.n !== '_') leaf(it.n, arr[k] ?? null); }
    else bindPat(it, arr[k] ?? null, env, leaf);
  });
}

function lookupVar(env, n) {
  const e = env.find(n);
  if (e) return e.vars.get(n);
  if (Object.prototype.hasOwnProperty.call(B, n)) return B[n];
  if (n in globalThis) return globalThis[n];
  throw new CompileErr('undefined: ' + n);
}

function evSeq(forms, env) { let r = null; for (const f of forms) r = ev(f, env); return r; }
function evArgs(xs, env) {
  const out = [];
  for (const x of xs) { if (isSpread(x)) out.push(...H.it(ev(x[1], env))); else out.push(ev(x, env)); }
  return out;
}
function jsPathRoot(x, env) {   // free global rooted path -> value
  if (x instanceof Sym) { if (env.find(x.n) || B[x.n]) return undefined; return globalThis[x.n]; }
  return undefined;
}

let CMPN = 0;
function ev(x, env) {
  if (x instanceof Sym) return lookupVar(env, x.n);
  if (!Array.isArray(x)) return x;
  if (!x.length) return null;
  const h = x[0];
  if (h instanceof Sym) {
    switch (h.n) {
      case '%list': return evArgs(x.slice(1), env);
      case '%map': { const m = new Map(); const a = x.slice(1); for (let i = 0; i < a.length; i += 2) { const k = ev(a[i], env); m.set(k, ev(a[i + 1], env)); } return m; }
      case '?': {
        const a = x.slice(1);
        for (let i = 0; i + 1 < a.length; i += 2) if (H.tr(ev(a[i], env))) return ev(a[i + 1], env);
        return a.length % 2 ? ev(a[a.length - 1], env) : null;
      }
      case ':': return evSeq(x.slice(1), env);
      case '=': {
        const t = x[1];
        if (Array.isArray(t) && !isPat(t)) { const f = makeFn(t.slice(1), x.slice(2), env, t[0].n); const jf = jsFn(f); assign(env, t[0].n, jf); return jf; }
        if (isPat(t)) {
          const v = x[2];
          if (isPat(v) && v.length === t.length && !v.slice(1).some(isSpread) && t.slice(1).every(y => y instanceof Sym)) {
            const vals = v.slice(1).map(e => ev(e, env));
            t.slice(1).forEach((y, i) => { if (y.n !== '_') assign(env, y.n, vals[i]); });
            return vals;
          }
          const val = ev(v, env); bindPat(t, val, env, (n, vv) => assign(env, n, vv)); return val;
        }
        const v = isForm(x[2], '\\') ? jsFn(makeFn(x[2][1], x[2].slice(2), env, t.n)) : ev(x[2], env);
        return assign(env, t.n, v);
      }
      case '<-': {
        const t = x[1];
        if (isForm(t, '@')) { const o = ev(t[1], env), i = ev(t[2], env), v = ev(x[2], env); return H.put(o, i, v); }
        return rebind(env, t.n, ev(x[2], env));
      }
      case '+=': case '-=': case '*=': case '/=': case '%=': case '**=': case '//=': case '||=': case '??=': {
        const op = h.n.slice(0, -1), t = x[1], v = x[2];
        const apply = (cur) => {
          if (op === '||') return H.tr(cur) ? cur : ev(v, env);
          if (op === '??') return cur != null ? cur : ev(v, env);
          return B[op](cur, ev(v, env));
        };
        if (t instanceof Sym) {
          const e = env.findLocal(t.n);
          if (!e) throw new CompileErr('op= on non-local ' + t.n);
          const nv = apply(e.vars.get(t.n)); e.vars.set(t.n, nv); return nv;
        }
        if (isForm(t, '@')) { const o = ev(t[1], env), i = ev(t[2], env); const nv = apply(H.at(o, i)); return H.put(o, i, nv); }
        const o = ev(t[1], env), k = t[2]; const nv = apply(H.dot(o, k)); return H.setdot(o, k, nv);
      }
      case '\\': return jsFn(makeFn(x[1], x.slice(2), env, null));
      case '&&': { let r = true; for (const a of x.slice(1)) { r = ev(a, env); if (!H.tr(r)) return r; } return r; }
      case '||': { let r = false; for (const a of x.slice(1)) { r = ev(a, env); if (H.tr(r)) return r; } return r; }
      case '??': { let r = null; const a = x.slice(1); for (let i = 0; i < a.length; i++) { r = ev(a[i], env); if (r != null) return r; } return r; }
      case '%cmp': {
        const operands = [], ops = [];
        for (let i = 1; i < x.length; i++) (i % 2 ? operands : ops).push(x[i]);
        let left = ev(operands[0], env);
        for (let i = 0; i < ops.length; i++) {
          const right = ev(operands[i + 1], env);
          if (!B[ops[i]](left, right)) return false;
          left = right;
        }
        return true;
      }
      case 'wh': { while (H.tr(ev(x[1], env))) evSeq(x.slice(2), env); return null; }
      case 'for': {
        const v = x[1], coll = ev(x[2], env);
        const items = typeof coll === 'number' ? null : H.it(coll);
        const count = items === null ? coll : items.length;      // length fixed at loop start; elements read live
        for (let k = 0; k < count; k++) {
          const it = items === null ? k : items[k];
          const e = new Env(env, false);
          if (v instanceof Sym) { if (v.n !== '_') e.vars.set(v.n, it); }
          else bindPat(v, it, e, (n, vv) => e.vars.set(n, vv));
          evSeq(x.slice(3), e);
        }
        return null;
      }
      case 'let': {
        const e = new Env(env, false); const b = x[1];
        for (let i = 0; i < b.length; i += 2) {
          if (isPat(b[i])) bindPat(b[i], ev(b[i + 1], e), e, (n, vv) => e.vars.set(n, vv));
          else if (isForm(b[i + 1], '\\')) { e.vars.set(b[i].n, null); e.vars.set(b[i].n, jsFn(makeFn(b[i + 1][1], b[i + 1].slice(2), e, b[i].n))); }
          else e.vars.set(b[i].n, ev(b[i + 1], e));
        }
        return evSeq(x.slice(2), e);
      }
      case 'try': {
        try { return ev(x[1], env); }
        catch (err) {
          if (err instanceof CompileErr) throw err;
          const m = H.msg(err);
          const hnd = x[2];
          if (isForm(hnd, '\\')) {
            const e = new Env(env, false);
            const ps = hnd[1] instanceof Sym ? [hnd[1]] : hnd[1];
            if (ps.length) e.vars.set(ps[0].n, m);
            return evSeq(hnd.slice(2), e);
          }
          return callFn(ev(hnd, env), [m]);
        }
      }
      case 'sw': {
        const v = ev(x[1], env); const rest = x.slice(2);
        let i = 0;
        for (; i + 1 < rest.length; i += 2) {
          const c = rest[i];
          const hit = isPat(c) ? c.slice(1).some(e => H.eq(v, ev(e, env))) : H.eq(v, ev(c, env));
          if (hit) return ev(rest[i + 1], env);
        }
        return i < rest.length ? ev(rest[i], env) : null;
      }
      case 'q': return x[1];
      case '.@': { const o = ev(x[1], env); return H.dot(o, x[2]); }
      case '.=': { const o = ev(x[1], env); return H.setdot(o, x[2], ev(x[3], env)); }
      case '.': { const o = ev(x[1], env); return o[x[2]](...evArgs(x.slice(3), env)); }
      case '<@': { const o = ev(x[1], env), i = ev(x[2], env), v = ev(x[3], env); return H.put(o, i, v); }
      case '@': {
        const a = evArgs(x.slice(1), env);
        return B['@'](...a);
      }
    }
    // function call
    const f = lookupVar(env, h.n);
    return callFn(f, evArgs(x.slice(1), env));
  }
  const f = ev(h, env);
  return callFn(f, evArgs(x.slice(1), env));
}

function run(forms) {
  const env = new Env(null, true);
  for (const n of decls(forms)) env.vars.set(n, null);
  return evSeq(forms, env);
}
module.exports = { run, CompileErr };
