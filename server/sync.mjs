// One-way mirror of the database into a Google Sheet (backup + Apps Script fallback).
// Source of truth: PostgreSQL. Each run rewrites every tab with the current grid.
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets/';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const b64u = buf => Buffer.from(buf).toString('base64url');

// stored grid cell → what Sheets should show
export function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && '$d' in v) return v.$d || '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

export function columnLetter(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const quoteTab = name => "'" + String(name).replace(/'/g, "''") + "'";

// service-account JWT → OAuth access token (no Google SDK needed)
export async function googleAccessToken(sa, fetchFn = fetch, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64u(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + claims), sa.private_key).toString('base64url');
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claims + '.' + sig })
  });
  const j = await res.json();
  if (!res.ok) throw new Error('google token: ' + (j.error_description || j.error || res.status));
  return j.access_token;
}

async function call(fetchFn, token, method, url, body) {
  const res = await fetchFn(url, {
    method,
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('sheets ' + method + ' ' + res.status + ': ' + (j.error && j.error.message || ''));
  return j;
}

/**
 * rows: [{ name, grid }] (grid = array of arrays as stored in the database).
 * Creates missing tabs, clears and rewrites the rest. Tabs not in rows are left alone.
 */
export async function mirrorToSheet({ spreadsheetId, token, rows, fetchFn = fetch, syncedAt = new Date() }) {
  const base = SHEETS_API + spreadsheetId;
  const meta = await call(fetchFn, token, 'GET', base + '?fields=sheets.properties.title');
  const have = new Set((meta.sheets || []).map(s => s.properties.title));
  const want = rows.map(r => r.name).concat(['_SYNC']);
  const missing = want.filter(n => !have.has(n));
  if (missing.length) {
    await call(fetchFn, token, 'POST', base + ':batchUpdate', {
      requests: missing.map(title => ({ addSheet: { properties: { title } } }))
    });
  }

  const data = rows.map(r => {
    const grid = (r.grid || []).map(line => (line || []).map(cellValue));
    const width = Math.max(1, ...grid.map(l => l.length));
    const height = Math.max(1, grid.length);
    return { range: quoteTab(r.name) + '!A1:' + columnLetter(width) + height, values: grid.length ? grid : [['']] };
  });
  data.push({ range: '_SYNC!A1:B2', values: [['last_sync', syncedAt.toISOString()], ['tabs', String(rows.length)]] });

  await call(fetchFn, token, 'POST', base + '/values:batchClear', {
    ranges: data.map(d => d.range.replace(/!.*$/, '') + '!A:ZZ')
  });
  await call(fetchFn, token, 'POST', base + '/values:batchUpdate', { valueInputOption: 'RAW', data });
  return { tabs: rows.length, cells: data.reduce((a, d) => a + d.values.length * (d.values[0] || []).length, 0), syncedAt: syncedAt.toISOString() };
}

/** one run at a time: a slow run must not overlap the next scheduled one */
let running = null;
export function runExclusive(fn) {
  if (running) return Promise.resolve({ skipped: true, reason: 'run already in progress' });
  running = (async () => { try { return await fn(); } finally { running = null; } })();
  return running;
}
