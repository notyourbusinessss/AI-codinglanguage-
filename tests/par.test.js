'use strict';
// Parallel workers (par, shared, cores) on the native target: what a program cannot check about itself. tests/native_only/par.aklang covers the
// language side (results, values, errors, exit codes, no zombies); here: a worker dies with its parent, the Mandelbrot example gives the same image
// with 1 worker and with every core and is faster with more cores, and shared memory reaches the workers of a program built with `ak build`.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..'), ak = path.join(root, 'bin', 'ak');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akpar-'));
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info).slice(0, 600)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gone = pid => { try { return /^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch (_) { return true; } };   // not there, or a zombie nobody has collected

(async () => {
  // ---- a worker does not outlive its parent: kill the parent while the workers sleep
  {
    const prog = path.join(tmp, 'orphans.aklang');
    fs.writeFileSync(prog, `d=(fst (args))\n(par 3 i=>(: (wr (++ d "/w" i) ($ ($syscall 39))) (sleep 60000) i) 3)\n`);
    const child = cp.spawn(ak, [prog, tmp], { stdio: 'ignore' });
    const files = [0, 1, 2].map(i => path.join(tmp, 'w' + i));
    for (let k = 0; k < 100 && !files.every(f => fs.existsSync(f) && fs.readFileSync(f, 'utf8')); k++) await sleep(50);
    const pids = files.map(f => +fs.readFileSync(f, 'utf8'));
    t('three workers started, each with its own pid', pids.length === 3 && pids.every(p => p > 0) && new Set(pids).size === 3 && pids.every(p => p !== child.pid), pids);
    t('the workers are alive while the parent waits', pids.every(p => !gone(p)), pids);
    child.kill('SIGKILL');
    for (let k = 0; k < 100 && !pids.every(gone); k++) await sleep(50);
    t('the workers die with their parent', pids.every(gone), pids);
  }

  // ---- the Mandelbrot example: same image, and faster with more cores
  {
    const cores = os.availableParallelism();
    let best = 0, same = true, sums = new Set(), runs = 0;
    for (let k = 0; k < 3 && (k === 0 || (best < 1.3 && cores >= 2)); k++) {
      const r = cp.spawnSync(ak, [path.join(root, 'examples', 'mandelbrot.aklang'), '640', '480'], { encoding: 'utf8', timeout: 120000 });
      const m = /(\d+) workers: [\d.]+ s, ([\d.]+)x faster\nsame image: (true|false) checksum (\d+)/.exec(r.stdout);
      t('mandelbrot example runs', r.status === 0 && !!m, r);
      if (!m) break;
      runs++; same = same && m[3] === 'true'; sums.add(m[4]); best = Math.max(best, +m[2]);
    }
    t('mandelbrot: the image is the same with 1 worker and with every core', runs > 0 && same && sums.size === 1, [...sums]);
    t(`mandelbrot: ${cores} cores are faster than 1 (best ${best.toFixed(2)}x)`, cores < 2 || best >= 1.3, best);
  }

  // ---- a built executable: shared memory and workers need nothing but the executable
  {
    const prog = path.join(tmp, 'built.aklang'), exe = path.join(tmp, 'built');
    fs.writeFileSync(prog, '(= (sq i) i*i)\na=(shared "f64" 100)\n(par 100 i=>(<@ a i (sq i)))\n(p (sum (~ x=>x a)) (par 5 sq))\n');
    const c = cp.spawnSync(ak, ['build', prog, exe], { encoding: 'utf8' });
    const r = cp.spawnSync(exe, [], { encoding: 'utf8', timeout: 60000 });
    t('built executable: workers fill shared memory', c.status === 0 && r.status === 0 && r.stdout === '328350 [0 1 4 9 16]\n', [c.stderr, r]);
  }

  // ---- output to a pipe and to a file is written once even when a worker prints
  {
    const prog = path.join(tmp, 'out.aklang');
    fs.writeFileSync(prog, '(p "a")\n(par 2 i=>(p "b"))\n(p "c")\n');
    const r = cp.spawnSync(ak, [prog], { encoding: 'utf8' });
    t('output before and after par is written once, the workers print too', r.status === 0 && r.stdout.split('\n').filter(Boolean).sort().join(',') === 'a,b,b,c' && r.stdout.startsWith('a\n') && r.stdout.endsWith('c\n'), r);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? `${bad} of ${n} parallel-worker checks failed` : `${n} parallel-worker checks passed`);
  process.exit(bad ? 1 : 0);
})();
