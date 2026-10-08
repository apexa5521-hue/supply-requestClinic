import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { cellValue, columnLetter, googleAccessToken, mirrorToSheet, runExclusive } from './sync.mjs';

assert.equal(columnLetter(1), 'A'); assert.equal(columnLetter(26), 'Z'); assert.equal(columnLetter(27), 'AA'); assert.equal(columnLetter(702), 'ZZ');
assert.equal(cellValue({ $d: '2026-10-08T10:00:00.000Z' }), '2026-10-08T10:00:00.000Z');
assert.equal(cellValue({ $d: null }), ''); assert.equal(cellValue(null), ''); assert.equal(cellValue(5), 5); assert.equal(cellValue('x'), 'x');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = { client_email: 'svc@proj.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const calls = [];
const fake = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, auth: opts.headers && opts.headers.authorization });
  if (String(url).startsWith('https://oauth2.googleapis.com/token')) return { ok: true, json: async () => ({ access_token: 'tok123' }) };
  if ((opts.method || 'GET') === 'GET') return { ok: true, json: async () => ({ sheets: [{ properties: { title: 'Users' } }] }) };
  return { ok: true, json: async () => ({}) };
};
const tok = await googleAccessToken(sa, fake, 1_700_000_000_000);
assert.equal(tok, 'tok123');
// the assertion is a valid RS256 JWT for the right account/scope
const form = new URLSearchParams(calls[0].body); const [h, c, sig] = form.get('assertion').split('.');
assert.ok(crypto.verify('RSA-SHA256', Buffer.from(h + '.' + c), publicKey, Buffer.from(sig, 'base64url')));
const claims = JSON.parse(Buffer.from(c, 'base64url')); assert.equal(claims.iss, sa.client_email); assert.match(claims.scope, /spreadsheets/);

calls.length = 0;
const rows = [
  { name: 'Users', grid: [['Name', 'Password'], ['المدير', 'h1'], ['منى', 'h2']] },
  { name: "Doctor's", grid: [['A', 'B', 'C'], [{ $d: '2026-01-02T03:04:05.000Z' }, null, 7]] },
  { name: 'Empty', grid: [] }
];
const out = await mirrorToSheet({ spreadsheetId: 'SID', token: 'tok123', rows, fetchFn: fake, syncedAt: new Date('2026-10-08T12:00:00Z') });
assert.equal(out.tabs, 3);
const add = calls.find(x => x.url.endsWith(':batchUpdate') && /addSheet/.test(x.body));
const added = JSON.parse(add.body).requests.map(r => r.addSheet.properties.title);
assert.deepEqual(added, ["Doctor's", 'Empty', '_SYNC'], 'only missing tabs are created');
const clear = JSON.parse(calls.find(x => x.url.endsWith('/values:batchClear')).body).ranges;
assert.ok(clear.includes("'Doctor''s'!A:ZZ") && clear.includes('_SYNC!A:ZZ'));
const upd = JSON.parse(calls.find(x => x.url.endsWith('/values:batchUpdate')).body);
assert.equal(upd.valueInputOption, 'RAW');
const byRange = Object.fromEntries(upd.data.map(d => [d.range, d.values]));
assert.deepEqual(byRange["'Users'!A1:B3"][1], ['المدير', 'h1']);
assert.deepEqual(byRange["'Doctor''s'!A1:C2"][1], ['2026-01-02T03:04:05.000Z', '', 7]);
assert.deepEqual(byRange['_SYNC!A1:B2'][0], ['last_sync', '2026-10-08T12:00:00.000Z']);
assert.ok(calls.every(x => !x.url.includes('oauth2') ? x.auth === 'Bearer tok123' : true));
// overlapping runs are skipped
const slow = runExclusive(() => new Promise(r => setTimeout(() => r('first'), 50)));
assert.deepEqual(await runExclusive(async () => 'second'), { skipped: true, reason: 'run already in progress' });
assert.equal(await slow, 'first');
assert.equal(await runExclusive(async () => 'third'), 'third');
console.log('sync tests OK');
