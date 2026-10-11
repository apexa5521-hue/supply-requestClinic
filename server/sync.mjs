// One-way mirror of the database into a Google Sheet (backup + Apps Script fallback).
// Source of truth: PostgreSQL. Each run rewrites every tab with the current grid.
// Plan B: this sheet is what the Apps Script backup (GitHub link) runs on when Render/Supabase is down.
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

/** offset (ms) of a time zone at an instant, e.g. Asia/Riyadh → +3h */
export function tzOffsetMs(timeZone, ms) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).reduce((o, p) => (o[p.type] = p.value, o), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Sheets date serial (days since 1899-12-30, wall clock of the sheet's time zone) */
export function sheetSerial(ms, timeZone) {
  return (ms + tzOffsetMs(timeZone, ms)) / 86400000 + 25569;
}

// photos: '/files/<id>' only works on the Render server — the sheet gets the Drive link instead
const FILE_RE = /(^|[\s,"'\[(])\/files\/([A-Za-z0-9_-]+)/g;
export function fixFileLinks(s, links) {
  if (!links || s.indexOf('/files/') === -1) return s;
  return s.replace(FILE_RE, (m, pre, id) => pre + (links[id] || '/files/' + id));
}

/** one stored cell → Sheets CellData (dates become real dates so Apps Script reads them as Date) */
export function cellData(v, timeZone, links) {
  if (v === null || v === undefined || v === '') return { cell: {} };
  if (typeof v === 'object' && '$d' in v) {
    const ms = v.$d ? Date.parse(v.$d) : NaN;
    return isNaN(ms) ? { cell: {} } : { cell: { userEnteredValue: { numberValue: sheetSerial(ms, timeZone) } }, date: true };
  }
  if (typeof v === 'number') return { cell: { userEnteredValue: { numberValue: v } } };
  if (typeof v === 'boolean') return { cell: { userEnteredValue: { boolValue: v } } };
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return { cell: { userEnteredValue: { stringValue: fixFileLinks(s, links) } } };
}

export class PlanBActiveError extends Error {
  constructor(writtenAt) { super('PLAN_B_ACTIVE: the sheet was edited at ' + writtenAt + ' (backup link in use) — import the sheet before syncing again'); this.code = 'PLAN_B_ACTIVE'; this.writtenAt = writtenAt; }
}

/** guard: the sheet was saved from the backup (GitHub/Apps Script) after the last mirror, and that data was not imported back */
export function planBBlocked(syncGrid, importedAt) {
  const get = k => { const r = (syncGrid || []).find(x => x && x[0] === k); return r ? Date.parse(r[1]) : NaN; };
  const written = get('sheet_written_at'), last = get('last_sync');
  if (isNaN(written)) return null;
  if (!isNaN(last) && last >= written) return null;
  if (importedAt && Date.parse(importedAt) >= written) return null;
  return new Date(written).toISOString();
}

const DATE_FORMAT = { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm' };
const CHUNK_ROWS = 2000;

/**
 * rows: [{ name, grid }] (grid = array of arrays as stored in the database). Tabs starting with '_' are skipped.
 * Creates missing tabs, clears values and rewrites them with typed cells (dates, numbers, text).
 * Tabs not in rows are left alone. Throws PlanBActiveError instead of overwriting backup work.
 */
export async function mirrorToSheet({ spreadsheetId, token, rows, fetchFn = fetch, syncedAt = new Date(), fileLinks = {}, importedAt = null }) {
  const base = SHEETS_API + spreadsheetId;
  rows = rows.filter(r => !String(r.name).startsWith('_'));
  const meta = await call(fetchFn, token, 'GET', base + '?fields=properties.timeZone,sheets.properties(title,sheetId,gridProperties)');
  const timeZone = (meta.properties && meta.properties.timeZone) || 'Asia/Riyadh';
  const props = {};
  (meta.sheets || []).forEach(s => { props[s.properties.title] = s.properties; });

  if (props._SYNC) {
    const cur = await call(fetchFn, token, 'GET', base + '/values/' + encodeURIComponent('_SYNC!A1:B3'));
    const blocked = planBBlocked(cur.values, importedAt);
    if (blocked) throw new PlanBActiveError(blocked);
  }

  const want = rows.map(r => r.name).concat(['_SYNC']);
  const missing = want.filter(n => !props[n]);
  if (missing.length) {
    const rep = await call(fetchFn, token, 'POST', base + ':batchUpdate', {
      requests: missing.map(title => ({ addSheet: { properties: { title } } }))
    });
    (rep.replies || []).forEach((r, i) => { props[missing[i]] = (r.addSheet && r.addSheet.properties) || { title: missing[i] }; });
  }

  await call(fetchFn, token, 'POST', base + '/values:batchClear', {
    ranges: rows.map(r => quoteTab(r.name) + '!A:ZZ')
  });

  let cells = 0;
  for (const r of rows) {
    const p = props[r.name] || {};
    const grid = r.grid || [];
    if (!grid.length) continue;
    const width = Math.max(1, ...grid.map(l => (l || []).length));
    const reqs = [];
    const gp = p.gridProperties || {};
    if ((gp.rowCount || 0) < grid.length) reqs.push({ appendDimension: { sheetId: p.sheetId, dimension: 'ROWS', length: grid.length - (gp.rowCount || 0) } });
    if ((gp.columnCount || 0) < width) reqs.push({ appendDimension: { sheetId: p.sheetId, dimension: 'COLUMNS', length: width - (gp.columnCount || 0) } });
    if (reqs.length) await call(fetchFn, token, 'POST', base + ':batchUpdate', { requests: reqs });
    for (let start = 0; start < grid.length; start += CHUNK_ROWS) {
      const part = grid.slice(start, start + CHUNK_ROWS);
      const dateRuns = []; // [col, fromRow, toRow) of consecutive date cells → one format request each
      const open = {};
      const rowData = part.map((line, i) => ({
        values: (line || []).map((v, c) => {
          const d = cellData(v, timeZone, fileLinks);
          const rowIx = start + i;
          if (d.date) {
            if (open[c] && open[c][2] === rowIx) open[c][2] = rowIx + 1;
            else { open[c] = [c, rowIx, rowIx + 1]; dateRuns.push(open[c]); }
          }
          return d.cell;
        })
      }));
      cells += part.reduce((a, l) => a + (l || []).length, 0);
      const requests = [{ updateCells: { range: { sheetId: p.sheetId, startRowIndex: start, startColumnIndex: 0 }, rows: rowData, fields: 'userEnteredValue' } }]
        .concat(dateRuns.map(([c, a, b]) => ({ repeatCell: { range: { sheetId: p.sheetId, startRowIndex: a, endRowIndex: b, startColumnIndex: c, endColumnIndex: c + 1 }, cell: { userEnteredFormat: { numberFormat: DATE_FORMAT } }, fields: 'userEnteredFormat.numberFormat' } })));
      await call(fetchFn, token, 'POST', base + ':batchUpdate', { requests });
    }
  }
  // B3 (sheet_written_at) is kept: the guard compares it with this new last_sync
  await call(fetchFn, token, 'POST', base + '/values:batchUpdate', { valueInputOption: 'RAW', data: [
    { range: '_SYNC!A1:B2', values: [['last_sync', syncedAt.toISOString()], ['tabs', String(rows.length)]] }] });
  return { tabs: rows.length, cells, timeZone, syncedAt: syncedAt.toISOString() };
}

/** one run at a time: a slow run must not overlap the next scheduled one */
let running = null;
export function runExclusive(fn) {
  if (running) return Promise.resolve({ skipped: true, reason: 'run already in progress' });
  running = (async () => { try { return await fn(); } finally { running = null; } })();
  return running;
}
