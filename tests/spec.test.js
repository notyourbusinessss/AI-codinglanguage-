'use strict';
// SPEC.md must document every builtin, and every name it lists as a builtin must exist.
const fs = require('fs'), path = require('path');
const { B } = require('../boot/runtime.js');
const spec = fs.readFileSync(path.join(__dirname, '..', 'SPEC.md'), 'utf8');
const builtinSection = spec.slice(spec.indexOf('## Builtins'), spec.indexOf('## CLI'));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const missing = Object.keys(B).filter(n => !new RegExp('(^|[\\s`(\\[])' + esc(n) + '($|[\\s`)\\]])').test(builtinSection));
// operators are documented as groups ("& | ^ << >>"), so only flag identifier-like names
const missingWords = missing.filter(n => /^[A-Za-z]/.test(n));
let bad = 0;
if (missingWords.length) { bad++; console.log('FAIL undocumented builtins:', missingWords.join(' ')); }
// the first backtick span of each category line is the builtin name list: all of its words must exist
const unknown = [];
for (const line of builtinSection.split('\n')) {
  if (!/^(math|list|typed|text|io) /.test(line)) continue;
  const m = /`([^`]*)`/.exec(line);
  for (const w of m[1].split(/\s+/)) if (/^[A-Za-z]/.test(w) && !(w in B)) unknown.push(w);
}
if (unknown.length) { bad++; console.log('FAIL spec lists non-existent builtins:', unknown.join(' ')); }
console.log(`spec: ${bad ? 'FAILED' : 'every builtin documented, every listed builtin exists'} (${Object.keys(B).length} builtins)`); process.exit(bad ? 1 : 0);
