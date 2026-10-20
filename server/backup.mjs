// Nightly / on-demand backup on Render: the whole database as a Google Sheet in the owner's Drive.
// Same OAuth account and drive.file scope as the photos (server/drive.mjs). The copy is private:
// only the owner's Google account opens it (no "anyone with the link" — it holds staff data).
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const BACKUP_FOLDER = 'مسار — نسخ احتياطية';
export const BACKUP_PREFIX = 'مسار — نسخة ';
export const BACKUP_KEEP = 30;

const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
async function j(res, what) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(what + ': ' + ((body.error && body.error.message) || res.status));
  return body;
}
const auth = token => ({ authorization: 'Bearer ' + token });

/** the backup folder: the one saved last time, else found by name, else created (inside parentId when given) */
export async function backupFolder({ token, folderId, parentId }, fetchFn = fetch) {
  if (folderId) {
    const r = await fetchFn(API + '/' + encodeURIComponent(folderId) + '?fields=id,trashed', { headers: auth(token) });
    if (r.ok) { const f = await r.json().catch(() => ({})); if (f.id && !f.trashed) return f.id; }
  }
  const list = await j(await fetchFn(API + '?q=' + encodeURIComponent('name = ' + q(BACKUP_FOLDER) + " and mimeType = '" + FOLDER_MIME + "' and trashed = false") + '&fields=files(id)&pageSize=1', { headers: auth(token) }), 'drive folder list');
  if (list.files && list.files[0]) return list.files[0].id;
  const make = parents => fetchFn(API + '?fields=id', { method: 'POST', headers: { ...auth(token), 'content-type': 'application/json' },
    body: JSON.stringify({ name: BACKUP_FOLDER, mimeType: FOLDER_MIME, ...(parents ? { parents } : {}) }) });
  let r = parentId ? await make([parentId]) : null;
  if (!r || !r.ok) r = await make(null); // no access to the photos folder: My Drive root
  return (await j(r, 'drive folder create')).id;
}

/** uploads the .xlsx converted to a Google Sheet, then keeps only the newest BACKUP_KEEP copies (older ones → Drive trash) */
export async function uploadBackup({ token, folderId, name, xlsx }, fetchFn = fetch) {
  const boundary = 'masarbk' + Math.random().toString(16).slice(2);
  const meta = { name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [folderId] };
  const body = Buffer.concat([
    Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + boundary + '\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'),
    Buffer.from(xlsx), Buffer.from('\r\n--' + boundary + '--')
  ]);
  const up = await j(await fetchFn(UPLOAD, { method: 'POST', headers: { ...auth(token), 'content-type': 'multipart/related; boundary=' + boundary }, body }), 'drive backup upload');
  const list = await j(await fetchFn(API + '?q=' + encodeURIComponent(q(folderId) + ' in parents and trashed = false') + '&orderBy=createdTime desc&fields=files(id,name)&pageSize=200', { headers: auth(token) }), 'drive backup list');
  const mine = (list.files || []).filter(f => String(f.name).startsWith(BACKUP_PREFIX));
  for (const f of mine.slice(BACKUP_KEEP)) {
    await fetchFn(API + '/' + encodeURIComponent(f.id), { method: 'PATCH', headers: { ...auth(token), 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }) }).catch(() => {});
  }
  return { id: up.id, url: up.webViewLink || 'https://docs.google.com/spreadsheets/d/' + up.id + '/edit', kept: Math.min(mine.length, BACKUP_KEEP) };
}

export const folderUrl = id => 'https://drive.google.com/drive/folders/' + encodeURIComponent(id);
