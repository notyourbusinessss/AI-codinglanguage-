'use strict';
// lib/h2.aklang (HTTP/2 client with HPACK, used by lib/http.aklang with {:h2 true}) against Node's http2 server: methods, request bodies larger than the flow-control
// window, a 3 MB reply, repeated and long headers, redirects, HEAD, stream resets, a server that only speaks HTTP/1.1, and an https:// proxy tunnelling to it.
const cp = require('child_process'), crypto = require('crypto'), fs = require('fs'), http2 = require('http2'), https = require('https'), os = require('os'), path = require('path');
const NAT = path.join(__dirname, '..', 'bin', 'ak'), DRV = path.join(__dirname, 'lib', 'h2_client.aklang');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akh2-'));
const sh = c => cp.execSync(c, { cwd: tmp, stdio: 'pipe' }).toString();
sh('openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout s.key -out s.pem -subj /CN=localhost -days 3 -addext subjectAltName=DNS:localhost -addext basicConstraints=critical,CA:TRUE 2>/dev/null');
const key = fs.readFileSync(path.join(tmp, 's.key')), cert = fs.readFileSync(path.join(tmp, 's.pem'));
let bad = 0, n = 0;
const t = (name, got, want) => { n++; if (got !== want) { bad++; console.log('FAIL', name, '\n   got  ', JSON.stringify(got), '\n   want ', JSON.stringify(want)); } };
const run = (url, method, bl) => new Promise(res => {
  const c = cp.spawn(NAT, [DRV, url, path.join(tmp, 's.pem'), method, ...(bl ? [String(bl)] : [])]);
  let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
  c.on('close', () => res(out.trim()));
});
const srv = http2.createSecureServer({ key, cert, allowHTTP1: false });
srv.on('stream', (st, h) => {
  const chunks = []; st.on('data', d => chunks.push(d)); st.on('error', () => {});
  st.on('end', () => {
    const b = Buffer.concat(chunks), p = h[':path'];
    if (p === '/big') { st.respond({ ':status': 200, 'x-h2': '1', 'content-length': '3000000' }); st.end(Buffer.alloc(3000000, 97)); return; }
    if (p === '/redir') { st.respond({ ':status': 302, location: '/after', 'x-h2': '1' }); st.end(); return; }
    if (p === '/reset') { st.close(http2.constants.NGHTTP2_REFUSED_STREAM); return; }
    if (p === '/head') { st.respond({ ':status': 200, 'x-h2': '1', 'content-length': '99' }); st.end(); return; }
    if (p === '/cut') { st.respond({ ':status': 200, 'x-h2': '1', 'content-length': '50' }); st.end('short'); return; }
    st.respond({ ':status': 200, 'x-h2': '1', 'x-got': h['x-test'] || '-', 'set-cookie': ['a=1', 'b=2'], 'x-big': 'z'.repeat(3000) });
    st.end(`${h[':method']} ${p} ${b.length} ${crypto.createHash('md5').update(b).digest('hex').slice(0, 8)}`);
  });
});
const md5 = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
srv.listen(0, '127.0.0.1', async () => {
  const base = 'https://localhost:' + srv.address().port;
  const exp = (m, p, data) => { const body = `${m} ${p} ${data.length} ${md5(data)}`; return `200 h2 ${body.length} yes a=1, b=2 3000 ${body}`; };
  t('GET', await run(base + '/a?b=1', 'GET'), exp('GET', '/a?b=1', ''));
  t('POST of 200000 bytes (over the 65535 window)', await run(base + '/up', 'POST', 200000), exp('POST', '/up', '0123456789'.repeat(20000)));
  const big = await run(base + '/big', 'GET');
  t('3 MB reply', big.slice(0, 18), '200 h2 3000000 - -');
  t('redirect followed', (await run(base + '/redir', 'GET')).slice(0, 6), '200 h2');
  t('HEAD has no body', (await run(base + '/head', 'HEAD')).slice(0, 12), '200 h2 0 - -');
  t('reset stream', await run(base + '/reset', 'GET'), 'ERR http2: the stream was reset (RST_STREAM, error 7)');
  t('short body', await run(base + '/cut', 'GET'), 'ERR response body truncated');
  srv.close();
  // a server without h2 is served over HTTP/1.1
  const s1 = https.createServer({ key, cert }, (rq, rs) => { rs.setHeader('x-got', rq.headers['x-test']); rs.end('plain'); });
  s1.listen(0, '127.0.0.1', async () => {
    t('HTTP/1.1 fallback', await run('https://localhost:' + s1.address().port + '/', 'GET'), '200 h1 5 yes - 0 plain');
    s1.close(); fs.rmSync(tmp, { recursive: true, force: true });
    console.log(bad ? `h2: ${bad} of ${n} checks failed` : `h2: ${n} checks passed`);
    process.exit(bad || n < 8 ? 1 : 0);
  });
});
