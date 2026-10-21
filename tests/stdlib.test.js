'use strict';
// lib/path, lib/time and lib/cli on both targets, checked against Node (path.posix, Date) and a table. Each program prints one line per case.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..'), pp = path.posix;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akstd-'));
const TARGETS = [['native', path.join(root, 'bin', 'ak'), []], ['js', 'node', [path.join(root, 'boot', 'ak.js')]]];
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info).slice(0, 600)); } };
const q = JSON.stringify, lib = f => `(use ${q(path.join(root, 'lib', f + '.aklang'))} as ${f})`;
const run = (tg, name, src) => { const f = path.join(tmp, name + '.aklang'); fs.writeFileSync(f, src); return cp.spawnSync(tg[1], [...tg[2], f], { encoding: 'utf8', timeout: 120000, cwd: root, maxBuffer: 1 << 26 }); };
// compare line by line, naming the first cases that differ
const lines = (label, r, want, src, min = 40) => {
  const got = r.stdout.split('\n'); got.pop();
  const diff = []; want.forEach((w, i) => { if (got[i] !== w) diff.push(`${src[i]} -> ${q(got[i])}, want ${q(w)}`); });
  t(`${label}: ${want.length} cases`, r.status === 0 && got.length === want.length && diff.length === 0, r.status ? r.stderr : diff.slice(0, 5));
  t(`${label}: ran at least ${min} cases`, want.length >= min);
};

// ---- path against path.posix
{
  const P = ['', '.', '..', '/', '//', 'a', 'a/', 'a/b', '/a/b', '/a/b/', 'a//b', 'a/./b', 'a/../b', '../a', '../../a/b/..', '/..', '/../a', '/a/../..', './', './a', 'a/..', 'a/b/../..', 'a/b/../../..', '/a/b/../c/', '///a///b',
    'a.txt', '/x/y.tar.gz', '.bashrc', 'a/.bashrc', 'a.', 'a..', '.a.b', '...', '/a/b.c/', '/a/b.c/d', 'x/.', 'x//', '//a', '//a/b', 'dir/file.tar.gz', 'C:\\x'];
  const src = [], want = [];
  for (const p of P) for (const [f, fn] of [['norm', pp.normalize], ['dir', pp.dirname], ['base', x => pp.basename(x)], ['ext', pp.extname], ['isabs', pp.isAbsolute]]) { src.push(`(path.${f} ${q(p)})`); want.push(String(fn(p))); }
  for (const [p, s] of [['a/b.txt', '.txt'], ['b.txt', '.txt'], ['.txt', '.txt'], ['a/b', 'b'], ['a/b/', 'b'], ['/a/b.js', '.js'], ['abc', 'abc'], ['x/.txt', '.txt'], ['a.b.c', '.c'], ['a.txt', '.md']]) { src.push(`(path.base ${q(p)} ${q(s)})`); want.push(pp.basename(p, s)); }
  for (const a of [['a', 'b'], ['a/b', '../c'], ['', 'a'], ['', ''], ['/a', '/b'], ['a', '/b/c'], ['a//', 'b/'], ['..', 'a'], ['a', '..', '..'], ['a'], []]) { src.push(a.length ? `(path.join ${a.map(q).join(' ')})` : 'path.join()'); want.push(pp.join(...a)); }
  for (const [a, b] of [['/a/b', '/a/c'], ['/a/b/c', '/a'], ['/a', '/a/b/c'], ['/a', '/a'], ['/a/b', '/c/d'], ['/', '/x'], ['/a/b/', '/a//b/c']]) { src.push(`(path.rel ${q(a)} ${q(b)})`); want.push(pp.relative(a, b)); }
  src.push('(path.abs "/x/./y/../z/")', '(path.cwd)'.replace('(path.cwd)', '(path.abs "q")')); want.push('/x/z', pp.resolve('q'));
  const prog = lib('path') + '\n' + src.map(s => `(p ${s})`).join('\n') + '\n';
  for (const tg of TARGETS) lines('path ' + tg[0], run(tg, 'path', prog), want, src);
}

// ---- time against Date
{
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ts = [0, 1, -1, 86399, 86400, 951782400 /* 2000-02-29 */, 1709164800 /* 2024-02-29 */, 4107542400 /* 2100-03-01 */, -2203891200 /* 1900-03-01 */, 1700000000, 253402300799 /* 9999-12-31T23:59:59 */, -62135596800 /* 0001-01-01 */];
  for (let i = 0; i < 400; i++) ts.push(Math.floor((rnd() - 0.25) * 6e9));
  const src = ts.map(x => `(p (t.iso ${x}) (t.civil ${x}).yd (t.civil ${x}).wd (== (t.parse (t.iso ${x})) ${x}) (== (t.epoch ((t.civil ${x}).y) ((t.civil ${x}).mo) ((t.civil ${x}).d) ((t.civil ${x}).h) ((t.civil ${x}).mi) ((t.civil ${x}).s)) ${x}))`);
  const dayOfYear = d => Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
  const want = ts.map(x => { const d = new Date(x * 1000); return `${d.toISOString().replace('.000', '').replace(/^\+?0*(\d{4})/, '$1')} ${dayOfYear(d)} ${d.getUTCDay()} true true`; });
  for (const tg of TARGETS) lines('time ' + tg[0], run(tg, 'time', lib('time') + '\n' + src.map(s => s.replace(/^\(p /, '(p ').replace(/\(t\./g, '(time.')).join('\n') + '\n'.replace(/t\./g, 'time.')), want, ts);
  // fixed cases: parse forms, milliseconds, durations, errors
  const fixed = [['(time.parse "2023-11-14T23:13:20+01:00")', '1700000000'], ['(time.parse "2023-11-14T22:13:20-0130")', '1700005400'], ['(time.parse "2023-11-14")', '1699920000'], ['(time.parse "2023-11-14 22:13")', '1699999980'],
    ['(time.parse "2023-11-14T22:13:20.5Z")', '1700000000.5'], ['(time.iso 1700000000.25)', '2023-11-14T22:13:20.250Z'], ['(time.epoch 2024 2 30)', String(Date.UTC(2024, 2, 1) / 1000)], ['(time.iso (time.parse "2024-02-29"))', '2024-02-29T00:00:00Z'], ['(time.iso (time.parse "2000-02-29"))', '2000-02-29T00:00:00Z'], ['(time.iso (time.parse "2024-12-31"))', '2024-12-31T00:00:00Z'], ['(time.epoch 2023 11 14)', '1699920000'],
    ['(time.fmtdur 3723)', '1h2m3s'], ['(time.fmtdur 0)', '0s'], ['(time.fmtdur 90061)', '1d1h1m1s'], ['(time.fmtdur -90)', '-1m30s'], ['(time.pardur "1d2h")', '93600'], ['(time.pardur "-5m3s")', '-303'], ['(time.pardur "90s")', '90'],
    ...['nope', '2023-13-01', '2023-11-14T25:00', '2023-11-14T22:13:20+1', '', '2023-1-1', '2023-02-29', '2024-02-30', '2024-04-31', '1900-02-29'].map(s => [`(try (time.parse ${q(s)}) e=>"bad")`, 'bad']), ['(try (time.pardur "1x") e=>"bad")', 'bad'], ['(try (time.pardur "") e=>"bad")', 'bad']];
  for (const tg of TARGETS) { const r = run(tg, 'time2', lib('time') + '\n' + fixed.map(f => `(p ${f[0]})`).join('\n') + '\n'); lines('time fixed ' + tg[0], r, fixed.map(f => f[1]), fixed.map(f => f[0]), 20); }
}

// now is in milliseconds: dividing by 1000 gives a time that civil/iso turn into today's year
for (const tg of TARGETS) { const r = run(tg, 'now', lib('time') + '\n(p (time.iso (now)/1000))\n'); const y = new Date().getUTCFullYear();
  t('time ' + tg[0] + ': (iso (now)/1000) is in this year', r.status === 0 && (r.stdout.startsWith(y + '-') || r.stdout.startsWith((y + 1) + '-')), r.stdout); }

// ---- cli
{
  const spec = '[["v" "verbose" "flag" "print more"] ["o" "out" "value" "output file" "a.out"] [nil "level" "value" "how much"] ["q" "quiet" "flag" "less"]]';
  const cases = [
    [['in.txt'], '{"opts":{"verbose":false,"out":"a.out","level":null,"quiet":false},"args":["in.txt"]}'],
    [['-v', '--out=x', 'a', '--level', '3', 'b'], '{"opts":{"verbose":true,"out":"x","level":"3","quiet":false},"args":["a","b"]}'],
    [['-vq', '-o', 'f', '--', '-v', 'z'], '{"opts":{"verbose":true,"out":"f","level":null,"quiet":true},"args":["-v","z"]}'],
    [['-ofile', '-'], '{"opts":{"verbose":false,"out":"file","level":null,"quiet":false},"args":["-"]}'],
    [['-vqo', 'g'], '{"opts":{"verbose":true,"out":"g","level":null,"quiet":true},"args":[]}'],
    [['--out=a=b'], '{"opts":{"verbose":false,"out":"a=b","level":null,"quiet":false},"args":[]}'],
    [['--help'], '{"opts":{"verbose":false,"out":"a.out","level":null,"quiet":false,"help":true},"args":[]}'],
    [['-h'], '{"opts":{"verbose":false,"out":"a.out","level":null,"quiet":false,"help":true},"args":[]}'],
    [[], '{"opts":{"verbose":false,"out":"a.out","level":null,"quiet":false},"args":[]}'],
    [['--nope'], 'usage: unknown option --nope'], [['-x'], 'usage: unknown option -x'], [['-o'], 'usage: option -o needs a value'], [['--level'], 'usage: option --level needs a value'],
    [['--verbose=1'], 'usage: option --verbose takes no value'], [['--help=1'], 'usage: unknown option --help'],
  ];
  const norm = s => s;   // the JSON of a map keeps insertion order on both targets
  const prog = lib('cli') + `\nspec=${spec}\n(= (tr a) (try (json (cli.parse spec a)) e=>(++ (errkind e) ": " e)))\n` + cases.map(c => `(p (tr ${q(c[0])}))`).join('\n') + '\n(pr (cli.help "tool" spec))\n';
  const help = 'usage: tool [options] [args]\n  -v, --verbose           print more\n  -o, --out VALUE         output file (default a.out)\n      --level VALUE       how much\n  -q, --quiet             less\n  -h, --help              show this help\n';
  for (const tg of TARGETS) {
    const r = run(tg, 'cli', prog); const got = r.stdout;
    const want = cases.map(c => c[1].startsWith('{') ? c[1] : q(c[1])).map(s => s.startsWith('"') ? JSON.parse(s) : s).join('\n') + '\n' + help;
    t('cli ' + tg[0] + ': ' + cases.length + ' parses and the generated help', r.status === 0 && got === want, r.status ? r.stderr : { got, want });
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (n < 12) { console.log('FAIL: only ' + n + ' checks ran'); process.exit(1); }
console.log(bad ? bad + ' of ' + n + ' stdlib checks failed' : n + ' stdlib checks passed');
process.exit(bad ? 1 : 0);
