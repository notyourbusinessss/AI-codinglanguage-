'use strict';
// Shared AST: atoms are JS number/bigint/string/true/false/null; symbols are Sym; forms are arrays (with .line/.col).
class Sym { constructor(n) { this.n = n; } toString() { return this.n; } }
class AkSyntaxError extends Error { constructor(m) { super(m); this.name = 'SyntaxError'; } }
const S = n => new Sym(n);
const isSym = (x, n) => x instanceof Sym && (n === undefined || x.n === n);
const isForm = (x, n) => Array.isArray(x) && x.length > 0 && x[0] instanceof Sym && (n === undefined || x[0].n === n);
function form(items, pos) { if (pos) { items.line = pos.line; items.col = pos.col; } return items; }
module.exports = { Sym, AkSyntaxError, S, isSym, isForm, form };
