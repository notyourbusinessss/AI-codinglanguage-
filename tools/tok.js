#!/usr/bin/env node
// Token meter. Uses Anthropic's tokenizer (claude) and GPT's (o200k) as a second opinion.
// usage: node tools/tok.js file...        count tokens per file
//        node tools/tok.js -s 'text'      count + show token splits
const path = require('path');
const root = path.join(process.env.TOKDIR || '/tmp/tok', 'node_modules');
const A = require(path.join(root, '@anthropic-ai/tokenizer'));
const G = require(path.join(root, 'gpt-tokenizer'));
const claude = s => A.countTokens(s), gpt = s => G.encode(s).length;
function split(s) { const t = A.getTokenizer(); return Array.from(t.encode(s.normalize('NFKC'), 'all'), x => x).map(id => new TextDecoder().decode(t.decode_single_token_bytes(id))); }
module.exports = { claude, gpt, split };
if (require.main === module) {
  const a = process.argv.slice(2);
  if (a[0] === '-s') { const s = a[1]; console.log(claude(s), 'claude /', gpt(s), 'gpt'); console.log(JSON.stringify(split(s))); }
  else { let tc = 0, tg = 0; for (const f of a) { const s = require('fs').readFileSync(f, 'utf8'); const c = claude(s), g = gpt(s); tc += c; tg += g; console.log(String(c).padStart(6), String(g).padStart(6), f); } console.log(String(tc).padStart(6), String(tg).padStart(6), 'TOTAL'); }
}
