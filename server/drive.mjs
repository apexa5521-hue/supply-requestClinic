// Google Drive as the photo archive (tools, consumables, box stickers, receipts).
// Uses the owner's own Google account through an OAuth refresh token: a service account
// has no storage quota in a personal My Drive, so uploads would fail.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
const PERMS_URL = 'https://www.googleapis.com/drive/v3/files/';

/** env → config, or null when Drive is not set up (the database keeps the bytes then) */
export function driveConfigFromEnv(env) {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID, clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET, refreshToken = env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken, folderId: env.DRIVE_FOLDER_ID || '' };
}

export async function driveAccessToken(cfg, fetchFn = fetch) {
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error('drive token: ' + (j.error_description || (j.error && j.error.message) || j.error || res.status));
  return j.access_token;
}

export function driveViewUrl(id) {
  return 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(id);
}

/** uploads one file (multipart) and makes it readable by anyone with the link. Returns the Drive file id. */
export async function uploadDriveFile({ token, name, mime, bytes, folderId }, fetchFn = fetch) {
  const boundary = 'masar' + Math.random().toString(16).slice(2);
  const meta = { name, mimeType: mime || 'application/octet-stream' };
  if (folderId) meta.parents = [folderId];
  const head = Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
    '\r\n--' + boundary + '\r\nContent-Type: ' + meta.mimeType + '\r\n\r\n');
  const tail = Buffer.from('\r\n--' + boundary + '--');
  const body = Buffer.concat([head, Buffer.from(bytes), tail]);
  const res = await fetchFn(UPLOAD_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'multipart/related; boundary=' + boundary },
    body
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id) throw new Error('drive upload: ' + (j.error && j.error.message || res.status));

  const p = await fetchFn(PERMS_URL + encodeURIComponent(j.id) + '/permissions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
  if (!p.ok) throw new Error('drive share: ' + p.status);
  return j.id;
}
