/* بروفايل الواجهة: زمن الإقلاع، الدخول، والتنقل بين الشاشات لكل دور، مع أثقل الدوال (CPU profile).
   التشغيل: node tests/profile-ui.js [عدد الطلبات]   — PROFILE_TOP=n لعدد الدوال المعروضة */
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..');
const N = Number(process.argv[2]) || 3000;
const TOP = Number(process.env.PROFILE_TOP) || 12;

const initScript = [
  fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8'),
  `(function () {
    const gas = GasMock.createGas();
    seedFixtures(gas);
    const D = 864e5, now = Date.now();
    const items = ['MICRO BRUSH FINE', 'PROPHY PASTE', 'DENTAL FLOSS', 'Etchant Blue Tip', 'Ivoclar Tetric-N A2', 'قفازات طبية M'];
    const st = ['مراجعة الطبيب', 'معتمد من الطبيب', 'قيد التجهيز', 'تم الإرسال', 'تم الاستلام', 'تم الاستلام', 'تم الاستلام'];
    const req = [], ri = [];
    for (let i = 0; i < ${N}; i++) {
      const id = 'REQ-P' + String(i).padStart(5, '0'), s = st[i % st.length];
      const d = new Date(now - (i % 120) * D), sent = s === 'تم الإرسال' || s === 'تم الاستلام';
      req.push([id, d, i % 2 ? 'عيادة الأسنان 1' : 'عيادة الأسنان 2', i % 2 ? 'د. خالد' : 'د. سعد', i % 2 ? 'سارة' : 'ريم', i % 6 ? 'شهري' : 'طارئ', s, d, sent ? d : '', s === 'تم الاستلام' ? d : '', '', '', i % 2 ? 'الرياض' : 'جدة', s === 'مراجعة الطبيب' ? '' : d]);
      for (let k = 0; k < 6; k++) ri.push([id, items[(i + k) % items.length], 3, 3, s === 'تم الاستلام' ? 3 : '', sent ? d : '', sent ? 1 : '']);
    }
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
          // الخادم يعمل خارج المتصفح في الواقع: نشغّله ونطرح زمنه من القياس
          setTimeout(() => {
            let r; const t0 = performance.now();
            try { r = g.__api.apply(null, a); } catch (e) { g.__srv = (g.__srv || 0) + performance.now() - t0; if (h.f) h.f(e); return; }
            const j = JSON.stringify(r === undefined ? null : r);
            g.__srv = (g.__srv || 0) + performance.now() - t0;
            g.__bytes = (g.__bytes || 0) + j.length;
            setTimeout(() => { if (h.s) h.s(JSON.parse(j)); }, 0);
          }, 0);
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(initScript);
  await ctx.addInitScript(() => { try { localStorage.setItem('sf_tour_off', 'true'); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  // هاتف متوسط: المعالج أبطأ 4 مرات
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU_RATE || 4) });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts/.test(m.text())) errors.push('console: ' + m.text()); });
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8')
    .replace(/<\?!=\s*include_\('([\w-]+)'\);?\s*\?>/g, (_, f) => fs.readFileSync(path.join(ROOT, f + '.html'), 'utf8'));
  await ctx.route('http://supplyflow.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));

  const rows = [];
  const allFns = {};
  async function prof(label, fn) {
    await page.evaluate(() => { window.__srv = 0; window.__bytes = 0; });
    await cdp.send('Profiler.start');
    const t0 = Date.now();
    await fn();
    const wall = Date.now() - t0;
    const { profile } = await cdp.send('Profiler.stop');
    const srv = await page.evaluate(() => [Math.round(window.__srv || 0), window.__bytes || 0]);
    // الوقت الذاتي لكل دالة (بدون دوال Code.gs التي تمثل الخادم)
    const self = {};
    const byId = {}; profile.nodes.forEach(n => { byId[n.id] = n; });
    const dt = profile.timeDeltas; let i = 0;
    profile.samples.forEach(id => {
      const n = byId[id]; const cf = n.callFrame;
      const k = (cf.functionName || '(anon)') + ':' + (cf.lineNumber + 1);
      self[k] = (self[k] || 0) + (dt[i++] || 0) / 1000;
    });
    Object.keys(self).forEach(k => { allFns[k] = (allFns[k] || 0) + self[k]; });
    const top = Object.entries(self).filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, v]) => k + '=' + Math.round(v)).join(' ');
    const gc = Math.round(self['(garbage collector):0'] || 0);
    rows.push({ label, wall, client: wall - srv[0], srv: srv[0], kb: Math.round(srv[1] / 1024), gc, top });
  }
  // ننتظر اختفاء الهياكل المؤقتة وهدوء الاستدعاءات
  async function settle() {
    await page.waitForTimeout(20);
    await page.waitForFunction(() => !document.querySelector('#view .skel'), null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
  }
  async function boot() {
    await prof('page boot → login form', async () => { await page.goto('http://supplyflow.test/'); await page.waitForSelector('#loginView:not(.hidden)', { timeout: 60000 }); });
  }
  async function login(name, pass, sel) {
    await page.fill('#loginName', name); await page.fill('#loginPass', pass);
    await prof(name + ': login → first view', async () => { await page.click('#loginBtn'); await page.waitForSelector(sel, { timeout: 60000 }); await settle(); });
  }
  async function views(who) {
    const navs = await page.$$eval('[data-view]', els => Array.from(new Set(els.filter(e => e.offsetParent || e.closest('.bottom-nav,.sidebar')).map(e => e.dataset.view))));
    for (const v of navs) {
      await prof(who + ': → ' + v, async () => {
        await page.evaluate(v => go(v), v);
        await settle();
      });
    }
  }
  async function logout() { await page.evaluate(() => { try { localStorage.clear(); localStorage.setItem('sf_tour_off', 'true'); } catch (e) { /* */ } }); await page.goto('about:blank'); }

  const users = [['سارة', '1111', 'nurse'], ['علي', '3333', 'procurement'], ['د. خالد', '4444', 'doctor'], ['منى', '5555', 'quality'], ['المدير', '1234', 'admin'], ['فني المعمل', '8888', 'lab']];
  const only = (process.env.PROFILE_USERS || '').split(',').filter(Boolean);
  for (const [n, p, who] of users.filter(u => !only.length || only.indexOf(u[2]) !== -1)) {
    await boot();
    await login(n, p, '#appShell:not(.hidden)');
    await views(who);
    await logout();
  }
  console.log('\nUI profile · ' + N + ' requests · CPU ×' + (process.env.CPU_RATE || 4) + ' (mid phone)\n');
  console.log('step'.padEnd(40) + 'wall'.padStart(7) + 'client'.padStart(8) + 'srv'.padStart(6) + '  KB'.padStart(6) + '  gc'.padStart(6) + '  heaviest client functions (ms)');
  rows.forEach(r => console.log(r.label.padEnd(40) + String(r.wall).padStart(7) + String(r.client).padStart(8) + String(r.srv).padStart(6) + String(r.kb).padStart(6) + String(r.gc).padStart(6) + '  ' + r.top));
  console.log('\nTop functions overall:');
  Object.entries(allFns).filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, TOP).forEach(([k, v]) => console.log('  ' + String(Math.round(v)).padStart(7) + ' ms  ' + k));
  console.log(errors.length ? 'ERRORS: ' + errors.slice(0, 5).join(' | ') : 'no page errors');
  if (process.env.PROFILE_JSON) fs.writeFileSync(process.env.PROFILE_JSON, JSON.stringify(rows));
  await browser.close();
})().catch(e => { console.error('PROFILE FAILED', e); process.exit(1); });
