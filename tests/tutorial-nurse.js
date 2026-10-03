/* فيديو تعليمي بالإنجليزية لصفحة الممرضة: الطلب ← المتابعة ← اعتماد الطبيب ← استلام الشحنة.
   يسجّل التطبيق الحقيقي (بيانات تجريبية بأسماء إنجليزية) مع مؤشر وتعليق نصي، ثم يدمج صوت الشرح.
   التشغيل: node tests/tutorial-nurse.js [مجلد الإخراج]
   يحتاج: pip install gTTS imageio-ffmpeg (للصوت وتحويل MP4) */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'tutorials');
const WORK = path.join(OUT, '.work');
fs.mkdirSync(WORK, { recursive: true });
const FFMPEG = execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();

/* ---------- المشاهد: نص الشرح (الصوت + الترجمة على الشاشة) ---------- */
const SCENES = [
  ['intro', 'Welcome to Supply Flow, the clinic supply system. In this short video you will learn how to order supplies, follow your requests, get your doctor\'s approval, and receive shipments.'],
  ['login', 'Open the system link. Enter your name and your password, then tap Sign in.'],
  ['doctor', 'You start on the New request page. First, choose the doctor you are ordering for. The clinic and the branch are filled in automatically.'],
  ['type', 'Next, choose the request type. Monthly is the regular monthly order. Emergency is for urgent needs.'],
  ['items', 'Now add the items. Tap the search box, type part of the item name, and tap it to add it.'],
  ['qty', 'Use the plus and minus buttons to set the quantity of each item.'],
  ['submit', 'Check the summary, then tap Send request. Don\'t worry about losing your work: your draft is saved automatically.'],
  ['mine', 'To follow your orders, open My requests. The colored badge shows where each request is right now, and the bar shows its progress.'],
  ['detail', 'Tap Details to see the full story of a request: every step with its time, the items, and the comments.'],
  ['notify', 'Your doctor is notified automatically by email. Ask the doctor to sign in to their page and approve. You can also write a comment here as a reminder.'],
  ['doctorpage', 'This is the doctor\'s page. The doctor sees every request waiting for review.'],
  ['approve', 'The doctor opens the request, can adjust a quantity or add a note, and then taps Approve.'],
  ['sent', 'After approval, procurement prepares your order and sends it. You get an alert, and the request shows that a shipment is on its way.'],
  ['receive', 'When the shipment arrives, open My requests and tap Receive. Check every quantity, and change it if anything is missing.'],
  ['sign', 'Sign inside the box with your finger, then tap Confirm receipt.'],
  ['done', 'Done. The request is complete, and a receipt with your signature is saved. If there is ever a problem with a request, use the Report button on its card. Thank you!']
];

/* ---------- الصوت: ملف لكل مشهد + مدته ---------- */
function durationOf(file) {
  let txt = '';
  try { execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { txt = String(e.stderr || ''); }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(txt);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 4;
}
const voice = {};
SCENES.forEach(([k, text], i) => {
  const f = path.join(WORK, String(i).padStart(2, '0') + '-' + k + '.mp3');
  if (!fs.existsSync(f)) execFileSync('python3', ['-c', 'import sys;from gtts import gTTS;gTTS(sys.argv[1],lang="en",tld="com").save(sys.argv[2])', text, f]);
  voice[k] = { file: f, dur: durationOf(f), text };
});
console.log('voice-over ready:', SCENES.length, 'clips,', Math.round(Object.values(voice).reduce((a, v) => a + v.dur, 0)), 's');

/* ---------- بيانات تجريبية بالإنجليزية ---------- */
const initScript = [
  fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8'),
  `(function () {
    const gas = GasMock.createGas();
    const D = 864e5, now = Date.now();
    gas.seed('Roles', ['RoleName', 'Screen'], [['Nurse', 'nurse'], ['Procurement', 'procurement'], ['Doctor', 'doctor'], ['Admin', 'admin']]);
    gas.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email', 'PasswordChangedAt', 'DoctorName'], [
      ['Sara', '1111', 'Nurse', 'Dental Clinic 1', 'sara@example.com', '', ''],
      ['Dr. Khalid', '4444', 'Doctor', '', 'khalid@example.com', '', 'Dr. Khalid'],
      ['Ali', '3333', 'Procurement', '', 'ali@example.com', '', ''],
      ['Admin', '9999', 'Admin', '', '', '', '']
    ]);
    gas.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [['Dental Clinic 1', 'Buraydah', 'Dentistry'], ['Dental Clinic 2', 'Unayzah', 'Dentistry']]);
    gas.seed('Doctors', ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty'], [['Dr. Khalid', 'Dental Clinic 1', 'Sara', 'Orthodontics'], ['Dr. Noura', 'Dental Clinic 1', 'Sara', '']]);
    gas.seed('ItemsCatalog', ['ItemName', 'CommercialName', 'Category', 'Price', 'Ownership', 'Serialized', 'Department'], [
      ['PROPHY PASTE', 'Nupro', 'Hygiene', 60, '', '', ''], ['DENTAL FLOSS', 'Oral-B', 'Hygiene', 15, '', '', ''], ['MICRO BRUSH FINE', '', 'Disposables', 25, '', '', ''],
      ['Etchant Blue Tip', '3M', 'Restorative', 40, '', '', ''], ['Composite A2', 'Tetric N', 'Restorative', 120, '', '', ''], ['Gloves M', '', 'Disposables', 30, '', '', '']
    ]);
    const old = (id, days, st) => { const d = new Date(now - days * D); return [id, d, 'Dental Clinic 1', 'Dr. Khalid', 'Sara', 'شهري', st, d, d, st === 'تم الاستلام' ? d : '', st === 'تم الاستلام' ? 'Sara' : '', '', '', '', '', d, d, '', '', 'Buraydah', d]; };
    gas.seed('Requests', ['RequestID','Date','Clinic','Doctor','Nurse','Type','Status','SubmittedAt','SentAt','ReceivedAt','ReceiverName','SignatureURL','PrepAt','VendorWaitAt','VendorReceivedAt','ReviewAt','ReviewedAt','RejectionReason','ReceiptURL','Branch','ApprovedAt'],
      [old('REQ-260915-004', 17, 'تم الاستلام'), old('REQ-260820-002', 43, 'تم الاستلام')]);
    gas.seed('RequestItems', ['RequestID','ItemName','RequestedQty','ApprovedQty','ReceivedQty','DispatchedAt'],
      [['REQ-260915-004', 'PROPHY PASTE', 4, 4, 4, new Date(now - 17 * D)], ['REQ-260915-004', 'Gloves M', 10, 10, 10, new Date(now - 17 * D)], ['REQ-260820-002', 'DENTAL FLOSS', 6, 6, 6, new Date(now - 43 * D)]]);
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
          }, 120);
        };
      } });
      return p;
    }
    g.google = { script: {} };
    Object.defineProperty(g.google.script, 'run', { get: runner });
    try { localStorage.setItem('sf_lang', '"en"'); localStorage.setItem('sf_tour_off', 'true'); } catch (e) { /* */ }
  })();`
].join('\n');

/* مؤشر ظاهر + شريط الترجمة + عنوان المشهد */
const overlayScript = `
  window.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '#tvCursor{position:fixed;z-index:2147483647;left:0;top:0;width:26px;height:26px;pointer-events:none;transition:transform .75s cubic-bezier(.4,.1,.2,1);transform:translate(640px,360px)}' +
      '#tvCursor svg{width:26px;height:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}' +
      '.tvRipple{position:fixed;z-index:2147483646;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(59,130,246,.35);border:2px solid rgba(59,130,246,.9);pointer-events:none;animation:tvR .6s ease-out forwards}' +
      '@keyframes tvR{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}' +
      '#tvCap{pointer-events:none;position:fixed;z-index:2147483645;left:50%;bottom:22px;transform:translateX(-50%);max-width:min(88vw,980px);padding:12px 20px;border-radius:14px;background:rgba(15,23,42,.88);color:#fff;font:600 19px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;direction:ltr;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:opacity .3s}' +
      '#tvCap:empty{opacity:0}' +
      '#tvStep{pointer-events:none;position:fixed;z-index:2147483645;left:18px;top:14px;padding:6px 12px;border-radius:99px;background:rgba(37,99,235,.95);color:#fff;font:700 14px system-ui,sans-serif;direction:ltr}#tvStep:empty{display:none}' +
      '.tvHi{outline:3px solid rgba(37,99,235,.9)!important;outline-offset:3px;border-radius:10px;transition:outline .2s}';
    document.head.appendChild(st);
    const c = document.createElement('div'); c.id = 'tvCursor';
    c.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const cap = document.createElement('div'); cap.id = 'tvCap'; document.body.appendChild(cap);
    const s = document.createElement('div'); s.id = 'tvStep'; document.body.appendChild(s);
  });`;

(async () => {
  const browser = await playwright.chromium.launch();
  const W = 1280, H = 720;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: WORK, size: { width: W, height: H } } });
  await ctx.addInitScript(initScript);
  await ctx.addInitScript(overlayScript);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8')
    .replace(/<\?!=\s*include_\('([\w-]+)'\);?\s*\?>/g, (_, f) => fs.readFileSync(path.join(ROOT, f + '.html'), 'utf8'));
  await ctx.route(/^http:\/\/masar\.demo\/(\?.*)?$/, r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|cdnjs/, r => r.abort());
  await page.goto('http://masar.demo/');
  await page.waitForSelector('#loginView:not(.hidden)');
  await page.waitForTimeout(600);

  const wait = ms => page.waitForTimeout(ms);
  const marks = [];
  let sceneEnd = 0;
  // بداية مشهد: الترجمة + رقم الخطوة؛ النهاية لا تسبق انتهاء الصوت
  async function scene(key, step, fn) {
    const v = voice[key];
    const start = Date.now();
    marks.push({ key, at: (start - t0) / 1000 });
    await page.evaluate(([txt, stp]) => { document.getElementById('tvCap').textContent = txt; document.getElementById('tvStep').textContent = stp || ''; }, [v.text, step]);
    await fn();
    const left = v.dur * 1000 + 450 - (Date.now() - start);
    if (left > 0) await wait(left);
    sceneEnd = Date.now();
  }
  async function point(sel, opts) {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    if (!b) return el;
    const x = b.x + Math.min(b.width / 2, (opts && opts.dx) || b.width / 2), y = b.y + b.height / 2;
    await page.evaluate(([x, y]) => { document.getElementById('tvCursor').style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; }, [x, y]);
    await wait(800);
    return { el, x, y };
  }
  async function click(sel, opts) {
    const p = await point(sel, opts);
    await page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = 'tvRipple'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, [p.x, p.y]);
    await page.locator(sel).first().click();
    await wait(350);
  }
  async function type(sel, text) { await click(sel); await page.locator(sel).first().fill(''); await page.locator(sel).first().pressSequentially(text, { delay: 85 }); }
  async function highlight(sel, ms) {
    const el = page.locator(sel).first();
    if (!(await el.count())) return;
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.evaluate(e => e.classList.add('tvHi'));
    await wait(ms || 1200);
    await el.evaluate(e => e.classList.remove('tvHi')).catch(() => {});
  }
  async function logout() { await page.click('.sidebar [data-act="logout"]'); await page.waitForSelector('#loginView:not(.hidden)'); }
  async function login(name, pass) {
    await type('#loginName', name);
    await type('#loginPass', pass);
    await click('#loginBtn');
    await page.waitForSelector('#appShell:not(.hidden)').catch(async e => { await page.screenshot({ path: path.join(WORK, 'fail.png') }); console.log('LOGIN ERR', await page.textContent('#loginError').catch(() => '')); throw e; });
    await wait(700);
  }

  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'Step 1 · Sign in', async () => { await login('Sara', '1111'); });
  await scene('doctor', 'Step 2 · New request', async () => {
    await page.waitForSelector('#fDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await point('#fDoctor');
    await page.selectOption('#fDoctor', 'Dr. Khalid');
    await wait(600);
    await highlight('#fBranch', 1500);
  });
  await scene('type', 'Step 2 · New request', async () => {
    await click('[data-seg-name="reqType"][data-v="شهري"]');
    await wait(500);
    await point('[data-seg-name="reqType"][data-v="طارئ"]');
  });
  await scene('items', 'Step 2 · New request', async () => {
    await type('#itemSearch', 'prophy');
    await page.waitForSelector('#comboList .combo-opt');
    await wait(500);
    await click('#comboList .combo-opt');
    await type('#itemSearch', 'floss');
    await page.waitForSelector('#comboList .combo-opt');
    await wait(400);
    await click('#comboList .combo-opt');
    await page.keyboard.press('Escape');
  });
  await scene('qty', 'Step 2 · New request', async () => {
    await click('.item-line:nth-child(1) [data-d="1"]');
    await click('.item-line:nth-child(1) [data-d="1"]');
    await click('.item-line:nth-child(2) [data-d="1"]');
  });
  let reqId = '';
  await scene('submit', 'Step 2 · New request', async () => {
    await highlight('#sumBox', 1400);
    await click('#submitBtn');
    const tt = await (await page.waitForSelector('.toast:last-child')).textContent();
    reqId = (/REQ-[\d-]+/.exec(tt) || [''])[0];
  });
  await scene('mine', 'Step 3 · Follow your requests', async () => {
    await click('.sidebar [data-view="mine"]');
    await page.waitForSelector('#mineList .req');
    await highlight(`.req:has-text("${reqId}") .badge`, 1600);
  });
  await scene('detail', 'Step 3 · Follow your requests', async () => {
    await click(`.req:has-text("${reqId}") [data-act="detail"]`);
    await page.waitForSelector('.modal .stepper');
    await wait(1200);
    await page.evaluate(() => { const b = document.querySelector('.modal-body'); if (b) b.scrollTo({ top: 260, behavior: 'smooth' }); });
  });
  await scene('notify', 'Step 4 · Doctor approval', async () => {
    await page.evaluate(() => { const b = document.querySelector('.modal-body'); if (b) b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); });
    await wait(700);
    await type('#dComment', 'Dr. Khalid, please approve this request today.');
    await click('#dSend');
    await wait(900);
    await page.keyboard.press('Escape');
  });
  await scene('doctorpage', 'Step 4 · Doctor approval', async () => {
    await logout();
    await login('Dr. Khalid', '4444');
    await page.waitForSelector('#docList .req');
    await highlight(`#docList .req:has-text("${reqId}")`, 1500);
  });
  await scene('approve', 'Step 4 · Doctor approval', async () => {
    await click(`#docList [data-id="${reqId}"]`);
    await page.waitForSelector('#rvItems table');
    await wait(500);
    await point('.rvQty >> nth=0');
    await page.fill('.rvQty >> nth=0', '4');
    await page.dispatchEvent('.rvQty >> nth=0', 'input');
    await wait(600);
    await click('#rvApprove');
    await wait(900);
  });
  // التموين يجهّز ويرسل (في الخلفية)
  await page.evaluate(id => {
    const tk = __api(null, 'login', ['Ali', '3333']).token;
    __api(tk, 'bulkUpdateStatus', [[id], 'قيد التجهيز']);
    __api(tk, 'dispatchItems', [id, ['PROPHY PASTE', 'DENTAL FLOSS']]);
  }, reqId);
  await scene('sent', 'Step 5 · Receive the shipment', async () => {
    await logout();
    await login('Sara', '1111');
    await wait(400);
    if (await page.isVisible('.alert.info')) await highlight('.alert.info', 1200);
    await click('.sidebar [data-view="mine"]');
    await page.waitForSelector(`.req:has-text("${reqId}") [data-act="receive"]`);
    await highlight(`.req:has-text("${reqId}") .badge`, 1200);
  });
  await scene('receive', 'Step 5 · Receive the shipment', async () => {
    await click(`.req:has-text("${reqId}") [data-act="receive"]`);
    await page.waitForSelector('.rq');
    await wait(600);
    await point('.rq >> nth=0');
    await highlight('.rq', 900);
  });
  await scene('sign', 'Step 5 · Receive the shipment', async () => {
    const pad = await page.$('#sigPad');
    await pad.scrollIntoViewIfNeeded();
    const bb = await pad.boundingBox();
    await page.evaluate(([x, y]) => { document.getElementById('tvCursor').style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, [bb.x + 40, bb.y + 100]);
    await wait(800);
    await page.mouse.move(bb.x + 40, bb.y + 100);
    await page.mouse.down();
    for (let i = 0; i <= 30; i++) {
      const x = bb.x + 40 + i * 11, y = bb.y + 85 + Math.sin(i / 2.6) * 34;
      await page.mouse.move(x, y);
      await page.evaluate(([x, y]) => { document.getElementById('tvCursor').style.transition = 'none'; document.getElementById('tvCursor').style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, [x, y]);
      await wait(25);
    }
    await page.mouse.up();
    await page.evaluate(() => { document.getElementById('tvCursor').style.transition = ''; });
    await wait(400);
    await click('#rOk');
  });
  await scene('done', '', async () => {
    await wait(900);
    await highlight(`.req:has-text("${reqId}") .badge`, 1400);
    await point(`.req:has-text("${reqId}") [data-act="complaint"]`);
  });
  await page.evaluate(() => { document.getElementById('tvCap').textContent = ''; });
  await wait(800);
  const total = (Date.now() - t0) / 1000;
  const vpath = await page.video().path();
  await ctx.close();
  await browser.close();

  /* ---------- الدمج: الفيديو + الصوت في مواضعه → MP4 ---------- */
  const keys = marks.map(m => m.key);
  const args = ['-y', '-i', vpath];
  keys.forEach(k => args.push('-i', voice[k].file));
  const delays = marks.map((m, i) => '[' + (i + 1) + ':a]adelay=' + Math.round(m.at * 1000) + '|' + Math.round(m.at * 1000) + '[a' + i + ']').join(';');
  const mix = delays + ';' + marks.map((m, i) => '[a' + i + ']').join('') + 'amix=inputs=' + marks.length + ':normalize=0[aout]';
  const mp4 = path.join(OUT, 'masar-nurse-tutorial-en.mp4');
  args.push('-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-t', String(Math.ceil(total)), '-movflags', '+faststart', mp4);
  execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  // ملف ترجمة SRT (للمنصات التي تعرض الترجمة)
  const ts = s => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), sec = Math.floor(ms % 6e4 / 1000); return [h, m, sec].map(x => String(x).padStart(2, '0')).join(':') + ',' + String(ms % 1000).padStart(3, '0'); };
  fs.writeFileSync(path.join(OUT, 'masar-nurse-tutorial-en.srt'), marks.map((m, i) => (i + 1) + '\n' + ts(m.at) + ' --> ' + ts(m.at + voice[m.key].dur) + '\n' + voice[m.key].text + '\n').join('\n'));
  console.log('video:', mp4, '(' + Math.round(total) + ' s)');
})().catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
