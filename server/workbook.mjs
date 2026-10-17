// Excel in and out of the database. The sheet's wall clock (Riyadh) is the only date format we use,
// so an export imported again gives back the same instants.
import * as XLSX from 'xlsx';
import { tzOffsetMs, sheetSerial } from './sync.mjs';

const isDate = v => v !== null && typeof v === 'object' && Object.prototype.toString.call(v) === '[object Date]';

/** an .xlsx date cell → real instant. SheetJS reads wall-clock values as server-local time; undo that, then undo the sheet zone. */
export function instantFromCell(d, timeZone) {
  const wall = d.getTime() - d.getTimezoneOffset() * 60000;
  return wall - tzOffsetMs(timeZone, wall);
}

/** tables: [{ name, data: rows (arrays, first row = headers) }]. Tabs starting with '_' (sync bookkeeping) are left out. */
export function exportWorkbook(tables, timeZone = 'Asia/Riyadh') {
  const wb = XLSX.utils.book_new();
  tables.filter(t => !String(t.name).startsWith('_')).forEach(t => {
    const rows = (t.data || []).map(row => (row || []).map(v => {
      if (v === null || v === undefined || v === '') return null;
      if (isDate(v)) return isNaN(v.getTime()) ? null : { t: 'n', v: sheetSerial(v.getTime(), timeZone), z: 'yyyy-mm-dd hh:mm' };
      if (typeof v === 'number') return { t: 'n', v };
      if (typeof v === 'boolean') return { t: 'b', v };
      return { t: 's', v: typeof v === 'object' ? JSON.stringify(v) : String(v) };
    }));
    // array of arrays → sheet; empty cells stay empty
    const ws = XLSX.utils.aoa_to_sheet(rows.map(r => r.map(c => (c ? c.v : null))));
    rows.forEach((r, i) => r.forEach((c, j) => {
      if (!c) return;
      const ref = XLSX.utils.encode_cell({ r: i, c: j });
      ws[ref] = Object.assign(ws[ref] || {}, c);
    }));
    XLSX.utils.book_append_sheet(wb, ws, String(t.name).slice(0, 31));
  });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** .xlsx buffer → [{ name, rows }] with date cells already converted to real instants (as ms) */
export function readWorkbook(buf, timeZone = 'Asia/Riyadh') {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  return wb.SheetNames.filter(n => !n.startsWith('_')).map(name => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false })
      .map(row => row.map(v => (v instanceof Date ? { $ms: instantFromCell(v, timeZone) } : v)))
  }));
}
