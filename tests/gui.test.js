'use strict';
// Ak's own GUI: the software canvas (lib/canvas.ak) and the X11 client (lib/x11.ak) against a real X server (Xvfb), driven with real
// input events by xdotool, plus the native-window game examples/connect4gui.ak. Skipped when Xvfb or xdotool is missing.
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..');
const ak = process.env.AK_BIN || path.join(root, 'bin', 'ak');
const have = c => cp.spawnSync('sh', ['-c', `command -v ${c}`]).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-'));
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info).slice(0, 500)); } };
const build = (src, out) => cp.spawnSync(ak, ['build', src, out], { encoding: 'utf8' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rgb = (r, g, b) => r * 65536 + g * 256 + b;
const finish = () => { console.log(`gui: ${n - bad}/${n} passed`); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0); };

// 1. the canvas needs no display at all
const probe = path.join(tmp, 'probe');
t('build probe', build(path.join(__dirname, 'gui_probe.ak'), probe).status === 0);
let r = cp.spawnSync(probe, ['canvas'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
t('canvas checks', r.status === 0 && !/FAIL/.test(r.stdout) && (r.stdout.match(/^ok /gm) || []).length === 14, r.stdout + r.stderr);
t('no display is a clear error', (r = cp.spawnSync(probe, ['window'], { encoding: 'utf8', env: { PATH: process.env.PATH } })).status !== 0 && /no display/.test(r.stderr + r.stdout), r.stdout + r.stderr);

if (!have('Xvfb') || !have('xdotool')) { console.log('gui: X server tests skipped (Xvfb and xdotool are needed)'); finish(); }

// 2. a private X server (with an authorization cookie when xauth is around)
let disp = 90; while (fs.existsSync(`/tmp/.X11-unix/X${disp}`)) disp++;
const D = ':' + disp, auth = path.join(tmp, 'xauth');
const useAuth = have('xauth') && have('mcookie');
if (useAuth) { fs.writeFileSync(auth, ''); cp.spawnSync('xauth', ['-f', auth, 'add', D, '.', cp.execSync('mcookie').toString().trim()]); }
const xvfb = cp.spawn('Xvfb', [D, '-screen', '0', '1280x900x24', '-nolisten', 'tcp', ...(useAuth ? ['-auth', auth] : [])], { stdio: 'ignore' });
const env = { PATH: process.env.PATH, DISPLAY: D, HOME: tmp, ...(useAuth ? { XAUTHORITY: auth } : {}) };
const xdo = (...a) => cp.spawnSync('xdotool', a, { env, encoding: 'utf8', timeout: 20000 }).stdout.trim();
const waitFor = async (f, ms) => { const t0 = Date.now(); for (;;) { const v = f(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(50); } };
const lines = (ch, buf) => { ch.stdout.on('data', d => buf.out += d); ch.stderr.on('data', d => buf.out += d); ch.on('exit', c => buf.code = c); return buf; };
const stop = () => { try { xvfb.kill(); } catch (e) { } };

(async () => {
  try {
    t('Xvfb starts', await waitFor(() => fs.existsSync(`/tmp/.X11-unix/X${disp}`), 10000) !== null);
    await sleep(300);

    // 3. authorization: the server demands the cookie
    if (useAuth) {
      r = cp.spawnSync(probe, ['shot', '1', '10', '10'], { encoding: 'utf8', env: { ...env, XAUTHORITY: path.join(tmp, 'nothing') } });
      t('missing cookie is refused with a message', r.status !== 0 && /refused|authorization/.test(r.stdout + r.stderr), r.stdout + r.stderr);
    }

    // 4. window round trip and real input events
    const buf = lines(cp.spawn(probe, ['window'], { env }), { out: '', code: null });
    t('window opens, present/snapshot agree', await waitFor(() => /READY/.test(buf.out), 10000) !== null && /ok present and snapshot agree on every pixel/.test(buf.out) && /ok second present/.test(buf.out), buf.out);
    const wid = xdo('search', '--sync', '--name', 'probe window').split('\n')[0];
    t('window has its title', wid !== '' && xdo('getwindowname', wid) === 'probe window', wid);
    xdo('mousemove', '--window', wid, '20', '30'); xdo('click', '1'); xdo('click', '3'); xdo('click', '4');
    xdo('key', 'a'); xdo('key', 'shift+b'); xdo('key', 'Left'); xdo('key', 'Return'); xdo('key', 'Escape'); xdo('key', 'ctrl+x');
    await sleep(400);
    const ev = [...buf.out.matchAll(/^event (.*)$/gm)].map(m => JSON.parse(m[1]));
    const has = f => ev.some(f);
    t('pointer motion', has(e => e.type === 'motion' && e.x === 20 && e.y === 30), buf.out);
    t('left click down and up', has(e => e.type === 'mouse' && e.button === 'left' && e.down && e.x === 20 && e.y === 30) && has(e => e.type === 'mouse' && e.button === 'left' && !e.down), buf.out);
    t('right click', has(e => e.type === 'mouse' && e.button === 'right' && e.down), buf.out);
    t('wheel', has(e => e.type === 'wheel' && e.dy === -1), buf.out);
    t('typed keys', has(e => e.type === 'key' && e.key === 'a' && e.down && !e.shift) && has(e => e.type === 'key' && e.key === 'B' && e.down && e.shift), buf.out);
    t('named keys', ['left', 'enter', 'esc'].every(k => has(e => e.type === 'key' && e.key === k && e.down)), buf.out);
    t('ctrl', has(e => e.type === 'key' && e.key === 'ctrl' && e.down) && has(e => e.type === 'key' && e.key === 'x' && e.ctrl), buf.out);
    // another client can read the window's pixels: the gradient's top left, the green block, the white disc
    r = cp.spawnSync(probe, ['shot', wid, '200', '100', '1,1', '20,20', '150,50', '199,99'], { encoding: 'utf8', env });
    const px = Object.fromEntries(r.stdout.trim().split('\n').map(l => l.split(' ')));
    t('window contents seen from a second client', r.status === 0 && +px['20,20'] === rgb(7, 8, 9) || false, r.stdout + r.stderr);   // the second present (flat colour) is what is shown
    xdo('key', 'q'); await waitFor(() => buf.code !== null, 5000);
    t('window closes cleanly', buf.code === 0 && /\nclosed\n/.test(buf.out), buf);

    // 5. the game in its own window: click a column, a disc lands; q quits
    const game = path.join(tmp, 'c4gui');
    t('build connect4gui', build(path.join(root, 'examples', 'connect4gui.ak'), game).status === 0);
    const g = lines(cp.spawn(game, [], { env }), { out: '', code: null });
    const gw = xdo('search', '--sync', '--name', 'Connect Four').split('\n')[0];
    t('game window appears', gw !== '', g.out);
    const look = (...pts) => { const q = cp.spawnSync(probe, ['shot', gw, '600', '730', ...pts], { encoding: 'utf8', env }); return Object.fromEntries(q.stdout.trim().split('\n').map(l => l.split(' ')).map(([k, v]) => [k, +v])); };
    await waitFor(() => look('312,590')['312,590'] === rgb(6, 10, 22), 5000);        // the first frame
    let s = look('300,578', '312,590', '10,10', '44,300');
    t('empty board: dark hole, blue frame, dark background', s['312,590'] === rgb(6, 10, 22) && s['44,300'] === rgb(29, 78, 216) && s['10,10'] < rgb(40, 50, 70), s);
    xdo('mousemove', '--window', gw, '300', '300'); xdo('click', '1');             // column 3 (0-based): x = 36+12+72*3+36
    const landed = await waitFor(() => look('312,590')['312,590'] === rgb(239, 68, 68), 5000);
    t('clicking a column drops a red disc to the bottom', landed !== null, look('312,590'));
    const cells = []; for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) cells.push(`${36 + 12 + 72 * c + 36 + 12},${170 + 12 + 72 * r + 36 + 12}`);
    const count = col => Object.values(s).filter(v => v === col).length;
    const answered = await waitFor(() => { s = look(...cells); return count(rgb(251, 191, 36)) === 1; }, 10000);   // the computer thinks, then its disc falls
    t('the computer answered: one yellow disc next to the red one', answered !== null && count(rgb(239, 68, 68)) === 1, Object.fromEntries(Object.entries(s).filter(([k, v]) => v !== rgb(6, 10, 22))));
    xdo('key', 'n'); await sleep(400);
    t('n starts a new game', look('312,590')['312,590'] === rgb(6, 10, 22));
    xdo('key', 'q'); await waitFor(() => g.code !== null, 5000);
    t('q quits the game', g.code === 0, g);
  } catch (e) { t('exception', false, String(e && e.stack || e)); }
  stop(); finish();
})();
