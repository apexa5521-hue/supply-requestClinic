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
import { driveConfigFromEnv, driveViewUrl } from './server/drive.mjs';
import { googleAccessToken, mirrorToSheet, runExclusive } from './server/sync.mjs';
import { Store, storageState, encodeGrid } from './server/store.mjs';
import { exportWorkbook, instantFromCell } from './server/workbook.mjs';
const SHEET_TZ = process.env.SHEET_TZ || 'Asia/Riyadh';

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
    // known refusals (e.g. ERR_STORAGE_FULL) reach the app as their code; anything else stays generic
    const code = err && typeof err.code === 'string' && /^ERR_[A-Z_]+$/.test(err.code) ? err.code : 'ERR_SERVER';
    res.status(500).json({ ok: false, error: code });
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

/* ---------- admin page: Excel export + import (both with the admin key) ---------- */
const keyOk = req => {
  const want = process.env.ADMIN_KEY || process.env.IMPORT_KEY || '';
  const got = String(req.get('x-admin-key') || req.get('x-import-key') || '');
  return want.length >= 8 && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
};
const ADMIN_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>صفحة الأدمن · مسار</title><style>
body{font-family:system-ui,sans-serif;max-width:600px;margin:32px auto;padding:0 16px;line-height:1.7;color:#0f172a}
h2{margin:.2em 0}section{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0}
input,button{font:inherit;padding:10px 12px;margin:6px 0;width:100%;box-sizing:border-box;border-radius:8px}
input{border:1px solid #cbd5e1}button{background:#2563eb;color:#fff;border:0;cursor:pointer}button:disabled{background:#94a3b8}
.warn{background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:10px;margin:8px 0}
#out{white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px;min-height:1em}
</style></head><body>
<h2>صفحة الأدمن</h2>
<label>مفتاح الأدمن (ADMIN_KEY من Render)</label>
<input id="k" type="password" autocomplete="off" placeholder="الصق المفتاح هنا">

<section>
<h3>مساحة قاعدة البيانات</h3>
<p>الحد المجاني 500 MB. الصور تروح لدرايف، وإذا وصلت القاعدة 80% تتوقف الصور المحفوظة داخلها، وإذا وصلت 97% تتوقف كل التعديلات.</p>
<button id="stat">عرض الحجم</button>
<div id="size" style="margin-top:8px"></div>
</section>

<section>
<h3>تصدير كل البيانات (Excel)</h3>
<p>ينزل ملف .xlsx على جهازك بكل التبويبات الحالية من قاعدة البيانات. ما يُحفظ شيء في Drive.</p>
<button id="exp">تنزيل ملف Excel</button>
</section>

<section>
<h3>استيراد ملف Excel</h3>
<div class="warn"><b>تحذير:</b> الاستيراد <b>يستبدل كل البيانات الحالية</b> في النظام بمحتوى الملف. قبل ما ترفع، تأكد إن ما فيه شغل جديد على النظام ما انحفظ في الملف.</div>
<input id="f" type="file" accept=".xlsx">
<button id="imp">استيراد</button>
</section>

<div id="out"></div>
<script>
const out = document.getElementById('out'), key = () => document.getElementById('k').value.trim();
const show = t => { out.textContent = t; };
document.getElementById('stat').onclick = async () => {
  if (!key()) return show('اكتب مفتاح الأدمن أولاً');
  const r = await fetch('/admin/status', { method: 'POST', headers: { 'x-admin-key': key() } });
  if (!r.ok) return show(await r.text());
  const j = await r.json(), warn = j.textBlocked ? 'توقفت التعديلات، ارفع الخطة فوراً' : j.photosBlocked ? 'الصور داخل القاعدة متوقفة، والتعديلات مستمرة' : 'المساحة تمام';
  document.getElementById('size').innerHTML = '<b>' + j.usedMb + ' MB من ' + j.limitMb + ' MB (' + j.percent + '%)</b> — ' + warn +
    '<br>أكبر الجداول: ' + j.tables.map(t => t.name + ' ' + t.mb + ' MB').join(' · ') + '<br>الصور في درايف: ' + (j.drive ? 'نعم' : 'لا (تُحفظ داخل القاعدة!)');
};
document.getElementById('exp').onclick = async () => {
  if (!key()) return show('اكتب مفتاح الأدمن أولاً');
  show('جاري تجهيز الملف…');
  const r = await fetch('/admin/export', { method: 'POST', headers: { 'x-admin-key': key() } });
  if (!r.ok) return show(await r.text());
  const blob = await r.blob(), a = document.createElement('a');
  const name = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/);
  a.href = URL.createObjectURL(blob); a.download = name ? name[1] : 'masar-export.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  show('تم التنزيل ✓');
};
document.getElementById('imp').onclick = async () => {
  const f = document.getElementById('f').files[0];
  if (!key()) return show('اكتب مفتاح الأدمن أولاً');
  if (!f) return show('اختر ملف .xlsx أولاً');
  if (!confirm('الاستيراد يستبدل كل البيانات الحالية. متأكد؟')) return;
  show('جاري الرفع…');
  const r = await fetch('/admin/import', { method: 'POST', headers: { 'x-admin-key': key(), 'Content-Type': 'application/octet-stream' }, body: await f.arrayBuffer() });
  show(await r.text());
};
</script></body></html>`;
app.get('/admin', (req, res) => res.type('html').send(ADMIN_HTML));
app.get('/admin/import', (req, res) => res.redirect(302, '/admin'));
app.post('/admin/export', express.json({ limit: '1kb' }), async (req, res) => {
  if (!keyOk(req)) return res.status(403).send('مفتاح الأدمن غير صحيح');
  try {
    await ready;
    const buf = await serial(async () => exportWorkbook(gas.order.map(n => ({ name: n, data: gas.sheets[n]._data }))));
    const stamp = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="masar-' + stamp + '.xlsx"');
    res.send(buf);
  } catch (e) {
    console.error('export', e);
    res.status(500).send('فشل التصدير: ' + e.message);
  }
});
app.post('/admin/import', express.raw({ type: '*/*', limit: '60mb' }), async (req, res) => {
  if (!keyOk(req)) return res.status(403).send('مفتاح الأدمن غير صحيح');
  try {
    await ready;
    const report = await serial(async () => {
      const wb = XLSX.read(req.body, { type: 'buffer', cellDates: true });
      gas.order.slice().forEach(n => gas.ss.deleteSheet(gas.sheets[n]));
      const lines = [];
      wb.SheetNames.filter(name => !name.startsWith('_')).forEach(name => {
        const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
        const sh = gas.ss.insertSheet(name);
        // dates: the sheet's wall clock (Riyadh) → real instants (see server/workbook.mjs)
        sh._data = grid.map(row => row.map(v => (v instanceof Date ? new VmDate(instantFromCell(v, SHEET_TZ)) : v)));
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
  // off until the move: staff still work on the Google Sheet (Apps Script), so nothing may write over it.
  // On moving day set SYNC_ENABLED=yes in Render (after importing the sheet) — see the README.
  if (String(process.env.SYNC_ENABLED || '').toLowerCase() !== 'yes') return res.json({ ok: true, skipped: true, reason: 'SYNC_ENABLED is not yes (sync is off until the move to Render)' });
  try {
    await ready;
    const out = await runExclusive(async () => {
      // the in-memory tabs are exactly what the database holds (every save is flushed before it answers)
      const grids = await serial(async () => gas.order.map(n => ({ name: n, grid: JSON.parse(encodeGrid(gas.sheets[n]._data)) })));
      if (!grids.length) return { skipped: true, reason: 'database has no tabs yet' };
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
        message: 'الشيت فيه عمل من الرابط البديل بعد آخر مزامنة — استورده من صفحة /admin أولاً، ثم تعود المزامنة تلقائياً' });
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
  let storage = null;
  try { storage = storageState(await store.dbBytes(), store.limitMb); storage.drive = !!driveCfg; } catch (e) { storage = { error: e.code || 'ERROR' }; }
  res.json({ status: bootError ? 'error' : 'ok', db, storage, sheets: gas.order.length, timestamp: new Date().toISOString() });
});

/* storage details for the admin page: size, the biggest tables */
app.post('/admin/status', express.json({ limit: '1kb' }), async (req, res) => {
  if (!keyOk(req)) return res.status(403).send('مفتاح الأدمن غير صحيح');
  try {
    await ready;
    const st = storageState(await store.dbBytes(), store.limitMb);
    const top = await pool.query(`select relname as name, pg_total_relation_size(relid)::bigint as bytes
      from pg_catalog.pg_statio_user_tables order by 2 desc limit 6`);
    res.json({ ...st, drive: !!driveCfg, tables: top.rows.map(r => ({ name: r.name, mb: Math.round(Number(r.bytes) / 1048576 * 10) / 10 })) });
  } catch (e) { res.status(500).send('فشل قراءة الحجم: ' + e.message); }
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
