/* اختبار شامل كمستخدم نهائي: يشغّل Index.html الحقيقي في Chromium مع Code.gs الحقيقي
   على محاكي Apps Script، ويمر بدورة الطلب كاملة لكل الأدوار ويلتقط صوراً.
   التشغيل: node tests/e2e.js [outDir]
   (يتطلب playwright — مثبت عالمياً أو عبر npm i -D playwright) */
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const initScript = [
  fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8'),
  `(function () {
    const gas = GasMock.createGas();
    seedFixtures(gas);
    // سجل تاريخي لـ 6 أشهر لتعبئة لوحة الإدارة
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const clinics = [['عيادة الأسنان 1', 'د. خالد', 'سارة'], ['عيادة الأسنان 2', 'د. سعد', 'ريم'], ['عيادة الجلدية 1', 'د. فهد', 'سارة']];
    const items = ['MICRO BRUSH FINE', 'PROPHY PASTE', 'DENTAL FLOSS', 'Etchant Blue Tip', 'Ivoclar Tetric-N A2', 'قفازات طبية M'];
    const H = 36e5, reqs = [], ri = [];
    for (let i = 0; i < 26; i++) {
      const c = clinics[i % 3];
      const sub = new Date(Date.now() - (170 - i * 6.2) * 24 * H);
      const emergency = i % 5 === 0;
      const prep = new Date(+sub + (2 + rnd() * 20) * H);
      const rev = new Date(+prep + (3 + rnd() * 12) * H);
      const revd = new Date(+rev + (1 + rnd() * 8) * H);
      const sent = new Date(+revd + (2 + rnd() * (emergency ? 6 : 30)) * H);
      const recv = new Date(+sent + (4 + rnd() * 20) * H);
      const id = 'REQ-H' + String(i + 1).padStart(3, '0');
      const done = i < 22;
      reqs.push([id, sub, c[0], c[1], c[2], emergency ? 'طارئ' : 'شهري', done ? 'تم الاستلام' : 'تم الإرسال', sub, sent, done ? recv : '', done ? c[2] : '', '', prep, '', '', rev, revd, '', '']);
      items.slice(0, 2 + (i % 4)).forEach((it, k) => { const q = 1 + ((i + k) % 7); ri.push([id, it, q, q, done ? q - (i % 9 === 0 && k === 0 ? 1 : 0) : '', sent]); });
    }
    gas.seed('Requests', ['RequestID','Date','Clinic','Doctor','Nurse','Type','Status','SubmittedAt','SentAt','ReceivedAt','ReceiverName','SignatureURL','PrepAt','VendorWaitAt','VendorReceivedAt','ReviewAt','ReviewedAt','RejectionReason','ReceiptURL'], reqs);
    gas.seed('RequestItems', ['RequestID','ItemName','RequestedQty','ApprovedQty','ReceivedQty','DispatchedAt'], ri);
    gas.seed('Comments', ['Timestamp','RequestID','Author','Role','Message'], [
      [new Date(Date.now() - 5 * H), 'REQ-H024', 'علي', 'تموين', 'تم تجهيز الطلب، بانتظار السائق'],
      [new Date(Date.now() - 2 * H), 'REQ-H025', 'سارة', 'ممرضة', 'الطلب وصل ناقص علبة واحدة']
    ]);
    gas.seed('Complaints', ['ComplaintID','Timestamp','RequestID','Author','Role','Type','Message','Resolved','ResolvedBy','ResolvedAt'], [
      ['CMP-1', new Date(Date.now() - 26 * H), 'REQ-H023', 'ريم', 'ممرضة', 'تأخير', 'الطلب الطارئ تأخر أكثر من يومين', false, '', '']
    ]);
    gas.seed('Notices', ['Timestamp','FromRole','FromName','ToRole','Message'], [
      [new Date(Date.now() - 20 * H), 'جودة', 'منى', 'الكل', 'تذكير: آخر موعد لرفع الطلبات الشهرية يوم 15 من كل شهر']
    ]);
    const g = globalThis;
    Object.assign(g, gas.globals);
    g.__gas = gas;
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
            try { r = g.__api.apply(null, a); } catch (e) { if (h.f) h.f(e); return; }
            if (h.s) h.s(r === undefined ? null : JSON.parse(JSON.stringify(r)));
          }, 90);
        };
      } });
      return p;
    }
    g.google = { script: {} };
    Object.defineProperty(g.google.script, 'run', { get: runner });
  })();`
].join('\n');

const errors = [];
let browser_ = null;
let step = 0;
function log(msg) { console.log('  ✔ ' + msg); }

(async () => {
  const browser = await playwright.chromium.launch();
  browser_ = browser;
  const results = { screenshots: [] };

  async function newPage(opts, withTour) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 }, opts || {}));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(initScript);
    // الجولة التعريفية تُختبر في قسم مستقل؛ هنا نوقفها حتى لا تغطي الشاشة
    if (!withTour) await ctx.addInitScript(() => { try { localStorage.setItem('sf_tour_off', 'true'); } catch (e) { /* ignore */ } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errors.push('console: ' + m.text()); });
    // مثل HtmlService: يستبدل <?!= include_('X'); ?> بمحتوى X.html
    const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8')
      .replace(/<\?!=\s*include_\('([\w-]+)'\);?\s*\?>/g, (_, f) => fs.readFileSync(path.join(ROOT, f + '.html'), 'utf8'));
    await ctx.route('http://supplyflow.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('http://supplyflow.test/');
    await page.waitForSelector('#loginView:not(.hidden)');
    return page;
  }
  async function shot(page, name, full) {
    step++;
    const f = path.join(OUT, String(step).padStart(2, '0') + '-' + name + '.png');
    if (full) await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);
    await page.screenshot({ path: f, fullPage: !!full });
    results.screenshots.push(f);
  }
  async function login(page, name, pass) {
    await page.fill('#loginName', name);
    await page.fill('#loginPass', pass);
    await page.click('#loginBtn');
    await page.waitForSelector('#appShell:not(.hidden)');
    await page.waitForTimeout(400);
  }
  async function logout(page) {
    await page.click('.sidebar [data-act="logout"]');
    await page.waitForSelector('#loginView:not(.hidden)');
  }
  async function toastText(page) {
    const el = await page.waitForSelector('.toast:last-child');
    return el.innerText();
  }
  async function toastHas(page, text) {
    try { await page.waitForSelector('.toast:has-text("' + text + '")', { timeout: 6000 }); return true; } catch (e) { return false; }
  }
  function expect(cond, msg) { if (!cond) throw new Error('Expectation failed: ' + msg); log(msg); }

  const page = await newPage();

  // ---------- Login ----------
  await shot(page, 'login');
  await page.fill('#loginName', 'سارة');
  await page.fill('#loginPass', 'wrong');
  await page.click('#loginBtn');
  await page.waitForSelector('#loginError:not(.hidden)');
  expect((await page.innerText('#loginError')).includes('غير صحيح'), 'wrong password shows an error');
  await shot(page, 'login-error');

  // ---------- Nurse: create request ----------
  await login(page, 'سارة', '1111');
  expect(await page.isVisible('text=طلب جديد'), 'nurse lands on the new-request screen');
  await page.waitForSelector('#fDoctor option[value="د. خالد"]', { state: 'attached' });
  await page.click('[data-seg-name="reqType"][data-v="طارئ"]');
  await page.fill('#itemSearch', 'floss');
  await page.waitForSelector('.combo-opt');
  await page.keyboard.press('Enter');
  await page.fill('#itemSearch', 'قفازات');
  await page.keyboard.press('Enter');
  await page.fill('#itemSearch', 'شاش معقم');
  await page.waitForSelector('.combo-opt.new');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.click('.item-line:nth-child(1) [data-d="1"]');
  await page.click('.item-line:nth-child(1) [data-d="1"]');
  await page.waitForSelector('#pkgCard:not(.hidden) .pkg-chip');
  await page.click('.pkg-chip >> nth=0');
  expect(await page.locator('.item-line').count() >= 3, 'items added via search, new-item option and doctor package');
  expect((await page.inputValue('.item-line:nth-child(1) input')) === '3', 'qty stepper increments');
  await shot(page, 'nurse-new-request', true);
  await page.click('#submitBtn');
  let tt = await toastText(page);
  expect(/تم إرسال الطلب REQ-/.test(tt), 'request submitted: ' + tt);
  const newId = /REQ-[\d-]+/.exec(tt)[0];
  expect(await page.locator('.item-line').count() === 0, 'form is cleared after submit');

  await page.click('.sidebar [data-view="mine"]');
  await page.waitForSelector('#mineList .req');
  expect(await page.isVisible(`text=${newId}`), 'new request appears in "my requests"');
  await shot(page, 'nurse-my-requests', true);
  // complaint
  await page.click(`.req:has-text("${newId}") [data-act="complaint"]`);
  await page.click('#cSend');
  expect(await page.isVisible('#cErr:not(.hidden)'), 'complaint requires details');
  await page.click('#cTypes [data-v="نقص"]');
  await page.fill('#cMsg', 'نحتاج الطلب بسرعة');
  await shot(page, 'complaint-modal');
  await page.click('#cSend');
  expect(await toastHas(page, 'البلاغ'), 'complaint sent');
  await logout(page);

  // ---------- Procurement ----------
  await login(page, 'علي', '3333');
  await page.waitForSelector('#procList .req');
  expect(await page.isVisible('.alert.danger'), 'procurement sees an emergency alert');
  await page.check(`.req[data-rid="${newId}"] .req-main > .check`);
  await page.waitForSelector('#bulkbar.show');
  const bulkState = async () => page.$$eval('#bulkbar [data-act="bulk"]', bs => bs.map(b => b.dataset.s + ':' + (b.disabled ? 'off' : 'on')).join(','));
  expect(await bulkState() === 'قيد التجهيز:on,بانتظار المندوب:off,استلم المندوب:off,مراجعة الطبيب:off,تم الإرسال:off',
    'new request: only "in progress" is enabled (dispatch before approval is disabled)');
  await shot(page, 'proc-bulk-new');
  await page.click('#bulkbar [data-s="قيد التجهيز"]');
  expect(await toastHas(page, 'تم تحديث 1'), 'moved to "in progress"');
  await page.waitForTimeout(300);
  await page.click(`.req[data-rid="${newId}"] .req-actions [data-act="procToggle"]`);
  await page.waitForSelector(`#exp-${newId} input[data-change="approveQty"]`);
  await page.fill(`#exp-${newId} input[data-item="DENTAL FLOSS"]`, '2');
  await page.dispatchEvent(`#exp-${newId} input[data-item="DENTAL FLOSS"]`, 'change');
  expect(await toastHas(page, 'تم الحفظ'), 'approved quantity saved');
  await page.check(`.req[data-rid="${newId}"] .req-main > .check`);
  expect(await bulkState() === 'قيد التجهيز:off,بانتظار المندوب:on,استلم المندوب:off,مراجعة الطبيب:on,تم الإرسال:off',
    'in progress: vendor wait and doctor review are enabled');
  await shot(page, 'procurement-board');
  await page.click('#bulkbar [data-s="مراجعة الطبيب"]');
  expect(await toastHas(page, 'تم تحديث'), 'sent to doctor review');
  await page.click('.sidebar [data-view="complaints"]');
  await page.waitForSelector('#cList .req');
  await shot(page, 'procurement-complaints');
  await logout(page);

  // ---------- Doctor ----------
  await login(page, 'د. خالد', '4444');
  await page.waitForSelector('#docList .req');
  await shot(page, 'doctor-reviews');
  await page.click(`#docList [data-id="${newId}"]`);
  await page.waitForSelector('#rvItems table');
  await page.click('#rvReject');
  expect(await page.isVisible('#rvErr:not(.hidden)'), 'rejecting without a reason is blocked');
  await page.fill('.rvNote >> nth=0', 'يفضل النوع الشمعي');
  await shot(page, 'doctor-review-modal');
  await page.click('#rvApprove');
  expect(await toastHas(page, 'تم اعتماد'), 'doctor approved the request');
  await logout(page);

  // ---------- Procurement dispatch ----------
  await login(page, 'علي', '3333');
  expect(await page.isVisible('#pageTitle:has-text("البلاغات")'), 'app remembers the last visited screen');
  await page.click('.sidebar [data-view="requests"]');
  await page.click('.chip[data-g="approved"]');
  await page.check(`.req[data-rid="${newId}"] .req-main > .check`);
  await page.waitForSelector('#bulkbar.show');
  expect(await bulkState() === 'قيد التجهيز:off,بانتظار المندوب:off,استلم المندوب:off,مراجعة الطبيب:off,تم الإرسال:on',
    'doctor-approved: only "dispatch" is enabled');
  await shot(page, 'proc-bulk-approved');
  await page.click('[data-act="clearSel"]');
  await page.waitForSelector(`.req[data-rid="${newId}"]`);
  const exp = await page.$(`#exp-${newId}`);
  if (!exp) await page.click(`.req[data-rid="${newId}"] .req-actions [data-act="procToggle"]`);
  await page.waitForSelector(`#exp-${newId} .dsp`);
  const totalItems = await page.locator(`#exp-${newId} .dsp`).count();
  expect(totalItems >= 2 && await page.isDisabled(`#exp-${newId} [data-act="dispatch"]`), 'dispatch button stays disabled until items are selected');
  await page.check(`#exp-${newId} .dsp >> nth=0`);
  expect(await page.textContent(`#exp-${newId} .dsp-btn .count-pill`) === '1', 'dispatch button shows the selected count');
  await page.click(`#exp-${newId} [data-act="dispatch"]`);
  expect(await toastHas(page, 'أُرسلت الشحنة #1'), 'first item sent as shipment #1');
  await page.waitForSelector(`.req[data-rid="${newId}"] .ship-track`);
  const track = await page.textContent(`.req[data-rid="${newId}"] .ship-track`);
  expect(track.includes('أُرسل 1 من ' + totalItems) && track.includes('متبقي ' + (totalItems - 1)), 'card tracker shows sent/remaining: ' + track.trim());
  await page.waitForSelector(`#exp-${newId} .ship-sum .ship`);
  expect(await page.locator(`#exp-${newId} .ship-stats .is-left b`).textContent() === String(totalItems - 1), 'items panel shows remaining count');
  expect(await page.locator(`#exp-${newId} .badge:has-text("شحنة #1")`).count() === 1, 'sent item is tagged with its shipment number');
  await page.click('.chip[data-g="partial"]');
  expect(await page.locator(`#procList .req[data-rid="${newId}"]`).count() === 1, '"partially sent" filter lists the request');
  await shot(page, 'proc-partial-dispatch');
  await page.click('.chip[data-g="all"]');
  await page.waitForSelector(`#exp-${newId} .dsp`);
  await page.check(`#exp-${newId} [data-change="dspAll"]`);
  expect(await page.locator(`#exp-${newId} .dsp:checked`).count() === totalItems - 1, '"select all remaining" checks every unsent item');
  await page.click(`#exp-${newId} [data-act="dispatch"]`);
  expect(await toastHas(page, 'اكتمل'), 'all items dispatched → request sent');
  await logout(page);

  // ---------- Nurse receives ----------
  await login(page, 'سارة', '1111');
  expect(await page.isVisible('.alert.info'), 'nurse is alerted about a request to receive');
  await page.click('.sidebar [data-view="mine"]');
  expect(await page.textContent(`.req:has-text("${newId}") [data-act="receive"] .count-pill`) === '2', 'receive button shows 2 shipments waiting');
  const sign = async (dx) => {
    const pad = await page.$('#sigPad');
    const bb = await pad.boundingBox();
    await page.mouse.move(bb.x + 40, bb.y + 110);
    await page.mouse.down();
    for (let i = 0; i <= 24; i++) await page.mouse.move(bb.x + 40 + i * 12, bb.y + 90 + Math.sin(i / 2.5 + dx) * 36);
    await page.mouse.up();
  };
  // الشحنة 1
  await page.click(`.req:has-text("${newId}") [data-act="receive"]`);
  await page.waitForSelector('.rq');
  expect(await page.locator('#rShip .chip').count() === 2, 'nurse picks which shipment arrived');
  expect(await page.locator('.rcv-note:not(.last)').count() === 1 && await page.locator('.rq').count() === 1, 'first shipment: only its item, marked as partial receipt');
  await page.fill('.rq >> nth=0', '1');
  await sign(0);
  expect(await page.isVisible('#sigWrap.inked'), 'signature pad captures ink');
  await shot(page, 'nurse-receive-shipment-1');
  await page.click('#rOk');
  expect(await toastHas(page, 'تم استلام الشحنة #1'), 'shipment #1 received and signed');
  expect(await page.evaluate(() => __gas.files.length) === 2, 'shipment #1 signature and receipt uploaded');
  // الشحنة 2 (الأخيرة) → إيصال موحّد
  await page.waitForSelector(`.req:has-text("${newId}") [data-act="receive"]:not(:has(.count-pill))`);
  await page.click(`.req:has-text("${newId}") [data-act="receive"]`);
  await page.waitForSelector('.rcv-note.last');
  expect(await page.locator('#rShip .chip').count() === 0, 'last shipment: no picker');
  await page.fill('#rName', 'منيرة');
  await sign(1.5);
  await shot(page, 'nurse-receive-last-shipment');
  await page.click('#rOk');
  expect(await toastHas(page, 'اكتمل استلام الطلب'), 'last shipment completes the request');
  const files = await page.evaluate(() => __gas.files.map(f => ({ name: f.name, bytes: f.bytes })));
  const merged = files.find(f => f.name.endsWith('-receipt-all.png'));
  expect(files.length === 5 && merged, 'combined receipt saved with every shipment (5 files)');
  if (merged) fs.writeFileSync(path.join(OUT, 'combined-receipt.png'), Buffer.from(merged.bytes.map(b => b & 0xff)));
  await page.click(`.req:has-text("${newId}") [data-act="detail"]`);
  await page.waitForSelector('.stepper');
  expect(await page.locator('.modal .ship-list .ship').count() === 2, 'nurse sees both shipments in the request detail');
  await page.fill('#dComment', 'تم الاستلام، شكراً');
  await page.click('#dSend');
  await page.waitForSelector('.msg.mine');
  expect(await page.locator('.step.done').count() === 6, 'detail stepper shows all 6 stages done');
  await shot(page, 'request-detail');
  await page.keyboard.press('Escape');
  await logout(page);

  // ---------- Quality dashboard ----------
  await login(page, 'منى', '5555');
  await page.waitForSelector('#dashKpis .kpi-val');
  await page.waitForTimeout(1200);
  await shot(page, 'dashboard-light', true);
  await page.click('.topbar [data-act="toggleTheme"]');
  await page.waitForTimeout(600);
  await shot(page, 'dashboard-dark', true);
  await page.click('.topbar [data-act="toggleTheme"]');
  await page.click('.sidebar [data-view="notices"]');
  await page.click('[data-seg-name="noticeTarget"][data-v="ممرضة"]');
  await page.fill('#noticeMsg', 'يرجى تأكيد الاستلام في نفس اليوم');
  await page.click('[data-act="sendNotice"]');
  expect(await toastHas(page, 'تم إرسال التنبيه'), 'notice sent');
  await logout(page);

  // ---------- Admin ----------
  await login(page, 'المدير', '1234');
  await page.click('.sidebar [data-view="users"]');
  await page.waitForSelector('#uTable table');
  await shot(page, 'admin-users');
  await page.click('[data-act="userNew"]');
  await page.fill('#uName', 'هند');
  await page.fill('#uPass', '7777');
  await page.selectOption('#uRole', 'ممرضة');
  await page.click('#uClinics .chip >> nth=1');
  await shot(page, 'admin-new-user');
  await page.click('#uSave');
  expect(await toastHas(page, 'تم حفظ المستخدم'), 'admin created a user');
  await page.click('[data-act="userEdit"][data-name="المدير"]');
  await page.click('#uDel');
  await page.click('[data-yes]');
  await page.waitForSelector('#uErr:not(.hidden)');
  expect((await page.innerText('#uErr')).includes('لا يمكنك حذف حسابك'), 'admin cannot delete own account');
  await page.keyboard.press('Escape');

  // ---------- English / LTR ----------
  await page.click('.topbar [data-act="toggleLang"]');
  await page.click('.sidebar [data-view="overview"]');
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => document.documentElement.dir) === 'ltr', 'language toggle switches to LTR');
  await shot(page, 'dashboard-english');
  await page.click('.topbar [data-act="toggleLang"]');
  await logout(page);

  // ---------- XSS check ----------
  await login(page, 'سارة', '1111');
  await page.evaluate(() => __api(null, 'login', ['سارة', '1111']));
  await page.click('.sidebar [data-view="mine"]');
  await page.click(`.req:has-text("${newId}") [data-act="detail"]`);
  await page.waitForSelector('#dComment');
  await page.fill('#dComment', '<img src=x onerror="window.__xss=1">');
  await page.click('#dSend');
  await page.waitForTimeout(600);
  expect(!(await page.evaluate(() => window.__xss)), 'HTML in comments is escaped (no XSS)');
  await page.keyboard.press('Escape');
  await logout(page);

  // ---------- GitHub Pages mode: fetch → real doPost (Node vm), batching + retry ----------
  {
    const vm = require('vm');
    const { createGas } = require('./gas-mock');
    const { seedFixtures } = require('./fixtures');
    const gas = createGas();
    seedFixtures(gas);
    const sctx = vm.createContext(Object.assign({ Buffer }, gas.globals));
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8'), sctx);
    const net = { posts: 0, batches: 0, failNext: 0 };
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('sf_tour_off', 'true'); } catch (e) { /* ignore */ } });
    await ctx.route('http://pages.test/Index.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8') }));
    await ctx.route('http://pages.test/JavaScript.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(ROOT, 'JavaScript.html'), 'utf8') }));
    await ctx.route(/script\.google\.com\/macros/, r => {
      net.posts++;
      const body = r.request().postData() || '{}';
      if (JSON.parse(body).fn === 'batch') net.batches++;
      if (net.rejectBatch && JSON.parse(body).fn === 'batch') return r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: false, error: 'ERR_UNKNOWN_FN' }) });
      if (net.failNext > 0) { net.failNext--; return r.fulfill({ status: 500, body: '<html>Google error</html>' }); }
      const out = sctx.doPost({ postData: { contents: body } }).getContent();
      r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: out });
    });
    const gp = await ctx.newPage();
    gp.on('pageerror', e => errors.push('pages-mode pageerror: ' + e.message));
    await gp.goto('http://pages.test/Index.html');
    await gp.waitForSelector('#loginView:not(.hidden)');
    expect(!(await gp.isVisible('text=include_')), 'Pages mode: include line is invisible');
    await login(gp, 'علي', '3333');
    await gp.waitForSelector('#procList .req, #procList .empty, #cList .req, #cList .empty');
    expect(net.batches >= 1, 'Pages mode: simultaneous reads are sent as one batch (' + net.posts + ' posts, ' + net.batches + ' batches)');
    net.failNext = 2;
    await gp.click('.topbar [data-act="sync"]');
    expect(await toastHas(gp, 'تم بنجاح'), 'Pages mode: reads recover from two failed server responses (retry)');
    expect(!(await gp.isVisible('.toast.error')), 'Pages mode: no error shown to the user after retry');
    // خادم قديم بدون batch: الواجهة ترجع تلقائياً للإرسال المنفرد
    await gp.evaluate(() => { NET.noBatch = false; });
    net.rejectBatch = true;
    await gp.click('.topbar [data-act="sync"]');
    expect(await toastHas(gp, 'تم بنجاح'), 'Pages mode: falls back to single calls when the server has no batch support');
    expect(!(await gp.isVisible('.toast.error')), 'Pages mode: fallback shows no error');
    await ctx.close();
  }

  // ---------- Onboarding tour & workflow ----------
  {
    const tp = await newPage(null, true);
    await login(tp, 'سارة', '1111');
    await tp.waitForSelector('.tour-card', { timeout: 5000 });
    expect((await tp.innerText('.tour-card h3')).includes('أهلاً'), 'tour opens automatically on first login (Arabic)');
    await shot(tp, 'tour-welcome');
    await tp.click('[data-tour="next"]');
    await tp.waitForTimeout(500);
    expect(await tp.isVisible('.tour-spot:not(.center)'), 'tour highlights a real element');
    await tp.click('[data-tour="next"]');
    await tp.waitForTimeout(700);
    await shot(tp, 'tour-step');
    const total = Number((await tp.innerText('.tour-card .t-step')).match(/\d+/g)[1]);
    expect(total >= 8, 'nurse tour has ' + total + ' steps');
    await tp.click('[data-tour="back"]');
    await tp.click('[data-tour="skip"]');
    await tp.waitForTimeout(400);
    expect(!(await tp.isVisible('.tour-card')), 'skip closes the tour');
    await logout(tp);
    await login(tp, 'سارة', '1111');
    await tp.waitForTimeout(1500);
    expect(!(await tp.isVisible('.tour-card')), 'tour does not reappear after skipping');
    await tp.click('.topbar [data-act="toggleLang"]');
    await tp.click('#tourBtn');
    await tp.waitForSelector('.tour-card');
    expect((await tp.innerText('.tour-card h3')).includes('Welcome'), 'replayed tour follows page language (English)');
    for (let i = 0; i < total; i++) {
      if (!(await tp.isVisible('.tour-card'))) break;
      await tp.click('[data-tour="next"]');
      await tp.waitForTimeout(450);
    }
    expect(!(await tp.isVisible('.tour-card')), 'tour can be completed to the end');
    await tp.click('.topbar [data-act="toggleLang"]');
    await tp.click('.sidebar [data-view="workflow"]');
    await tp.waitForSelector('.wf-flow');
    expect(await tp.locator('.wf-stage').count() === 6 && await tp.isVisible('.wf-card.mine'), 'workflow page shows 6 stages and highlights your role');
    await shot(tp, 'workflow', true);
    await logout(tp);
    await login(tp, 'علي', '3333');
    await tp.waitForSelector('.tour-card');
    await tp.click('[data-tour="next"]'); await tp.waitForTimeout(400);
    await tp.click('[data-tour="next"]'); await tp.waitForTimeout(700);
    await shot(tp, 'tour-procurement');
    await tp.keyboard.press('Escape');
    await tp.waitForTimeout(300);
    expect(!(await tp.isVisible('.tour-card')), 'Esc skips the tour (procurement)');
    await tp.context().close();
    const tm = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true);
    await login(tm, 'د. خالد', '4444');
    await tm.waitForSelector('.tour-card');
    await tm.click('[data-tour="next"]'); await tm.waitForTimeout(600);
    await shot(tm, 'mobile-tour');
    const off = await tm.evaluate(() => { const r = document.querySelector('.tour-card').getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; });
    expect(!off, 'mobile: tour card stays within the screen');
    await tm.context().close();
  }

  // ---------- Mobile ----------
  const m = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await shot(m, 'mobile-login');
  await login(m, 'سارة', '1111');
  await m.waitForSelector('#fDoctor option[value="د. خالد"]', { state: 'attached' });
  await m.waitForSelector('#pkgCard:not(.hidden)');
  await m.click('[data-act="pkgAll"]');
  await shot(m, 'mobile-nurse-new');
  await m.click('.bottom-nav [data-view="mine"]');
  await m.waitForSelector('#mineList .req');
  await shot(m, 'mobile-nurse-mine');
  await m.click('#mineList .req-main >> nth=0');
  await m.waitForSelector('.stepper');
  await shot(m, 'mobile-detail-sheet');
  const hScroll = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!hScroll, 'no horizontal page scroll on mobile');

  await browser.close();
  if (errors.length) { console.error('\nBrowser errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nAll E2E checks passed. Screenshots: ' + results.screenshots.length + ' in ' + OUT);
})().catch(async e => {
  try { const pages = browser_ && browser_.contexts().flatMap(c => c.pages()); if (pages && pages.length) await pages[pages.length - 1].screenshot({ path: path.join(OUT, 'FAILURE.png') }); } catch (x) { /* ignore */ }
  console.error('\nE2E FAILED: ' + e.message);
  if (errors.length) console.error('Browser errors:\n' + errors.join('\n'));
  process.exit(1);
});
