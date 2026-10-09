'use strict';
// Differential fuzzer: random typed programs; compiled (ak.js, via printed text) vs reference interpreter (interp.js).
// Also checks parse(fmt(ast)) == ast. usage: node tests/fuzz.js [count=500] [seed=1] [-v]
const { compile } = require('../boot/ak.js');
const RT = require('../boot/runtime.js');
const { parse } = require('../boot/syntax.js');
const { fmt } = require('../boot/fmt.js');
const interp = require('../boot/interp.js');
const { S, Sym } = require('../boot/ast.js');
const { same } = require('./roundtrip.test.js');

// ---------------------------------------------------------------- random
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let R;
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const chance = p => R() < p;
const pick = xs => xs[Math.floor(R() * xs.length)];
const L = (...a) => [S('%list'), ...a];
const call = (n, ...a) => [S(n), ...a];

// ---------------------------------------------------------------- generator
class Gen {
  constructor() { this.steps = 0; this.uid = 0; this.frames = [{ ints: [], strs: [], lists: [], maps: [], fns: [] }]; this.fnDepth = 0; this.depthBlock = 0; }
  get cur() { return this.frames[this.frames.length - 1]; }
  name(p) { return p + (++this.uid); }
  // all visible names of a kind (current frame chain: outer frames are readable)
  vis(kind) { const out = []; for (const f of this.frames) out.push(...f[kind]); return out; }
  local(kind) { return this.cur[kind]; }

  tick() { if (++this.steps > 200000) throw new Error('generator runaway'); }
  int(d) {
    this.tick();
    const ints = this.vis('ints');
    if (d <= 0 || chance(0.15)) return chance(0.5) || !ints.length ? ri(-3, 12) : S(pick(ints));
    switch (ri(0, 21)) {
      case 0: return call('+', this.int(d - 1), this.int(d - 1));
      case 1: return call('-', this.int(d - 1), this.int(d - 1));
      case 2: return call('*', this.int(d - 1), ri(-2, 4));
      case 3: return call('//', this.int(d - 1), ri(1, 5));
      case 4: return call('%', this.int(d - 1), ri(1, 7));
      case 5: return call('#', this.list(d - 1));
      case 6: return call('#', this.str(d - 1));
      case 7: return call('?', this.bool(d - 1), this.int(d - 1), this.int(d - 1));
      case 8: return call('?', this.bool(d - 1), this.int(d - 1), this.bool(d - 1), this.int(d - 1), this.int(d - 1));
      case 9: return this.seqExpr(d - 1, () => this.int(d - 1));
      case 10: { const v = this.name('v'); return this.withLet(v, 'ints', this.int(d - 1), () => this.int(d - 1)); }
      case 11: return call('try', this.int(d - 1), [S('\\'), [S('e')], this.int(d - 1)]);
      case 12: return call('try', this.failing(d - 1), [S('\\'), [S('e')], this.int(d - 1)]);
      case 13: return this.callFn(d - 1);
      case 14: return call('??', call('@', this.list(d - 1), this.int(d - 1)), this.int(d - 1));
      case 15: return call(pick(['&&', '||']), this.int(d - 1), this.int(d - 1));
      case 16: return call(pick(['max', 'min']), this.int(d - 1), this.int(d - 1));
      case 17: return call('sw', this.int(d - 1), ri(0, 5), this.int(d - 1), L(ri(6, 9), 10), this.int(d - 1), this.int(d - 1));
      case 18: { const ints2 = this.local('ints'); if (this.fnDepth === 0 && ints2.length) return call('+=', S(pick(ints2)), this.int(d - 1)); return this.int(d - 1); }
      case 19: return [this.lam(['a'], () => call('+', S('a'), this.int(d - 1))), this.int(d - 1)];
      case 20: { const ms = this.vis('maps'); if (ms.length) return call('??', [S('.@'), S(pick(ms)), pick(['a', 'b', 'c'])], this.int(d - 1)); return this.int(d - 1); }
      default: { const ints2 = this.vis('ints'); if (ints2.length) return call('abs', S(pick(ints2))); return 1; }
    }
  }
  // body of a lambda: new frame (outer names readable, assignments only to its own params/locals)
  lam(params, bodyFn) {
    this.frames.push({ ints: params.slice(), strs: [], lists: [], maps: [], fns: [] }); this.fnDepth++;
    const save = this.depthBlock; this.depthBlock = 0;
    const b = bodyFn();
    this.depthBlock = save; this.frames.pop(); this.fnDepth--;
    return [S('\\'), params.map(S), b];
  }
  failing(d) { return pick([() => call('//', this.int(d), 0), () => call('err', 'boom'), () => call('%', this.int(d), 0)])(); }
  bool(d) {
    if (d <= 0 || chance(0.1)) return chance(0.5);
    switch (ri(0, 9)) {
      case 0: return call(pick(['<', '>', '<=', '>=']), this.int(d - 1), this.int(d - 1));
      case 1: return call(pick(['==', '!=']), this.int(d - 1), this.int(d - 1));
      case 2: return [S('%cmp'), this.int(d - 1), pick(['<', '<=']), this.int(d - 1), pick(['<', '<=']), this.int(d - 1)];
      case 3: return call('!', this.int(d - 1));
      case 4: return call('!', this.bool(d - 1));
      case 5: return call('&&', this.bool(d - 1), this.bool(d - 1), this.bool(d - 1));
      case 6: return call('||', this.bool(d - 1), this.bool(d - 1));
      case 7: return call('has', this.list(d - 1), this.int(d - 1));
      case 8: return call('==', this.str(d - 1), this.str(d - 1));
      default: return call(pick(['&&', '||']), this.seqExpr(d - 1, () => this.bool(d - 1)), this.bool(d - 1));
    }
  }
  str(d) {
    const strs = this.vis('strs');
    if (d <= 0 || chance(0.2)) return chance(0.6) || !strs.length ? pick(['a', 'bc', '', 'xyz']) : S(pick(strs));
    switch (ri(0, 6)) {
      case 0: return call('+', this.str(d - 1), this.str(d - 1));
      case 1: return call('++', this.str(d - 1), this.int(d - 1));
      case 2: return call('up', this.str(d - 1));
      case 3: return call('?', this.bool(d - 1), this.str(d - 1), this.str(d - 1));
      case 4: return call('join', this.list(d - 1), ',');
      case 5: return call('$', this.int(d - 1));
      default: return this.seqExpr(d - 1, () => this.str(d - 1));
    }
  }
  list(d) {
    const ls = this.vis('lists');
    if (d <= 0 || chance(0.2)) return chance(0.5) || !ls.length ? L(...Array.from({ length: ri(0, 3) }, () => ri(0, 9))) : S(pick(ls));
    switch (ri(0, 9)) {
      case 0: return L(this.int(d - 1), this.int(d - 1));
      case 1: return call('..', ri(0, 5));
      case 2: return call('..', ri(0, 3), ri(3, 7));
      case 3: return call('+>', this.list(d - 1), this.int(d - 1));
      case 4: return L([S('%spread'), this.list(d - 1)], this.int(d - 1), [S('%spread'), this.list(d - 1)]);
      case 5: return call('~', this.lam(['x'], () => call('+', S('x'), this.int(d - 1))), call('+>', this.list(d - 1)));
      case 6: return call('~?', this.lam(['x'], () => call('>', S('x'), this.int(d - 1))), call('+>', this.list(d - 1)));
      case 7: return call(pick(['sort', 'rev']), this.list(d - 1));
      case 8: return call('@', this.list(d - 1), ri(0, 2), ri(1, 4));
      default: return call('?', this.bool(d - 1), this.list(d - 1), this.list(d - 1));
    }
  }
  // expression containing statements (forces hoisting / spilling in the compiler)
  seqExpr(d, last) {
    const stmts = Array.from({ length: ri(1, 2) }, () => this.effect(d));
    return [S(':'), ...stmts, last()];
  }
  // statement with a visible side effect on shared state (log / globals) -- order must match
  effect(d) {
    const ints = this.local('ints'), logs = this.vis('lists');
    const opts = [
      () => call('push', S('log'), this.int(Math.max(0, d))),
      () => call('push', S('log'), ri(0, 99)),
    ];
    if (ints.length && this.fnDepth === 0) opts.push(() => call(pick(['+=', '-=']), S(pick(ints)), ri(1, 4)), () => call('=', S(pick(ints)), this.int(Math.max(0, d))));
    if (this.fnDepth > 0 && this.vis('ints').length) opts.push(() => call('<-', S(pick(this.frames[0].ints)), ri(0, 20)));
    return pick(opts)();
  }
  withLet(v, kind, init, bodyFn) {
    this.cur[kind].push(v);
    const body = bodyFn();
    this.cur[kind].pop();
    return call('let', [S(v), init], body);
  }
  callFn(d) {
    const fns = this.vis('fns');
    if (!fns.length) return this.int(d);
    const f = pick(fns);
    if (f.fancy === 'pat') return [S(f.name), L(this.int(d), this.int(d))];
    if (f.fancy === 'rest') return chance(0.5) ? [S(f.name), ...Array.from({ length: ri(0, 3) }, () => this.int(d))] : [S(f.name), [S('%spread'), this.list(d)], this.int(d)];
    if (f.fancy === 'def') return chance(0.5) ? [S(f.name), this.int(d)] : [S(f.name), this.int(d), this.int(d)];
    return [S(f.name), ...Array.from({ length: f.arity }, (_, i) => f.rec && i === 0 ? ri(0, 25) : this.int(d))];
  }

  // ---- statements
  block(d, n) { this.depthBlock++; const saved = this.frames.map(f => ({ ints: f.ints.length, strs: f.strs.length, lists: f.lists.length, maps: f.maps.length })); const out = Array.from({ length: n }, () => this.stmt(d)); this.frames.forEach((f, i) => { const s = saved[i]; f.ints.length = s.ints; f.strs.length = s.strs; f.lists.length = s.lists; f.maps.length = s.maps; }); this.depthBlock--; return out; }
  stmt(d) {
    this.tick();
    const top = this.depthBlock === 0 && this.frames.length === 1;
    const k = ri(0, 33);
    const ints = this.local('ints'), lists = this.local('lists'), maps = this.local('maps');
    const canNew = this.depthBlock === 0;      // new names only in straight-line code
    switch (k) {
      case 0: case 1: if (canNew) { const v = this.name('i'); const e = this.int(d); this.local('ints').push(v); return call('=', S(v), e); } break;
      case 2: if (canNew) { const v = this.name('s'); const e = this.str(d); this.local('strs').push(v); return call('=', S(v), e); } break;
      case 3: if (canNew) { const v = this.name('l'); const e = this.list(d); this.local('lists').push(v); return call('=', S(v), e); } break;
      case 4: if (ints.length) return call('=', S(pick(ints)), this.int(d)); break;
      case 5: if (ints.length) return call(pick(['+=', '-=', '*=']), S(pick(ints)), this.int(Math.min(d, 1))); break;
      case 6: if (lists.length) return call('push', S(pick(lists)), this.int(d)); break;
      case 7: if (lists.length) return call('<@', S(pick(lists)), ri(0, 2), this.int(d)); break;
      case 8: return call('push', S('log'), this.int(d));
      case 9: return call('?', this.bool(d), [S(':'), ...this.block(d - 1, ri(1, 2))]);
      case 10: return call('?', this.bool(d), [S(':'), ...this.block(d - 1, 1)], [S(':'), ...this.block(d - 1, 1)]);
      case 11: { const v = this.name('k'); this.cur.ints.push(v); const body = this.block(d - 1, ri(1, 2)); this.cur.ints.pop(); return call('for', S(v), ri(0, 4), ...body); }
      case 12: if (lists.length || this.vis('lists').length) { const v = this.name('x'); this.cur.ints.push(v); const body = this.block(d - 1, 1); this.cur.ints.pop(); return call('for', S(v), this.list(d), ...body); } break;
      case 13: { const c = this.name('c'); if (!canNew) break; const body = this.block(d - 1, 1); this.cur.ints.push(c); return [S(':'), call('=', S(c), ri(0, 4)), call('wh', call('>', S(c), 0), ...body, call('-=', S(c), 1))]; }
      case 14: if (canNew && ints.length >= 2) return call('=', L(S(ints[0]), S(ints[1])), L(S(ints[1]), call('+', S(ints[0]), S(ints[1])))); break;
      case 15: if (canNew) { const a = this.name('i'), b = this.name('i'); const e = L(this.int(d), this.int(d)); this.local('ints').push(a, b); return call('=', L(S(a), S(b)), e); } break;
      case 16: return call('try', [S(':'), this.effect(d), call('err', 'x'), call('push', S('log'), 5)], [S('\\'), [S('e')], call('push', S('log'), S('e'))]);
      case 17: if (canNew && this.fnDepth === 0 && this.frames.length === 1) return this.defFn(d); break;
      case 18: if (canNew && this.fnDepth === 0 && this.frames.length === 1) return this.defRec(d); break;
      case 19: if (canNew && this.frames.length === 1) { const v = this.name('m'); this.cur.maps.push(v); return call('=', S(v), [S('%map'), 'a', this.int(d), 'b', this.int(d)]); } break;
      case 20: if (maps.length) return call('<@', S(pick(maps)), pick(['a', 'b', 'c']), this.int(d)); break;
      case 21: if (maps.length) return call('??=', [S('@'), S(pick(maps)), 'z'], this.int(d)); break;
      case 22: if (canNew && this.frames.length === 1) return this.closureDemo(d); break;
      case 23: return call('=', S(this.name('t')), this.int(d));      // dead local (hoisting check)
      case 25: if (canNew && this.frames.length === 1) return this.defFancy(d); break;
      case 26: if (maps.length) { const a = this.name('k'), b = this.name('w'); return call('for', L(S(a), S(b)), S(pick(maps)), call('push', S('log'), call('+', S(a), this.int(0))), call('push', S('log'), S(b))); } break;
      case 27: { const c = this.name('ch'); const strs = this.vis('strs'); return call('for', S(c), strs.length && chance(0.7) ? S(pick(strs)) : pick(['abc', 'xy', '']), call('push', S('log'), S(c))); }
      case 28: if (canNew && ints.length) { const c = this.name('c'); return [S(':'), call('=', S(c), ri(0, 3)), call('wh', [S(':'), this.effect(d), call('>', S(c), 0)], call('-=', S(c), 1))]; } break;
      case 29: if (lists.length) return call('+=', [S('@'), S(pick(lists)), [S(':'), call('push', S('log'), ri(0, 9)), ri(0, 1)]], this.int(d)); break;
      case 30: if (ints.length) return call('?', [S(':'), this.effect(d), this.bool(d)], call('+=', S(pick(ints)), 1), this.bool(d), call('-=', S(pick(ints)), 1)); break;
      case 31: if (canNew) { const s2 = this.name('s'); const e = this.str(d); this.cur.strs.push(s2); return [S(':'), call('=', S(s2), e), call('+=', S(s2), this.str(d)), call('push', S('log'), call('@', S(s2), 0, ri(1, 3)))]; } break;
      case 32: { const v = this.name('r'); return call('let', [S(v), [S('\\'), [S('n')], call('?', call('<=', S('n'), 0), 1, call('*', 2, [S(v), call('-', S('n'), 1)]))]], call('push', S('log'), [S(v), ri(0, 6)])); }
      case 33: return call('?', this.bool(d), call('push', S('log'), 1), this.bool(d), call('push', S('log'), 2), call('push', S('log'), 3));
      default: return this.effect(d);
    }
    return call('push', S('log'), this.int(d));
  }
  defFn(d) {
    const name = this.name('f'), arity = ri(0, 2);
    const params = Array.from({ length: arity }, () => this.name('p'));
    this.frames.push({ ints: params.slice(), strs: [], lists: [], maps: [], fns: [] }); this.fnDepth++;
    const saveDepth = this.depthBlock; this.depthBlock = 0;
    const locs = [];
    const body = [];
    for (let i = 0, n = ri(0, 2); i < n; i++) { const v = this.name('q'); const e = this.int(d - 1); this.cur.ints.push(v); body.push(call('=', S(v), e)); locs.push(v); }
    if (chance(0.4)) body.push(this.effect(d - 1));
    body.push(this.int(d));
    this.depthBlock = saveDepth; this.frames.pop(); this.fnDepth--;
    this.cur.fns.push({ name, arity });
    return [S('='), [S(name), ...params.map(S)], ...body];
  }
  defFancy(d) {
    const name = this.name('g');
    const kind = ri(0, 2);
    const a = this.name('a'), b = this.name('b'), c = this.name('c');
    this.frames.push({ ints: [a, b, c], strs: [], lists: [], maps: [], fns: [] }); this.fnDepth++;
    const e = call('+', S(a), call('+', S(b), S(c)));
    this.frames.pop(); this.fnDepth--;
    if (kind === 0) {          // destructured + default params; calls pass a list
      this.cur.fns.push({ name, arity: 1, fancy: 'pat' });
      return call('=', [S(name), L(S(a), S(b)), call('=', S(c), pick([7, 0, -1, false]))], e);
    }
    if (kind === 1) {          // rest parameter
      this.cur.fns.push({ name, arity: 0, fancy: 'rest' });
      const r = this.name('r');
      return call('=', [S(name), [S('%spread'), S(r)]], call('+', call('#', S(r)), call('sum', S(r))));
    }
    this.cur.fns.push({ name, arity: 2, fancy: 'def' });    // default param referencing earlier param
    return call('=', [S(name), S(a), call('=', S(b), chance(0.3) ? 0 : call('*', S(a), 2))], call('+', S(a), S(b)));
  }
  defRec(d) {
    const name = this.name('r');
    if (chance(0.5)) {  // tail recursive accumulator
      this.frames.push({ ints: ['n', 'acc'], strs: [], lists: [], maps: [], fns: [] }); this.fnDepth++;
      const e = this.int(Math.min(d, 2)); this.frames.pop(); this.fnDepth--;
      this.cur.fns.push({ name, arity: 2, rec: 'tail' });
      return [S('='), [S(name), S('n'), S('acc')], call('?', call('<=', S('n'), 0), S('acc'), [S(name), call('-', S('n'), 1), call('+', S('acc'), call('%', e, 5))])];
    }
    this.frames.push({ ints: ['n'], strs: [], lists: [], maps: [], fns: [] }); this.fnDepth++;
    const e = this.int(Math.min(d, 2)); this.frames.pop(); this.fnDepth--;
    this.cur.fns.push({ name, arity: 1, rec: 'plain' });
    return [S('='), [S(name), S('n')], call('?', call('<=', S('n'), 0), 1, call('+', [S(name), call('-', S('n'), 1)], call('%', e, 3)))];
  }
  closureDemo(d) {
    const mk = this.name('mk'), c = this.name('ctr'), fs = this.name('fs');
    const kind = ri(0, 2);
    if (kind === 0)       // counter closure via <-
      return [S(':'), call('=', [S(mk)], call('=', S('n'), 0), [S('\\'), [], call('<-', S('n'), call('+', S('n'), 1)), S('n')]),
        call('=', S(c), call(mk)), call('push', S('log'), [S(c)]), call('push', S('log'), [S(c)])];
    if (kind === 1)       // closures captured in a loop see per-iteration vars
      return [S(':'), call('=', S(fs), L()), call('for', S('j'), ri(1, 3), call('push', S(fs), [S('\\'), [], call('+', S('j'), ri(0, 3))])),
        call('push', S('log'), call('~', [S('\\'), [S('f')], [S('f')]], S(fs)))];
    return [S(':'), call('=', S(fs), L()), call('for', S('j'), ri(1, 3), call('=', S('w'), call('*', S('j'), 2)), call('push', S(fs), [S('\\'), [], S('w')])),
      call('push', S('log'), call('~', [S('\\'), [S('f')], [S('f')]], S(fs)))];
  }

  program(size) {
    const forms = [call('=', S('log'), L())];
    this.cur.ints.push('g0'); forms.push(call('=', S('g0'), ri(0, 5)));
    for (let i = 0; i < size; i++) forms.push(this.stmt(ri(1, 3)));
    // observations: everything visible at top level
    const obs = [S('log'), ...this.cur.ints.map(S), ...this.cur.strs.map(S), ...this.cur.lists.map(S), ...this.cur.maps.map(S)];
    forms.push([S('%list'), ...obs]);
    return forms;
  }
}

// ---------------------------------------------------------------- execution
const vm = require('vm');
const TIMEOUT = 1500;
function timed(f) {   // run sync code with a hard time limit
  const ctx = vm.createContext({ f }); return vm.runInContext('f()', ctx, { timeout: TIMEOUT });
}
function runCompiled(text) {
  try { return 'OK ' + RT.show(timed(() => RT.evalCode(compile(text, { file: '<fuzz>', ret: true })))); }
  catch (e) {
    if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return 'TIMEOUT';
    if (e.name === 'CompileError' || e.name === 'SyntaxError') return 'INVALID ' + e.message.split('\n')[0];
    if (e instanceof RT.AkError) return 'ERR ' + e.message;
    return 'JSERR ' + e.name + ': ' + e.message;
  }
}
function runInterp(ast) {
  try { return 'OK ' + RT.show(timed(() => interp.run(ast))); }
  catch (e) {
    if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return 'TIMEOUT';
    if (e instanceof interp.CompileErr) return 'INVALID ' + e.message;
    if (e instanceof RT.AkError) return 'ERR ' + e.message;
    return 'JSERR ' + e.name + ': ' + e.message;
  }
}
const norm = o => o.startsWith('INVALID') ? 'INVALID' : o.startsWith('JSERR') ? o : o;

let layoutN = 0;
function check(ast) {
  const text = fmt(ast, { layout: layoutN++ % 3 === 0 ? 'tight' : 'lines' });   // every third program goes through the tight layout and the line forms of the parser
  let ast2;
  try { ast2 = parse(text, '<fuzz>'); } catch (e) { return { bad: 'parse-error: ' + e.message, text }; }
  if (!same(ast, ast2)) return { bad: 'roundtrip mismatch', text };
  const a = norm(runInterp(ast)), b = norm(runCompiled(text));
  if (a === 'TIMEOUT' && b === 'TIMEOUT') return null;   // non-terminating program: inconclusive
  if (a.includes('Maximum call stack') || b.includes('Maximum call stack')) return null;   // interpreter has no TCO / resource limit: inconclusive
  if (a !== b) return { bad: `interp vs compiled\n   interp:   ${a}\n   compiled: ${b}`, text };
  return null;
}

const kind = o => o.split(' ')[0];
function sig(r) { const m = /interp:\s+(\S+)[\s\S]*compiled:\s+(\S+)/.exec(r.bad); return m ? m[1] + '|' + m[2] : r.bad.split(':')[0]; }
function shrink(ast) {
  let cur = ast; const want = sig(check(ast));
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 1; i < cur.length - 1; i++) {   // keep first (log=[]) and last (observation list)
      const cand = cur.slice(0, i).concat(cur.slice(i + 1));
      const r = check(cand);
      if (r && sig(r) === want) { cur = cand; i--; changed = true; }
    }
    if (!changed) break;
  }
  return cur;
}

function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const count = +args[0] || 500, seed0 = +args[1] || 1, verbose = process.argv.includes('-v');
  let fails = 0, invalid = 0, errs = 0;
  for (let n = 0; n < count; n++) {
    const seed = seed0 * 100000 + n; R = rng(seed);
    if (process.env.FUZZ_TRACE) require('fs').writeSync(2, 'seed ' + seed + '\n');
    const g = new Gen(); const ast = g.program(ri(4, 14));
    if (process.env.FUZZ_DUMP) { console.log(fmt(ast, { layout: 'lines' })); }
    const r = check(ast);
    if (verbose) { const o = runInterp(ast); if (o.startsWith('INVALID')) invalid++; if (o.startsWith('ERR')) errs++; }
    if (r) {
      fails++;
      const small = shrink(ast); const rs = check(small) || r;
      console.log(`\n=== FAIL seed=${seed}: ${rs.bad}\n${fmt(small, { layout: 'lines' })}`);
      if (fails >= 5) break;
    }
  }
  console.log(`fuzz: ${count} programs, ${fails} failures` + (verbose ? ` (interp INVALID ${invalid}, uncaught AkError ${errs})` : ''));
  process.exit(fails ? 1 : 0);
}
if (require.main === module) main();
module.exports = { Gen, check, setSeed: seed => { R = rng(seed); }, ri };
