'use strict';
// Ak v2 surface syntax -> AST.
//
// Forms:   (head arg..)            S-expression: special forms, calls
// Chunks:  tight infix expressions (no spaces): fib(n-1)+fib(n-2)  t[i j]  x+=1  x=>x*2  a[1..]  #xs
// Rule:    whitespace/commas separate elements; an expression chunk ends at whitespace outside brackets.
const { Sym, AkSyntaxError, S, isSym, isForm, form } = require('./ast.js');

const OPCH = new Set('+-*/%<>=!&|^~?@#\\:.'.split(''));
const IDS = /[A-Za-z_$\u0080-￿]/, IDC = /[A-Za-z0-9_$\u0080-￿]/, DIG = /[0-9]/;

// binary operators, longest first. prec: higher binds tighter
const BIN = [
  ['>>>', 13], ['**=', 1], ['//=', 1], ['||=', 1], ['??=', 1],
  ['=>', 2], ['==', 8], ['!=', 8], ['<=', 8], ['>=', 8], ['&&', 4], ['||', 3], ['??', 3], ['**', 17], ['//', 15], ['<<', 13], ['>>', 13], ['..', 9],
  ['+=', 1], ['-=', 1], ['*=', 1], ['/=', 1], ['%=', 1],
  ['+', 14], ['-', 14], ['*', 15], ['/', 15], ['%', 15], ['<', 8], ['>', 8], ['=', 1], ['&', 12], ['|', 10], ['^', 11],
];
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '//=', '||=', '??=']);
const CMP = new Set(['<', '>', '<=', '>=', '==', '!=']);
const UNARY_PRE = { '-': '-', '!': '!', '#': '#', '~': 'bnot' };
const PREC_UNARY = 17;

class Parser {
  constructor(src, file) { this.s = src; this.i = 0; this.line = 1; this.lineStart = 0; this.file = file || '<ak>'; this.idx = false; }

  err(msg, at) { const p = at === undefined ? this.i : at; const { line, col } = this.lc(p); throw new AkSyntaxError(`${this.file}:${line}:${col}: ${msg}`); }
  lc(p) {
    if (!this.starts) { this.starts = [0]; for (let k = 0; k < this.s.length; k++) if (this.s.charCodeAt(k) === 10) this.starts.push(k + 1); }
    let lo = 0, hi = this.starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.starts[mid] <= p) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, col: p - this.starts[lo] + 1 };
  }
  pos(p) { return this.lc(p === undefined ? this.i : p); }

  peek(o = 0) { return this.s[this.i + o]; }
  eof() { return this.i >= this.s.length; }
  isWs(c) { return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ','; }
  skipWs() {
    for (;;) {
      const c = this.s[this.i];
      if (c === undefined) return;
      if (this.isWs(c)) this.i++;
      else if (c === ';') { while (this.i < this.s.length && this.s[this.i] !== '\n') this.i++; }
      else return;
    }
  }
  // end of an expression chunk: whitespace, closing bracket, comment, EOF
  atBreak() { const c = this.s[this.i]; return c === undefined || this.isWs(c) || c === ')' || c === ']' || c === '}' || c === ';'; }

  program() {
    const out = [];
    for (;;) { this.skipWs(); if (this.eof()) return out; if (this.peek() === ')' || this.peek() === ']' || this.peek() === '}') this.err(`unexpected '${this.peek()}'`); out.push(this.chunk()); }
  }
  elems(close, opener) {
    const out = [];
    for (;;) {
      this.skipWs();
      if (this.eof()) this.err(`missing '${close}' for '${opener.ch}' opened at ${opener.line}:${opener.col}`, this.s.length);
      const c = this.peek();
      if (c === close) { this.i++; return out; }
      if (c === ')' || c === ']' || c === '}') this.err(`expected '${close}' but found '${c}' (opened at ${opener.line}:${opener.col})`);
      out.push(this.chunk());
    }
  }

  chunk() { return this.bin(0); }

  peekBin() {
    const s = this.s, i = this.i;
    for (const [op] of BIN) if (s.startsWith(op, i)) return op;
    return null;
  }
  prec(op) { for (const [o, p] of BIN) if (o === op) return p; }

  bin(minPrec) {
    let left = this.unary();
    for (;;) {
      if (this.atBreak()) return left;
      const op = this.peekBin();
      if (!op) {
        const c = this.peek();
        this.err(`unexpected '${c}' after expression; elements must be separated by whitespace`);
      }
      const prec = this.prec(op);
      if (prec < minPrec) return left;
      const opPos = this.pos();
      this.i += op.length;
      // `a[2..]` / `a[..3]`: open-ended range inside an index
      if (op === '..' && this.idx && this.atBreak()) { left = form([S('..'), left, null], opPos); return left; }
      if (this.atBreak()) this.err(`dangling operator '${op}' (infix operators must not have spaces around them)`, this.i - op.length);
      if (op === '=>') {
        const body = this.bin(2);
        left = form([S('\\'), this.toParams(left, opPos), body], opPos);
      } else if (ASSIGN.has(op)) {
        const right = this.bin(1);
        left = this.mkAssign(op, left, right, opPos);
      } else if (CMP.has(op)) {
        const operands = [left], ops = [op];
        let right = this.bin(prec + 1); operands.push(right);
        while (!this.atBreak()) {
          const o2 = this.peekBin();
          if (!o2 || !CMP.has(o2)) break;
          this.i += o2.length;
          if (this.atBreak()) this.err(`dangling operator '${o2}'`, this.i - o2.length);
          ops.push(o2); operands.push(this.bin(prec + 1));
        }
        left = ops.length === 1 ? form([S(op), operands[0], operands[1]], opPos)
          : form([S('%cmp'), ...operands.flatMap((x, k) => k < ops.length ? [x, ops[k]] : [x])], opPos);
      } else {
        const right = op === '**' ? this.bin(prec) : this.bin(prec + 1);
        left = form([S(op), left, right], opPos);
      }
    }
  }

  mkAssign(op, lhs, rhs, pos) {
    const target = lhs;
    if (op === '=') {
      if (isForm(target, '@') && target.length === 3) return form([S('<@'), target[1], target[2], rhs], pos);
      if (isForm(target, '.@')) return form([S('.='), target[1], target[2], rhs], pos);
      if (target instanceof Sym || isForm(target, '%list') || isForm(target, '%map')) return form([S('='), target, rhs], pos);
      this.err('invalid assignment target (use a name, a[i], a.b, or a [x y] pattern)');
    }
    if (!(target instanceof Sym || isForm(target, '@') || isForm(target, '.@'))) this.err(`invalid target for ${op}`);
    return form([S(op), target, rhs], pos);
  }

  toParams(x, pos) {
    // `x=>`, `(a b)=>`, `()=>`
    if (x instanceof Sym) return [x];
    if (Array.isArray(x) && x.length === 0) return [];
    if (Array.isArray(x) && !(x[0] instanceof Sym && isSpecialHead(x[0].n))) return x;
    if (isForm(x, '%list')) return [x];
    this.err('bad lambda parameters before =>', undefined);
  }

  unary() {
    const c = this.peek(), c2 = this.peek(1);
    const start = this.i;
    if (c === '.' && c2 === '.') {
      const nxt = this.s[this.i + 2];
      if (nxt !== undefined && !this.isWs(nxt) && nxt !== ')' && nxt !== ']' && nxt !== '}') {
        const p = this.pos(); this.i += 2;
        const operand = this.bin(PREC_UNARY);
        return this.idx ? form([S('..'), null, operand], p) : form([S('%spread'), operand], p);
      }
    }
    if (c === '-' || c === '!' || c === '#' || c === '~') {
      const nxt = c2;
      const operand = nxt !== undefined && !this.isWs(nxt) && nxt !== ')' && nxt !== ']' && nxt !== '}' && nxt !== ';';
      // a lone operator char followed by a break is a symbol (`-`, `!`, `#`, `~`)
      if (operand && !(OPCH.has(nxt) && this.looksLikeSymbolRun())) {
        const p = this.pos(); this.i++;
        const arg = this.bin(PREC_UNARY);
        if (c === '-' && typeof arg === 'number') return -arg;
        if (c === '-' && typeof arg === 'bigint') return -arg;
        return form([S(UNARY_PRE[c]), arg], p);
      }
    }
    return this.postfix(this.primary());
  }
  // at an operator-char run like `~?` `<@!` `++`: is the whole run a standalone symbol?
  looksLikeSymbolRun() {
    let j = this.i; while (OPCH.has(this.s[j])) j++;
    const c = this.s[j];
    return c === undefined || this.isWs(c) || c === ')' || c === ']' || c === '}' || c === ';';
  }

  primary() {
    const c = this.peek(), p = this.pos();
    if (c === '(') {
      this.i++;
      const sv = this.idx; this.idx = false;
      const els = this.elems(')', { ch: '(', ...p });
      this.idx = sv;
      if (els.length === 0) return form([], p);
      if (els.length === 1 && !(els[0] instanceof Sym)) {
        const e = els[0];
        // group: (a+b), (-x), (f(x)), ("s"). Keep as-is.
        return e;
      }
      return form(els, p);
    }
    if (c === '[') { this.i++; const sv = this.idx; this.idx = false; const els = this.elems(']', { ch: '[', ...p }); this.idx = sv; return form([S('%list'), ...els], p); }
    if (c === '{') {
      this.i++; const sv = this.idx; this.idx = false; const els = this.elems('}', { ch: '{', ...p }); this.idx = sv;
      if (els.length % 2) this.err('map literal needs key/value pairs', this.s.indexOf('{', 0));
      return form([S('%map'), ...els], p);
    }
    if (c === '"') return this.string();
    if (DIG.test(c) || (c === '.' && DIG.test(this.peek(1) || ''))) return this.number();
    if (c === ':' && this.peek(1) !== undefined && IDS.test(this.peek(1))) {
      this.i++; const st = this.i; while (this.i < this.s.length && IDC.test(this.s[this.i])) this.i++;
      return this.s.slice(st, this.i);
    }
    if (IDS.test(c)) {
      const st = this.i; while (this.i < this.s.length && IDC.test(this.s[this.i])) this.i++;
      const w = this.s.slice(st, this.i);
      if (w === 'true') return true; if (w === 'false') return false; if (w === 'nil') return null;
      const sym = S(w); const sp = this.pos(st); sym.line = sp.line; sym.col = sp.col; return sym;
    }
    if (OPCH.has(c)) {
      // standalone operator symbol: `+` `~?` `<@!` `++` `\` `?` `:` `@` ...
      const st = this.i; while (OPCH.has(this.s[this.i])) this.i++;
      const w = this.s.slice(st, this.i);
      const nc = this.s[this.i];
      if (!(nc === undefined || this.isWs(nc) || nc === ')' || nc === ']' || nc === '}' || nc === ';')) {
        this.err(`operator '${w}' must be followed by a space (infix operators go between operands with no spaces: a${w}b)`, st);
      }
      return S(w);
    }
    this.err(`unexpected '${c}'`);
  }

  postfix(n) {
    for (;;) {
      const c = this.peek();
      if (c === '(') {
        const p = this.pos(); this.i++;
        const sv = this.idx; this.idx = false; const args = this.elems(')', { ch: '(', ...p }); this.idx = sv;
        n = this.mkCall(n, args, p);
      } else if (c === '[') {
        const p = this.pos(); this.i++;
        const sv = this.idx; this.idx = true; const els = this.elems(']', { ch: '[', ...p }); this.idx = sv;
        if (!els.length) this.err('empty index []', this.i - 2);
        for (const e of els) {
          if (isForm(e, '..') && e.length === 3) n = form([S('@'), n, e[1], e[2]], p);   // slice a[i..j]
          else n = form([S('@'), n, e], p);
        }
      } else if (c === '.' && this.peek(1) !== '.' && this.peek(1) !== undefined && IDS.test(this.peek(1))) {
        const p = this.pos(); this.i++;
        const st = this.i; while (this.i < this.s.length && IDC.test(this.s[this.i])) this.i++;
        n = form([S('.@'), n, this.s.slice(st, this.i)], p);
      } else return n;
    }
  }
  mkCall(callee, args, p) {
    if (isForm(callee, '.@') && callee.length === 3 && typeof callee[2] === 'string') return form([S('.'), callee[1], callee[2], ...args], p);
    return form([callee, ...args], p);
  }

  number() {
    const s = this.s, st = this.i;
    if (s[this.i] === '0' && (s[this.i + 1] === 'x' || s[this.i + 1] === 'X')) { this.i += 2; while (/[0-9a-fA-F_]/.test(s[this.i] || '')) this.i++; return Number(s.slice(st, this.i).replace(/_/g, '')); }
    if (s[this.i] === '0' && (s[this.i + 1] === 'b' || s[this.i + 1] === 'B')) { this.i += 2; while (/[01_]/.test(s[this.i] || '')) this.i++; return parseInt(s.slice(st + 2, this.i).replace(/_/g, ''), 2); }
    while (/[0-9_]/.test(s[this.i] || '')) this.i++;
    if (s[this.i] === 'n') { this.i++; return BigInt(s.slice(st, this.i - 1).replace(/_/g, '')); }
    if (s[this.i] === '.' && DIG.test(s[this.i + 1] || '')) { this.i++; while (/[0-9_]/.test(s[this.i] || '')) this.i++; }
    else if (st === this.i) { /* ".5" handled below */ }
    if (s[this.i] === 'e' || s[this.i] === 'E') {
      const m = /^[eE][+-]?\d+/.exec(s.slice(this.i));
      if (m) this.i += m[0].length;
    }
    return Number(s.slice(st, this.i).replace(/_/g, ''));
  }

  string() {
    const s = this.s, open = this.i; this.i++;
    let out = '';
    for (;;) {
      if (this.i >= s.length) this.err('unterminated string', open);
      const c = s[this.i++];
      if (c === '"') return out;
      if (c !== '\\') { out += c; continue; }
      const e = s[this.i++];
      switch (e) {
        case 'n': out += '\n'; break; case 't': out += '\t'; break; case 'r': out += '\r'; break; case '0': out += '\0'; break;
        case 'e': out += '\x1b'; break; case '\\': out += '\\'; break; case '"': out += '"'; break; case "'": out += "'"; break; case '$': out += '$'; break;
        case 'u': {
          if (s[this.i] === '{') { const j = s.indexOf('}', this.i); out += String.fromCodePoint(parseInt(s.slice(this.i + 1, j), 16)); this.i = j + 1; }
          else { out += String.fromCharCode(parseInt(s.slice(this.i, this.i + 4), 16)); this.i += 4; }
          break;
        }
        case 'x': out += String.fromCharCode(parseInt(s.slice(this.i, this.i + 2), 16)); this.i += 2; break;
        default: this.err(`bad escape \\${e}`, this.i - 2);
      }
    }
  }
}

const SPECIAL_HEADS = new Set(['?', ':', '=', '\\', '&&', '||', '??', 'wh', 'for', 'try', 'let', 'sw', 'q', 'aw', 'req', 'js', 'new', '.', '.@', '.=', '%list', '%map', '%spread', '%cmp']);
function isSpecialHead(n) { return SPECIAL_HEADS.has(n); }

function parse(src, file) {
  if (src.startsWith('#!')) src = src.replace(/^#!.*/, '');
  return new Parser(src, file).program();
}

module.exports = { parse, SPECIAL_HEADS };
