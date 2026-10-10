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
          (g.__runs = g.__runs || []).push(a[1]);
          setTimeout(() => {
            let r;
            if (g.__failWrites > 0 && !/^(get|batch|login|logout)/.test(a[1])) { g.__failWrites--; if (h.f) h.f(new Error('ERR_BUSY')); return; }
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
    await ctx.route(/^http:\/\/supplyflow\.test\/(\?.*)?$/, r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    // مولّد QR من cdnjs غير متاح في الاختبار: الطباعة تتحول لرابط نصي
    await ctx.route(/cdnjs\.cloudflare\.com/, r => r.abort());
    await page.goto('http://supplyflow.test/' + ((opts && opts.query) || ''));
    if (!(opts && opts.query)) await page.waitForSelector('#loginView:not(.hidden)');
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
  await page.click('.login-tools [data-act="toggleTheme"]');
  await page.waitForTimeout(250);
  await shot(page, 'login-dark');
  await page.click('.login-tools [data-act="toggleTheme"]');
  await page.fill('#loginName', 'سارة');
  await page.fill('#loginPass', 'wrong');
  await page.click('#loginBtn');
  await page.waitForSelector('#loginError:not(.hidden)');
  expect((await page.innerText('#loginError')).includes('غير صحيح'), 'wrong password shows an error');
  expect(await page.evaluate(() => { const i = document.getElementById('companyLogo'); return i && i.complete && i.naturalWidth > 100; }), 'client logo shows on the login screen');
  await shot(page, 'login-error');

  // ---------- Nurse: create request ----------
  await login(page, 'سارة', '1111');
  expect(await page.isVisible('text=طلب جديد'), 'nurse lands on the new-request screen');
  await page.waitForSelector('#fDoctor option[value="د. خالد"]', { state: 'attached' });
  expect(!(await page.$('#fClinic')) && await page.isVisible('#fDocClinic'), 'doctor request: clinic dropdown, then the doctor');
  const docClinicOpts = await page.$$eval('#fDocClinic option', os => os.map(o => o.textContent));
  expect(docClinicOpts.length >= 1 && !docClinicOpts.some(x => /Sterilization|فرز|Triage/i.test(x)), 'doctor request clinics exclude sterilization/triage: ' + docClinicOpts.join(' | '));
  const docGroups = await page.$$eval('#fDoctor optgroup', gs => gs.map(g => g.label));
  expect(docGroups.length === 0 || (docGroups[0] === 'أطباء هذه العيادة' && docGroups[1] === 'باقي الأطباء'), 'doctors: this clinic first, then every other doctor — ' + docGroups.join(' | '));
  await page.click('[data-seg-name="reqKind"][data-v="clinic"]');
  await page.waitForSelector('#fClinic');
  expect(!(await page.$('#fDoctor')), 'clinic consumables: clinic instead of doctor');
  const groups = await page.$$eval('#fClinic optgroup', gs => gs.map(g => g.label + ':' + g.children.length));
  expect(groups.slice(0, 2).join(' | ') === 'قسم التعقيم:2 | غرفة الفرز:2' && groups.slice(2).length >= 1 && groups.slice(2).every(g => g.startsWith('عيادات الأسنان — ')),
    'clinic consumables: sterilization, the triage room, then dental clinics by branch — ' + groups.join(' | '));
  const dentalOpts = await page.$$eval('#fClinic optgroup', gs => gs.filter(g => g.label.startsWith('عيادات الأسنان')).flatMap(g => [...g.children].map(o => o.textContent)));
  expect(dentalOpts.includes('عيادة الأسنان 2') && !dentalOpts.some(x => /جلد|derma/i.test(x)), 'every dental clinic listed (not only hers), no dermatology clinics — ' + dentalOpts.join(' | '));
  expect(await page.inputValue('#fClinic') !== '' && (await page.textContent('#sterilNote')).includes('التعقيم'), 'defaults to sterilization of her branch');
  await page.selectOption('#fClinic', await page.$eval('#fClinic optgroup option:nth-child(2)', o => o.value));
  expect((await page.textContent('#sterilNote')).includes('جدة') && await page.inputValue('#fBranch') === 'جدة', 'choosing sterilization shows where it is (branch) and sets the branch');
  await shot(page, 'new-sterilization');
  await shot(page, 'new-clinic-consumables');
  await page.click('[data-seg-name="reqKind"][data-v="doctor"]');
  await page.waitForSelector('#fDoctor option[value="د. خالد"]', { state: 'attached' });
  // الأقسام: عيادة الجلدية ترى مستهلكات الجلدية والمشتركة فقط، وكل صنف عليه تصنيفه
  const clinicVal = n => page.$eval('#fDocClinic', (sel, n) => [...sel.querySelectorAll('option')].find(x => x.textContent === n).value, n);
  await page.evaluate(() => { S.catalog.forEach(c => { if (c.name === 'PROPHY PASTE') c.dept = 'أسنان'; if (c.name === 'قفازات طبية M') c.dept = 'جلدية'; }); });
  await page.selectOption('#fDocClinic', await clinicVal('عيادة الجلدية 1'));
  await page.click('#itemSearch');
  await page.waitForSelector('#comboList .combo-opt');
  const pick = await page.$$eval('#comboList .combo-opt .nm', els => els.map(e => e.textContent));
  expect(!pick.some(x => x.includes('PROPHY PASTE')) && pick.some(x => x.includes('قفازات طبية M') && x.includes('مستهلك جلدية')) && pick.some(x => x.includes('مشترك')), 'derma clinic: dental items hidden, items tagged by department (' + pick.length + ')');
  await shot(page, 'items-by-department');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { S.catalog.forEach(c => { delete c.dept; }); });
  await page.selectOption('#fDocClinic', await clinicVal('عيادة الأسنان 1'));
  await page.waitForSelector('#fDoctor option[value="د. خالد"]', { state: 'attached' });
  await page.selectOption('#fDoctor', 'د. خالد');
  await page.waitForFunction(() => document.getElementById('fBranch').value === 'الرياض');
  expect(await page.inputValue('#fBranch') === 'الرياض', 'branch defaults to the doctor clinic branch');
  await page.selectOption('#fBranch', 'جدة');
  expect((await page.textContent('#sumBox')).includes('جدة'), 'chosen branch shows in the summary');
  await page.click('[data-seg-name="reqType"][data-v="طارئ"]');
  await page.click('#itemSearch');
  await page.waitForSelector('#comboList .combo-opt');
  const catN = await page.evaluate(() => S.catalog.length);
  expect(catN >= 5 && await page.locator('#comboList .combo-opt').count() === catN, 'item picker lists the whole catalog (' + catN + ') on focus, scrollable');
  await shot(page, 'item-picker-all');
  await page.fill('#itemSearch', 'floss');
  await page.waitForSelector('.combo-opt');
  await page.keyboard.press('Enter');
  // جزء من اسم صنف موجود: نتائج الكتالوج تظهر أولاً، وخيار الصنف الحر تحتها (لا يخفيها)
  await page.fill('#itemSearch', 'قفاز');
  await page.waitForSelector('#comboList .combo-opt[data-i]');
  expect(await page.locator('#comboList .combo-opt[data-i]').count() >= 1 && await page.locator('#comboList .combo-free-opt').count() === 2, 'partial name lists catalog matches above the free-item options');
  await page.fill('#itemSearch', 'قفازات');
  await page.keyboard.press('Enter');
  // صنف غير موجود: الممرضة تكتبه كصنف حر (مستهلك أو ماتيريال)، ويظهر في الطلب بعلامة حر
  await page.fill('#itemSearch', 'شاش معقم');
  await page.waitForSelector('#comboList .combo-free-opt');
  expect(await page.locator('#comboList .combo-free-opt').count() === 2, 'free item: add as consumable or material');
  await shot(page, 'new-free-item');
  await page.click('#comboList .combo-free-opt[data-free="مستهلك"]');
  await page.waitForSelector('#itemsList .item-line:has-text("شاش معقم")');
  expect((await page.textContent('#itemsList')).includes('صنف حر'), 'free item marked on the request line');
  await page.locator('#itemsList .item-line:has-text("شاش معقم") [data-act="rmItem"]').click();
  await page.keyboard.press('Escape');
  await page.fill('#itemSearch', 'etchant');
  await page.waitForSelector('#comboList .combo-opt');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.click('.item-line:nth-child(1) [data-d="1"]');
  await page.click('.item-line:nth-child(1) [data-d="1"]');
  await page.waitForSelector('#pkgCard:not(.hidden) .pkg-chip');
  await page.click('.pkg-chip >> nth=0');
  expect(await page.locator('.item-line').count() >= 3, 'items added via catalog search and doctor package');
  expect((await page.inputValue('.item-line:nth-child(1) input')) === '3', 'qty stepper increments');
  // الكمية صفر: خطأ واضح ويُمنع الإرسال
  // القائمة قد تُعاد رسمها بعد إضافة البكج: نعيد كتابة الصفر حتى يثبت
  for (let k = 0; k < 4; k++) {
    await page.fill('.item-line:nth-child(1) input', '0');
    await page.dispatchEvent('.item-line:nth-child(1) input', 'input');
    if (await page.waitForSelector('.item-line:nth-child(1) .qty-err:not(.hidden)', { timeout: 1500 }).then(() => true, () => false)) break;
  }
  expect(await page.isVisible('.item-line:nth-child(1) .qty-err') && (await page.textContent('.item-line:nth-child(1) .qty-err')).includes('أقل كمية 1'), 'zero quantity shows "minimum is 1"');
  await page.click('#submitBtn');
  expect((await page.textContent('#submitErr')).includes('لا يمكن طلب صفر'), 'submit is blocked while a quantity is zero');
  await shot(page, 'nurse-qty-zero');
  await page.fill('.item-line:nth-child(1) input', '3');
  await page.dispatchEvent('.item-line:nth-child(1) input', 'input');
  expect(!(await page.isVisible('.item-line:nth-child(1) .qty-err')), 'error clears once the quantity is valid');
  await shot(page, 'nurse-new-request', true);
  await page.click('#submitBtn');
  let tt = await toastText(page);
  expect(/تم إرسال الطلب REQ-/.test(tt), 'request submitted: ' + tt);
  const newId = /REQ-[\d-]+/.exec(tt)[0];
  expect(await page.locator('.item-line').count() === 0, 'form is cleared after submit');
  // طلب سابق بأثر رجعي (خاصية مؤقتة): يُسجَّل مستلَماً بتاريخه ويظهر بعلامة «أثر رجعي»
  expect(await page.isVisible('#fBackdate'), 'backdate option is shown while the window is open');
  await page.check('#fBackdate');
  await page.waitForSelector('#fBdDate');
  await page.fill('#itemSearch', 'floss'); await page.waitForSelector('.combo-opt'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.click('#submitBtn');
  expect((await page.textContent('#submitErr')).includes('تاريخ الطلب الفعلي'), 'backdated request needs its actual date');
  const bdDay = new Date(Date.now() - 20 * 864e5 + 3 * 36e5).toISOString().slice(0, 10);
  await page.fill('#fBdDate', bdDay); await page.dispatchEvent('#fBdDate', 'change');
  expect((await page.textContent('#sumBox')).includes('أثر رجعي'), 'summary shows the backdated date');
  await shot(page, 'nurse-backdated-form');
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
  await page.click('#submitBtn');
  tt = await toastText(page);
  expect(/بأثر رجعي/.test(tt), 'backdated request recorded: ' + tt);
  const bdId = /REQ-[\d-]+/.exec(tt)[0];
  await page.uncheck('#fBackdate');

  await page.click('.sidebar [data-view="mine"]');
  await page.waitForSelector('#mineList .req');
  expect(await page.isVisible(`text=${newId}`), 'new request appears in "my requests"');
  await page.click('#mineChips .chip[data-g="all"]').catch(() => {});
  await page.waitForSelector(`.req:has-text("${bdId}") .tag.backdated`);
  expect(await page.locator(`.req:has-text("${bdId}") .badge:has-text("تم الاستلام")`).count() >= 1, 'backdated request is received and tagged «أثر رجعي»');
  await shot(page, 'nurse-backdated-tag');
  expect((await page.textContent(`.req:has-text("${newId}") .tag.branch`)).includes('جدة'), 'request card shows its branch');
  expect(await page.locator(`.req:has-text("${newId}") .tag.branch`).count() === 1, 'branch tag appears once');
  expect((await page.textContent(`.req:has-text("${newId}") .stage-at`)).includes('رُفع'), 'card shows the time of the current stage (submitted)');
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
  await page.evaluate(() => { __runs = []; });
  await login(page, 'علي', '3333');
  await page.waitForSelector('#procList .req');
  await page.waitForTimeout(600);
  const runs = await page.evaluate(() => __runs.slice());
  const startup = runs.filter(f => f !== 'login' && f !== 'logout' && f !== 'getRequestItemsFull' && f !== 'getRequestDetail'); // الأخيران = تحميل مسبق عند مرور المؤشر
  expect(startup.length === 0, 'login brings the first screen data: no extra server calls after login (' + runs.join(', ') + ')');
  expect((await page.textContent(`.req[data-rid="${newId}"] .tag.branch`)).includes('جدة'), 'procurement sees the order branch');
  await page.selectOption('[data-change="procBranch"]', 'الرياض');
  expect(await page.locator(`#procList .req[data-rid="${newId}"]`).count() === 0, 'branch filter hides other branches');
  await page.selectOption('[data-change="procBranch"]', 'جدة');
  expect(await page.locator(`#procList .req[data-rid="${newId}"]`).count() === 1, 'branch filter shows the order');
  await page.selectOption('[data-change="procBranch"]', '');
  const newDoc = await page.evaluate(id => S.proc.list.find(r => r.id === id).doctor, newId);
  const otherDoc = await page.evaluate(d => (S.proc.list.find(r => r.doctor && r.doctor !== d) || {}).doctor || '', newDoc);
  await page.selectOption('[data-change="procDoctor"]', newDoc);
  expect(await page.locator(`#procList .req[data-rid="${newId}"]`).count() === 1 && await page.evaluate(d => $$('#procList .req').every(c => S.proc.list.find(r => r.id === c.dataset.rid).doctor === d), newDoc), 'doctor dropdown shows only that doctor\'s requests');
  if (otherDoc) { await page.selectOption('[data-change="procDoctor"]', otherDoc); expect(await page.locator(`#procList .req[data-rid="${newId}"]`).count() === 0, 'another doctor hides the request'); }
  await page.selectOption('[data-change="procDoctor"]', '');
  expect(await page.getAttribute(`#procList .req[data-rid="${newId}"]`, 'data-tone') !== null, 'procurement request cards are colored by status');
  // الطلب الجديد لدى الطبيب أولاً: التموين يراه لكن لا يستطيع تجهيزه
  expect(await page.isVisible('.alert.warning:has-text("لدى الطبيب")'), 'procurement is alerted that an emergency awaits doctor approval');
  expect((await page.textContent(`.req[data-rid="${newId}"] .badge`)).includes('مراجعة الطبيب'), 'new request goes straight to doctor review');
  await page.check(`.req[data-rid="${newId}"] .req-main > .check`);
  await page.waitForSelector('#bulkbar.show');
  const bulkState = async () => page.$$eval('#bulkbar [data-act="bulk"]', bs => bs.map(b => b.dataset.s + ':' + (b.disabled ? 'off' : 'on')).join(','));
  expect(await bulkState() === 'قيد التجهيز:off,بانتظار المندوب:off,استلم المندوب:off,تم الإرسال:off',
    'awaiting the doctor: every procurement action is disabled (no "send to doctor" button)');
  expect(await page.locator('.chip[data-g="review"] .count-pill').textContent() === '1', 'procurement sees it under "With doctor" right after submission');
  await shot(page, 'proc-bulk-new');
  await page.click('[data-act="clearSel"]');
  await page.click('.sidebar [data-view="complaints"]');
  await page.waitForSelector('#cList .req');
  expect(await page.locator('#cList [data-act="resolve"]').count() === 0 && await page.isVisible('#cList .hint:has-text("الجودة")'),
    'procurement cannot close issues (Quality/executive only)');
  await shot(page, 'procurement-complaints');
  await logout(page);

  // ---------- Doctor ----------
  await login(page, 'د. خالد', '4444');
  // استبيان الرضا: نافذة عند الدخول (مرة باليوم) + شريط حتى يُعبّأ
  await page.waitForSelector('.modal .sv-form', { timeout: 8000 });
  expect(await page.locator('.modal .sv-stars').count() === 11 && await page.locator('.modal .sv-nps').count() === 1, 'survey pops up on login: 11 star questions + recommend 0–10 + free text');
  await page.click('#svSend');
  expect(await page.isVisible('#svErr:not(.hidden)') && await page.locator('.sv-q.missing').count() === 12, 'required questions are flagged');
  await page.click('.modal [data-close]');
  await page.waitForSelector('#alerts .alert:has-text("استبيان الرضا") [data-act="surveyOpen"]');
  expect(true, 'after «Later» the survey stays as a notice at the top');
  await page.click('[data-act="surveyOpen"]');
  await page.waitForSelector('.modal .sv-form');
  for (let i = 0; i < 11; i++) await page.click('.modal .sv-stars >> nth=' + i + ' >> .sv-b >> nth=3');
  await page.click('.modal .sv-nps .sv-b[data-v="9"]');
  await page.fill('.modal textarea[data-q="Q14"]', 'تتبع البوكس ممتاز');
  await shot(page, 'doctor-survey');
  await page.click('#svSend');
  expect(await toastHas(page, 'وصلنا رأيك'), 'doctor submits the survey');
  await page.waitForFunction(() => !document.querySelector('#alerts [data-act="surveyOpen"]'));
  expect(true, 'the notice disappears after answering');
  await page.waitForSelector('#docList .req');
  await shot(page, 'doctor-reviews');
  await page.click(`#docList [data-id="${newId}"]`);
  await page.waitForSelector('#rvItems table');
  await page.click('#rvReject');
  expect(await page.isVisible('#rvErr:not(.hidden)'), 'rejecting without a reason is blocked');
  await page.fill('.rvNote >> nth=0', 'يفضل النوع الشمعي');
  // الطبيب يعدّل كمية الخيط (3 → 2) قبل الاعتماد والإجمالي يتحدث فوراً
  const tot0 = await page.textContent('#rvTotal');
  await page.fill('.rvQty[data-item="DENTAL FLOSS"]', '2');
  await page.dispatchEvent('.rvQty[data-item="DENTAL FLOSS"]', 'input');
  expect(await page.textContent('#rvTotal') !== tot0 && await page.isVisible('.rvQty.changed'), 'doctor edits a quantity and the estimated total updates');
  await shot(page, 'doctor-review-modal');
  await page.click('#rvApprove');
  expect(await toastHas(page, 'تم اعتماد'), 'doctor approved the request');
  await page.waitForTimeout(400);
  // تقرير الطبيب
  await page.click('#docReportBtn');
  await page.waitForSelector('.rep .rep-tiles');
  expect(await page.locator('.rep .rep-req').count() >= 1, 'doctor report lists the requests with items');
  expect(/\d/.test(await page.textContent('.rep-grand b')), 'doctor report shows a grand total');
  expect(await page.isVisible('.rep-logo'), 'report header carries the client logo');
  await page.click('[data-seg-name="repMode"][data-v="cum"]');
  expect(await page.isVisible('#repTo') && !(await page.isVisible('#repMonth')), 'cumulative mode asks for an end date');
  await page.click('#repGo');
  await page.waitForSelector('.rep .rep-tiles');
  await shot(page, 'doctor-report');
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#repPrint');
  await page.emulateMedia({ media: 'print' });
  expect(await page.isVisible('#printArea .rep-grand') && !(await page.isVisible('#appShell')), 'print shows only the report');
  await shot(page, 'doctor-report-print', true);
  await page.emulateMedia({ media: 'screen' });
  await page.waitForTimeout(1600);
  await page.keyboard.press('Escape');
  // الطبيب يغيّر رقمه السري بنفسه
  await page.click('#pwBtn');
  await page.waitForSelector('#pwCur');
  await page.fill('#pwCur', '0000'); await page.fill('#pwNew', 'dr-khaled-7'); await page.fill('#pwNew2', 'dr-khaled-7');
  await page.click('#pwOk');
  await page.waitForSelector('#pwErr:not(.hidden)');
  expect((await page.textContent('#pwErr')).includes('غير صحيح'), 'wrong current password is rejected');
  await page.fill('#pwCur', '4444'); await page.fill('#pwNew2', 'mismatch');
  await page.click('#pwOk');
  expect((await page.textContent('#pwErr')).includes('لا يطابق'), 'confirmation mismatch is caught');
  await page.fill('#pwNew2', 'dr-khaled-7');
  await shot(page, 'change-password');
  await page.click('#pwOk');
  expect(await toastHas(page, 'تم تغيير الرقم السري'), 'doctor changed his own password');
  await logout(page);
  await page.fill('#loginName', 'د. خالد'); await page.fill('#loginPass', '4444'); await page.click('#loginBtn');
  await page.waitForSelector('#loginError:not(.hidden)');
  expect(true, 'old doctor password no longer signs in');
  await login(page, 'د. خالد', 'dr-khaled-7');
  expect(await page.isVisible('#docList'), 'new doctor password signs in');
  await logout(page);

  // ---------- Procurement: prepare & dispatch after approval ----------
  await login(page, 'علي', '3333');
  expect(await page.isVisible('#pageTitle:has-text("البلاغات")'), 'app remembers the last visited screen');
  await page.click('.sidebar [data-view="requests"]');
  await page.click('.chip[data-g="docok"]');
  expect((await page.textContent('.chip[data-g="docok"]')).includes('معتمد من الطبيب') && await page.locator(`#procList .req[data-rid="${newId}"]`).count() === 1, '«doctor approved» chip lists the approved request');
  expect((await page.textContent('.chip[data-g="ready"]')).includes('جديد يحتاج إلى تجهيز'), '«ready to prepare» chip is renamed «new, needs preparing»');
  await page.click('.chip[data-g="ready"]');
  expect(await page.locator(`#procList .req[data-rid="${newId}"]`).count() === 0, 'a doctor-approved request is not repeated under «new, needs preparing»');
  await page.click('.chip[data-g="docok"]');
  await page.check(`.req[data-rid="${newId}"] .req-main > .check`);
  await page.waitForSelector('#bulkbar.show');
  expect(await bulkState() === 'قيد التجهيز:on,بانتظار المندوب:off,استلم المندوب:off,تم الإرسال:on',
    'approved: prepare (or dispatch directly) is enabled');
  await shot(page, 'proc-bulk-approved');
  await page.click('#bulkbar [data-s="قيد التجهيز"]');
  expect(await toastHas(page, 'تم تحديث 1'), 'moved to "in progress" after approval');

  await page.waitForTimeout(300);
  await page.click('.chip[data-g="all"]');
  expect((await page.textContent(`.req[data-rid="${newId}"] .stage-at`)).includes('بدأ التجهيز'), 'card time follows the stage: "prep started"');
  await page.click(`.req[data-rid="${newId}"] .req-actions [data-act="procToggle"]`);
  await page.waitForSelector(`#exp-${newId} .dsp-table`);
  expect(await page.locator(`#exp-${newId} input[data-change="approveQty"]`).count() === 0 && (await page.textContent(`#exp-${newId}`)).includes('كما اعتمدها الطبيب'),
    'procurement sees the doctor-approved quantities, locked');
  const flossRow = await page.textContent(`#exp-${newId} .dsp-row:has-text("DENTAL FLOSS")`);
  expect(flossRow.includes('أُرسل 0 من 2'), 'the doctor quantity (2) is what procurement prepares: ' + flossRow.replace(/\s+/g, ' '));
  // مستهلك بديل: رابط تحت كل صنف متبقٍ، والبديل يُختار من الكتالوج
  expect(await page.locator(`#exp-${newId} .dsp-row:has-text("DENTAL FLOSS") [data-act="subItem"]`).count() === 1, 'each item left to send offers «add a substitute item»');
  await (await page.$(`#exp-${newId} .dsp-table`)).screenshot({ path: __dirname + '/screenshots/proc-substitute-link.png' });
  await page.click(`#exp-${newId} .dsp-row:has-text("DENTAL FLOSS") [data-act="subItem"]`);
  await page.waitForSelector('.modal #subItem');
  expect(await page.locator('.modal #subCat option').count() > 3, 'the substitute is picked from the catalog');
  await shot(page, 'proc-substitute');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.check(`.req[data-rid="${newId}"] .req-main > .check`);
  expect(await bulkState() === 'قيد التجهيز:off,بانتظار المندوب:on,استلم المندوب:off,تم الإرسال:on',
    'in progress: vendor wait and dispatch are enabled');
  await shot(page, 'procurement-board');
  await page.click('[data-act="clearSel"]');
  await page.waitForSelector(`.req[data-rid="${newId}"]`);
  const exp = await page.$(`#exp-${newId}`);
  if (!exp) await page.click(`.req[data-rid="${newId}"] .req-actions [data-act="procToggle"]`);
  await page.waitForSelector(`#exp-${newId} .dsp`);
  const totalItems = await page.locator(`#exp-${newId} .dsp`).count();
  expect(totalItems >= 2 && await page.isDisabled(`#exp-${newId} [data-act="dispatch"]`), 'dispatch button stays disabled until items are selected');
  // الشحنة 1: كمية جزئية من نفس الصنف (1 من 4) + صنف كامل
  const qtyInp = n => `#exp-${newId} input.dsp-qty[data-item="${n}"]`;
  expect(await page.inputValue(qtyInp('MICRO BRUSH FINE')) === '4', 'shipment qty defaults to what is left');
  await page.fill(qtyInp('MICRO BRUSH FINE'), '9');
  await page.dispatchEvent(qtyInp('MICRO BRUSH FINE'), 'input');
  expect(await page.isChecked(`#exp-${newId} .dsp[data-item="MICRO BRUSH FINE"]`), 'typing a quantity ticks the item in the checklist');
  await page.click(`#exp-${newId} [data-act="dispatch"]`);
  expect(await toastHas(page, 'أكبر من المتبقي'), 'cannot send more than what is left');
  await page.fill(qtyInp('MICRO BRUSH FINE'), '1');
  await page.dispatchEvent(qtyInp('MICRO BRUSH FINE'), 'input');
  await page.check(`#exp-${newId} .dsp[data-item="DENTAL FLOSS"]`);
  const pill = await page.textContent(`#exp-${newId} .dsp-btn .count-pill`);
  expect(pill.startsWith('2 · 3'), 'button shows items and units of this shipment: ' + pill);
  await page.click(`#exp-${newId} [data-act="dispatch"]`);
  await page.waitForSelector('.modal .bxp-owner');
  const reqDoc = await page.evaluate(id => S.proc.list.find(r => r.id === id), newId);
  expect(await page.inputValue('.modal .bxp-owner') === reqDoc.doctor && await page.inputValue('.modal .bxp-branch') === reqDoc.branch, 'send asks for the box: doctor and branch filled from the request');
  await page.waitForSelector('.modal .bxp-hint:has-text("بوكس جديد")');
  expect(true, 'first shipment for this doctor+branch → a new box will be created');
  await page.click('.modal #bxpOk');
  expect(await toastHas(page, 'أُرسلت الشحنة #1'), 'shipment #1 sent (1 of 4 micro brushes + all floss)');
  await page.waitForSelector(`.req[data-rid="${newId}"] .ship-left`);
  const track = await page.textContent(`.req[data-rid="${newId}"] .ship-track`);
  const left = await page.textContent(`.req[data-rid="${newId}"] .ship-left`);
  expect(/أُرسل 3 من \d+ قطعة/.test(track), 'card tracker counts units: ' + track.trim());
  expect(left.includes('MICRO BRUSH FINE') && left.includes('×3') && left.includes('أُرسل 1 من 4'), 'card lists what is left of each item: ' + left.trim());
  await page.waitForSelector(`#exp-${newId} .ship-sum .ship`);
  expect((await page.textContent(`#exp-${newId} .dsp-row.partial .qp-left`)).includes('باقي 3'), 'item row shows its remaining quantity');
  expect(await page.locator(`#exp-${newId} .dsp-row.done .dsp-ok`).count() === 1, 'fully-sent item is ticked as complete');
  await page.click('.chip[data-g="partial"]');
  expect(await page.locator(`#procList .req[data-rid="${newId}"]`).count() === 1, '"partially sent" filter lists the request');
  await page.click('.topbar [data-act="sync"]');
  await page.waitForSelector('.alert:has-text("مُرسل جزئياً")');
  expect(true, 'procurement alert shows partially-sent requests with quantities left');
  await shot(page, 'proc-partial-dispatch');
  await page.click('.chip[data-g="all"]');
  await page.waitForSelector(`#exp-${newId} .dsp`);
  await page.check(`#exp-${newId} [data-change="dspAll"]`);
  expect(await page.locator(`#exp-${newId} .dsp:checked`).count() === totalItems - 1, '"select all remaining" ticks every item with quantity left');
  expect(await page.inputValue(qtyInp('MICRO BRUSH FINE')) === '3', 'remaining 3 micro brushes prefilled');
  await page.click(`#exp-${newId} [data-act="dispatch"]`);
  await page.waitForSelector('.modal .bxp-hint:has-text("BOX-")');
  expect(true, 'second shipment for the same doctor+branch goes into the existing box');
  await page.click('.modal #bxpOk');
  expect(await toastHas(page, 'اكتمل'), 'all quantities dispatched → request sent');
  // ---------- البوكسات: الإرسال حمّل بوكس الطبيب ← السواق يمسح ويسلّم بصورة ----------
  await page.click('.sidebar [data-view="boxes"]');
  await page.waitForSelector('#bxList .box-card');
  const bx = await page.evaluate(() => BX.data.boxes[0]);
  expect(bx.status === 'جاهز للنقل' && bx.loads.length === 2 && bx.destination === bx.loads[0].branch, 'dispatch loaded the doctor box (2 shipments) → ready to deliver to the request branch');
  expect((await page.inputValue('#bxDrvUrl')).includes('?driver='), 'procurement sees the driver tasks link');
  await shot(page, 'proc-boxes');
  await page.click('#bxList [data-act="bxSticker"]');
  await page.waitForSelector('#printArea .sticker', { state: 'attached' });
  expect(await page.textContent('#printArea .sticker .st-id') === bx.id && (await page.textContent('#printArea .sticker')).includes('?box=' + bx.id), 'sticker prints the box id + scan link (text when QR lib is offline)');
  await page.evaluate(() => { document.body.classList.remove('printing'); document.getElementById('printArea').innerHTML = ''; });
  // صفحة السواق: المهام ← البوكس ← المكان + صورة + اسم ← تسليم
  // شبكة السواق الضعيفة: أول محاولتين تفشلان ← إعادة تلقائية بدون رسالة خطأ
  await page.evaluate(() => {
    window.__realCall = call; let fails = 2;
    window.call = function (fn) { if (fn === 'driverTasks' && fails-- > 0) return Promise.reject(new Error('ERR_NETWORK')); return __realCall.apply(null, arguments); };
  });
  await page.evaluate(tk => showDriverTasks(tk), await page.evaluate(() => BX.data.driverToken));
  await page.waitForSelector('.drv-task', { timeout: 15000 });
  expect(!(await page.$('#driverView .empty')), 'driver tasks retry automatically after network failures');
  // انقطاع كامل: تبقى آخر قائمة محفوظة ظاهرة مع تنبيه
  await page.evaluate(() => { window.call = function (fn) { return fn === 'driverTasks' ? Promise.reject(new Error('ERR_SERVER')) : __realCall.apply(null, arguments); }; });
  await page.click('[data-act="drvTasks"]');
  await page.waitForFunction(() => document.querySelector('#driverView').textContent.includes('آخر قائمة محفوظة'));
  expect(await page.isVisible('.drv-task') && (await page.textContent('#driverView')).includes('آخر قائمة محفوظة'), 'offline: last saved driver tasks stay visible with a notice');
  await page.evaluate(() => { window.call = __realCall; });
  await page.click('[data-act="drvTasks"]');
  await page.waitForFunction(() => !document.querySelector('#driverView').textContent.includes('آخر قائمة محفوظة'));
  expect((await page.textContent('.drv-task')).includes('من التموين إلى ' + bx.destination), 'driver tasks: box from procurement to the branch');
  await page.click('.drv-task');
  await page.waitForSelector('#drvGo');
  expect(await page.getAttribute('.drv-place[data-p="' + bx.destination + '"]', 'aria-pressed') === 'true', 'destination branch preselected');
  expect(await page.isDisabled('.drv-place[data-p="التموين"]'), 'the place where the box already is cannot be chosen');
  await page.click('.drv-lang[data-l="bn"]');
  expect((await page.textContent('#drvGo')).includes('ডেলিভারি সম্পন্ন'), 'driver page switches to Bengali');
  await page.click('.drv-lang[data-l="hi"]');
  expect((await page.textContent('#drvGo')).includes('डिलीवरी पूरी हुई'), 'driver page switches to Hindi');
  await page.click('.drv-lang[data-l="ar"]');
  expect((await page.textContent('#drvGo')).includes('تم التوصيل'), 'Arabic button reads «تم التوصيل»');
  await page.fill('#drvName', 'أبو فهد');
  await page.click('#drvGo');
  expect((await page.textContent('#drvErr')).includes('صوّر'), 'photo is required before delivery');
  await page.setInputFiles('#drvFile', { name: 'box.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
  await page.waitForSelector('#drvPhoto.has');
  await shot(page, 'driver-deliver');
  await page.click('#drvGo');
  await page.waitForSelector('.drv-done');
  expect((await page.textContent('.drv-done')).includes('تم التسليم إلى ' + bx.destination), 'driver delivered with one tap');
  expect(await page.evaluate(() => __gas.dump('BoxMoves').filter(r => r[5] === 'تسليم').length) === 2, 'delivery logged for both shipments with photo');
  await shot(page, 'driver-done');
  await page.evaluate(() => { document.getElementById('driverView').remove(); document.getElementById('appShell').classList.remove('hidden'); });
  await logout(page);

  // ---------- Nurse receives ----------
  await login(page, 'سارة', '1111');
  expect(await page.isVisible('.alert.info'), 'nurse is alerted about a request to receive');
  await page.click('.sidebar [data-view="mine"]');
  expect(await page.textContent(`.req:has-text("${newId}") [data-act="receive"] .count-pill`) === '2', 'receive button shows 2 shipments waiting');
  expect(await page.isVisible(`.req:has-text("${newId}") .tag.arrived`), 'request card shows «وصل الفرع» after the driver delivery');
  expect((await page.getAttribute(`.req:has-text("${newId}")`, 'style') || '').includes('--t-cyan'), 'arrived request card is colored as a whole');
  await page.click('#mineChips [data-g="arrived"]');
  expect(await page.isVisible(`.req:has-text("${newId}")`), 'nurse filters «وصل الفرع» requests');
  await page.click('#mineChips [data-g="all"]');
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
  expect(await page.locator('.rcv-note:not(.last)').count() === 1 && await page.locator('.rq').count() === 2, 'first shipment: only its items, marked as partial receipt');
  expect((await page.textContent('#rShip tbody')).includes('MICRO BRUSH FINE') && await page.inputValue('#rShip .rq[data-i="0"], #rShip .rq >> nth=0') !== '', 'shipment lists its own quantities');
  await page.fill('.rq >> nth=0', '1');
  await sign(0);
  expect(await page.isVisible('#sigWrap.inked'), 'signature pad captures ink');
  await shot(page, 'nurse-receive-shipment-1');
  await page.click('#rOk');
  expect(await toastHas(page, 'تم استلام الشحنة #1'), 'shipment #1 received and signed');
  expect(await page.evaluate(() => __gas.files.length) === 3, 'shipment #1 signature and receipt uploaded (+ the driver box photo)');
  // الشحنة 2 (الأخيرة) → إيصال موحّد
  await page.waitForSelector(`.req:has-text("${newId}") [data-act="receive"]:not(:has(.count-pill))`);
  await page.click(`.req:has-text("${newId}") [data-act="receive"]`);
  await page.waitForSelector('.rcv-note.last');
  expect(await page.locator('#rShip .chip').count() === 0, 'last shipment: no picker');
  expect(await page.getAttribute('#rName', 'readonly') !== null && await page.inputValue('#rName') === 'سارة', 'receiver name is locked to the logged-in nurse');
  await sign(1.5);
  await shot(page, 'nurse-receive-last-shipment');
  await page.click('#rOk');
  expect(await toastHas(page, 'اكتمل استلام الطلب'), 'last shipment completes the request');
  const files = await page.evaluate(() => __gas.files.filter(f => !/^BOX-/.test(f.name)).map(f => ({ name: f.name, bytes: f.bytes })));
  const merged = files.find(f => f.name.endsWith('-receipt-all.png'));
  expect(files.length === 5 && merged, 'combined receipt saved with every shipment (5 files)');
  if (merged) fs.writeFileSync(path.join(OUT, 'combined-receipt.png'), Buffer.from(merged.bytes.map(b => b & 0xff)));
  await page.hover(`.req:has-text("${newId}") [data-act="detail"]`);
  await page.waitForTimeout(500); // التحميل المسبق عند تمرير المؤشر
  await page.click(`.req:has-text("${newId}") [data-act="detail"]`);
  expect(await page.isVisible('.modal .stepper'), 'details open instantly after hover-prefetch (no loading skeleton)');
  await page.waitForSelector('.stepper');
  expect(await page.locator('.modal .ship-list .ship').count() === 2, 'nurse sees both shipments in the request detail');
  await page.fill('#dComment', 'تم الاستلام، شكراً');
  await page.click('#dSend');
  await page.waitForSelector('.msg.mine');
  expect(await page.locator('.step.done').count() === 6, 'detail stepper shows all 6 stages done');
  await shot(page, 'request-detail');
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#dPrint');
  await page.emulateMedia({ media: 'print' });
  expect(await page.isVisible('#printArea .rep-sign') && (await page.textContent('#printArea')).includes(newId) && await page.locator('#printArea .rep-table tbody tr').count() >= 1,
    'request detail prints / saves as PDF (items table + signatures)');
  await shot(page, 'request-detail-print', true);
  await page.emulateMedia({ media: 'screen' });
  await page.waitForTimeout(1600);
  await page.keyboard.press('Escape');
  const lbl = await page.evaluate(() => { const old = S.clinics; S.clinics = [{ name: 'Sterilization', branch: 'بريدة' }, { name: 'Sterilization', branch: 'عنيزة' }, { name: 'A', branch: 'بريدة' }];
    const r = [clinicLabel(S.clinics[0]), clinicLabel(S.clinics[1]), clinicLabel(S.clinics[2]), clinicNames().join('|'), clinicBranch('Sterilization', 'عنيزة')]; S.clinics = old; return r; });
  expect(lbl.join(',') === 'Sterilization — بريدة,Sterilization — عنيزة,A,Sterilization|A,عنيزة', 'same clinic in two branches is labelled by branch: ' + lbl.join(','));
  await logout(page);

  // ---------- الخادم مشغول وقت الرفع: الطلب يُحفظ ويُرسل تلقائياً بلا تكرار ----------
  await login(page, 'سارة', '1111');
  await page.evaluate(() => { AUTO_SEND.delay = 600; const d = nurseDraft(); d.kind = 'doctor'; saveDraft(); go('new'); });
  await page.waitForSelector('#fDoctor option[value="د. خالد"]', { state: 'attached' });
  await page.click('#itemSearch');
  await page.fill('#itemSearch', 'floss');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => __gas.dump('Requests').length);
  await page.evaluate(() => { window.__failWrites = 6; }); // الإرسال + 3 إعادات تلقائية + محاولتان مجدولتان
  await page.click('#submitBtn');
  await page.waitForSelector('#submitErr:not(.hidden)', { timeout: 20000 });
  expect((await page.textContent('#submitErr')).includes('تلقائياً'), 'busy server: the nurse is told the request is saved and will be sent automatically');
  expect((await page.textContent('#draftState')).includes('بانتظار الإرسال'), 'draft marked as waiting to send');
  expect(await toastHas(page, 'تم إرسال الطلب'), 'request sent automatically once the server is free');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => __gas.dump('Requests').length) === before + 1, 'exactly one request created (no duplicates)');
  await shot(page, 'auto-resend');
  await logout(page);

  // ---------- Lab: nurse → lab (internal/external) → clinic → redo; doctor follows ----------
  await login(page, 'سارة', '1111');
  await page.evaluate(() => go('new'));
  await page.click('[data-seg-name="reqKind"][data-v="lab"]');
  await page.waitForSelector('#lDoctor option[value="د. خالد"]', { state: 'attached' });
  await page.selectOption('#lDoctor', 'د. خالد');
  expect(!(await page.$('#lPatient')) && await page.inputValue('#lScan') !== '' && await page.inputValue('#lBranch') === 'الرياض', 'lab form: file No. only, scan date defaults to today, branch from the doctor clinic');
  await page.fill('#lFile', 'F-1001');
  await page.selectOption('#lLines .lab-line:nth-child(1) [data-k="lab"]', 'المعمل الداخلي');
  await page.selectOption('#lLines .lab-line:nth-child(1) [data-k="workType"]', 'Crown');
  await page.fill('#lLines .lab-line:nth-child(1) [data-k="details"]', 'سن 16 · A2');
  await page.click('[data-act="labAddLine"]');
  await page.selectOption('#lLines .lab-line:nth-child(2) [data-k="lab"]', 'معمل النخبة');
  await page.selectOption('#lLines .lab-line:nth-child(2) [data-k="workType"]', 'Bridge');
  expect(!(await page.$('#lLines [data-k="material"]')) && !(await page.$('#lPhoto')), 'work = lab · type · notes only; no general photo box');
  const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#lLines .lab-line:nth-child(1) [data-line-photo]', { name: 'tooth.png', mimeType: 'image/png', buffer: PNG1 });
  await page.waitForSelector('#lLines .lab-line:nth-child(1) .lab-photo img');
  expect(await page.locator('#lLines .lab-line:nth-child(2) .lab-photo').count() === 0, 'photo is attached to its own work only');
  expect((await page.textContent('#lSum')).includes('معمل النخبة'), 'lab form: two items to two labs in one case');
  expect((await page.textContent('#lDue')).includes('تلقائي') && (await page.textContent('#lDue')).includes('10'), 'lab due is calculated automatically (scan + 10 days)');
  await shot(page, 'lab-nurse-form', true);
  await page.click('#lSubmit');
  expect(await toastHas(page, 'للمعمل'), 'lab case sent');
  await page.waitForSelector('#labList .lab-card');
  const labId = (await page.textContent('#labList .lab-card .req-id')).trim();
  expect(/^LAB-\d{6}-\d{3}$/.test(labId), 'nurse sees the case in her lab list (' + labId + ')');
  // iTero: تبويب ثالث بجانب حالة جديدة والإعادة — تاريخ السكان، رقم الآيتيرو، رقم الملف، الطبيب ثم إرسال
  await page.evaluate(() => go('new'));
  await page.click('[data-seg-name="reqKind"][data-v="lab"]');
  await page.click('[data-seg-name="labMode"][data-v="itero"]');
  await page.waitForSelector('#lItero');
  expect(!(await page.$('#lLines')) && await page.isVisible('#lScan') && await page.isVisible('#lFile'), 'iTero tab: scan date, iTero No., file No., doctor — no work lines');
  await page.waitForSelector('#lDoctor option[value="د. خالد"]', { state: 'attached' });
  await page.selectOption('#lDoctor', 'د. خالد');
  await page.fill('#lFile', 'F-2002');
  await page.fill('#lItero', 'IT-5566');
  await page.waitForSelector('#lIteroLab option[value="معمل النخبة"]', { state: 'attached' });
  expect(await page.inputValue('#lIteroLab') === 'المعمل الداخلي' && (await page.textContent('#lIteroLab')).includes('خارجي'), 'iTero: lab dropdown (internal by default, external labs listed)');
  await page.selectOption('#lIteroLab', 'معمل النخبة');
  await shot(page, 'lab-itero-form', true);
  await page.click('#lSubmit');
  expect(await toastHas(page, 'للمعمل'), 'iTero scan sent to the lab');
  await page.waitForSelector('#labList .tag.itero');
  expect((await page.textContent('#labList .tag.itero')).includes('IT-5566'), 'iTero case shows its iTero number on the card');
  await logout(page);
  await login(page, 'فني المعمل', '8888');
  await page.waitForSelector('#labList .lab-card');
  await page.waitForSelector('#labList .tag.ext-lab');
  expect((await page.textContent('#labList .lab-card:has(.tag.itero) .tag.ext-lab')).includes('معمل النخبة'), 'lab board: a case sent to an external lab is flagged «FYI — not for you»');
  // قائمة طويلة: «عرض المزيد» في لوحة المعمل يضيف دفعة (كان يرمي خطأ)
  {
    const before = await page.evaluate(() => {
      const k = LAB.key, one = LAB[k][0];
      window.__labSaved = LAB[k];
      LAB[k] = Array.from({ length: 120 }, (_, i) => Object.assign({}, one, { id: one.id + '-x' + i }));
      resetPage('lab'); renderLabBoard(false);
      return document.querySelectorAll('#labList .lab-card').length;
    });
    await page.click('#labList [data-act="moreList"][data-k="lab"]');
    const after = await page.evaluate(() => document.querySelectorAll('#labList .lab-card').length);
    expect(before === 50 && after === 100, 'lab board pages long lists (50 → 100 after «show more»)');
    await page.evaluate(() => { LAB[LAB.key] = window.__labSaved; resetPage('lab'); renderLabBoard(false); });
  }
  // طبيبة الجلدية: تقريرها بدون أي سعر أو قيمة
  {
    const h = await page.evaluate(() => {
      const was = S.user.noPrices; S.user.noPrices = true;
      const out = reportHtml({ doctor: 'د. فهد', generatedAt: new Date(), rows: [{ id: 'REQ-X', date: new Date(), clinic: 'عيادة الجلدية 1', type: 'شهري', status: 'جديد', items: [{ item: 'PROPHY PASTE', qty: 2 }] }],
        summary: { requests: 1, lines: 1, qty: 2 }, top: [{ item: 'PROPHY PASTE', qty: 2 }] }, {});
      S.user.noPrices = was;
      return out + '|' + t('currency') + '|' + t('rep_price') + '|' + t('rep_total');
    });
    const [html, cur, priceH, totalH] = h.split('|');
    expect(html.includes('PROPHY PASTE') && !html.includes(cur) && !html.includes(priceH) && !html.includes(totalH), 'derma doctor report: quantities only, no price/total/currency');
  }
  // الجداول الطويلة (مثل «طلبات تجاوزت الموعد»): 50 صفاً ثم «عرض المزيد» يكمل في مكانه، والطباعة تعرض الكل
  {
    const first = await page.evaluate(() => {
      const host = document.createElement('div'); host.id = 'tblTest';
      host.innerHTML = rpTable(Array.from({ length: 330 }, (_, i) => ({ i })), [{ h: '#', v: r => String(r.i) }]);
      document.body.appendChild(host);
      return host.querySelectorAll('tbody tr:not(.tbl-more)').length;
    });
    await page.click('#tblTest .tbl-more button');
    const second = await page.evaluate(() => document.querySelectorAll('#tblTest tbody tr:not(.tbl-more)').length);
    const all = await page.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); const h = document.getElementById('tblTest'); const n = [h.querySelectorAll('tbody tr').length, h.querySelector('tbody tr:last-child').textContent]; h.remove(); return n; });
    expect(first === 50 && second === 250 && all[0] === 330 && all[1] === '329', 'long tables: 50 rows, +200 on «show more», all rows when printing');
  }
  expect(await page.isVisible('.alert:has-text("إرسالية جديدة")'), 'lab gets a new-case alert');
  await page.click('.lab-card [data-act="labDo"][data-a="start"][data-items="' + labId + '-1"]');
  expect(await toastHas(page, 'بدأ العمل'), 'lab started item 1 in-house');
  await page.click('.lab-card [data-act="labDo"][data-a="external"][data-items="' + labId + '-2"]');
  await page.waitForSelector('.modal #laLab');
  await page.fill('.modal #laExp', '2099-01-05');
  await page.fill('.modal #laCost', '300');
  await page.click('.modal #laOk');
  expect(await toastHas(page, 'معمل خارجي'), 'lab sent item 2 to an external lab with cost');
  await page.click('.lab-card [data-act="labDo"][data-a="ready"][data-items="' + labId + '-1"]');
  await page.waitForTimeout(400);
  await page.click('.lab-card [data-act="labDo"][data-a="ready"][data-items="' + labId + '-2"]');
  await page.waitForSelector('.lab-card [data-act="labDo"][data-a="send"][data-items*=","]');
  await shot(page, 'lab-board', true);
  await page.click('.lab-card [data-act="labDo"][data-a="send"][data-items*=","]');
  expect(await toastHas(page, 'أُرسل للعيادة'), 'lab sent both items back to the clinic');
  await page.click('.sidebar [data-view="labkpi"]');
  await page.waitForSelector('#lkBody .rp-tile');
  expect((await page.textContent('#lkBody')).includes('معمل النخبة'), 'lab KPIs list labs');
  await shot(page, 'lab-kpis', true);
  await logout(page);
  await login(page, 'سارة', '1111');
  await page.click('.sidebar [data-view="labmine"]');
  await page.waitForSelector('#labList [data-act="labConfirm"]');
  await page.click('#labList [data-act="labConfirm"]');
  expect(await toastHas(page, 'تأكيد استلام'), 'nurse confirmed receipt of lab work');
  await page.click('#labList [data-act="labRedo"]');
  await page.waitForSelector('#lRedoBox .lab-pick');
  await page.check('#lRedoBox .lab-pick:nth-of-type(2) input');
  await page.selectOption('#lReason', 'لون');
  await page.fill('#lRedoNote', 'اللون أغمق من المطلوب');
  await page.selectOption('#lRedoLab', 'المعمل الداخلي');
  expect(await page.inputValue('#lRedoScan') !== '' && (await page.textContent('#lRedoDue')).includes('تلقائي'), 'remake: scan date + send-to lab + automatic due date');
  await shot(page, 'lab-redo-form', true);
  await page.click('#lSubmit');
  expect(await toastHas(page, 'الإعادة'), 'redo sent with the problem description');
  await page.waitForSelector('#labList .lab-card.redo');
  expect(await page.isVisible('#labList .lab-card.redo .tag.remake'), 'remake is flagged in orange');
  expect((await page.textContent('#labList .lab-card.redo .req-id')).trim() === labId + '-R1', 'remake number is a sub-number of the original case (' + labId + '-R1)');
  await page.click('#labList .lab-card.redo [data-act="labOpen"] >> nth=0');
  await page.waitForSelector('.modal .lab-chain');
  expect(await page.locator('.modal .lab-chain button').count() === 2 && await page.locator('.modal .lab-stepper .step').count() === 7, 'remake has its own tracking stepper and the chain to the original');
  await shot(page, 'lab-remake-chain');
  await page.keyboard.press('Escape');
  await logout(page);
  // المعمل: بحث برقم الملف ← Delivered to Patient
  await login(page, 'فني المعمل', '8888');
  await page.click('.sidebar [data-view="labboard"]');
  await page.waitForSelector('#labList .lab-card');
  await page.fill('[data-input="labQ"]', 'F-1001');
  await page.waitForTimeout(300);
  expect(await page.locator('#labList .lab-card').count() === 2, 'lab finds the patient cases by file number');
  await page.click('.lab-card [data-act="labDo"][data-a="patient"][data-items="' + labId + '-1,' + labId + '-2"]');
  expect(await toastHas(page, 'تسليمه للمريض'), 'lab marked the case delivered to the patient');
  await page.waitForTimeout(300);
  expect((await page.textContent('#labList')).includes('سُلِّم للمريض'), 'case shows delivered to patient');
  await shot(page, 'lab-delivered-patient');
  await page.fill('[data-input="labQ"]', '');
  await logout(page);
  // مسؤول المعمل يطلب مستهلكات للمعمل: بلا طبيب أو اعتماد، والتموين يسلّمها مباشرة بلا بوكس
  await login(page, 'فني المعمل', '8888');
  await page.click('.sidebar [data-view="new"]');
  await page.waitForSelector('#itemSearch');
  expect(!(await page.$('#fDoctor')) && !(await page.$('#fKind')) && (await page.textContent('.new-layout')).includes('مستهلكات المعمل'), 'lab form: no doctor or clinic, «lab supplies» only');
  await page.fill('#itemSearch', 'floss');
  await page.waitForSelector('#comboList .combo-opt');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.click('#submitBtn');
  expect(await toastHas(page, 'تم إرسال'), 'lab submitted a supply request');
  const labSupId = await page.evaluate(() => __gas.dump('Requests').slice(-1)[0][0]);
  await page.click('.sidebar [data-view="mine"]');
  await page.waitForSelector(`.req:has-text("${labSupId}")`);
  expect((await page.textContent(`.req:has-text("${labSupId}") .badge`)).includes('جديد'), 'lab sees its request as new (no doctor review)');
  await logout(page);
  await login(page, 'علي', '3333');
  await page.click('.sidebar [data-view="requests"]');
  await page.waitForSelector(`.req[data-rid="${labSupId}"]`);
  expect((await page.textContent(`.req[data-rid="${labSupId}"]`)).includes('مستهلكات المعمل'), 'procurement sees «lab supplies»');
  await page.check(`.req[data-rid="${labSupId}"] .req-main > .check`);
  await page.click('#bulkbar [data-act="bulk"][data-s="قيد التجهيز"]');
  await page.waitForTimeout(600);
  await page.check(`.req[data-rid="${labSupId}"] .req-main > .check`);
  await page.click('#bulkbar [data-act="bulk"][data-s="تم الإرسال"]');
  await page.waitForTimeout(800);
  expect(!(await page.isVisible('.modal .bxp-owner')), 'sending lab supplies asks for no box');
  await page.waitForFunction(id => { const d = __gas.dump('Requests'); const h = d[0]; const r = d.find(x => x[0] === id); return r && r[h.indexOf('Status')] === 'تم الاستلام'; }, labSupId);
  expect(true, 'lab supplies are received on handover (no signature)');
  await logout(page);
  await login(page, 'د. خالد', 'dr-khaled-7');
  await page.click('.sidebar [data-view="labdoc"]');
  await page.waitForSelector('#labList .lab-card');
  expect(await page.locator('#labList .lab-card').count() === 3, 'doctor follows his patient cases (original + redo + iTero)');
  await page.click('#labList .lab-card.redo [data-act="labOpen"] >> nth=0');
  await page.waitForSelector('.modal #lcBody');
  expect((await page.textContent('.modal #lcBody')).includes('أغمق'), 'doctor sees the redo problem');
  await shot(page, 'lab-doctor-detail');
  await page.keyboard.press('Escape');
  await logout(page);

  // ---------- عُهدة العيادة: المعيار ← الصرف بالأرقام التسلسلية ← بلاغ الممرضة ← استلام بصورة ← تالفة ← بديل ----------
  const PNG2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await login(page, 'علي', '3333');
  await page.click('.sidebar [data-view="assets"]');
  await page.click('[data-seg-name="asTab"][data-v="clinics"]');
  await page.waitForSelector('#asClinics [data-act="asIssue"][data-clinic="عيادة الأسنان 1"]');
  await page.click('#asClinics [data-act="asStd"][data-clinic="عيادة الأسنان 1"] >> nth=0');
  await page.waitForSelector('.modal #sdQty');
  await page.selectOption('.modal #sdItem', 'Handpiece Low Speed');
  await page.fill('.modal #sdQty', '3');
  await page.click('.modal #sdOk');
  expect(await toastHas(page, 'حُفظ المعيار'), 'procurement set the clinic standard (3 low-speed handpieces)');
  await page.click('#asClinics [data-act="asIssue"][data-clinic="عيادة الأسنان 1"]');
  await page.waitForSelector('.modal #isItem');
  await page.selectOption('.modal #isItem', 'Handpiece Low Speed');
  expect(await page.isVisible('.modal #isSer') && !(await page.isVisible('.modal #isQty')), 'serialized tool asks for serial numbers, not a quantity');
  await page.fill('.modal #isSer .input >> nth=0', 'LS-101');
  await page.press('.modal #isSer .input >> nth=0', 'Enter');
  // ننتظر السطر الجديد قبل الكتابة: الكتابة المبكرة كانت تذهب للسطر الأول
  await page.waitForFunction(() => document.querySelectorAll('.modal #isSer .input').length === 2, null, { timeout: 5000 }).catch(() => {});
  await page.fill('.modal #isSer .input >> nth=1', 'LS-102');
  await page.waitForFunction(() => (document.querySelector('.modal #isSerN') || {}).textContent.includes('2'), null, { timeout: 3000 }).catch(() => {});
  expect((await page.locator('.modal #isSer .input').count()) === 2 && (await page.textContent('.modal #isSerN')).includes('2'), 'Enter adds the next serial row (2 units counted)');
  await page.click('.modal #isOk');
  expect(await toastHas(page, 'تم صرف 2 قطعة'), 'issued 2 handpieces by serial number');
  await page.waitForTimeout(300);
  const dentalCard = page.locator('#asClinics section:has-text("عيادة الأسنان 1")');
  expect((await dentalCard.locator('.as-row.short').count()) === 1 && (await dentalCard.textContent()).includes('LS-102'), 'clinic shows standard 3 vs 2 in clinic (short 1) with serials');
  // تصحيح عهدة مصروفة: تعديل الرقم التسلسلي، ثم صرف قطعة بالغلط وحذفها
  await dentalCard.locator('button.as-unit:has-text("LS-102")').click();
  await page.waitForSelector('.modal #aeSer');
  expect((await page.inputValue('.modal #aeSer')) === 'LS-102' && await page.isVisible('.modal #aeDel'), 'procurement opens an issued unit: serial prefilled, delete available');
  await page.fill('.modal #aeSer', 'LS-1020');
  await page.click('.modal #aeOk');
  expect(await toastHas(page, 'تم حفظ التعديل'), 'issued unit serial edited');
  await page.waitForTimeout(300);
  expect((await dentalCard.textContent()).includes('LS-1020'), 'card shows the corrected serial');
  await shot(page, 'assets-edit-unit');
  await dentalCard.locator('button.as-unit:has-text("LS-1020")').click();
  await page.waitForSelector('.modal #aeSer');
  await page.fill('.modal #aeSer', 'LS-102');
  await page.click('.modal #aeOk');
  await page.waitForTimeout(300);
  await page.click('#asClinics [data-act="asIssue"][data-clinic="عيادة الأسنان 1"]');
  await page.waitForSelector('.modal #isItem');
  await page.selectOption('.modal #isItem', 'Handpiece Low Speed');
  await page.fill('.modal #isSer .input >> nth=0', 'WRONG-1');
  await page.click('.modal #isOk');
  await page.waitForTimeout(300);
  await dentalCard.locator('button.as-unit:has-text("WRONG-1")').click();
  await page.waitForSelector('.modal #aeDel');
  await page.click('.modal #aeDel');
  await page.click('.modal [data-yes]');
  expect(await toastHas(page, 'تم حذف العهدة'), 'unit issued by mistake deleted');
  await page.waitForTimeout(300);
  expect(!(await dentalCard.textContent()).includes('WRONG-1') && (await dentalCard.textContent()).includes('LS-102'), 'deleted unit gone; corrected serial restored');
  await shot(page, 'assets-procurement-clinics', true);
  await logout(page);
  await login(page, 'سارة', '1111');
  await page.click('.sidebar [data-view="assets"]');
  expect(await page.isVisible('#asReportBtn') && (await page.textContent('#pageSub')).trim() === '', 'nurse custody page: «report a faulty tool» button on top, no subtitle');
  await page.waitForSelector('#asClinics section');
  expect(!(await page.textContent('#asClinics')).includes('عيادة الجلدية 1') && (await page.textContent('#asClinics')).includes('بلا عهدة مسجلة'), 'clinics without custody are collapsed into one line');
  await page.click('#asReportBtn');
  await page.waitForSelector('.modal #anClinic');
  await page.selectOption('.modal #anClinic', 'عيادة الجلدية 1');
  await page.selectOption('.modal #anItem', 'Handpiece Low Speed');
  expect(await page.isVisible('.modal #anSerial') && !(await page.isVisible('.modal #anUnit')), 'unregistered clinic: the nurse types the serial (registered automatically)');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#asClinics [data-act="asReport"][data-serial="LS-101"]');
  await page.click('#asClinics [data-act="asReport"][data-serial="LS-101"]');
  await page.waitForSelector('.modal #arProb');
  await page.selectOption('.modal #arProb', 'خربانة');
  await page.fill('.modal #arDesc', 'صوت عالي ويسخن');
  await page.click('.modal #arOk');
  expect((await page.textContent('.modal #arErr')).includes('إلزامية'), 'photo is required for a broken tool');
  await page.setInputFiles('.modal #arFile', { name: 'hp.png', mimeType: 'image/png', buffer: PNG2 });
  await page.waitForSelector('.modal #arPh img');
  await page.click('.modal #arOk');
  expect(await toastHas(page, 'للتموين'), 'nurse reported the broken handpiece');
  await page.waitForSelector('#asTickets .req');
  expect((await page.textContent('#asTickets')).includes('LS-101'), 'nurse sees her ticket with the serial');
  await shot(page, 'assets-nurse', true);
  await logout(page);
  await login(page, 'علي', '3333');
  expect(await page.isVisible('.alert:has-text("بلاغ أداة جديد")'), 'procurement gets a new-tool-ticket alert');
  await page.click('.sidebar [data-view="assets"]');
  await page.click('[data-seg-name="asTab"][data-v="tickets"]');
  await page.waitForSelector('#asTickets .req');
  await page.click('#asTickets .req [data-act="asTicket"]');
  await page.waitForSelector('.modal [data-tk-act="receive"]');
  await page.click('.modal [data-tk-act="receive"]');
  await page.waitForSelector('.modal #taFile', { state: 'attached' });
  await page.setInputFiles('.modal #taFile', { name: 'check.png', mimeType: 'image/png', buffer: PNG2 });
  await page.waitForSelector('.modal #taPh img');
  await page.fill('.modal #taNote', 'التوربين مكسور');
  await page.click('.modal #taOk');
  expect(await toastHas(page, 'تم تحديث البلاغ'), 'procurement received the tool with a condition photo');
  await page.waitForSelector('.modal [data-tk-act="damaged"]');
  await page.click('.modal [data-tk-act="damaged"]');
  await page.waitForSelector('.modal #taLoss');
  await page.click('.modal #taOk');
  await page.waitForSelector('.modal [data-tk-act="replace"]');
  expect((await page.textContent('.modal .modal-body')).includes('1,500'), 'damaged → loss = tool cost (1,500)');
  await page.click('.modal [data-tk-act="replace"]');
  await page.waitForSelector('.modal #isSer');
  await page.fill('.modal #isSer .input >> nth=0', 'LS-103');
  await page.click('.modal #isOk');
  expect(await toastHas(page, 'تم صرف 1 قطعة'), 'replacement issued manually with a new serial');
  await page.waitForTimeout(500);
  expect((await page.textContent('.modal .modal-body')).includes('AST-'), 'replacement linked to the ticket');
  await shot(page, 'assets-ticket');
  await page.keyboard.press('Escape');
  await page.click('[data-seg-name="asTab"][data-v="find"]');
  await page.fill('#asFindQ', 'LS-101');
  await page.waitForSelector('#asFound .card');
  expect((await page.textContent('#asFound')).includes('تالفة'), 'serial lookup shows the unit history');
  await logout(page);

  // ---------- حالة كل صنف داخل الطلبية + التراجع عن خطوة بالسبب ----------
  await login(page, 'سارة', '1111');
  const stId = await page.evaluate(() => call('createRequest', { clinic: 'Sterilization', branch: 'الرياض', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'DENTAL FLOSS', qty: 4 }] }).then(r => r.id));
  await logout(page);
  await login(page, 'علي', '3333');
  await page.click('.sidebar [data-view="requests"]');
  await page.waitForSelector('[data-rid="' + stId + '"] [data-act="procToggle"]');
  await page.click('[data-rid="' + stId + '"] .req-actions [data-act="procToggle"]');
  await page.waitForSelector('#exp-' + stId + ' .item-st[data-item="DENTAL FLOSS"]');
  await page.selectOption('#exp-' + stId + ' .item-st[data-item="DENTAL FLOSS"]', 'بانتظار المندوب');
  expect(await toastHas(page, 'حُدّثت حالة 1 صنف'), 'procurement sets a status for one item inside the request');
  await page.waitForTimeout(300);
  expect(await page.inputValue('#exp-' + stId + ' .item-st[data-item="DENTAL FLOSS"]') === 'بانتظار المندوب' && await page.inputValue('#exp-' + stId + ' .item-st[data-item="PROPHY PASTE"]') === '', 'each item keeps its own status');
  await page.selectOption('#exp-' + stId + ' .item-st[data-item="DENTAL FLOSS"]', 'قيد التجهيز');
  await page.waitForSelector('.modal #rvReason');
  await page.click('.modal [data-close]');
  await page.waitForTimeout(300);
  expect(await page.inputValue('#exp-' + stId + ' .item-st[data-item="DENTAL FLOSS"]') === 'بانتظار المندوب', 'going back needs a reason — cancelling restores the status');
  await shot(page, 'item-statuses', true);
  await page.check('#exp-' + stId + ' [data-change="dspAll"]');
  await page.click('#exp-' + stId + ' [data-act="dispatch"]');
  await page.waitForSelector('.modal #bxpOk');
  await page.click('.modal #bxpOk');
  expect(await toastHas(page, 'اكتمل إرسال كل الأصناف'), 'everything sent (by mistake)');
  await page.waitForSelector('[data-rid="' + stId + '"] [data-act="revertStep"]');
  await page.click('[data-rid="' + stId + '"] [data-act="revertStep"]');
  await page.waitForSelector('.modal #rvReason');
  expect((await page.textContent('.modal .modal-head')).includes('إلغاء الشحنة 1'), 'undo shows exactly what will be undone (shipment 1)');
  await page.click('.modal #rvOk');
  expect((await page.textContent('.modal #rvErr')).length > 0, 'the reason is required');
  await page.fill('.modal #rvReason', 'أُرسلت بالغلط قبل وصول المندوب');
  await page.click('.modal #rvOk');
  expect(await toastHas(page, 'تم التراجع وتسجيله'), 'wrong shipment undone with a reason');
  await page.waitForTimeout(500);
  expect(await page.evaluate(id => __gas.dump('ShipmentItems').filter(r => r[0] === id).length, stId) === 0, 'shipment rows removed — items open again');
  // إلغاء بالجملة مع السبب ← يظهر للممرضة
  await page.click('.chip[data-g="all"]');
  await page.check(`.req[data-rid="${stId}"] .req-main > .check`);
  await page.waitForSelector('#bulkbar.show [data-act="bulkCancel"]:not([disabled])');
  await page.click('#bulkbar [data-act="bulkCancel"]');
  await page.waitForSelector('.modal #cnReason');
  await page.click('.modal #cnOk');
  expect((await page.textContent('.modal #cnErr')).length > 0, 'cancelling needs a reason');
  await page.fill('.modal #cnReason', 'الأصناف غير متوفرة هذا الشهر');
  await page.click('.modal #cnOk');
  expect(await toastHas(page, 'أُلغي 1 طلب'), 'procurement cancelled the selected request');
  await page.waitForSelector(`.req[data-rid="${stId}"] .cancel-box`);
  await page.click('.chip[data-g="cancelled"]');
  expect(await page.locator(`#procList .req[data-rid="${stId}"]`).count() === 1, '«cancelled» chip lists it');
  await logout(page);
  await login(page, 'سارة', '1111');
  await page.click('.sidebar [data-view="mine"]');
  await page.waitForSelector(`.req:has-text("${stId}") .cancel-box`);
  expect((await page.textContent(`.req:has-text("${stId}") .cancel-box`)).includes('الأصناف غير متوفرة هذا الشهر') && (await page.textContent(`.req:has-text("${stId}") .badge`)).includes('ملغي'), 'nurse sees the request cancelled with the reason');
  await logout(page);
  await login(page, 'منى', '5555');
  await page.click('.sidebar [data-view="monitor"]');
  await page.waitForSelector('#monRev .card');
  expect((await page.textContent('#monRev')).includes('أُرسلت بالغلط قبل وصول المندوب') && (await page.textContent('#monRev')).includes(stId), 'quality sees the undo log (who, when, what, why)');
  await shot(page, 'undo-log', true);
  await page.click('.sidebar [data-view="overview"]');
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
  // التقارير والإحصائيات + تقرير طبيب من قائمة منسدلة
  await page.click('.sidebar [data-view="reports"]');
  // تم تحميلها مسبقاً في الخلفية بعد الدخول: تظهر فوراً بلا انتظار الخادم
  expect(await page.waitForSelector('#rpStats .rp-tile', { timeout: 250 }).then(() => true, () => false), 'reports open instantly (preloaded in the background after login)');
  await page.click('.sidebar [data-view="monitor"]');
  expect(await page.waitForSelector('#monBody .rp-tile', { timeout: 250 }).then(() => true, () => false), 'follow-up screen opens instantly (preloaded)');
  await page.click('.sidebar [data-view="reports"]');
  await page.click('[data-seg-name="rpMode"][data-v="all"]');
  await page.click('[data-act="rpGo"]');
  await page.waitForSelector('#rpStats .rp-tile');
  expect(await page.locator('#rpStats .rp-tile').count() === 8, 'statistics page shows 8 summary figures');
  expect(await page.locator('#rpStats .rp-table').count() === 5, 'tables by doctor, doctor billing, branch, clinic and top items');
  expect((await page.textContent('#rpStats')).includes('الحسبة المالية للأطباء') && await page.locator('#rpStats .tag.bill-box').count() >= 1, 'doctor billing table (clinic / box) is shown');
  expect((await page.textContent('#rpStats .rp-table >> nth=0')).includes('د. خالد'), 'doctor table lists doctors');
  await page.waitForSelector('#rpDoctor option[value="د. خالد"], #rpDoctor option:has-text("د. خالد")', { state: 'attached' });
  await page.selectOption('#rpDoctor', 'د. خالد');
  await page.click('[data-act="rpDoc"]');
  await page.waitForSelector('#rpDocOut .rep-grand');
  expect((await page.textContent('#rpDocOut .rep-meta')).includes('د. خالد') && await page.locator('#rpDocOut .rep-req').count() >= 1, 'doctor dropdown report shows his request history with prices');
  expect(!(await page.isDisabled('[data-act="rpDocPrint"]')), 'doctor report can be printed/exported');
  await page.click('[data-act="rpDocOf"] >> nth=0');
  await page.waitForSelector('#rpDocOut .rep-grand');
  expect(true, 'report button in the doctor table opens that doctor');
  await shot(page, 'reports-statistics', true);
  await page.click('.sidebar [data-view="notices"]');
  await page.click('[data-seg-name="noticeTarget"][data-v="ممرضة"]');
  await page.fill('#noticeMsg', 'يرجى تأكيد الاستلام في نفس اليوم');
  await page.click('[data-act="sendNotice"]');
  expect(await toastHas(page, 'تم إرسال التنبيه'), 'notice sent');
  // ---------- Quality: deadlines & procurement follow-up ----------
  const qNav = await page.$$eval('.sidebar .nav-item', els => els.map(e => e.dataset.view));
  expect(qNav.includes('monitor') && !qNav.includes('users') && !qNav.includes('finance'), 'quality menu follows its permissions (follow-up yes, users/finance no): ' + qNav.join(','));
  // أسعار الأطباء: الجودة تمنح/تحجب
  expect(qNav.includes('docprices'), 'quality sees «Doctor prices»');
  await page.click('.sidebar [data-view="docprices"]');
  await page.waitForSelector('#dpBody [data-act="dpSet"]');
  expect((await page.textContent('#dpBody')).includes('د. خالد') && await page.locator('#dpBody .tag.pv').count() >= 1, 'doctor list with who sees prices');
  await page.click('#dpBody [data-act="dpSet"][data-u="د. خالد"]');
  expect(await toastHas(page, 'حُجبت الأسعار'), 'quality withholds prices from a doctor');
  await page.click('#dpBody [data-act="dpSet"][data-u="د. خالد"]');
  expect(await toastHas(page, 'رؤية الأسعار'), 'and grants them back');
  await shot(page, 'quality-doctor-prices');
  // نتائج استبيان الأطباء
  expect(qNav.includes('surveys'), 'quality sees «Doctor survey»');
  await page.click('.sidebar [data-view="surveys"]');
  await page.waitForSelector('#svBody .rp-tile');
  expect((await page.textContent('#svBody')).includes('تتبع البوكس ممتاز') && (await page.textContent('#svBody')).includes('د. خالد'), 'survey results: per question, written feedback and each doctor answer');
  await shot(page, 'quality-survey', true);
  // الأطباء — مباشر
  expect(qNav.includes('doctorslive'), 'quality sees «Doctors — live»');
  await page.click('.sidebar [data-view="doctorslive"]');
  await page.waitForSelector('#dlBody .rp-table');
  expect(await page.locator('#dlTiles .rp-tile').count() === 5 && (await page.textContent('#dlTiles')).includes('مراجعة الطبيب'), 'totals by stage at the top (review, new, approved, prep, sent)');
  expect((await page.textContent('#dlBody')).includes('د. خالد'), 'one row per doctor');
  await page.click('#dlBody .dl-n >> nth=0');
  await page.waitForSelector('.modal [data-act="detail"]');
  expect(await page.locator('.modal [data-act="detail"]').count() >= 1, 'a count opens the requests behind it');
  await shot(page, 'doctors-live', true);
  await page.keyboard.press('Escape');
  await page.click('.sidebar [data-view="monitor"]');
  await page.waitForSelector('#monBody .rp-tile');
  expect(await page.locator('#monBody .mon-doc').count() === 4, 'monthly cycle is tracked per doctor (not per clinic)');
  expect(await page.locator('#monBody [data-act="monNudge"]').count() >= 1, 'overdue requests are listed with a nudge button');
  await shot(page, 'quality-monitor', true);
  const nOwner = await page.getAttribute('#monBody [data-act="monNudge"] >> nth=0', 'data-owner');
  const nLabel = { nurse: 'التمريض', doctor: 'الطبيب', procurement: 'التموين' }[nOwner];
  expect(!!nLabel && (await page.textContent('#monBody [data-act="monNudge"] >> nth=0')).includes(nLabel), 'nudge button names who the request waits on (' + nOwner + ')');
  await page.click('#monBody [data-act="monNudge"] >> nth=0');
  expect((await page.textContent('.modal .modal-head')).includes(nLabel), 'nudge dialog is addressed to the stage owner');
  await page.click('#nSend');
  expect(await toastHas(page, 'تم تنبيه ' + nLabel) || await toastHas(page, 'لا يوجد إيميل مسجل'), 'quality nudged the stage owner on an overdue request');
  const nMails = await page.evaluate(() => __gas.mails.filter(m => /متابعة طلب متأخر/.test(m.subject)).map(m => m.to));
  expect(nOwner === 'nurse' ? nMails.every(to => !/ali@example\.com/.test(to)) : nMails.length > 0, 'nudge emailed the stage owner only — not procurement (' + nOwner + ': ' + (nMails.join(',') || 'no email → comment + warning') + ')');
  await logout(page);

  // ---------- Finance ----------
  await login(page, 'نواف', '7777');
  await page.waitForSelector('#fnBody .rp-tile');
  const fNav = await page.$$eval('.sidebar .nav-item', els => els.map(e => e.dataset.view));
  expect(fNav[0] === 'finance' && !fNav.includes('users') && !fNav.includes('complaints'), 'finance lands on its own screen: ' + fNav.join(','));
  expect(await page.locator('#fnBody .rp-tile').count() === 8, 'finance shows 8 money figures');
  await page.waitForSelector('#fnPrices tr:has-text("Itero Sleeve") .price-in');
  await page.fill('#fnPrices tr:has-text("Itero Sleeve") .price-in', '320');
  await page.click('#fnPrices tr:has-text("Itero Sleeve") [data-act="priceSave"]');
  expect(await toastHas(page, 'حُفظ سعر Itero Sleeve'), 'finance edited a catalog price');
  expect(await page.evaluate(() => { const d = __gas.dump('ItemsCatalog'); const h = d[0]; const r = d.find(x => x[0] === 'Itero Sleeve'); return r[h.indexOf('Price')]; }) === 320, 'price written to the ItemsCatalog sheet');
  await shot(page, 'finance', true);
  await page.click('.sidebar [data-view="assetsdash"]');
  await page.waitForSelector('#asStats .rp-tile');
  expect((await page.textContent('#asStats')).includes('1,500') && (await page.textContent('#asStats')).includes('Handpiece Low Speed'), 'finance sees custody cost (loss 1,500) by tool');
  await shot(page, 'assets-dashboard', true);
  await logout(page);

  // رابط السواق الخاطئ يفتح صفحة السواق برسالة واضحة (بدون شاشة الدخول)
  {
    const dp = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, query: '?driver=wrong-token' });
    await dp.waitForSelector('#driverView .empty');
    expect((await dp.textContent('#driverView')).includes('الرابط غير صالح') && await dp.isHidden('#loginView'), 'driver link opens the driver page without login (invalid token → clear message)');
    await dp.close();
  }

  // ---------- Admin ----------
  await login(page, 'المدير', '1234');
  await page.click('.sidebar [data-view="users"]');
  await page.waitForSelector('#uTable table');
  await shot(page, 'admin-users');
  await page.click('[data-act="userNew"]');
  await page.fill('#uName', 'هند');
  await page.fill('#uPass', '7777');
  await page.selectOption('#uRole', 'طبيب');
  expect(await page.isVisible('#uPriceView') && await page.locator('#uPriceView option').count() === 2 && await page.inputValue('#uPriceView') === '', 'doctor account: no prices by default, admin can grant');
  await shot(page, 'admin-doctor-price-view');
  await page.selectOption('#uRole', 'ممرضة');
  expect(!(await page.isVisible('#uPriceView')), 'price view applies to doctors only');
  await page.click('#uClinics .chip >> nth=1');
  await shot(page, 'admin-new-user');
  await page.click('#uSave');
  const okUser = await toastHas(page, 'تم حفظ المستخدم');
  expect(okUser, 'admin created a user' + (okUser ? '' : ' — ' + (await page.$$eval('.toast, .field-error:not(.hidden)', els => els.map(e => e.innerText).join(' | ')))));
  // مدير فرع: الأدمن يحدد فرعه، وهو يرى فرعه فقط (مشاهدة)
  await page.click('[data-act="userNew"]');
  await page.fill('#uName', 'مدير جدة');
  await page.fill('#uPass', '4545');
  await page.selectOption('#uRole', 'مدير فرع');
  expect(await page.isVisible('#uBranch') && !(await page.isVisible('#uClinics')), 'branch field shown for a branch manager');
  await page.selectOption('#uBranch', 'جدة');
  await page.click('#uSave');
  expect(await toastHas(page, 'تم حفظ المستخدم'), 'admin created a branch manager');
  await page.waitForFunction(() => /مدير جدة/.test(document.getElementById('uTable').textContent));
  expect(await page.evaluate(() => { const d = __gas.dump('Users'); const h = d[0]; return d.find(r => r[0] === 'مدير جدة')[h.indexOf('Branch')] === 'جدة'; }), 'branch saved in the Users sheet');
  await logout(page);
  await login(page, 'مدير جدة', '4545');
  expect((await page.textContent('#userRole')).includes('فرع جدة'), 'branch manager sees his branch badge');
  const bm = await page.evaluate(() => ({ nav: navItems().map(n => n.id), reqs: null }));
  expect(bm.nav.includes('overview') && bm.nav.includes('monitor') && bm.nav.includes('labkpi') && !bm.nav.includes('users') && !bm.nav.includes('finance'), 'branch manager nav: overview, monitor, lab… (no users/finance)');
  const branches = await page.evaluate(() => call('getRequests', {}).then(l => Array.from(new Set(l.map(r => r.branch)))));
  expect(branches.every(b => b === 'جدة'), 'branch manager only gets his branch requests (' + branches.join(',') + ')');
  await page.evaluate(() => go('monitor'));
  await page.waitForSelector('#monBody .rp-tiles');
  await shot(page, 'branch-manager-monitor', true);
  // البوكسات (اطلاع): بلا رابط السواق ولا أزرار النقل والستيكر، وبحث بالطبيب
  expect(bm.nav.includes('boxes'), 'branch manager has the boxes tab');
  await page.evaluate(() => go('boxes'));
  await page.waitForSelector('#bxList');
  await page.waitForFunction(() => BX.data);
  expect(!(await page.$('#bxDriver')) && !(await page.$('[data-act="bxMove"]')) && !(await page.$('[data-act="bxNew"]')) && !(await page.$('[data-act="bxSticker"]')), 'boxes view is read-only (no driver link, move, sticker or new box)');
  expect(await page.evaluate(() => (BX.data.boxes || []).every(b => !b.k && (!b.branch || b.branch === 'جدة' || b.location === 'جدة' || b.destination === 'جدة')) && !BX.data.driverToken), 'only جدة boxes, no QR tokens');
  await page.fill('#bxQ', 'zzz-none');
  await page.waitForTimeout(500);
  expect(await page.locator('#bxList .box-card').count() === 0, 'search by doctor filters the boxes');
  await logout(page);
  await login(page, 'المدير', '1234');
  await page.click('.sidebar [data-view="users"]');
  await page.waitForSelector('#uTable table');
  await page.waitForSelector('#bkBox');
  await page.waitForFunction(() => /لم تُؤخذ|آخر نسخة/.test(document.getElementById('bkBox').textContent));
  await page.click('#bkBtn');
  await page.waitForFunction(() => /آخر نسخة/.test(document.getElementById('bkBox').textContent));
  expect(await toastHas(page, 'تم أخذ نسخة احتياطية') && await page.isVisible('#bkBox a:has-text("فتح آخر نسخة")'), 'admin takes a backup now and can open it');
  await page.locator('#bkBox').scrollIntoViewIfNeeded();
  await shot(page, 'admin-backup');
  const setupVer = /SETUP_VERSION_ = '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'))[1];
  await page.waitForFunction(v => ((document.getElementById('suBox') || {}).textContent || '').includes(v), setupVer);
  await page.click('#suBtn');
  expect(await toastHas(page, 'اكتمل التجهيز') || await toastHas(page, 'التجهيز فيه خطوات'), 'admin sees the setup status (code version + steps) and can re-run it');
  // صلاحيات الدور: الأدمن يحدد ما يظهر لكل دور
  await page.click('[data-act="roleEdit"][data-name="جودة"]');
  await page.waitForSelector('#rPermWrap:not(.hidden)');
  expect(await page.isChecked('#rPerms input[value="monitor"]') && !(await page.isChecked('#rPerms input[value="users"]')), 'quality role shows its default permissions');
  await shot(page, 'admin-role-permissions');
  await page.uncheck('#rPerms input[value="reports"]');
  await page.click('#rSave');
  expect(await toastHas(page, 'تم حفظ الدور'), 'admin saved role permissions');
  expect(await page.evaluate(() => { const d = __gas.dump('Roles'); const h = d[0]; const r = d.find(x => x[0] === 'جودة'); return !/reports/.test(r[h.indexOf('Permissions')]) && /monitor/.test(r[h.indexOf('Permissions')]); }), 'permissions saved to the Roles sheet');
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

  // ---------- الأصناف الحرة: التموين يعتمدها بسعر، أو يربطها بصنف موجود، أو يرفضها ----------
  await page.evaluate(async () => {
    const tok = (await __api(null, 'login', ['سارة', '1111'])).token;
    await __api(tok, 'createRequest', [{ doctor: 'د. خالد', type: 'شهري', items: [
      { name: 'salk', qty: 2, free: true, type: 'مستهلك' }, { name: 'gloves big', qty: 3, free: true, type: 'مستهلك' }, { name: 'wrong thing', qty: 1, free: true, type: 'ماتيريال' }] }]);
  });
  await login(page, 'علي', '3333');
  await page.click('.sidebar [data-view="freeitems"]');
  await page.waitForSelector('#fiList .fi-row');
  expect(await page.locator('#fiList .fi-row').count() === 3, 'procurement «free items» tab lists the nurse-added items');
  await shot(page, 'proc-free-items');
  await page.click('#fiList .fi-row:has-text("wrong thing") [data-act="fiReject"]');
  await page.waitForSelector('.modal #fiReason');
  expect(await page.inputValue('.modal #fiReason') === 'موجود مسبقاً', 'reject suggests «already exists» as the reason');
  await page.click('.modal #fiRejOk');
  expect(await toastHas(page, '1 رفض'), 'free item rejected with a reason');
  await page.waitForFunction(() => document.querySelectorAll('#fiList .fi-row').length === 2);
  await page.check('#fiAll');
  await page.click('#fiApproveBtn');
  await page.waitForSelector('.modal .fi-dec');
  expect(await page.locator('.modal .fi-dec').count() === 2, 'approving the selection opens one row per item');
  await page.fill('.modal .fi-dec:has-text("salk") .fi-price', '15');
  await page.selectOption('.modal .fi-dec:has-text("gloves big") .fi-match', 'قفازات طبية M');
  expect(await page.isVisible('.modal .fi-dec:has-text("gloves big") .fi-match-hint .alias-of'), 'matching previews the nurse name next to the procurement name');
  await shot(page, 'proc-free-approve');
  await page.click('.modal #fiOk');
  expect(await toastHas(page, '1 اعتماد · 1 ربط'), 'one approved with a price, one linked to an existing item');
  await page.waitForSelector('#fiList .empty, #fiList .empty-state');
  await logout(page);
  await login(page, 'سارة', '1111');
  await page.click('.sidebar [data-view="new"]');
  await page.click('[data-seg-name="reqKind"][data-v="doctor"]');
  await page.waitForSelector('#itemSearch');
  await page.fill('#itemSearch', 'gloves');
  await page.waitForSelector('#comboList .alias-nm');
  expect((await page.textContent('#comboList .combo-opt:has(.alias-nm) .alias-of')).includes('قفازات طبية M'), 'nurse sees her name and the procurement name in two colors');
  await (await page.$('#comboList .combo-opt:has(.alias-nm)')).scrollIntoViewIfNeeded();
  await (await page.$('#comboList')).screenshot({ path: __dirname + '/screenshots/nurse-alias-search.png' });
  await page.fill('#itemSearch', '');
  await page.keyboard.press('Escape');
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
  // الممرضة تلغي طلباً رفعته بالغلط وهو عند مراجعة الطبيب
  const wdId = await page.evaluate(async () => {
    const tok = (await __api(null, 'login', ['سارة', '1111'])).token;
    return (await __api(tok, 'createRequest', [{ doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 9 }] }])).id;
  });
  await page.click('.sidebar [data-view="new"]');
  await page.click('.sidebar [data-view="mine"]');
  await page.click(`.req:has-text("${wdId}") [data-act="detail"]`);
  await page.waitForSelector('.modal [data-act="withdraw"]');
  await page.click('.modal [data-act="withdraw"]');
  await page.fill('.modal #wdReason', 'اخترت الطبيب الخطأ');
  await shot(page, 'nurse-withdraw');
  await page.click('.modal #wdOk');
  expect(await toastHas(page, 'تم إلغاء الطلب ' + wdId), 'nurse cancels her own request while it is with the doctor');
  await page.waitForTimeout(400);
  await page.click(`.req:has-text("${wdId}") [data-act="detail"]`);
  await page.waitForSelector('#dComment');
  expect((await page.textContent('.modal')).includes('اخترت الطبيب الخطأ') && !(await page.$('.modal [data-act="withdraw"]')), 'cancelled request shows the reason; no cancel button any more');
  await page.keyboard.press('Escape');
  // «جديد» (مستهلكات عيادة) يُلغى من زر الكرت مباشرة
  const wdId2 = await page.evaluate(async () => {
    const tok = (await __api(null, 'login', ['سارة', '1111'])).token;
    return (await __api(tok, 'createRequest', [{ clinic: 'Sterilization', branch: 'الرياض', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 11 }, { name: 'DENTAL FLOSS', qty: 3 }] }])).id;
  });
  await page.click('.sidebar [data-view="new"]');
  await page.click('.sidebar [data-view="mine"]');
  // تعديل الأصناف: تغيير كمية + حذف صنف
  await page.click(`.req:has-text("${wdId2}") .req-actions [data-act="editItems"]`);
  await page.waitForSelector('.modal .rvQty[data-item="PROPHY PASTE"]');
  await page.fill('.modal .rvQty[data-item="PROPHY PASTE"]', '12');
  await page.click('.modal tr:has(.rvQty[data-item="DENTAL FLOSS"]) [data-rm]');
  expect(await page.$eval('.modal tr:has(.rvQty[data-item="DENTAL FLOSS"])', tr => tr.classList.contains('removed')), 'bin marks the item as removed');
  await shot(page, 'nurse-edit-items');
  await page.click('.modal #eiOk');
  expect(await toastHas(page, 'تم تعديل أصناف الطلب ' + wdId2), 'nurse saved the edited items');
  const edited = await page.evaluate(async id => {
    const tok = (await __api(null, 'login', ['سارة', '1111'])).token;
    return (await __api(tok, 'getRequestDetail', [id])).items.map(i => i.item + ':' + i.requestedQty).join(',');
  }, wdId2);
  expect(edited === 'PROPHY PASTE:12', 'server has the new qty and the removed item is gone — ' + edited);
  await page.waitForSelector(`.req:has-text("${wdId2}") .req-actions [data-act="withdraw"]`);
  await page.click(`.req:has-text("${wdId2}") .req-actions [data-act="withdraw"]`);
  await page.click('.modal #wdOk');
  expect(await toastHas(page, 'تم إلغاء الطلب ' + wdId2), 'new clinic-consumables request cancelled from the card button');
  await page.waitForTimeout(400);
  expect(!(await page.$(`.req:has-text("${wdId2}") .req-actions [data-act="withdraw"]`)), 'card loses the cancel button once cancelled');
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
      const body = r.request().postData() || '{}';
      if (JSON.parse(body).fn === 'ping') net.pings = (net.pings || 0) + 1; else net.posts++;
      if (JSON.parse(body).fn === 'batch') net.batches++;
      if (net.rejectBatch && JSON.parse(body).fn === 'batch') return r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: false, error: 'ERR_UNKNOWN_FN' }) });
      if (net.failNext > 0) { net.failNext--; return r.fulfill({ status: 500, body: '<html>Google error</html>' }); }
      if (net.busyWrites > 0 && !/^(get|batch|login)/.test(JSON.parse(body).fn)) { net.busyWrites--; net.busyServed = (net.busyServed || 0) + 1; return r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: false, error: 'ERR_BUSY' }) }); }
      const out = sctx.doPost({ postData: { contents: body } }).getContent();
      const send = () => r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: out }).catch(() => {});
      if (net.delay) setTimeout(send, net.delay); else send();
    });
    const gp = await ctx.newPage();
    gp.on('pageerror', e => errors.push('pages-mode pageerror: ' + e.message));
    await gp.goto('http://pages.test/Index.html');
    await gp.waitForSelector('#loginView:not(.hidden)');
    expect(!(await gp.isVisible('text=include_')), 'Pages mode: include line is invisible');
    await login(gp, 'علي', '3333');
    await gp.waitForSelector('#procList .req, #procList .empty, #cList .req, #cList .empty');
    await gp.waitForTimeout(400);
    expect(net.posts === 1, 'Pages mode: login + first screen data in a single request (' + net.posts + ' posts)');
    expect(net.pings >= 1, 'Pages mode: login screen wakes the server early (ping)');
    await gp.click('.topbar [data-act="sync"]');
    expect(await toastHas(gp, 'تم بنجاح'), 'Pages mode: sync done');
    expect(net.posts === 2 && net.batches === 1, 'Pages mode: sync sends all reads as one batch (' + net.posts + ' posts, ' + net.batches + ' batches)');
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
    net.rejectBatch = false;
    // ضغط كتابة: الخادم يرد «مشغول» مرتين ثم ينجح — الواجهة تعيد المحاولة تلقائياً بلا خطأ
    net.failNext = 0; // لا تبقى أخطاء 500 من اختبار القراءة السابق (تعتمد على عدد القراءات في المزامنة)
    net.busyWrites = 2;
    const saved = await gp.evaluate(() => call('changePassword', '3333', 'busy-test-1').then(r => r, e => 'ERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
    expect(saved === true && net.busyServed === 2, 'Pages mode: writes retry automatically when the server is busy (' + saved + ')');
    // إعادة تحميل الصفحة مع خادم بطيء (ثانيتان): الواجهة تفتح فوراً بآخر بيانات معروفة
    net.delay = 2000;
    await gp.waitForTimeout(1000);
    const t0 = Date.now();
    await gp.reload();
    await gp.waitForSelector('#procList .req, #procList .empty', { timeout: 1500 });
    const ms = Date.now() - t0;
    expect(ms < 1500, 'Pages mode: page reload shows the app and list instantly while the server takes 2 s (' + ms + ' ms)');
    net.delay = 0;
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
    expect(await tp.locator('.wf-rolecard').count() === 0, 'nurse does not see the «who does what» block (executive, quality and admin only)');
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

  // ---------- Mobile: كل الشاشات لكل الأدوار — لا شيء يخرج عن حدود الشاشة ----------
  // عنصر «يخرج» = حافته خارج عرض الشاشة وليس داخل حاوية تمرير أفقي مقصودة (جداول / شرائح)
  const offenders = pg => pg.evaluate(() => {
    const W = document.documentElement.clientWidth, out = [];
    const scroller = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    document.querySelectorAll('body *').forEach(el => {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > W + 1 || r.left < -1) && !scroller(el) && !el.closest('#bottomNav,.tour-card,.chart-tip,.sidebar')) out.push((el.id ? '#' + el.id : el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : el.tagName) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    });
    // أي عنصر أعرض من الشاشة (أعلى مستوى فقط) خارج حاويات التمرير المقصودة
    Array.from(document.querySelectorAll('body *')).filter(el => el.getClientRects().length && el.getBoundingClientRect().width > W + 1 && !scroller(el) && !el.closest('#bottomNav,.sidebar,.table-wrap,.chips,.tour-card') && !Array.from(el.children).some(c => c.getBoundingClientRect().width > W + 1))
      .slice(0, 5).forEach(el => out.unshift('WIDE ' + (el.id ? '#' + el.id : el.tagName) + ' w=' + Math.round(el.getBoundingClientRect().width)));
    return { scroll: document.documentElement.scrollWidth > W + 1, out: out.slice(0, 8) };
  });
  const mCheck = async (pg, label) => {
    await pg.waitForTimeout(500);
    const o = await offenders(pg);
    expect(!o.scroll && !o.out.length, 'mobile ' + label + ': fits the screen' + (o.out.length ? ' — overflow: ' + o.out.join(', ') : ''));
  };
  const mLogout = async pg => { await pg.click('#mobileMenuBtn'); await pg.click('.modal [data-menu="logout"]'); await pg.waitForSelector('#loginView:not(.hidden)'); };
  await mCheck(m, 'request detail');
  await m.keyboard.press('Escape');
  await m.click('#mineList [data-act="receive"] >> nth=0').catch(() => {});
  if (await m.$('.modal #rOk')) { await shot(m, 'mobile-receive'); await mCheck(m, 'receive & sign'); await m.keyboard.press('Escape'); }
  const mRole = async (name, pass, views) => {
    await mLogout(m);
    await login(m, name, pass);
    // استبيان الطبيب يظهر عند الدخول: نتحقق أنه يناسب الجوال ثم «لاحقاً»
    if (await m.waitForSelector('.modal .sv-form', { timeout: 2500 }).then(() => true, () => false)) {
      await mCheck(m, name + ' / survey');
      await m.click('.modal [data-close]'); await m.waitForTimeout(400);
    }
    for (const v of views) {
      await m.evaluate(v => go(v), v);
      await m.waitForTimeout(900);
      await shot(m, 'mobile-' + name + '-' + v, true);
      await mCheck(m, name + ' / ' + v);
    }
  };
  await mRole('علي', '3333', ['requests', 'complaints']);
  await m.click('#procList .req-main >> nth=0').catch(() => {});
  if (await m.$('.modal .stepper')) { await mCheck(m, 'procurement detail'); await m.keyboard.press('Escape'); }
  await mRole('د. خالد', '4444', ['reviews']);
  await mRole('منى', '5555', ['overview', 'monitor', 'reports', 'complaints', 'notices', 'workflow']);
  expect(await m.evaluate(() => ['executive', 'quality', 'admin'].indexOf(S.user.screen) !== -1) === (await m.locator('.wf-rolecard').count() > 0), '«who does what» block shows only for executive, quality and admin');
  await mRole('نواف', '7777', ['finance']);
  await mRole('فني المعمل', '8888', ['labboard', 'labkpi']);
  await mRole('سارة', '1111', ['labmine']);
  await m.evaluate(() => { nurseDraft().kind = 'lab'; go('new'); });
  await m.waitForSelector('#lLines .lab-line');
  await shot(m, 'mobile-lab-form', true);
  await mCheck(m, 'nurse lab form');
  await mRole('المدير', '1234', ['users']);
  await m.click('[data-act="roleEdit"] >> nth=3');
  await m.waitForSelector('.modal #rPerms');
  await shot(m, 'mobile-role-modal');
  await mCheck(m, 'role permissions modal');
  await m.keyboard.press('Escape');
  await m.click('[data-act="userNew"]');
  await mCheck(m, 'new user modal');
  await m.keyboard.press('Escape');

  await browser.close();
  if (errors.length) { console.error('\nBrowser errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nAll E2E checks passed. Screenshots: ' + results.screenshots.length + ' in ' + OUT);
})().catch(async e => {
  try { const pages = browser_ && browser_.contexts().flatMap(c => c.pages()); if (pages && pages.length) await pages[pages.length - 1].screenshot({ path: path.join(OUT, 'FAILURE.png') }); } catch (x) { /* ignore */ }
  console.error('\nE2E FAILED: ' + e.message);
  if (errors.length) console.error('Browser errors:\n' + errors.join('\n'));
  process.exit(1);
});
