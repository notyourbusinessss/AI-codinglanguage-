'use strict';
// install.sh (a first step towards an automatic install): installs bin/ak from a clone into a prefix, refuses unsupported platforms and
// broken binaries, uninstalls. Everything happens inside temporary directories.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const script = path.join(root, 'install.sh');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-'));
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info).slice(0, 500)); } };
const run = (args, env = {}, sc = script) => cp.spawnSync('sh', [sc, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: tmp, ...env } });
const out = r => r.stdout + r.stderr;

let r = run(['--help']);                    t('--help', r.status === 0 && /--uninstall/.test(r.stdout), out(r));
r = run(['--bogus']);                       t('unknown option is an error', r.status === 2 && /unknown option/.test(r.stderr), out(r));
r = run(['--prefix']);                      t('--prefix needs an argument', r.status === 2, out(r));
r = run(['--check']);                       t('--check on a supported machine', r.status === 0 && /supported: Linux/.test(r.stdout) && /would install to: .*\/\.local\/bin\/ak/.test(r.stdout), out(r));

// install into a prefix that is not on PATH: installed, works, says how to put it on PATH
const prefix = path.join(tmp, 'p');
r = run(['--prefix', prefix]);
t('install exits 0', r.status === 0, out(r));
t('binary installed and executable', fs.existsSync(path.join(prefix, 'bin', 'ak')) && (fs.statSync(path.join(prefix, 'bin', 'ak')).mode & 0o111) !== 0);
t('installed ak runs a program', cp.spawnSync(path.join(prefix, 'bin', 'ak'), ['-e', '(p 1+2)'], { encoding: 'utf8' }).stdout === '3\n');
t('tells how to add it to PATH', /add it to your PATH/.test(out(r)) && out(r).includes(path.join(prefix, 'bin')), out(r));
t('no stray files next to the binary', fs.readdirSync(path.join(prefix, 'bin')).join() === 'ak', fs.readdirSync(path.join(prefix, 'bin')));
r = run(['--prefix', prefix], { PATH: path.join(prefix, 'bin') + ':' + process.env.PATH });
t('reinstall is fine and notes it is on PATH', r.status === 0 && /try it/.test(r.stdout), out(r));
r = run(['--prefix', prefix, '--check']);   t('--check with a prefix', r.status === 0 && out(r).includes('NOT on your PATH'), out(r));

// the default prefix is ~/.local
r = run([]);                                t('default prefix is $HOME/.local', r.status === 0 && fs.existsSync(path.join(tmp, '.local', 'bin', 'ak')), out(r));

// uninstall
r = run(['--prefix', prefix, '--uninstall']); t('uninstall removes it', r.status === 0 && !fs.existsSync(path.join(prefix, 'bin', 'ak')) && /removed/.test(r.stdout), out(r));
r = run(['--prefix', prefix, '--uninstall']); t('uninstall twice is harmless', r.status === 0 && /nothing to remove/.test(r.stdout), out(r));

// unsupported platforms install nothing
const p2 = path.join(tmp, 'p2');
for (const [e, what] of [[{ AK_INSTALL_ARCH: 'aarch64' }, 'ARM'], [{ AK_INSTALL_OS: 'Darwin' }, 'macOS']]) {
  r = run(['--prefix', p2], e);
  t(`${what} is refused with an explanation`, r.status === 1 && /Linux x86-64 only/.test(r.stderr) && /WSL2/.test(r.stderr) && !fs.existsSync(p2), out(r));
}

// a copy of the script without the binary, and with a binary that does not run
const lone = path.join(tmp, 'lone'); fs.mkdirSync(path.join(lone, 'bin'), { recursive: true }); fs.copyFileSync(script, path.join(lone, 'install.sh'));
r = run(['--prefix', p2], {}, path.join(lone, 'install.sh'));
t('no bin/ak: asks for a clone', r.status === 1 && /clone/.test(r.stderr) && !fs.existsSync(p2), out(r));
fs.writeFileSync(path.join(lone, 'bin', 'ak'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
r = run(['--prefix', p2], {}, path.join(lone, 'install.sh'));
t('a binary that does not run is not installed', r.status === 1 && /does not run/.test(r.stderr) && !fs.existsSync(path.join(p2, 'bin', 'ak')), out(r));

console.log(`install: ${n - bad}/${n} passed`); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
