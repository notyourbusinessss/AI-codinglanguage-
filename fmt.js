'use strict';
// AST -> canonical (token-cheap) Ak v2 text. parse(fmt(ast)) == ast for every valid AST.
const { Sym, S, isSym, isForm } = require('./ast.js');

// precedence (mirror of syntax.js)
const BINPREC = { '||': 3, '??': 3, '&&': 4, '|': 5, '^': 6, '&': 7, '==': 8, '!=': 8, '<': 9, '>': 9, '<=': 9, '>=': 9, '..': 10, '<<': 11, '>>': 11, '>>>': 11, '+': 12, '-': 12, '*': 13, '/': 13, '%': 13, '//': 13, '**': 15 };
const ASSIGN_OPS = new Set(['+=', '-=', '*=', '/=', '%=', '**=', '//=', '||=', '??=']);
const ID = /^[A-Za-z_$\u0080-￿][A-Za-z0-9_$\u0080-￿]*$/;
const RESERVED = new Set(['true', 'false', 'nil']);
const isIdentStr = s => typeof s === 'string' && ID.test(s) && !RESERVED.has(s);
const OPSYM = /^[+\-*\/%<>=!&|^~?@#\\:.]+$/;

const P_ASSIGN = 1, P_LAMBDA = 2, P_UNARY = 15, P_POSTFIX = 20, P_ATOM = 100;

function atom(x, keyOk) {
  if (x === true) return 'true'; if (x === false) return 'false'; if (x === null || x === undefined) return 'nil';
  if (typeof x === 'number') { if (Object.is(x, -0)) return '-0'; if (!Number.isFinite(x)) throw new Error('cannot print non-finite number'); return String(x); }
  if (typeof x === 'bigint') return x + 'n';
  if (typeof x === 'string') return keyOk && isIdentStr(x) ? ':' + x : JSON.stringify(x);
  if (x instanceof Sym) return x.n;
  throw new Error('bad atom ' + x);
}

class Printer {
  constructor(o = {}) { this.o = { layout: 'lines', ...o }; }

  // returns [text, prec]; prec = how tightly the text binds (P_ATOM for self-delimited)
  pr(x, key = false) {
    if (!Array.isArray(x)) return [atom(x, key), P_ATOM];
    if (!x.length) return ['()', P_ATOM];
    const h = x[0], n = x.length - 1;
    if (h instanceof Sym) {
      const a = x.slice(1);
      switch (h.n) {
        case '%list': return ['[' + a.map(e => this.arg(e)).join(' ') + ']', P_ATOM];
        case '%map': return ['{' + a.map((e, i) => this.arg(e, i % 2 === 0)).join(' ') + '}', P_ATOM];
        case '%spread': if (n === 1) return ['..' + this.at(a[0], P_UNARY), P_UNARY]; break;
        case '%cmp': {
          let s = this.at(a[0], 10);
          for (let i = 1; i < a.length; i += 2) s += a[i] + this.at(a[i + 1], 10);
          return [s, 9];
        }
        case '=': if (n === 2 && !Array.isArray(a[0])) return [this.at(a[0], P_POSTFIX) + '=' + this.at(a[1], P_ASSIGN), P_ASSIGN];
          if (n === 2 && (isForm(a[0], '%list') || isForm(a[0], '%map'))) return [this.pr(a[0])[0] + '=' + this.at(a[1], P_ASSIGN), P_ASSIGN];
          break;
        case '<@': if (n === 3) return [this.at(a[0], P_POSTFIX) + '[' + this.arg(a[1]) + ']=' + this.at(a[2], P_ASSIGN), P_ASSIGN]; break;
        case '.=': if (n === 3 && isIdentStr(a[1])) return [this.at(a[0], P_POSTFIX) + '.' + a[1] + '=' + this.at(a[2], P_ASSIGN), P_ASSIGN]; break;
        case '@': {
          if (n === 2) {
            // collapse a[i][j] -> a[i j]
            let idx = [this.arg(a[1], true)], base = a[0];
            while (isForm(base, '@') && base.length === 3) { idx.unshift(this.arg(base[2], true)); base = base[1]; }
            return [this.at(base, P_POSTFIX) + '[' + idx.join(' ') + ']', P_POSTFIX];
          }
          if (n === 3) {
            const lo = a[1] === null ? '' : this.at(a[1], 11), hi = a[2] === null ? '' : this.at(a[2], 11);
            return [this.at(a[0], P_POSTFIX) + '[' + lo + '..' + hi + ']', P_POSTFIX];
          }
          break;
        }
        case '.@': if (n === 2 && isIdentStr(a[1])) return [this.at(a[0], P_POSTFIX) + '.' + a[1], P_POSTFIX]; break;
        case '.': if (n >= 2 && isIdentStr(a[1])) return [this.at(a[0], P_POSTFIX) + '.' + a[1] + '(' + a.slice(2).map(e => this.arg(e)).join(' ') + ')', P_POSTFIX]; break;
        case '\\': {
          if (n === 2) {
            const ps = a[0];
            if (Array.isArray(ps) && !(ps.length && ps[0] instanceof Sym && ps[0].n.startsWith('%') && false)) {
              const body = a[1];
              const plist = ps.length === 1 && ps[0] instanceof Sym ? ps[0].n : '(' + ps.map(p => this.param(p)).join(' ') + ')';
              if (ps.length === 1 && !(ps[0] instanceof Sym) && !isForm(ps[0], '%list') && !isForm(ps[0], '%map')) { /* default/rest single param: needs parens */ return this.sform(x); }
              const pl = (ps.length === 1 && ps[0] instanceof Sym) ? plist : (ps.length === 1 && (isForm(ps[0], '%list'))) ? this.pr(ps[0])[0] : plist;
              return [pl + '=>' + this.at(body, P_LAMBDA), P_LAMBDA];
            }
          }
          break;
        }
        case '-': if (n === 1) return ['-' + this.at(a[0], P_UNARY), P_UNARY]; break;
        case '!': if (n === 1) return ['!' + this.at(a[0], P_UNARY), P_UNARY]; break;
        case '#': if (n === 1) return ['#' + this.at(a[0], P_UNARY), P_UNARY]; break;
        case 'bnot': if (n === 1) return ['~' + this.at(a[0], P_UNARY), P_UNARY]; break;
        case '?': case ':': case 'wh': case 'for': case 'let': case 'try': case 'sw': case 'q': case 'aw': case 'req': case 'js': case 'new': case 'use': return this.sform(x);
      }
      if (ASSIGN_OPS.has(h.n) && n === 2 && !Array.isArray(a[0]) ) return [this.at(a[0], P_POSTFIX) + h.n + this.at(a[1], P_ASSIGN), P_ASSIGN];
      if (ASSIGN_OPS.has(h.n) && n === 2 && (isForm(a[0], '@') || isForm(a[0], '.@'))) return [this.at(a[0], P_POSTFIX) + h.n + this.at(a[1], P_ASSIGN), P_ASSIGN];
      const p = BINPREC[h.n];
      if (p !== undefined && n >= 2 && (n === 2 || h.n === '+' || h.n === '*' || h.n === '&&' || h.n === '||' || h.n === '??')) {
        if (CHAIN_NONASSOC.has(h.n) && n !== 2) return this.sform(x);
        const rightAssoc = h.n === '**';
        let s = this.at(a[0], rightAssoc ? p + 1 : p);
        for (let i = 1; i < a.length; i++) s += h.n + this.at(a[i], rightAssoc ? p : p + 1);
        return [s, p];
      }
      // plain call: head symbol
      if (!isSpecial(h.n) && !OPSYM.test(h.n)) return this.callForm(x);
      return this.sform(x);
    }
    return this.sform(x);
  }

  param(p) {
    if (p instanceof Sym) return p.n;
    if (isForm(p, '=') && p.length === 3 && p[1] instanceof Sym) return p[1].n + '=' + this.at(p[2], P_ASSIGN + 1 > 1 ? 2 : 2);
    if (isForm(p, '%spread')) return '..' + this.at(p[1], P_UNARY);
    if (isForm(p, '%list') || isForm(p, '%map')) return this.pr(p)[0];
    throw new Error('bad param');
  }

  callForm(x) { return [this.sform(x)[0], P_ATOM]; }
  // S-form text: (h a b c)
  sform(x) {
    const parts = x.map((e, i) => this.arg(e, false, i));
    return ['(' + parts.join(' ') + ')', P_ATOM];
  }
  // element in an S-form / list / call args: must be a self-contained chunk (no top-level spaces)
  arg(x, key = false) {
    const [s, p] = this.pr(x, key);
    return s;
  }
  // operand needing at least precedence `min`
  at(x, min) {
    const [s, p] = this.pr(x, false);
    return p < min ? '(' + s + ')' : s;
  }
}
const CHAIN_NONASSOC = new Set(['==', '!=', '<', '>', '<=', '>=', '..', '-', '/', '%', '//', '<<', '>>', '>>>', '**']);

const SPECIALS = new Set(['?', ':', '=', '\\', '&&', '||', '??', 'wh', 'for', 'try', 'let', 'sw', 'q', 'aw', 'req', 'js', 'new', '.', '.@', '.=', '%list', '%map', '%spread', '%cmp', 'use']);
function isSpecial(n) { return SPECIALS.has(n); }

// ---- layout: statement-level pretty printing -----------------------------------------------
// top-level forms one per line; bodies of fn/for/wh/let split over lines (layout 'lines': no indent)
function fmt(forms, o = {}) {
  const pr = new Printer(o);
  const layout = o.layout || 'lines';
  const BODYFORMS = { '=': 2, 'for': 3, 'wh': 2, 'let': 2, '\\': 2, ':': 1, 'try': 99 };
  function stmt(x, depth) {
    if (layout === 'flat' || !Array.isArray(x) || !(x[0] instanceof Sym)) return pr.pr(x)[0];
    const h = x[0].n;
    // only break S-forms with multiple body statements that are themselves forms
    const bodyStart = h === 'for' ? 3 : h === 'wh' ? 2 : h === 'let' ? 2 : (h === '=' && Array.isArray(x[1]) && x[1].length && x.length > 3) ? 2 : (h === '\\' && x.length > 3) ? 2 : -1;
    if (bodyStart < 0 || x.length - bodyStart < 2) return pr.pr(x)[0];
    const head = x.slice(0, bodyStart).map((e, i) => i === 0 ? e.n : pr.arg(e));
    const head2 = x.slice(0, bodyStart).map((e, i) => i === 0 ? e.n : pr.arg(e)).join(' ');
    const body = x.slice(bodyStart).map(e => stmt(e, depth + 1));
    const ind = layout === 'indent' ? '  '.repeat(depth + 1) : '';
    return '(' + head2 + '\n' + body.map(b => ind + b).join('\n') + ')';
  }
  return forms.map(f => stmt(f, 0)).join('\n') + '\n';
}

module.exports = { fmt, Printer, atom };
