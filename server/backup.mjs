// Nightly / on-demand backup on Render: the whole database as a Google Sheet in the owner's Drive.
// Same OAuth account and drive.file scope as the photos (server/drive.mjs). The copy is private:
// only the owner's Google account opens it (no "anyone with the link" — it holds staff data).
const API = 'https://www.googleapis.com/drive/v3/files';
const RESUMABLE = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink';
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

/**
 * resumable upload (no 5 MB cap like multipart): first the metadata, then the bytes to the session URL.
 * convert = true → a Google Sheet; if Google refuses the conversion, the caller retries as a plain .xlsx.
 */
async function resumable({ token, meta, bytes }, fetchFn) {
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const start = await fetchFn(RESUMABLE, { method: 'POST', headers: { ...auth(token), 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': XLSX_MIME, 'x-upload-content-length': String(bytes.length) },
    body: JSON.stringify(meta) });
  if (!start.ok) await j(start, 'drive backup start');
  const loc = start.headers && start.headers.get && start.headers.get('location');
  if (!loc) throw new Error('drive backup start: no upload URL');
  return j(await fetchFn(loc, { method: 'PUT', headers: { 'content-type': XLSX_MIME }, body: bytes }), 'drive backup upload');
}

/** uploads the .xlsx (as a Google Sheet when possible), then keeps only the newest BACKUP_KEEP copies (older ones → Drive trash) */
export async function uploadBackup({ token, folderId, name, xlsx }, fetchFn = fetch) {
  const bytes = Buffer.from(xlsx);
  let up;
  try { up = await resumable({ token, meta: { name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [folderId] }, bytes }, fetchFn); }
  catch (e) { up = await resumable({ token, meta: { name: name + '.xlsx', parents: [folderId] }, bytes }, fetchFn); }
  const list = await j(await fetchFn(API + '?q=' + encodeURIComponent(q(folderId) + ' in parents and trashed = false') + '&orderBy=createdTime desc&fields=files(id,name)&pageSize=200', { headers: auth(token) }), 'drive backup list');
  const mine = (list.files || []).filter(f => String(f.name).startsWith(BACKUP_PREFIX));
  for (const f of mine.slice(BACKUP_KEEP)) {
    await fetchFn(API + '/' + encodeURIComponent(f.id), { method: 'PATCH', headers: { ...auth(token), 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }) }).catch(() => {});
  }
  return { id: up.id, url: up.webViewLink || 'https://drive.google.com/file/d/' + up.id + '/view', kept: Math.min(mine.length, BACKUP_KEEP) };
}

export const folderUrl = id => 'https://drive.google.com/drive/folders/' + encodeURIComponent(id);
