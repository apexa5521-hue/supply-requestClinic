import assert from 'node:assert/strict';
import { driveConfigFromEnv, driveAccessToken, uploadDriveFile, driveViewUrl } from './drive.mjs';

assert.equal(driveConfigFromEnv({}), null);
assert.equal(driveConfigFromEnv({ GOOGLE_OAUTH_CLIENT_ID: 'a', GOOGLE_OAUTH_CLIENT_SECRET: 'b' }), null);
assert.deepEqual(driveConfigFromEnv({ GOOGLE_OAUTH_CLIENT_ID: 'a', GOOGLE_OAUTH_CLIENT_SECRET: 'b', GOOGLE_OAUTH_REFRESH_TOKEN: 'c' }),
  { clientId: 'a', clientSecret: 'b', refreshToken: 'c', folderId: '' });

const calls = [];
const fake = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  if (String(url).startsWith('https://oauth2.googleapis.com/token')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
  if (String(url).includes('/permissions')) return { ok: true, status: 200, json: async () => ({}) };
  return { ok: true, json: async () => ({ id: 'file123' }) };
};
const cfg = { clientId: 'a', clientSecret: 'b', refreshToken: 'r', folderId: 'folderX' };
assert.equal(await driveAccessToken(cfg, fake), 'tok');
const form = new URLSearchParams(calls[0].opts.body);
assert.equal(form.get('grant_type'), 'refresh_token'); assert.equal(form.get('refresh_token'), 'r');

calls.length = 0;
const id = await uploadDriveFile({ token: 'tok', name: 'photo.jpg', mime: 'image/jpeg', bytes: Buffer.from([1, 2, 3]), folderId: 'folderX' }, fake);
assert.equal(id, 'file123');
const up = calls[0];
assert.match(up.url, /uploadType=multipart/);
assert.equal(up.opts.headers.authorization, 'Bearer tok');
const body = Buffer.from(up.opts.body).toString('latin1');
assert.match(body, /"name":"photo\.jpg"/); assert.match(body, /"parents":\["folderX"\]/);
assert.ok(body.includes(String.fromCharCode(1, 2, 3)));
const share = calls[1];
assert.match(share.url, /files\/file123\/permissions$/);
assert.deepEqual(JSON.parse(share.opts.body), { role: 'reader', type: 'anyone' });

assert.equal(driveViewUrl('abc'), 'https://drive.google.com/uc?export=view&id=abc');

// a failed upload throws (the store then keeps the bytes in the database)
const bad = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'quota' } }) });
await assert.rejects(uploadDriveFile({ token: 't', name: 'x', mime: 'image/png', bytes: Buffer.from('x') }, bad), /drive upload: quota/);
console.log('drive tests ok');
