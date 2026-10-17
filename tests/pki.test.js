'use strict';
// lib/pki.aklang: signatures made by Node's crypto (RSA PKCS#1 v1.5, RSA-PSS, ECDSA P-256/P-384) must verify and tampered ones must not;
// certificate chains made with the openssl CLI are checked for trust, host name, dates and CA flags; the system CA bundle's own signatures verify.
const cp = require('child_process'), crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const NAT = path.join(__dirname, '..', 'bin', 'ak'), DRV = path.join(__dirname, 'pki_driver.aklang');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akpki-'));
const hx = b => Buffer.from(b).toString('hex');
const cases = [], want = [];
const add = (line, exp) => { cases.push(line); want.push(exp); };
const spki = k => hx(k.export({ type: 'spki', format: 'der' }));
const flip = b => { const x = Buffer.from(b); x[x.length >> 1] ^= 1; return x; };
const rsa = [crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), crypto.generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 3 })];
for (const kp of rsa) for (const h of ['sha256', 'sha384']) {
  const data = crypto.randomBytes(1 + Math.floor(Math.random() * 300));
  const pk = crypto.sign(h, data, kp.privateKey), ps = crypto.sign(h, data, { key: kp.privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: h === 'sha256' ? 32 : 48 });
  add(`sig ${spki(kp.publicKey)} rsa_pkcs1_${h} ${hx(data)} ${hx(pk)}`, 'true');
  add(`sig ${spki(kp.publicKey)} rsa_pkcs1_${h} ${hx(data)} ${hx(flip(pk))}`, 'false');
  add(`sig ${spki(kp.publicKey)} rsa_pkcs1_${h} ${hx(flip(data))} ${hx(pk)}`, 'false');
  add(`sig ${spki(kp.publicKey)} rsa_pss_${h} ${hx(data)} ${hx(ps)}`, 'true');
  add(`sig ${spki(kp.publicKey)} rsa_pss_${h} ${hx(data)} ${hx(flip(ps))}`, 'false');
  add(`sig ${spki(kp.publicKey)} rsa_pkcs1_${h} ${hx(data)} ${hx(ps)}`, 'false');
}
for (const [curve, h] of [['prime256v1', 'sha256'], ['secp384r1', 'sha384'], ['prime256v1', 'sha384'], ['secp384r1', 'sha256']]) {
  for (let i = 0; i < 3; i++) {
    const kp = crypto.generateKeyPairSync('ec', { namedCurve: curve }), data = crypto.randomBytes(5 + i * 50);
    const sg = crypto.sign(h, data, kp.privateKey);
    add(`sig ${spki(kp.publicKey)} ecdsa_${h} ${hx(data)} ${hx(sg)}`, 'true');
    add(`sig ${spki(kp.publicKey)} ecdsa_${h} ${hx(flip(data))} ${hx(sg)}`, 'false');
    add(`sig ${spki(kp.publicKey)} ecdsa_${h} ${hx(data)} ${hx(flip(sg))}`, 'false');
    const tg = Buffer.from(sg), st = 4 + tg[3]; tg[st] = 3;   // the tag of the second INTEGER changed: an otherwise valid signature must be refused
    add(`sig ${spki(kp.publicKey)} ecdsa_${h} ${hx(data)} ${hx(tg)}`, 'false');
    const rg = Buffer.from(sg); rg[2] = 3;
    add(`sig ${spki(kp.publicKey)} ecdsa_${h} ${hx(data)} ${hx(rg)}`, 'false');
  }
}
// chains from the openssl CLI
const sh = (c) => cp.execSync(c, { cwd: tmp, stdio: 'pipe' }).toString();
const T = 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign';
fs.writeFileSync(path.join(tmp, 'ca.ext'), T + '\n');
fs.writeFileSync(path.join(tmp, 'leaf.ext'), 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:example.test,DNS:*.wild.test,IP:10.1.2.3\n');
fs.writeFileSync(path.join(tmp, 'leafnosan.ext'), 'basicConstraints=CA:FALSE\n');
const gen = (name, keyspec, subj, signer, ext, days) => {
  sh(`openssl genpkey ${keyspec} -out ${name}.key`);
  sh(`openssl req -new -key ${name}.key -subj "/CN=${subj}" -out ${name}.csr`);
  if (!signer) sh(`openssl req -x509 -key ${name}.key -subj "/CN=${subj}" -days 3650 -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign" -out ${name}.pem`);
  else sh(`openssl x509 -req -in ${name}.csr -CA ${signer}.pem -CAkey ${signer}.key -CAcreateserial -days ${days || 3650} -extfile ${ext}.ext -out ${name}.pem`);
};
const EC = '-algorithm EC -pkeyopt ec_paramgen_curve:P-256', RSA = '-algorithm RSA -pkeyopt rsa_keygen_bits:2048';
gen('root', EC, 'Test Root'); gen('mid', RSA, 'Test Intermediate', 'root', 'ca'); gen('leaf', EC, 'leaf', 'mid', 'leaf');
gen('rootb', RSA, 'Other Root'); gen('leafnoca', RSA, 'x', 'leaf', 'leaf'); gen('direct', EC, 'direct', 'root', 'leaf');
gen('nosan', EC, 'nosan', 'mid', 'leafnosan'); gen('old', EC, 'old', 'mid', 'leaf', 1);
const cat = (out, ...n) => fs.writeFileSync(path.join(tmp, out), n.map(x => fs.readFileSync(path.join(tmp, x + '.pem'), 'utf8')).join(''));
cat('chain.pem', 'leaf', 'mid'); cat('chain_nomid.pem', 'leaf'); cat('direct.pem', 'direct'); cat('self.pem', 'root'); cat('nosan.pem', 'nosan', 'mid');
cat('noca.pem', 'leafnoca', 'leaf', 'mid'); cat('old.pem', 'old', 'mid'); cat('roots_root.pem', 'root'); cat('roots_other.pem', 'rootb');
const now = Math.floor(Date.now() / 1000), r = f => path.join(tmp, f);
const chain = (host, t, roots, ch) => `chain ${host} ${t} ${r(roots)} ${r(ch)}`;
add(chain('example.test', now, 'roots_root.pem', 'chain.pem'), 'ok');
add(chain('a.wild.test', now, 'roots_root.pem', 'chain.pem'), 'ok');
add(chain('EXAMPLE.test', now, 'roots_root.pem', 'chain.pem'), 'ok');
add(chain('10.1.2.3', now, 'roots_root.pem', 'chain.pem'), 'ok');
add(chain('example.test', now, 'roots_root.pem', 'direct.pem'), 'ok');
add(chain('evil.test', now, 'roots_root.pem', 'chain.pem'), 'certificate: host name evil.test does not match the certificate');
add(chain('a.b.wild.test', now, 'roots_root.pem', 'chain.pem'), 'certificate: host name a.b.wild.test does not match the certificate');
add(chain('wild.test', now, 'roots_root.pem', 'chain.pem'), 'certificate: host name wild.test does not match the certificate');
add(chain('10.1.2.4', now, 'roots_root.pem', 'chain.pem'), 'certificate: host name 10.1.2.4 does not match the certificate');
add(chain('example.test', now, 'roots_other.pem', 'chain.pem'), 'certificate: unable to find a trusted issuer');
add(chain('example.test', now, 'roots_root.pem', 'chain_nomid.pem'), 'certificate: unable to find a trusted issuer');
add(chain('example.test', now, 'roots_root.pem', 'self.pem'), 'certificate: host name example.test does not match the certificate');
add(chain('example.test', now + 86400 * 365 * 20, 'roots_root.pem', 'chain.pem'), 'certificate: leaf is expired or not yet valid');
add(chain('example.test', now - 86400 * 365, 'roots_root.pem', 'chain.pem'), 'certificate: leaf is expired or not yet valid');
add(chain('example.test', now + 86400 * 3, 'roots_root.pem', 'old.pem'), 'certificate: leaf is expired or not yet valid');
add(chain('example.test', now, 'roots_root.pem', 'nosan.pem'), 'certificate: host name example.test does not match the certificate');
add(chain('example.test', now, 'roots_root.pem', 'noca.pem'), 'certificate: unable to find a trusted issuer');
add('roots', 'true');
if (cases.length < 60) { console.log('too few pki cases ran:', cases.length); process.exit(1); }
const run = cp.spawnSync(NAT, [DRV], { input: cases.join('\n') + '\n', encoding: 'utf8', timeout: 600000 });
if (run.status !== 0) { console.log('driver failed', run.status, run.stderr, run.stdout.slice(-300)); process.exit(1); }
const got = run.stdout.split('\n');
let bad = 0;
cases.forEach((c, i) => { if (got[i] !== want[i]) { bad++; if (bad < 8) console.log('FAIL', c.slice(0, 40), c.slice(-40), '\n  got ', String(got[i]).slice(0, 100), '\n  want', want[i]); } });

fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `${bad} of ${cases.length} pki checks FAILED` : `pki: ${cases.length}/${cases.length} ok`);
process.exit(bad ? 1 : 0);
