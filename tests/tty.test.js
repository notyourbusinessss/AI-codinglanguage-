'use strict';
// The native terminal library (raw mode, key decoding, terminal size) and the terminal game (examples/connect4.ak), driven through a real
// pseudo-terminal by tests/tty_run.py (needs python3; skipped when it is missing).
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..');
const ak = process.env.AK_BIN || path.join(root, 'bin', 'ak');
if (cp.spawnSync('python3', ['-c', 'import pty']).status !== 0) { console.log('tty: skipped (no python3 with pty)'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tty-'));
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info).slice(0, 400)); } };
const tty = (rows, cols, cmd, steps) => cp.spawnSync('python3', [path.join(__dirname, 'tty_run.py'), String(rows), String(cols), cmd, steps], { encoding: 'utf8', timeout: 120000 }).stdout;
const build = (src, out) => cp.spawnSync(ak, ['build', src, out], { encoding: 'utf8' });

// 1. key decoding: arrows, enter, esc (alone), ctrl-c, UTF-8, ESC O A, plain characters; raw mode is left again afterwards
const keys = path.join(tmp, 'keys.ak');
fs.writeFileSync(keys, `(? !(isatty) (: (p "not a tty") (exit 2)))
(p "size" (termsize))
(rawmode (\\ () ks=[] (fdw 1 "READY\\r\\n")
  (wh (&& (< #ks 40) !(has ks "q")) k=(getkey 2000) (push ks (? k==nil "timeout" k)))
  (fdw 1 (++ "KEYS:" (join ks ",") "\\r\\n"))))
(p "cooked again")
(p (getkey 50))
`);
t('build keys', build(keys, path.join(tmp, 'keys')).status === 0);
let out = tty(30, 100, path.join(tmp, 'keys'), 'wait:READY;text:ab;send:1b5b41;send:1b5b42;send:1b5b43;send:1b5b44;text:x;send:0d;send:1b;sleep:0.3;send:03;send:c3a9;text: ;send:1b4f41;text:q;sleep:0.5').replace(/\r/g, '');
t('terminal size', /size \[30 100\]/.test(out), out);
t('keys decoded', out.includes('KEYS:a,b,up,down,right,left,x,enter,esc,ctrl-c,é, ,up,q'), out);
t('cooked afterwards', out.includes('cooked again'), out);
t('not a tty is detected', cp.spawnSync(path.join(tmp, 'keys'), [], { encoding: 'utf8', input: '' }).stdout === 'not a tty\n');

// 2. the game: draw, move the cursor, drop a disc, the computer answers, quit and restore the screen
const game = path.join(tmp, 'c4');
t('build connect4', build(path.join(root, 'examples', 'connect4.ak'), game).status === 0);
out = tty(30, 100, game, 'wait:CONNECT;text:4;send:0d;wait:computer played;sleep:1.5;text:q;sleep:0.6');
t('title and board drawn', out.includes('C O N N E C T') && out.includes('⣴⣿⣿⣦') && out.includes('you 0   computer 0'), out.slice(0, 300));
t('the computer answered', /computer played column \d: \d+ positions/.test(out), out.slice(-400));
t('screen restored on quit', out.endsWith('\x1b[?25h\x1b[?1049l\x1b[0mthanks for playing\r\n'), out.slice(-120));
out = tty(10, 40, game, 'sleep:1').replace(/\r/g, '');
t('too small is refused', out.includes('terminal too small') && out.includes('40x10'), out);
console.log(`tty: ${n - bad}/${n} passed`); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
