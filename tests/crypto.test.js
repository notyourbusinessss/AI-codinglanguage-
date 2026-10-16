'use strict';
// lib/crypto.aklang against Node's crypto on random inputs (and the RFC vectors through the same path).
const cp = require('child_process'), crypto = require('crypto'), path = require('path');
const NAT = path.join(__dirname, '..', 'bin', 'ak'), DRV = path.join(__dirname, 'crypto_driver.aklang');
const hx = b => Buffer.from(b).toString('hex'), rnd = n => crypto.randomBytes(n);
const lens = [0, 1, 15, 16, 17, 55, 56, 63, 64, 65, 111, 112, 127, 128, 129, 300];
const cases = [], want = [];
const add = (line, exp) => { cases.push(line); want.push(exp); };
for (const n of lens) {
  const m = rnd(n);
  add(`sha256 ${hx(m)}`, hx(crypto.createHash('sha256').update(m).digest()) );
  add(`sha384 ${hx(m)}`, hx(crypto.createHash('sha384').update(m).digest()));
}
for (const kl of [5, 32, 64, 65, 131, 200]) for (const n of [0, 33, 150]) {
  const k = rnd(kl), m = rnd(n);
  add(`hmac256 ${hx(k)} ${hx(m)}`, hx(crypto.createHmac('sha256', k).update(m).digest()));
  add(`hmac384 ${hx(k)} ${hx(m)}`, hx(crypto.createHmac('sha384', k).update(m).digest()));
}
// HKDF-Expand is checked through hkdfSync with a PRK-sized key: Extract(salt=0s) of a zero-salt key is HMAC, so compare Expand directly via crypto.hkdfSync's expand half
for (const n of [1, 48, 49, 100]) {
  const prk = rnd(48), info = rnd(20);
  let out = Buffer.alloc(0), t = Buffer.alloc(0);
  for (let i = 1; out.length < n; i++) { t = crypto.createHmac('sha384', prk).update(Buffer.concat([t, info, Buffer.from([i])])).digest(); out = Buffer.concat([out, t]); }
  add(`hkdf ${hx(prk)} ${hx(info)} ${n}`, hx(out.subarray(0, n)));
}
for (const n of [0, 1, 15, 16, 17, 63, 64, 65, 200, 1000]) for (const al of [0, 13, 16]) {
  const k = rnd(32), iv = rnd(12), aad = rnd(al), pt = rnd(n);
  const c = crypto.createCipheriv('chacha20-poly1305', k, iv, { authTagLength: 16 }); c.setAAD(aad); const ct = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
  add(`chacha-seal ${hx(k)} ${hx(iv)} ${hx(aad)} ${hx(pt)}`, hx(ct));
  add(`chacha-open ${hx(k)} ${hx(iv)} ${hx(aad)} ${hx(ct)}`, n ? hx(pt) : 'empty');
  const bad = Buffer.from(ct); bad[bad.length - 1] ^= 1;
  add(`chacha-open ${hx(k)} ${hx(iv)} ${hx(aad)} ${hx(bad)}`, 'nil');
  for (const kl of [16, 32]) {
    const k2 = rnd(kl), g = crypto.createCipheriv(kl === 16 ? 'aes-128-gcm' : 'aes-256-gcm', k2, iv); g.setAAD(aad);
    const gt = Buffer.concat([g.update(pt), g.final(), g.getAuthTag()]);
    add(`aes-seal ${hx(k2)} ${hx(iv)} ${hx(aad)} ${hx(pt)}`, hx(gt));
    add(`aes-open ${hx(k2)} ${hx(iv)} ${hx(aad)} ${hx(gt)}`, n ? hx(pt) : 'empty');
    const gb = Buffer.from(gt); gb[0] ^= 1;
    add(`aes-open ${hx(k2)} ${hx(iv)} ${hx(aad)} ${hx(gb)}`, n ? 'nil' : 'nil');
  }
}
const x = crypto.diffieHellman;
for (let i = 0; i < 6; i++) {
  const a = crypto.generateKeyPairSync('x25519'), b = crypto.generateKeyPairSync('x25519');
  const raw = k => k.export({ format: 'der', type: k.type === 'private' ? 'pkcs8' : 'spki' }).subarray(-32);
  add(`x25519 ${hx(raw(a.privateKey))} ${hx(raw(b.publicKey))}`, hx(crypto.diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey })));
}
// RFC 7748 section 5.2 vector
add('x25519 a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4 e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c', 'c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552');
if (cases.length < 100) { console.log('too few crypto cases ran:', cases.length); process.exit(1); }
const r = cp.spawnSync(NAT, [DRV], { input: cases.join('\n') + '\n', encoding: 'utf8', timeout: 300000 });
const got = r.stdout.split('\n').slice(0, cases.length);
let bad = 0;
cases.forEach((c, i) => { if (got[i] !== want[i]) { bad++; if (bad < 6) console.log('FAIL', c.slice(0, 70), '\n  got ', String(got[i]).slice(0, 80), '\n  want', want[i].slice(0, 80)); } });
if (r.status !== 0) { console.log('driver failed', r.stderr); process.exit(1); }
console.log(bad ? `${bad} of ${cases.length} crypto checks FAILED` : `crypto: ${cases.length}/${cases.length} ok`);
process.exit(bad ? 1 : 0);
