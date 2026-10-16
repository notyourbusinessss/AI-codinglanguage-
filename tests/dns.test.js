'use strict';
// DNS and connect-by-name on the native target, against a fake nameserver (AK_DNS=ip:port) and a local TCP server.
const cp = require('child_process'), dgram = require('dgram'), net = require('net'), path = require('path'), fs = require('fs'), os = require('os');
const NAT = path.join(__dirname, '..', 'bin', 'ak');
let bad = 0, n = 0;
const t = (name, ok, info) => { n++; if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : '\n   ' + JSON.stringify(info)); } };
const run = (code, env) => new Promise(res => {
  const c = cp.spawn(NAT, ['-e', code], { env: { ...process.env, ...env } });
  let out = '', err = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => err += d);
  c.on('close', st => res({ status: st, out, err }));
});
const qname = (m) => { const l = []; let i = 12; while (m[i]) { l.push(m.toString('latin1', i + 1, i + 1 + m[i])); i += m[i] + 1; } return { name: l.join('.'), end: i + 5 }; };
const seen = [];
// answers: a.test -> CNAME(c.test) + two A records (compressed names), nx.test -> NXDOMAIN, mute.test -> no answer, lh.test -> 127.0.0.1
const server = dgram.createSocket('udp4');
server.on('message', (m, rinfo) => {
  const { name, end } = qname(m); seen.push(name);
  const head = Buffer.from(m.subarray(0, end)); head[2] = 0x81; head[3] = 0x80;
  const a = (ip, ptr) => { const b = Buffer.alloc(16); b.writeUInt16BE(0xc000 | ptr, 0); b.writeUInt16BE(1, 2); b.writeUInt16BE(1, 4); b.writeUInt32BE(60, 6); b.writeUInt16BE(4, 10); Buffer.from(ip).copy(b, 12); return b; };
  if (name === 'mute.test') return;
  if (name === 'nx.test') { head[3] = 0x83; return server.send(head, rinfo.port, rinfo.address); }
  if (name === 'a.test') {
    const cn = Buffer.from([0xc0, 12, 0, 5, 0, 1, 0, 0, 0, 60, 0, 2, 0xc0, 12 + 1 + 1]); // CNAME whose rdata is a pointer (any valid name)
    head.writeUInt16BE(3, 6);
    return server.send(Buffer.concat([head, cn, a([192, 0, 2, 1], 12), a([127, 0, 0, 1], 12)]), rinfo.port, rinfo.address);
  }
  head.writeUInt16BE(1, 6);
  server.send(Buffer.concat([head, a([127, 0, 0, 1], 12)]), rinfo.port, rinfo.address);
});
(async () => {
  await new Promise(r => server.bind(0, '127.0.0.1', r));
  const env = { AK_DNS: '127.0.0.1:' + server.address().port };
  let r = await run('(p (dns "a.test"))', env);
  t('resolves A records past a CNAME', r.out === '["192.0.2.1" "127.0.0.1"]\n', r);
  r = await run('(p (dns "one.test"))', env);
  t('resolves a single A record', r.out === '["127.0.0.1"]\n', r);
  r = await run('(p (try (dns "nx.test") e=>e))', env);
  t('NXDOMAIN raises cannot resolve', r.out === 'cannot resolve nx.test\n', r);
  r = await run('(p (dns "127.0.0.1") (dns "localhost"))', env);
  t('literals and localhost need no DNS', r.out === '["127.0.0.1"] ["127.0.0.1"]\n', r);
  const before = seen.length;
  await run('(p (dns "mute.test"))', env);
  t('no answer: the query is retried, then the error is clear', seen.length - before >= 2);
  r = await run('(p (try (dns "mute.test") e=>e))', env);
  t('no answer raises cannot resolve', r.out === 'cannot resolve mute.test\n', r);
  r = await run('(p (try (dns "bad..name.test") e=>e) (try (dns (rpt "a" 64)) e=>e))', env);
  t('bad names raise', /cannot resolve|bad host name/.test(r.out) && r.status === 0, r);
  // connect by name: the first address (192.0.2.1, TEST-NET) is dead, the second is the local server
  const tcp = net.createServer(s => { s.end('hello'); });
  await new Promise(res => tcp.listen(0, '127.0.0.1', res));
  const port = tcp.address().port;
  r = await run(`c=(tcpc "a.test" ${port} 500) (p (fdr c)) (fdc c)`, env);
  t('tcpc falls through to the next address', r.out === 'hello\n', r);
  r = await run(`c=(tcpc "one.test" ${port}) (p (fdr c)) (fdc c)`, env);
  t('tcpc by DNS name', r.out === 'hello\n', r);
  tcp.close();
  r = await run(`(p (try (tcpc "one.test" ${port}) e=>e))`, env);
  t('refused names the host and reason', r.out === `cannot connect to one.test:${port} (refused)\n`, r);
  // timeout against a blackhole address: must return within ~ms, not minutes (some sandboxes refuse at once, which is fine too)
  const t0 = Date.now();
  r = await run('(p (try (tcpc "192.0.2.1" 81 300) e=>e))', env);
  t('connect timeout is honoured', Date.now() - t0 < 5000 && /^cannot connect to 192\.0\.2\.1:81 \((timed out|no route|network unreachable|refused|failed)\)\n$/.test(r.out), r);
  // UDP round trip
  const u = dgram.createSocket('udp4'); u.on('message', (m, ri) => u.send(Buffer.concat([Buffer.from('re:'), m]), ri.port, ri.address));
  await new Promise(res => u.bind(0, '127.0.0.1', res));
  r = await run(`s=(udp) (udpto s "127.0.0.1" ${u.address().port} "ping") (p (udpfrom s 100 1000)) (fdc s) s=(udp) (p (udpfrom s 100 50)) (fdc s)`, env);
  t('udp send/receive, and nil on timeout', r.out === 're:ping\nnil\n', r);
  u.close(); server.close();
  console.log(bad ? `${bad} of ${n} dns checks FAILED` : `dns: ${n}/${n} ok`);
  if (n < 10) { console.log('too few checks ran'); bad = 1; }
  process.exit(bad ? 1 : 0);
})();
