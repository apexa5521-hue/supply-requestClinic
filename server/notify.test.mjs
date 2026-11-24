import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mailConfigFromEnv, createMailer, createPusher, vapidFromEnv, SERVICE_WORKER, MANIFEST, HEAD_TAGS } from './notify.mjs';

const quiet = { log() {}, error() {} };

// email: nothing set → only logged; Gmail App Password with spaces still works
assert.equal(mailConfigFromEnv({}), null);
const cfg = mailConfigFromEnv({ SMTP_USER: 'supply@clinic.sa', SMTP_PASS: 'abcd efgh ijkl mnop' });
assert.deepEqual([cfg.host, cfg.port, cfg.secure, cfg.pass], ['smtp.gmail.com', 465, true, 'abcdefghijklmnop']);
assert.equal(mailConfigFromEnv({ SMTP_USER: 'a@b.c', SMTP_PASS: 'x', SMTP_PORT: '587' }).secure, false);
assert.equal(createMailer(null, { log: quiet }).enabled, false);
assert.equal(await createMailer(null, { log: quiet }).send({ to: 'a@b.c', subject: 's', body: 'b' }), false);

const sent = [];
const m = createMailer(cfg, { log: quiet, transport: { sendMail: async msg => { sent.push(msg); if (msg.subject === 'boom') throw new Error('535 auth'); } } });
assert.equal(await m.send({ to: 'khaled@clinic.sa', subject: 'طلب', body: 'نص', html: '<b>x</b>', name: 'MasarX · مسار اكس' }), true);
assert.equal(sent[0].to, 'khaled@clinic.sa');
assert.equal(sent[0].from, '"MasarX · مسار اكس" <supply@clinic.sa>');
assert.equal(sent[0].html, '<b>x</b>');
// a role/department email: one message, each person sees only their own address
await m.send({ to: 'a@clinic.sa, b@clinic.sa', subject: 'بلاغ', body: 'x' });
assert.deepEqual([sent[1].to, sent[1].bcc], ['supply@clinic.sa', ['a@clinic.sa', 'b@clinic.sa']]);
assert.ok(!('html' in sent[1]), 'plain-text email stays plain');
// a failed send never throws into the request
assert.equal(await m.send({ to: 'x@clinic.sa', subject: 'boom', body: '' }), false);
assert.deepEqual(m.stats(), { sent: 2, failed: 1 });
assert.equal(await m.send({ to: '', subject: 'x' }), false, 'no address: nothing sent');

// push: devices that are gone (404/410) are reported; other errors only logged
assert.equal(createPusher(null), null);
assert.equal(vapidFromEnv({ VAPID_PUBLIC_KEY: 'p' }), null);
const calls = [], gone = [];
const p = createPusher({ publicKey: 'PUB', privateKey: 'PRIV', subject: 'mailto:a@b.c' }, {
  log: quiet, onGone: list => { gone.push(...list); },
  send: async (sub, payload, opts) => {
    calls.push({ sub, payload, opts });
    if (sub.endpoint.endsWith('/gone')) { const e = new Error('Gone'); e.statusCode = 410; throw e; }
    if (sub.endpoint.endsWith('/down')) { const e = new Error('Down'); e.statusCode = 503; throw e; }
  }
});
assert.equal(p.publicKey, 'PUB');
const out = await p.send([{ endpoint: 'https://p/ok' }, { endpoint: 'https://p/gone' }, { endpoint: 'https://p/down' }], '{"title":"t"}');
assert.deepEqual(out, ['https://p/gone']);
assert.deepEqual(gone, ['https://p/gone']);
assert.equal(calls[0].opts.vapidDetails.privateKey, 'PRIV');
assert.equal(calls[0].opts.urgency, 'high');

// the phone side: tapping opens the request, the app installs to the Home Screen
assert.ok(SERVICE_WORKER.includes("addEventListener('push'") && SERVICE_WORKER.includes('notificationclick') && SERVICE_WORKER.includes('postMessage({ req })'));
assert.equal(JSON.parse(MANIFEST).display, 'standalone');
assert.ok(HEAD_TAGS.includes('apple-touch-icon') && HEAD_TAGS.includes('manifest'));
['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'badge-96.png'].forEach(f =>
  assert.ok(fs.existsSync(new URL('../public/icons/' + f, import.meta.url)), 'icon ' + f));
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
['/sw.js', '/manifest.webmanifest', '/push/key'].forEach(r => assert.ok(server.includes("'" + r + "'"), 'route ' + r));

console.log('notify tests passed');
