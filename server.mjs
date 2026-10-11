// Masar trial server: runs the same Code.gs as Apps Script (in a Node vm), with data in PostgreSQL
// (Supabase) instead of Google Sheets, and serves the same front end.
import express from 'express';
import dotenv from 'dotenv';
import pg from 'pg';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { createGas } from './server/gas.mjs';
import { Store } from './server/store.mjs';
import { driveConfigFromEnv, driveViewUrl } from './server/drive.mjs';
import { googleAccessToken, mirrorToSheet, runExclusive, tzOffsetMs } from './server/sync.mjs';

dotenv.config();
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 4
});
// Drive archive for photos: set GOOGLE_OAUTH_* (see README). Without it, files stay in the database.
const driveCfg = driveConfigFromEnv(process.env);
const store = new Store(pool, driveCfg ? { cfg: driveCfg, token: null } : null);

/* ---------- Code.gs runtime ---------- */
const gas = createGas({ onMail: m => console.log('[mail] to=%s subject=%s', m.to, m.subject) });
const ctx = vm.createContext(Object.assign({ console }, gas.globals));
vm.runInContext(read('Code.gs'), ctx, { filename: 'Code.gs' });
const VmDate = vm.runInContext('Date', ctx);
let ready = null, bootError = null;

// one request at a time (the Apps Script lock), and every change is saved before the reply
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}
async function callApi(bodyText) {
  const out = ctx.doPost({ postData: { contents: bodyText } }).getContent();
  await store.flush(gas);
  return out;
}

/* ---------- front end: Index.html + JavaScript.html, talking to /api ---------- */
function buildIndex() {
  const js = read('JavaScript.html').replace(/const APPS_SCRIPT_URL = '[^']*';/, "const APPS_SCRIPT_URL = '/api';");
  let html = read('Index.html').replace("<?!= include_('JavaScript'); ?>", () => js);
  if (!/<title>/i.test(html)) html = html.replace('<head>', '<head>\n<title>مسار — ApexCare</title>');
  if (!/name="viewport"/.test(html)) html = html.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
  return html;
}
const INDEX = buildIndex();

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'strict-origin-when-cross-origin'); next(); });

app.get('/', (req, res) => { res.set('Cache-Control', 'no-cache'); res.type('html').send(INDEX); });

app.post('/api', express.text({ type: '*/*', limit: '25mb' }), async (req, res) => {
  try {
    await ready;
    if (bootError) throw bootError;
    const out = await serial(() => callApi(req.body || '{}'));
    res.type('application/json').send(out);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ ok: false, error: 'ERR_SERVER' });
  }
});

// files that Code.gs saved to "Drive" (receipts, signatures, photos)
app.get('/files/:id', (req, res) => {
  const f = gas.files.get(req.params.id);
  if (!f) return res.sendStatus(404);
  if (f.driveId) return res.redirect(302, driveViewUrl(f.driveId));
  res.set('Cache-Control', 'private, max-age=86400');
  res.type(f.mime || 'application/octet-stream').send(f.bytes);
});

/* ---------- one-time import of the Google Sheet (.xlsx export) ---------- */
const keyOk = req => {
  const want = process.env.IMPORT_KEY || '';
  const got = String(req.get('x-import-key') || '');
  return want.length >= 8 && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
};
app.get('/admin/import', (req, res) => {
  res.type('html').send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>استيراد بيانات مسار</title><style>body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;line-height:1.7}
input,button{font:inherit;padding:8px 12px;margin:6px 0;width:100%;box-sizing:border-box}button{background:#2563eb;color:#fff;border:0;border-radius:8px}#out{white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px}</style></head>
<body><h2>استيراد بيانات Google Sheet</h2>
<p>من Google Sheets: <b>File ← Download ← Microsoft Excel (.xlsx)</b> ثم ارفع الملف هنا. <b>كل البيانات الحالية في هذه النسخة التجريبية تُستبدل.</b></p>
<label>مفتاح الاستيراد (IMPORT_KEY من Render)</label><input id="k" type="password" autocomplete="off">
<label>ملف .xlsx</label><input id="f" type="file" accept=".xlsx">
<button id="go">استيراد</button><div id="out"></div>
<script>
document.getElementById('go').onclick = async () => {
  const f = document.getElementById('f').files[0], out = document.getElementById('out');
  if (!f) { out.textContent = 'اختر الملف أولاً'; return; }
  out.textContent = 'جاري الرفع…';
  const r = await fetch('/admin/import', { method: 'POST', headers: { 'x-import-key': document.getElementById('k').value, 'Content-Type': 'application/octet-stream' }, body: await f.arrayBuffer() });
  out.textContent = await r.text();
};
</script></body></html>`);
});
app.post('/admin/import', express.raw({ type: '*/*', limit: '60mb' }), async (req, res) => {
  if (!keyOk(req)) return res.status(403).send('مفتاح الاستيراد غير صحيح');
  try {
    await ready;
    const report = await serial(async () => {
      const wb = XLSX.read(req.body, { type: 'buffer', cellDates: true });
      gas.order.slice().forEach(n => gas.ss.deleteSheet(gas.sheets[n]));
      const lines = [];
      // .xlsx dates carry the sheet's wall clock (Riyadh); SheetJS reads them as this server's local time
      const tz = process.env.SHEET_TZ || 'Asia/Riyadh';
      const fixDate = d => { const wall = d.getTime() - d.getTimezoneOffset() * 60000; return wall - tzOffsetMs(tz, wall); };
      wb.SheetNames.filter(name => !name.startsWith('_')).forEach(name => {
        const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
        const sh = gas.ss.insertSheet(name);
        sh._data = grid.map(row => row.map(v => (v instanceof Date ? new VmDate(fixDate(v)) : v)));
        lines.push(name + ': ' + Math.max(0, grid.length - 1) + ' صف');
      });
      // sessions and memoized reads belong to the old data
      Object.keys(gas.cacheStore).forEach(k => delete gas.cacheStore[k]);
      await store.flush(gas);
      // the sheet's backup work is now in the database: the mirror may overwrite the sheet again
      await pool.query("insert into gas_kv (kind, k, v) values ('meta', 'imported_at', $1) on conflict (kind, k) do update set v = excluded.v", [new Date().toISOString()]);
      return lines;
    });
    res.type('text').send('تم الاستيراد ✓\n' + report.join('\n'));
  } catch (e) {
    console.error('import', e);
    res.status(500).send('فشل الاستيراد: ' + e.message);
  }
});

/* ---------- mirror to a Google Sheet (called every 15 min by Supabase pg_cron) ---------- */
app.post('/sync/run', async (req, res) => {
  const want = process.env.SYNC_KEY || '', got = String(req.get('x-sync-key') || '');
  if (!(want.length >= 8 && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want)))) return res.sendStatus(403);
  if (!process.env.GOOGLE_SA_JSON || !process.env.SHEET_SYNC_ID) return res.status(400).json({ ok: false, error: 'sync not configured' });
  try {
    await ready;
    const out = await runExclusive(async () => {
      const { rows } = await pool.query('select name, data::text as data from gas_sheets order by ord, name');
      if (!rows.length) return { skipped: true, reason: 'database has no tabs yet' };
      const grids = rows.map(r => ({ name: r.name, grid: JSON.parse(r.data) }));
      const token = await googleAccessToken(JSON.parse(process.env.GOOGLE_SA_JSON));
      // photos stored in Drive: the sheet (backup link) gets the Drive link, not this server's /files/<id>
      const fileLinks = {};
      (await pool.query('select id, drive_id from gas_files where drive_id is not null')).rows.forEach(f => { fileLinks[f.id] = driveViewUrl(f.drive_id); });
      const imp = await pool.query("select v from gas_kv where kind = 'meta' and k = 'imported_at'");
      return mirrorToSheet({ spreadsheetId: process.env.SHEET_SYNC_ID, token, rows: grids, fileLinks, importedAt: imp.rows[0] ? imp.rows[0].v : null });
    });
    console.log('[sync]', JSON.stringify(out));
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e.code === 'PLAN_B_ACTIVE') {
      // the backup link (GitHub + Apps Script) saved data in the sheet: never overwrite it — import it first
      console.warn('[sync] blocked:', e.message);
      return res.status(409).json({ ok: false, error: 'PLAN_B_ACTIVE', writtenAt: e.writtenAt,
        message: 'الشيت فيه عمل من الرابط البديل بعد آخر مزامنة — استورده من /admin/import أولاً، ثم تعود المزامنة تلقائياً' });
    }
    console.error('[sync] failed:', e.message);
    res.status(500).json({ ok: false, error: String(e.message).slice(0, 200) });
  }
});

app.get('/health', async (req, res) => {
  let db;
  try {
    const r = await pool.query('select version()');
    db = { connected: true, version: r.rows[0].version.split(' ').slice(0, 2).join(' ') };
  } catch (err) {
    db = { connected: false, error: err.code || 'ERROR' };
  }
  res.json({ status: bootError ? 'error' : 'ok', db, sheets: gas.order.length, timestamp: new Date().toISOString() });
});

ready = (async () => {
  try {
    await store.init();
    const n = await store.load(gas, VmDate);
    console.log('Loaded from PostgreSQL:', n);
    // empty database: the same first-time setup as Apps Script (tabs, default roles, admin «المدير» / 1234)
    if (!n.sheets) { ctx.setupSheets(); await store.flush(gas); console.log('New database: created', gas.order.length, 'tabs'); }
  } catch (e) { bootError = e; console.error('Boot failed:', e); }
})();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Masar listening on port ${PORT}`));
