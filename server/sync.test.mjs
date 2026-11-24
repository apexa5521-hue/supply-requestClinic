import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { cellValue, columnLetter, googleAccessToken, mirrorToSheet, runExclusive, tzOffsetMs, sheetSerial, cellData, fixFileLinks, planBBlocked } from './sync.mjs';

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

// dates: Riyadh is UTC+3 all year; serial counts days since 1899-12-30 on the sheet's wall clock
assert.equal(tzOffsetMs('Asia/Riyadh', Date.parse('2026-01-02T03:04:05Z')), 3 * 3600e3);
assert.equal(tzOffsetMs('UTC', Date.parse('2026-07-01T00:00:00Z')), 0);
assert.equal(sheetSerial(Date.parse('1970-01-01T00:00:00Z'), 'UTC'), 25569);
assert.equal(sheetSerial(Date.parse('2026-01-01T21:00:00Z'), 'Asia/Riyadh'), sheetSerial(Date.parse('2026-01-02T00:00:00Z'), 'UTC'), 'midnight in Riyadh');
assert.deepEqual(cellData({ $d: '1970-01-01T00:00:00.000Z' }, 'UTC'), { cell: { userEnteredValue: { numberValue: 25569 } }, date: true });
assert.deepEqual(cellData('', 'UTC'), { cell: {} });
assert.deepEqual(cellData(true, 'UTC').cell.userEnteredValue, { boolValue: true });
assert.deepEqual(cellData('=HYPERLINK("x")', 'UTC').cell.userEnteredValue, { stringValue: '=HYPERLINK("x")' }, 'text stays text (no formulas)');
// photo links: Render-only /files/<id> → Drive link; unknown ids unchanged
const links = { abc: 'https://drive.google.com/uc?export=view&id=D1' };
assert.equal(fixFileLinks('/files/abc', links), links.abc);
assert.equal(fixFileLinks('["/files/abc","/files/zzz"]', links), '["' + links.abc + '","/files/zzz"]');
assert.equal(fixFileLinks('see https://x.com/files/abc', links), 'see https://x.com/files/abc');
// plan B guard
assert.equal(planBBlocked([['last_sync', '2026-10-10T10:00:00Z'], ['tabs', '3']], null), null, 'no backup save');
assert.equal(planBBlocked([['last_sync', '2026-10-10T10:00:00Z'], ['tabs', '3'], ['sheet_written_at', '2026-10-10T09:00:00Z']], null), null, 'save already mirrored over');
assert.equal(planBBlocked([['last_sync', '2026-10-10T10:00:00Z'], ['tabs', '3'], ['sheet_written_at', '2026-10-10T11:00:00Z']], null), '2026-10-10T11:00:00.000Z', 'backup used after the last sync → blocked');
assert.equal(planBBlocked([['last_sync', '2026-10-10T10:00:00Z'], ['tabs', '3'], ['sheet_written_at', '2026-10-10T11:00:00Z']], '2026-10-10T12:00:00Z'), null, 'sheet imported back → sync resumes');

const sheetFake = (state) => async (url, opts = {}) => {
  const u = String(url), method = opts.method || 'GET';
  calls.push({ url: u, method, body: opts.body, auth: opts.headers && opts.headers.authorization });
  if (method === 'GET' && u.includes('/values/')) return { ok: true, json: async () => ({ values: state.sync }) };
  if (method === 'GET') return { ok: true, json: async () => ({ properties: { timeZone: 'Asia/Riyadh' }, sheets: state.sheets }) };
  if (u.endsWith(':batchUpdate') && /addSheet/.test(opts.body)) {
    const titles = JSON.parse(opts.body).requests.map(r => r.addSheet.properties.title);
    return { ok: true, json: async () => ({ replies: titles.map((t, i) => ({ addSheet: { properties: { title: t, sheetId: 100 + i, gridProperties: { rowCount: 1000, columnCount: 26 } } } })) }) };
  }
  return { ok: true, json: async () => ({}) };
};
calls.length = 0;
const rows = [
  { name: 'Users', grid: [['Name', 'Password'], ['المدير', 'h1'], ['منى', 'h2']] },
  { name: "Doctor's", grid: [['A', 'B', 'C', 'Photo'], [{ $d: '2026-01-02T03:04:05.000Z' }, null, 7, '/files/abc'], [{ $d: '2026-01-03T03:04:05.000Z' }, 'x', 8, '']] },
  { name: 'Empty', grid: [] },
  { name: '_SYNC', grid: [['last_sync', 'old']] }
];
const state = { sheets: [{ properties: { title: 'Users', sheetId: 1, gridProperties: { rowCount: 2, columnCount: 26 } } }], sync: [] };
const out = await mirrorToSheet({ spreadsheetId: 'SID', token: 'tok123', rows, fetchFn: sheetFake(state), syncedAt: new Date('2026-10-08T12:00:00Z'), fileLinks: links });
assert.equal(out.tabs, 3, "tabs starting with '_' in the database are not mirrored");
assert.equal(out.timeZone, 'Asia/Riyadh');
const add = calls.find(x => x.url.endsWith(':batchUpdate') && /addSheet/.test(x.body));
assert.deepEqual(JSON.parse(add.body).requests.map(r => r.addSheet.properties.title), ["Doctor's", 'Empty', '_SYNC'], 'only missing tabs are created');
const clear = JSON.parse(calls.find(x => x.url.endsWith('/values:batchClear')).body).ranges;
assert.ok(clear.includes("'Doctor''s'!A:ZZ") && !clear.includes('_SYNC!A:ZZ'), 'the guard row in _SYNC is not wiped');
const grow = calls.map(x => x.body && JSON.parse(x.body)).find(b => b && b.requests && b.requests[0].appendDimension);
assert.deepEqual(grow.requests[0].appendDimension, { sheetId: 1, dimension: 'ROWS', length: 1 }, 'a too-small tab grows first');
const writes = calls.filter(x => x.url.endsWith(':batchUpdate') && /updateCells/.test(x.body)).map(x => JSON.parse(x.body).requests);
const docReq = writes.find(r => r[0].updateCells.range.sheetId === 100);
const row1 = docReq[0].updateCells.rows[1].values;
assert.equal(row1[0].userEnteredValue.numberValue, sheetSerial(Date.parse('2026-01-02T03:04:05Z'), 'Asia/Riyadh'), 'date → serial in the sheet time zone');
assert.deepEqual(row1[1], {}); assert.equal(row1[2].userEnteredValue.numberValue, 7);
assert.equal(row1[3].userEnteredValue.stringValue, links.abc, 'photo link points to Drive');
const fmt = docReq.filter(r => r.repeatCell);
assert.deepEqual(fmt.map(r => [r.repeatCell.range.startColumnIndex, r.repeatCell.range.startRowIndex, r.repeatCell.range.endRowIndex]), [[0, 1, 3]], 'one date-format request for the consecutive date cells');
const meta = JSON.parse(calls.filter(x => x.url.endsWith('/values:batchUpdate')).pop().body);
assert.deepEqual(meta.data[0].values[0], ['last_sync', '2026-10-08T12:00:00.000Z']);
assert.ok(calls.every(x => x.auth === 'Bearer tok123'));

// the backup was used after the last sync → nothing is written
calls.length = 0;
state.sheets.push({ properties: { title: '_SYNC', sheetId: 9, gridProperties: { rowCount: 10, columnCount: 5 } } });
state.sync = [['last_sync', '2026-10-08T12:00:00Z'], ['tabs', '3'], ['sheet_written_at', '2026-10-08T13:30:00Z']];
await assert.rejects(mirrorToSheet({ spreadsheetId: 'SID', token: 'tok123', rows, fetchFn: sheetFake(state) }), e => e.code === 'PLAN_B_ACTIVE');
assert.ok(calls.every(x => x.method === 'GET'), 'blocked run only reads');
// after importing the sheet back, it syncs again
calls.length = 0;
await mirrorToSheet({ spreadsheetId: 'SID', token: 'tok123', rows, fetchFn: sheetFake(state), importedAt: '2026-10-08T14:00:00Z' });
assert.ok(calls.some(x => /updateCells/.test(x.body || '')));

// overlapping runs are skipped
const slow = runExclusive(() => new Promise(r => setTimeout(() => r('first'), 50)));
assert.deepEqual(await runExclusive(async () => 'second'), { skipped: true, reason: 'run already in progress' });
assert.equal(await slow, 'first');
assert.equal(await runExclusive(async () => 'third'), 'third');
console.log('sync tests OK');
