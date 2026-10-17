'use strict';
// Token budget: SPEC.md (read once per session that writes Ak) and the 24 corpus programs must not get more expensive by accident.
// Ceilings are in tools/token-budget.json. Needs the tokenizer packages (see tools/tok.js); without them this test is skipped,
// unless AK_REQUIRE_TOKENIZER=1 (CI sets it, so a missing tokenizer there is a failure, not a skip).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let tok;
try { tok = require('../tools/tok.js'); } catch (e) {
  if (process.env.AK_REQUIRE_TOKENIZER === '1') { console.log('FAIL tokenizer packages not found (TOKDIR=' + (process.env.TOKDIR || '/tmp/tok') + '):', e.message.split('\n')[0]); process.exit(1); }
  console.log('tokens: skipped (tokenizer packages not installed, see tools/tok.js)'); process.exit(0);
}
const budget = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'token-budget.json'), 'utf8'));
const files = fs.readdirSync(path.join(root, 'corpus')).filter(f => f.endsWith('.aklang'));
let bad = 0;
const check = (name, n, ceiling, what) => {
  if (n > ceiling) { bad++; console.log(`FAIL ${name}: ${n} tokens, over the ceiling of ${ceiling} in tools/token-budget.json (${what})`); }
  else if (n < ceiling * 0.97) console.log(`note: ${name} is ${n} tokens, more than 3% under its ceiling of ${ceiling}; lower the ceiling in tools/token-budget.json`);
};
if (files.length < 24) { bad++; console.log('FAIL expected at least 24 corpus programs, found', files.length); }
const spec = tok.claude(fs.readFileSync(path.join(root, 'SPEC.md'), 'utf8'));
const corpus = files.reduce((a, f) => a + tok.claude(fs.readFileSync(path.join(root, 'corpus', f), 'utf8')), 0);
check('SPEC.md', spec, budget.spec, 'move details to SPEC-extra.md or tighten the wording');
check('corpus', corpus, budget.corpus, 'a syntax or layout change made the corpus programs more expensive');
console.log(`tokens: SPEC.md ${spec}/${budget.spec}, corpus ${corpus}/${budget.corpus} (${files.length} programs), ${bad} failures`); process.exit(bad ? 1 : 0);
