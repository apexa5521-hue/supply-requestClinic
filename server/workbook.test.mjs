import assert from 'node:assert/strict';
import { exportWorkbook, readWorkbook, instantFromCell } from './workbook.mjs';
import { sheetSerial } from './sync.mjs';

const at = Date.parse('2026-10-10T07:30:00Z'); // 10:30 in Riyadh
const tables = [
  { name: 'Requests', data: [['RequestID', 'Date', 'Qty', 'Ok', 'Note'], ['REQ-1', new Date(at), 3, true, '']] },
  { name: 'ItemNotes', data: [['A'], ['=HYPERLINK("x")']] },
  { name: '_SYNC', data: [['last_sync', 'x']] }
];
const buf = exportWorkbook(tables);
// the date cell holds the Riyadh wall clock (10:30) as a serial
const raw = (await import('xlsx')).read(buf, { type: 'buffer' });
assert.equal(raw.Sheets.Requests.B2.v, sheetSerial(at, 'Asia/Riyadh'));
const asDate = (await import('xlsx')).read(buf, { type: 'buffer', cellDates: true });
assert.equal(asDate.Sheets.Requests.B2.t, 'd', 'Excel shows it as a date, not a number');
assert.equal(raw.Sheets.Requests.D2.t, 'b');
assert.equal(raw.Sheets.ItemNotes.A2.t, 's', 'formula text stays text');
assert.equal(raw.SheetNames.includes('_SYNC'), false, 'bookkeeping tabs are not exported');
// round trip: import gives back the same instant, the same text and numbers
const back = readWorkbook(buf);
const req = back.find(t => t.name === 'Requests').rows;
assert.equal(req[1][1].$ms, at, 'date survives export → import');
assert.equal(req[1][0], 'REQ-1'); assert.equal(req[1][2], 3); assert.equal(req[1][3], true);
assert.equal(back.find(t => t.name === 'ItemNotes').rows[1][0], '=HYPERLINK("x")');
// instantFromCell is independent of the server's own zone (test: current process zone)
assert.equal(instantFromCell(new Date(2026, 0, 2, 10, 0, 0), 'Asia/Riyadh'), Date.parse('2026-01-02T07:00:00Z'));
console.log('workbook tests OK');
