import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyTicket, readPublicKey, UsedTickets, ISSUER } from './sso.mjs';

const pair = () => {
  const k = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { pub: k.publicKey.export({ type: 'spki', format: 'pem' }), priv: k.privateKey };
};
const platform = pair(), stranger = pair();
const key = readPublicKey(platform.pub.replace(/\n/g, '\\n'));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');

/** An ES256 ticket shaped like the platform's (header.payload.signature, P-1363 signature). */
function sign(claims, { priv = platform.priv, header = { alg: 'ES256', typ: 'JWT' } } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: ISSUER, aud: 'masar', sub: 'سارة الحربي', iat: now, exp: now + 60, jti: crypto.randomUUID(), ...claims };
  const input = b64(header) + '.' + b64(body);
  const sig = crypto.sign('sha256', Buffer.from(input), { key: priv, dsaEncoding: 'ieee-p1363' });
  return input + '.' + sig.toString('base64url');
}
const check = (t, used = new UsedTickets()) => verifyTicket(t, { key, audience: 'masar', used });

// a good ticket: Arabic user names come through intact
const good = sign({});
const used = new UsedTickets();
assert.equal(check(good, used).sub, 'سارة الحربي');
assert.equal(check(good, used), null, 'single use');

// refused tickets
const now = Math.floor(Date.now() / 1000);
const bad = {
  'other key': sign({}, { priv: stranger.priv }),
  'other system': sign({ aud: 'taqeem' }),
  'other issuer': sign({ iss: 'apex-portal' }),
  expired: sign({ iat: now - 300, exp: now - 200 }),
  'from the future': sign({ iat: now + 600, exp: now + 660 }),
  'too long-lived': sign({ exp: now + 3600 }),
  'no user': sign({ sub: '  ' }),
  'no id': sign({ jti: '' }),
  'alg none': b64({ alg: 'none' }) + '.' + b64({ iss: ISSUER, aud: 'masar', sub: 'x', iat: now, exp: now + 60, jti: 'n' }) + '.',
  'header lies about alg': sign({}, { header: { alg: 'HS256' } }),
  'not a jwt': 'garbage',
  'tampered payload': (() => { const p = good.split('.'); return p[0] + '.' + b64({ iss: ISSUER, aud: 'masar', sub: 'admin', iat: now, exp: now + 60, jti: 'z' }) + '.' + p[2]; })()
};
for (const [why, t] of Object.entries(bad)) assert.equal(check(t), null, why);

// HS256 made with the public key text as its secret (algorithm confusion) is refused
const hsInput = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ iss: ISSUER, aud: 'masar', sub: 'x', iat: now, exp: now + 60, jti: 'h' });
const hs = hsInput + '.' + crypto.createHmac('sha256', platform.pub).update(hsInput).digest('base64url');
assert.equal(check(hs), null, 'HS256 with the public key');

// a list audience works when it names masar
assert.ok(check(sign({ aud: ['masar', 'x'] })));

// no key configured: nothing passes
assert.equal(verifyTicket(sign({}), { key: null, audience: 'masar', used: new UsedTickets() }), null);
assert.equal(readPublicKey('not a key'), null);
assert.equal(readPublicKey(''), null);

// used ids are forgotten once their ticket has expired
let t = 1_000_000;
const u = new UsedTickets(() => t);
assert.equal(u.claim('a', 1000), true);
assert.equal(u.claim('a', 1000), false);
t = 1_000_001;
assert.equal(u.claim('a', 2000), true);

console.log('sso tests ok');
