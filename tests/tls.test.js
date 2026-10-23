'use strict';
// lib/tls.aklang (native TLS 1.3 client) against Node's TLS server: EC and RSA certificates, all three cipher suites, large transfers,
// and the failures a client must report (wrong host, untrusted CA, server hanging up during the handshake).
const cp = require('child_process'), crypto = require('crypto'), fs = require('fs'), net = require('net'), os = require('os'), path = require('path'), tls = require('tls');
const NAT = path.join(__dirname, '..', 'bin', 'ak'), DRV = path.join(__dirname, 'tls_driver.aklang');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aktls-'));
const sh = c => cp.execSync(c, { cwd: tmp, stdio: 'pipe' }).toString();
const rd = f => fs.readFileSync(path.join(tmp, f));
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };
const ca = (name) => sh(`openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout ${name}.key -out ${name}.pem -subj "/CN=${name}" -days 30 -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign"`);
fs.writeFileSync(path.join(tmp, 'leaf.ext'), 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost\n');
const leaf = (name, keyspec) => {
  sh(`openssl genpkey ${keyspec} -out ${name}.key`);
  sh(`openssl req -new -key ${name}.key -subj "/CN=localhost" -out ${name}.csr`);
  sh(`openssl x509 -req -in ${name}.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 30 -extfile leaf.ext -out ${name}.pem`);
};
ca('ca'); ca('other');
leaf('ec256', '-algorithm EC -pkeyopt ec_paramgen_curve:P-256'); leaf('ec384', '-algorithm EC -pkeyopt ec_paramgen_curve:secp384r1'); leaf('rsa', '-algorithm RSA -pkeyopt rsa_keygen_bits:2048');
const payload = crypto.randomBytes(70000);
const run = (host, port, roots) => new Promise(res => {
  const c = cp.spawn(NAT, [DRV, host, String(port), path.join(tmp, roots)]);
  let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
  c.on('close', () => res(out.trim()));
});
const serve = (opts, handler) => new Promise(res => {
  const s = tls.createServer(opts, handler || (sock => { sock.on('data', () => {}); sock.on('error', () => {}); sock.end(payload); }));
  s.on('tlsClientError', () => {});
  s.listen(0, '127.0.0.1', () => res(s));
});
(async () => {
  const want = 'OK ' + payload.length + ' ' + crypto.createHash('sha256').update(payload).digest('hex');
  for (const lf of ['ec256', 'ec384', 'rsa']) for (const suite of ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256']) {
    let negotiated = '';
    const s = await serve({ key: rd(lf + '.key'), cert: Buffer.concat([rd(lf + '.pem')]), minVersion: 'TLSv1.3', ciphers: suite }, sock => { negotiated = sock.getCipher().name; sock.on('data', () => {}); sock.on('error', () => {}); sock.end(payload); });
    const out = await run('localhost', s.address().port, 'ca.pem');
    t(`${lf} / ${suite}: 70 KB transfer`, out === want && negotiated === suite, { out: out.slice(0, 150), negotiated });
    s.close();
  }
  let s = await serve({ key: rd('ec256.key'), cert: rd('ec256.pem'), minVersion: 'TLSv1.3' });
  const port = s.address().port;
  t('wrong host name is rejected', (await run('127.0.0.1', port, 'ca.pem')) === 'ERR tls: certificate: host name 127.0.0.1 does not match the certificate');
  t('untrusted CA is rejected', (await run('localhost', port, 'other.pem')) === 'ERR tls: certificate: unable to find a trusted issuer');
  s.close();
  s = await serve({ key: rd('ec256.key'), cert: rd('ec256.pem'), maxVersion: 'TLSv1.2' });
  const o12 = await run('localhost', s.address().port, 'ca.pem');
  t('TLS 1.2-only server works (TLS 1.2 fallback)', o12 === want, o12);
  s.close();
  const hang = net.createServer(sock => { sock.on('error', () => {}); sock.end(); }); await new Promise(r => hang.listen(0, '127.0.0.1', r));
  t('server hanging up during the handshake', /^ERR tls: connection closed during the handshake/.test(await run('localhost', hang.address().port, 'ca.pem')));
  hang.close();
  const junk = net.createServer(sock => { sock.on('error', () => {}); sock.on('data', () => { sock.write('HTTP/1.1 400 Bad Request\r\n\r\n'); sock.end(); }); }); await new Promise(r => junk.listen(0, '127.0.0.1', r));
  const jo = await run('localhost', junk.address().port, 'ca.pem');
  t('a non-TLS server gives a clear error, not a crash', /^ERR tls: /.test(jo), jo);
  junk.close();
  // KeyUpdate (client must re-key its read side, and answer when asked): openssl s_server sends data, then K (update requested), then more data
  const ossl = cp.spawn('openssl', ['s_server', '-accept', '0', '-cert', path.join(tmp, 'ec256.pem'), '-key', path.join(tmp, 'ec256.key'), '-tls1_3'], { cwd: tmp });
  let oport = 0, olog = '';
  const oready = new Promise(r => { const f = d => { olog += d; const m = /ACCEPT\s+(?:0\.0\.0\.0|\[?::\]?):(\d+)/.exec(olog) || /ACCEPT/.exec(olog) && /LISTEN|port/.exec(olog); if (m && m[1]) { oport = +m[1]; r(); } }; ossl.stdout.on('data', f); ossl.stderr.on('data', f); setTimeout(r, 5000); });
  await oready;
  if (oport) {
    const pending = run('localhost', oport, 'ca.pem');
    await new Promise(r => setTimeout(r, 2500));
    ossl.stdin.write('one\n'); await new Promise(r => setTimeout(r, 500));
    ossl.stdin.write('K\n'); await new Promise(r => setTimeout(r, 500));
    ossl.stdin.write('two\n'); await new Promise(r => setTimeout(r, 500));
    ossl.stdin.write('Q\n');
    const ko = await pending;
    t('KeyUpdate from the server is followed', ko === 'OK 8 ' + crypto.createHash('sha256').update('one\ntwo\n').digest('hex'), { ko, olog: olog.slice(0, 700) });
  } else t('KeyUpdate test could not start openssl s_server', false, olog.slice(0, 200));
  ossl.kill();
  const closed = await run('localhost', 1, 'ca.pem');
  t('connection refused is reported', /^ERR cannot connect to localhost:1 /.test(closed), closed);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? `${bad} of ${n} tls checks FAILED` : `tls: ${n}/${n} ok`);
  if (n < 12) bad = 1;
  process.exit(bad ? 1 : 0);
})();
