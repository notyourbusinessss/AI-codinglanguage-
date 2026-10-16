'use strict';
// lib/http.aklang (native client) against a Node HTTP server: content-length, chunked, close-delimited, redirects, POST, errors.
const cp = require('child_process'), http = require('http'), path = require('path');
const NAT = path.join(__dirname, '..', 'bin', 'ak'), LIB = path.join(__dirname, '..', 'lib', 'http.aklang');
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };
const run = code => new Promise(res => {
  const c = cp.spawn(NAT, ['-e', `(use ${JSON.stringify(LIB)} as h)\n${code}`]);
  let out = '', err = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => err += d);
  c.on('close', st => res({ status: st, out, err }));
});
const srv = http.createServer((q, s) => {
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
});
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
  r = await run('(p (try (h.get "https://example.com/") e=>e))');
  t('https says TLS is missing', /needs TLS/.test(r.out), r);
  r = await run('(p (try (h.get "ftp://x/") e=>e))');
  t('other schemes are rejected', r.out === 'unsupported URL: ftp://x/\n', r);
  srv.close();
  console.log(bad ? `${bad} of ${n} http checks FAILED` : `http: ${n}/${n} ok`);
  if (n < 10) bad = 1;
  process.exit(bad ? 1 : 0);
});
