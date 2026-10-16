'use strict';
// lib/http.aklang (native client) against a Node HTTP server: content-length, chunked, close-delimited, redirects, POST, errors.
const cp = require('child_process'), fs = require('fs'), http = require('http'), https = require('https'), os = require('os'), path = require('path');
const NAT = path.join(__dirname, '..', 'bin', 'ak'), LIB = path.join(__dirname, '..', 'lib', 'http.aklang'), PKI = path.join(__dirname, '..', 'lib', 'pki.aklang');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akhttp-'));
const sh = c => cp.execSync(c, { cwd: tmp, stdio: 'pipe' });
sh('openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout ca.key -out ca.pem -subj /CN=HttpTestCA -days 30 -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign');
fs.writeFileSync(path.join(tmp, 'leaf.ext'), 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost\n');
sh('openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout leaf.key -out leaf.csr -subj /CN=localhost');
sh('openssl x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 30 -extfile leaf.ext -out leaf.pem');
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };
const run = code => new Promise(res => {
  const c = cp.spawn(NAT, ['-e', `(use ${JSON.stringify(LIB)} as h)\n${code}`]);
  let out = '', err = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => err += d);
  c.on('close', st => res({ status: st, out, err }));
});
const handler = (q, s) => {
  let body = ''; q.on('data', d => body += d); q.on('end', () => {
    if (q.url === '/len') { s.writeHead(200, { 'Content-Type': 'text/plain', 'X-Seen': q.headers['user-agent'] + '|' + q.headers.host }); s.end('hello'); }
    else if (q.url === '/chunked') { s.writeHead(200); s.write('abc'); setTimeout(() => { s.write('defgh'); s.end('!'); }, 30); }
    else if (q.url === '/close') { s.socket.write('HTTP/1.0 200 OK\r\n\r\nuntil close'); s.socket.end(); }
    else if (q.url === '/redir') { s.writeHead(302, { Location: '/len' }); s.end(); }
    else if (q.url === '/loop') { s.writeHead(302, { Location: '/loop' }); s.end(); }
    else if (q.url === '/post') { s.writeHead(201); s.end(q.method + ':' + body + ':' + q.headers['x-extra']); }
    else if (q.url === '/short') { s.socket.write('HTTP/1.1 200 OK\r\nContent-Length: 50\r\n\r\nonly ten b'); s.socket.end(); }
    else { s.writeHead(404); s.end('nope'); }
  });
};
const srv = http.createServer(handler);
const tsrv = https.createServer({ key: fs.readFileSync(path.join(tmp, 'leaf.key')), cert: fs.readFileSync(path.join(tmp, 'leaf.pem')) }, handler);
tsrv.listen(0, '127.0.0.1');
srv.listen(0, '127.0.0.1', async () => {
  const u = p => `"http://127.0.0.1:${srv.address().port}${p}"`;
  let r = await run(`r=(h.get ${u('/len')}) (p r.status r.body r.headers["content-type"] r.headers["x-seen"])`);
  t('content-length body, headers lower-cased', r.out === `200 hello text/plain ak|127.0.0.1:${srv.address().port}\n`, r);
  r = await run(`(p (h.get ${u('/chunked')}).body)`);
  t('chunked body', r.out === 'abcdefgh!\n', r);
  r = await run(`(p (h.get ${u('/close')}).body)`);
  t('body until close', r.out === 'until close\n', r);
  r = await run(`r=(h.get ${u('/redir')}) (p r.status r.body)`);
  t('redirect is followed', r.out === '200 hello\n', r);
  r = await run(`(p (h.get ${u('/loop')}).status)`);
  t('redirect loop stops after 5 hops', r.out === '302\n', r);
  r = await run(`r=(h.post ${u('/post')} "data" {"X-Extra" "yes"}) (p r.status r.body)`);
  t('POST with body and extra header', r.out === '201 POST:data:yes\n', r);
  r = await run(`(p (h.get ${u('/missing')}).status)`);
  t('404 is a response, not an error', r.out === '404\n', r);
  r = await run(`(p (try (h.get ${u('/short')}) e=>e))`);
  t('truncated body raises', r.out === 'response body truncated\n', r);
  const sp = tsrv.address().port, roots = `(use ${JSON.stringify(PKI)} as k)\nroots=(~ x=>(k.cert_parse x) (k.pem_certs (rd ${JSON.stringify(path.join(tmp, 'ca.pem'))})))\n`;
  const su = p => `"https://localhost:${sp}${p}"`;
  r = await run(roots + `r=(h.get ${su('/len')} nil {:roots roots}) (p r.status r.body r.headers["x-seen"])`);
  t('https GET over TLS 1.3', r.out === `200 hello ak|localhost:${sp}\n`, r);
  r = await run(roots + `(p (h.get ${su('/chunked')} nil {:roots roots}).body)`);
  t('https chunked body', r.out === 'abcdefgh!\n', r);
  r = await run(roots + `r=(h.post ${su('/post')} "data" {"X-Extra" "yes"} {:roots roots}) (p r.status r.body)`);
  t('https POST', r.out === '201 POST:data:yes\n', r);
  r = await run(roots + `r=(h.get ${su('/redir')} nil {:roots roots}) (p r.status r.body)`);
  t('https redirect stays on https', r.out === '200 hello\n', r);
  r = await run(`(p (try (h.get ${su('/len')}) e=>e))`);
  t('https with the system CAs rejects the test CA', /^tls: certificate: unable to find a trusted issuer\n$/.test(r.out), r);
  r = await run('(p (try (h.get "ftp://x/") e=>e))');
  t('other schemes are rejected', r.out === 'unsupported URL: ftp://x/\n', r);
  srv.close(); tsrv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? `${bad} of ${n} http checks FAILED` : `http: ${n}/${n} ok`);
  if (n < 14) bad = 1;
  process.exit(bad ? 1 : 0);
});
