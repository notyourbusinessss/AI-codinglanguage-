'use strict';
// parse(fmt(ast)) must equal ast (after normalizing n-ary ops) — checked on every corpus program (via v1 parse + migrate).
const { parse } = require('../boot/syntax.js'); const { fmt } = require('../boot/fmt.js');
const { Sym } = require('../boot/ast.js');
const norm = x => !Array.isArray(x) ? x : (() => {
  const r = x.map(norm); const h = r[0];
  if (h instanceof Sym && ['+', '*', '&&', '||'].includes(h.n) && r.length > 3) { let acc = [h, r[1], r[2]]; for (let i = 3; i < r.length; i++) acc = [h, acc, r[i]]; return acc; }
  return r; })();
const strip = x => x instanceof Sym ? { s: x.n } : Array.isArray(x) ? x.map(strip) : typeof x === 'bigint' ? { b: String(x) } : x;
const same = (a, b) => JSON.stringify(strip(norm(a))) === JSON.stringify(strip(norm(b)));
module.exports = { same, norm };
if (require.main === module) {
  const migrate = require('../tools/migrate.js'); const fs = require('fs'), path = require('path');
  let bad = 0, n = 0;
  for (const f of fs.readdirSync(path.join(__dirname, '../corpus')).filter(f => f.endsWith('.ak1')).sort()) {
    const ast = migrate.loadV1(path.join(__dirname, '../corpus', f)); n++;
    for (const layout of ['flat', 'lines', 'indent']) {
      const txt = fmt(ast, { layout }); let back;
      try { back = parse(txt, f); } catch (e) { bad++; console.log('FAIL parse', f, layout, e.message); continue; }
      if (!same(ast, back)) { bad++; console.log('FAIL roundtrip', f, layout); }
    }
  }
  console.log(`roundtrip: ${n} corpus programs x 3 layouts, ${bad} failures`); process.exit(bad ? 1 : 0);
}
