/* اختبار حِمل الواجهة: التطبيق الحقيقي في Chromium مع آلاف الطلبات.
   يقيس زمن ظهور القائمة بعد الدخول، البحث، الفلترة، المزامنة، وعدد البطاقات المرسومة.
   التشغيل: node tests/load-ui.js [طلبات مفتوحة/حديثة] [طلبات قديمة مكتملة] */
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..');
const RECENT = Number(process.argv[2]) || 2500;
const OLD = Number(process.argv[3]) || 2500;

const initScript = [
  fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8'),
  `(function () {
    const gas = GasMock.createGas();
    seedFixtures(gas);
    const D = 864e5, now = Date.now();
    const items = ['MICRO BRUSH FINE', 'PROPHY PASTE', 'DENTAL FLOSS', 'Etchant Blue Tip', 'Ivoclar Tetric-N A2', 'قفازات طبية M'];
    const open = ['مراجعة الطبيب', 'معتمد من الطبيب', 'قيد التجهيز', 'تم الإرسال', 'تم الاستلام'];
    const req = [], ri = [];
    const add = (i, days, st) => {
      const id = 'REQ-L' + String(i).padStart(5, '0');
      const d = new Date(now - days * D);
      const sent = st === 'تم الإرسال' || st === 'تم الاستلام';
      req.push([id, d, i % 2 ? 'عيادة الأسنان 1' : 'عيادة الأسنان 2', i % 2 ? 'د. خالد' : 'د. سعد', i % 2 ? 'سارة' : 'ريم', i % 6 ? 'شهري' : 'طارئ', st, d, sent ? d : '', st === 'تم الاستلام' ? d : '', '', '', i % 2 ? 'الرياض' : 'جدة', st === 'مراجعة الطبيب' ? '' : d]);
      for (let k = 0; k < 5; k++) ri.push([id, items[(i + k) % items.length], 3, 3, st === 'تم الاستلام' ? 3 : '', sent ? d : '', sent ? 1 : '']);
    };
    for (let i = 0; i < ${RECENT}; i++) add(i, (i % 55), open[i % open.length]);
    for (let i = 0; i < ${OLD}; i++) add(${RECENT} + i, 70 + (i % 300), 'تم الاستلام');
    gas.seed('Requests', ['RequestID','Date','Clinic','Doctor','Nurse','Type','Status','SubmittedAt','SentAt','ReceivedAt','ReceiverName','SignatureURL','Branch','ApprovedAt'], req);
    gas.seed('RequestItems', ['RequestID','ItemName','RequestedQty','ApprovedQty','ReceivedQty','DispatchedAt','DispatchBatch'], ri);
    const g = globalThis;
    Object.assign(g, gas.globals);
    (function () {
      ${fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8')}
      g.__api = api;
    })();
    function runner() {
      const h = {};
      const p = new Proxy({}, { get(_, k) {
        if (k === 'withSuccessHandler') return f => { h.s = f; return p; };
        if (k === 'withFailureHandler') return f => { h.f = f; return p; };
        return function () {
          const a = arguments;
          setTimeout(() => {
            let r;
            const t0 = performance.now();
            try { r = g.__api.apply(null, a); } catch (e) { if (h.f) h.f(e); return; } finally { g.__apiMs = (g.__apiMs || 0) + performance.now() - t0; (g.__apiLog = g.__apiLog || []).push([a[1], Math.round(performance.now() - t0)]); }
            if (h.s) h.s(r === undefined ? null : JSON.parse(JSON.stringify(r)));
          }, 150); // زمن شبكة تقريبي
        };
      } });
      return p;
    }
    g.google = { script: {} };
    Object.defineProperty(g.google.script, 'run', { get: runner });
  })();`
].join('\n');

(async () => {
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(initScript);
  await ctx.addInitScript(() => { try { localStorage.setItem('sf_tour_off', 'true'); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8')
    .replace(/<\?!=\s*include_\('([\w-]+)'\);?\s*\?>/g, (_, f) => fs.readFileSync(path.join(ROOT, f + '.html'), 'utf8'));
  await ctx.route('http://supplyflow.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('http://supplyflow.test/');
  try { await page.waitForSelector('#loginView:not(.hidden)', { timeout: 30000 }); }
  catch (e) { console.error('page errors:', errors.join(' | ')); throw e; }
  const res = {};
  const time = async (label, fn) => {
    await page.evaluate(() => { window.__apiMs = 0; window.__apiLog = []; });
    const t0 = Date.now(); await fn();
    const srv = await page.evaluate(() => [Math.round(window.__apiMs || 0), (window.__apiLog || []).map(x => x.join(':')).join(' ')]);
    res[label] = (Date.now() - t0) + ' ms (server ' + srv[0] + ' ms: ' + srv[1] + ')';
  };
  await page.fill('#loginName', 'علي'); await page.fill('#loginPass', '3333');
  await time('login → list visible', async () => { await page.click('#loginBtn'); await page.waitForSelector('#procList .req', { timeout: 60000 }); });
  res['cards rendered'] = await page.locator('#procList .req').count();
  res['requests loaded'] = await page.evaluate(() => S.proc.list.length);
  await time('search "REQ-L00123"', async () => { await page.fill('#procFilters input[data-input="procQ"], #procList ~ * input, [data-input="procQ"]', 'REQ-L00123'); await page.waitForFunction(() => document.querySelectorAll('#procList .req').length <= 2, null, { timeout: 30000 }); });
  await page.fill('[data-input="procQ"]', '');
  await page.waitForTimeout(400);
  await time('filter chip "received"', async () => { await page.click('.chip[data-g="received"]'); await page.waitForTimeout(50); await page.waitForSelector('#procList .req'); });
  await page.click('.chip[data-g="all"]');
  await time('sync (all views refresh)', async () => { await page.click('.topbar [data-act="sync"]'); await page.waitForSelector('.toast:has-text("تم")', { timeout: 60000 }); });
  await time('open request details', async () => { await page.click('#procList .req >> nth=3 >> [data-act="detail"]'); await page.waitForSelector('.modal .stepper', { timeout: 30000 }); });
  await page.keyboard.press('Escape');
  const hasMore = await page.isVisible('[data-act="moreList"][data-k="proc"]');
  if (hasMore) await time('show more', async () => { await page.click('[data-act="moreList"][data-k="proc"]'); await page.waitForTimeout(50); });
  const hasArchive = await page.isVisible('[data-act="loadArchive"][data-k="proc"]');
  if (hasArchive) {
    await time('load archive', async () => { await page.click('[data-act="loadArchive"][data-k="proc"]'); await page.waitForFunction(n => S.proc.list.length >= n, RECENT + OLD - 5, { timeout: 60000 }); });
    res['requests with archive'] = await page.evaluate(() => S.proc.list.length);
  }
  res['DOM nodes'] = await page.evaluate(() => document.getElementsByTagName('*').length);
  res['JS heap MB'] = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1);
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'load-ui.png') });
  console.log('\nUI load: ' + RECENT + ' recent/open + ' + OLD + ' old completed requests');
  Object.keys(res).forEach(k => console.log('  ' + k.padEnd(34) + res[k]));
  console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : '  no page errors');
  await browser.close();
})().catch(e => { console.error('LOAD UI FAILED', e); process.exit(1); });
