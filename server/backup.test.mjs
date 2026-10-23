import assert from 'node:assert/strict';
import { backupFolder, uploadBackup, BACKUP_PREFIX, BACKUP_KEEP, folderUrl } from './backup.mjs';

const calls = [];
const ok = body => ({ ok: true, status: 200, json: async () => body });
let existing = [], refuseConvert = false;
const fake = async (url, opts = {}) => {
  url = String(url); calls.push({ url, opts });
  if (/\/files\/stale\?/.test(url)) return { ok: false, status: 404, json: async () => ({}) };
  if (/\/files\/good\?/.test(url)) return ok({ id: 'good', trashed: false });
  if (url.includes('uploadType=resumable')) {
    if (refuseConvert && JSON.parse(opts.body).mimeType) return { ok: false, status: 400, json: async () => ({ error: { message: 'conversion refused' } }) };
    return { ok: true, status: 200, headers: { get: k => (k === 'location' ? 'https://upload.example/session1' : null) }, json: async () => ({}) };
  }
  if (url === 'https://upload.example/session1') return ok({ id: 'sheet1', webViewLink: 'https://docs.google.com/spreadsheets/d/sheet1/edit' });
  if (opts.method === 'POST') return ok({ id: 'newFolder' });
  if (opts.method === 'PATCH') return ok({});
  if (url.includes('in%20parents')) return ok({ files: existing });
  return ok({ files: [] }); // folder search: none yet
};

// a saved folder that still exists is reused; a stale one (e.g. the old fake «folder1») → search → create
assert.equal(await backupFolder({ token: 't', folderId: 'good' }, fake), 'good');
calls.length = 0;
assert.equal(await backupFolder({ token: 't', folderId: 'stale', parentId: 'photos' }, fake), 'newFolder');
const create = calls.find(c => c.opts.method === 'POST');
assert.deepEqual(JSON.parse(create.opts.body).parents, ['photos']);
assert.equal(JSON.parse(create.opts.body).mimeType, 'application/vnd.google-apps.folder');

// upload: converted to a Google Sheet in the folder, private (no permissions call), keeps the newest 30
existing = Array.from({ length: BACKUP_KEEP + 2 }, (_, i) => ({ id: 'b' + i, name: BACKUP_PREFIX + i })).concat([{ id: 'other', name: 'ملف آخر' }]);
calls.length = 0;
const up = await uploadBackup({ token: 't', folderId: 'newFolder', name: BACKUP_PREFIX + 'x', xlsx: Buffer.from('PK') }, fake);
assert.equal(up.url, 'https://docs.google.com/spreadsheets/d/sheet1/edit');
assert.equal(up.kept, BACKUP_KEEP);
const meta = JSON.parse(calls[0].opts.body);
assert.equal(meta.mimeType, 'application/vnd.google-apps.spreadsheet');
assert.deepEqual(meta.parents, ['newFolder']);
assert.equal(calls[1].opts.method, 'PUT'); assert.equal(Buffer.from(calls[1].opts.body).toString(), 'PK');
assert.ok(!calls.some(c => c.url.includes('/permissions')), 'backup is not shared by link');
assert.deepEqual(calls.filter(c => c.opts.method === 'PATCH').map(c => c.url.split('/').pop()), ['b30', 'b31']);
assert.equal(folderUrl('abc'), 'https://drive.google.com/drive/folders/abc');

// Google refuses the conversion → the same backup as a plain .xlsx
refuseConvert = true; existing = []; calls.length = 0;
const up2 = await uploadBackup({ token: 't', folderId: 'newFolder', name: BACKUP_PREFIX + 'y', xlsx: Buffer.from('PK') }, fake);
assert.equal(up2.id, 'sheet1');
assert.equal(JSON.parse(calls.filter(c => c.url.includes('resumable'))[1].opts.body).name, BACKUP_PREFIX + 'y.xlsx');
refuseConvert = false;

// a failed upload throws (the server then keeps the previous backup status and reports ERR_BACKUP_FAILED)
const bad = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'insufficient scope' } }) });
await assert.rejects(uploadBackup({ token: 't', folderId: 'f', name: 'n', xlsx: Buffer.from('x') }, bad), /drive backup start: insufficient scope/);
console.log('backup tests ok');
