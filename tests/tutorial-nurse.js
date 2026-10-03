/* فيديو تعليمي بالإنجليزية لصفحة الممرضة: الطلب ← المتابعة ← اعتماد الطبيب ← استلام الشحنة.
   يسجّل التطبيق الحقيقي (بيانات تجريبية بأسماء إنجليزية) مع مؤشر وتعليق نصي، ثم يدمج صوت الشرح.
   التشغيل: node tests/tutorial-nurse.js [مجلد الإخراج]
   يحتاج: pip install edge-tts imageio-ffmpeg (صوت Microsoft الطبيعي + تحويل MP4)؛ gTTS احتياطي.
   الصوت: TUTORIAL_VOICE (الافتراضي en-US-AvaNeural). المزامنة دقيقة: الإطارات تُلتقط بتوقيتها الحقيقي (CDP screencast). */
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
  ['intro', 'Welcome to Supply Flow. This video shows nurses everything they need, step by step, in a simple way.'],
  ['login', 'Open the system link. Write your name and your password, then tap Sign in.'],
  ['kinds', 'On the New request page, there are three choices at the top. One: Doctor request, for supplies used by one doctor. The doctor must approve it. Two: Clinic consumables, for supplies used by the whole clinic, and for sterilization. No doctor approval is needed. Three: Send to lab, for patient work that goes to the dental lab.'],
  ['doctor', 'Let\'s start with a Doctor request. Choose the doctor. The clinic and the branch are filled in for you.'],
  ['type', 'Choose the type. Monthly is your normal monthly order. Emergency is only for urgent needs.'],
  ['items', 'Now add the items. Tap the search box, write part of the name, and tap the item.'],
  ['qty', 'Use plus and minus to set how many you need.'],
  ['submit', 'Check the summary on the side, then tap Submit request. Your draft is saved by itself, so you never lose your work.'],
  ['clinic', 'Next, Clinic consumables. Use it for things the whole clinic uses, like gloves or cotton. Choose Clinic consumables, then choose your clinic, and add the items.'],
  ['clinicsend', 'Tap Submit request. This request goes straight to procurement. It does not wait for a doctor.'],
  ['steril', 'Sterilization supplies are ordered the same way, as Clinic consumables. Open the clinic list. The Sterilization section is at the top. Choose the sterilization of your branch: Buraydah or Unayzah.'],
  ['sterilsend', 'A note shows exactly where the order will be delivered. Add the items and tap Submit request.'],
  ['mine', 'Now open My requests. Here you can see the difference. The doctor request shows Doctor review: it waits for the doctor. The clinic and sterilization requests show New: they went straight to procurement.'],
  ['detail', 'Tap Details to see everything about a request: each step and its time, the items, and the comments.'],
  ['notify', 'The doctor gets an email automatically. Ask the doctor to open their page and approve. You can also write a comment here as a reminder.'],
  ['doctorpage', 'This is the doctor\'s page. The doctor sees the requests that are waiting for approval.'],
  ['approve', 'The doctor opens the request. The doctor can change a quantity or add a note, and then taps Approve.'],
  ['sent', 'After approval, procurement prepares the order and sends it to your branch. You get an alert, and the request shows Sent.'],
  ['receive', 'When the box arrives, open My requests and tap Receive and sign. Check each quantity. If something is missing, change the number.'],
  ['sign', 'Sign in the box with your finger, then tap Confirm receipt. A receipt with your signature is saved.'],
  ['labform', 'Now, sending work to the lab. Choose Send to lab, choose the doctor, and write the patient file number. The scan date is today. Change it only if the scan was on another day.'],
  ['labwork', 'Add the work: choose the lab, the type of work, and write notes, like the tooth number and the shade. You can add a photo for each work. The date the lab must finish is calculated for you.'],
  ['labsend', 'Tap Send to lab. Now you can follow it on the Lab page.'],
  ['labback', 'When the lab finishes, it sends the work back to the clinic. You will see the button Confirm receipt. Tap it when the work reaches your clinic.'],
  ['done', 'That\'s all. Doctor requests need the doctor\'s approval. Clinic and sterilization requests go straight to procurement. Lab work goes to the lab. If there is any problem, use the Report button on the card. Thank you!']
];

/* ---------- الصوت: ملف لكل مشهد + مدته ---------- */
function durationOf(file) {
  let txt = '';
  try { execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { txt = String(e.stderr || ''); }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(txt);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 4;
}
const VOICE = process.env.TUTORIAL_VOICE || 'en-US-AvaNeural';
const voice = {};
SCENES.forEach(([k, text], i) => {
  const f = path.join(WORK, String(i).padStart(2, '0') + '-' + k + '-' + VOICE + '.mp3');
  if (!fs.existsSync(f)) {
    try { execFileSync('python3', [path.join(__dirname, 'tts-edge.py'), text, VOICE, f, '+4%'], { stdio: ['ignore', 'ignore', 'pipe'] }); if (!fs.statSync(f).size) throw new Error('empty'); }
    catch (e) { console.log('edge-tts unavailable, falling back to gTTS'); execFileSync('python3', ['-c', 'import sys;from gtts import gTTS;gTTS(sys.argv[1],lang="en",tld="com").save(sys.argv[2])', text, f]); }
  }
  voice[k] = { file: f, dur: durationOf(f), text };
});
console.log('voice-over ready:', SCENES.length, 'clips,', Math.round(Object.values(voice).reduce((a, v) => a + v.dur, 0)), 's');

/* ---------- بيانات تجريبية بالإنجليزية ---------- */
const initScript = [
  fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8'),
  `(function () {
    const gas = GasMock.createGas();
    const D = 864e5, now = Date.now();
    gas.seed('Roles', ['RoleName', 'Screen'], [['Nurse', 'nurse'], ['Procurement', 'procurement'], ['Doctor', 'doctor'], ['Lab', 'lab'], ['Admin', 'admin']]);
    gas.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email', 'PasswordChangedAt', 'DoctorName'], [
      ['Sara', '1111', 'Nurse', 'Dental Clinic 1', 'sara@example.com', '', ''],
      ['Dr. Khalid', '4444', 'Doctor', '', 'khalid@example.com', '', 'Dr. Khalid'],
      ['Ali', '3333', 'Procurement', '', 'ali@example.com', '', ''],
      ['Lab Tech', '8888', 'Lab', '', 'lab@example.com', '', ''],
      ['Admin', '9999', 'Admin', '', '', '', '']
    ]);
    gas.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [['Sterilization', 'Buraydah', 'Sterilization'], ['Sterilization', 'Unayzah', 'Sterilization'], ['Dental Clinic 1', 'Buraydah', 'Dentistry'], ['Dental Clinic 2', 'Unayzah', 'Dentistry']]);
    gas.seed('Labs', ['LabName', 'Type', 'Email', 'Phone', 'Active', 'TurnaroundDays'], [['Internal Lab', 'داخلي', 'lab@example.com', '', 'نعم', 7], ['Elite Dental Lab', 'خارجي', 'elite@example.com', '', 'نعم', 10]]);
    gas.seed('LabWorkTypes', ['WorkType'], [['Crown'], ['Bridge'], ['Denture'], ['Night guard']]);
    gas.seed('LabMaterials', ['Material'], [['Zirconia'], ['Emax'], ['Acrylic']]);
    gas.seed('Doctors', ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty'], [['Dr. Khalid', 'Dental Clinic 1', 'Sara', 'Orthodontics'], ['Dr. Noura', 'Dental Clinic 1', 'Sara', '']]);
    gas.seed('ItemsCatalog', ['ItemName', 'CommercialName', 'Category', 'Price', 'Ownership', 'Serialized', 'Department'], [
      ['PROPHY PASTE', 'Nupro', 'Hygiene', 60, '', '', ''], ['DENTAL FLOSS', 'Oral-B', 'Hygiene', 15, '', '', ''], ['MICRO BRUSH FINE', '', 'Disposables', 25, '', '', ''],
      ['Etchant Blue Tip', '3M', 'Restorative', 40, '', '', ''], ['Composite A2', 'Tetric N', 'Restorative', 120, '', '', ''], ['Gloves M', '', 'Disposables', 30, '', '', ''], ['Cotton rolls', '', 'Disposables', 12, '', '', ''], ['Sterilization pouches', '', 'Sterilization', 45, '', '', ''], ['Indicator tape', '', 'Sterilization', 20, '', '', '']
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
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(initScript);
  await ctx.addInitScript(overlayScript);
  const page = await ctx.newPage();
  // التقاط الإطارات بتوقيتها الحقيقي (تسجيل الفيديو المدمج ينحرف عن الوقت الفعلي فيتأخر الصوت)
  const FR = path.join(WORK, 'frames');
  fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', f => {
    const file = path.join(FR, 'f' + String(frames.length).padStart(6, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp * 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
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
  await scene('login', 'Sign in', async () => { await login('Sara', '1111'); });
  await scene('kinds', 'Three kinds of requests', async () => {
    await page.waitForSelector('[data-seg-name="reqKind"]');
    await wait(1500);
    for (const k of ['doctor', 'clinic', 'lab']) { await point('[data-seg-name="reqKind"][data-v="' + k + '"]'); await highlight('[data-seg-name="reqKind"][data-v="' + k + '"]', 3600); }
  });
  await scene('doctor', '1 · Doctor request', async () => {
    await click('[data-seg-name="reqKind"][data-v="doctor"]');
    await page.waitForSelector('#fDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await point('#fDoctor');
    await page.selectOption('#fDoctor', 'Dr. Khalid');
    await wait(600);
    await highlight('#fBranch', 1500);
  });
  await scene('type', '1 · Doctor request', async () => {
    await click('[data-seg-name="reqType"][data-v="شهري"]');
    await wait(400);
    await point('[data-seg-name="reqType"][data-v="طارئ"]');
  });
  async function addItem(q) {
    await type('#itemSearch', q);
    await page.waitForSelector('#comboList .combo-opt');
    await wait(400);
    await click('#comboList .combo-opt');
  }
  await scene('items', '1 · Doctor request', async () => { await addItem('prophy'); await addItem('floss'); await page.keyboard.press('Escape'); });
  await scene('qty', '1 · Doctor request', async () => {
    await click('.item-line:nth-child(1) [data-d="1"]');
    await click('.item-line:nth-child(1) [data-d="1"]');
    await click('.item-line:nth-child(2) [data-d="1"]');
  });
  const submit = async () => {
    await click('#submitBtn');
    const tt = await (await page.waitForSelector('.toast:last-child')).textContent();
    await wait(600);
    return (/REQ-[\d-]+/.exec(tt) || [''])[0];
  };
  let reqId = '';
  await scene('submit', '1 · Doctor request', async () => { await highlight('#sumBox', 1400); reqId = await submit(); });
  await scene('clinic', '2 · Clinic consumables', async () => {
    await click('[data-seg-name="reqKind"][data-v="clinic"]');
    await page.waitForSelector('#fClinic');
    await point('#fClinic');
    await page.selectOption('#fClinic', await page.$eval('#fClinic', el => [...el.options].find(o => /Dental Clinic 1/.test(o.textContent)).value));
    await wait(500);
    await addItem('gloves'); await addItem('cotton'); await page.keyboard.press('Escape');
    await click('.item-line:nth-child(1) [data-d="1"]');
  });
  await scene('clinicsend', '2 · Clinic consumables', async () => { await submit(); });
  await scene('steril', '3 · Sterilization', async () => {
    await page.waitForSelector('#fClinic');
    await point('#fClinic');
    await highlight('#fClinic', 1600);
    await page.selectOption('#fClinic', await page.$eval('#fClinic', el => [...el.options].find(o => /Sterilization/.test(o.textContent) && /Buraydah/.test(o.textContent)).value));
    await wait(500);
  });
  await scene('sterilsend', '3 · Sterilization', async () => {
    await highlight('#sterilNote', 1800);
    await addItem('pouches'); await page.keyboard.press('Escape');
    await click('.item-line:nth-child(1) [data-d="1"]');
    await submit();
  });
  await scene('mine', 'Follow your requests', async () => {
    await click('.sidebar [data-view="mine"]');
    await page.waitForSelector('#mineList .req');
    await highlight(`.req:has-text("${reqId}") .badge`, 2600);
    await highlight('#mineList .req:nth-child(2) .badge', 2000);
    await highlight('#mineList .req:nth-child(3) .badge', 2000);
  });
  await scene('detail', 'Follow your requests', async () => {
    await click(`.req:has-text("${reqId}") [data-act="detail"]`);
    await page.waitForSelector('.modal .stepper');
    await wait(1200);
    await page.evaluate(() => { const b = document.querySelector('.modal-body'); if (b) b.scrollTo({ top: 260, behavior: 'smooth' }); });
  });
  await scene('notify', 'Doctor approval', async () => {
    await page.evaluate(() => { const b = document.querySelector('.modal-body'); if (b) b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); });
    await wait(700);
    await type('#dComment', 'Dr. Khalid, please approve this request today.');
    await click('#dSend');
    await wait(900);
    await page.keyboard.press('Escape');
  });
  await scene('doctorpage', 'Doctor approval', async () => {
    await logout();
    await login('Dr. Khalid', '4444');
    await page.waitForSelector('#docList .req');
    await highlight(`#docList .req:has-text("${reqId}")`, 1500);
  });
  await scene('approve', 'Doctor approval', async () => {
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
  await scene('sent', 'Receive the shipment', async () => {
    await logout();
    await login('Sara', '1111');
    await wait(400);
    if (await page.isVisible('.alert.info')) await highlight('.alert.info', 1200);
    await click('.sidebar [data-view="mine"]');
    await page.waitForSelector(`.req:has-text("${reqId}") [data-act="receive"]`);
    await highlight(`.req:has-text("${reqId}") .badge`, 1200);
  });
  await scene('receive', 'Receive the shipment', async () => {
    await click(`.req:has-text("${reqId}") [data-act="receive"]`);
    await page.waitForSelector('.rq');
    await wait(600);
    await point('.rq >> nth=0');
    await highlight('.rq', 900);
  });
  await scene('sign', 'Receive the shipment', async () => {
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
    await wait(900);
  });
  await scene('labform', '4 · Send to lab', async () => {
    await click('.sidebar [data-view="new"]');
    await click('[data-seg-name="reqKind"][data-v="lab"]');
    await page.waitForSelector('#lDoctor option[value="Dr. Khalid"]', { state: 'attached' });
    await point('#lDoctor');
    await page.selectOption('#lDoctor', 'Dr. Khalid');
    await wait(400);
    await type('#lFile', '10245');
    await highlight('#lScan', 1400);
  });
  await scene('labwork', '4 · Send to lab', async () => {
    const L = '#lLines .lab-line:nth-child(1) ';
    await point(L + '[data-k="lab"]');
    await page.selectOption(L + '[data-k="lab"]', 'Internal Lab');
    await wait(400);
    await point(L + '[data-k="workType"]');
    await page.selectOption(L + '[data-k="workType"]', 'Crown');
    await wait(400);
    await type(L + '[data-k="details"]', 'Tooth 16, shade A2');
    await point(L + '.lab-line-photo-btn');
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.setInputFiles(L + '[data-line-photo]', { name: 'tooth.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector(L + '.lab-photo img').catch(() => {});
    await wait(500);
    await highlight('#lDue', 1800);
  });
  let caseId = '';
  await scene('labsend', '4 · Send to lab', async () => {
    await click('#lSubmit');
    await page.waitForSelector('#labList .lab-card');
    caseId = (await page.textContent('#labList .lab-card .req-id')).trim();
    await highlight('#labList .lab-card', 1600);
  });
  // المعمل ينجز العمل ويرسله للعيادة (في الخلفية)
  await page.evaluate(id => {
    const tk = __api(null, 'login', ['Lab Tech', '8888']).token;
    __api(tk, 'updateLabItems', [[id + '-1'], 'start', {}]);
    __api(tk, 'updateLabItems', [[id + '-1'], 'ready', {}]);
    __api(tk, 'updateLabItems', [[id + '-1'], 'send', {}]);
  }, caseId);
  await scene('labback', '4 · Send to lab', async () => {
    await click('.sidebar [data-view="new"]');
    await click('.sidebar [data-view="labmine"]');
    await page.waitForSelector('#labList [data-act="labConfirm"]');
    await highlight('#labList [data-act="labConfirm"]', 1400);
    await click('#labList [data-act="labConfirm"]');
    await wait(900);
  });
  await scene('done', '', async () => {
    await click('.sidebar [data-view="mine"]');
    await wait(900);
    await point('#mineList .req [data-act="complaint"]');
  });
  await page.evaluate(() => { document.getElementById('tvCap').textContent = ''; });
  await wait(800);
  const tEnd = Date.now();
  await cdp.send('Page.stopScreencast').catch(() => {});
  await ctx.close();
  // الإطارات + مدة كل إطار حتى التالي (بالوقت الحقيقي) ← فيديو بالتوقيت الصحيح
  const base = Math.min(t0, frames.length ? frames[0].t : t0);
  marks.forEach(m => { m.at = m.at + (t0 - base) / 1000; });
  const total = (tEnd - base) / 1000;
  const list = frames.map((fr, i) => "file '" + fr.file + "'\nduration " + (((i + 1 < frames.length ? frames[i + 1].t : tEnd) - fr.t) / 1000).toFixed(3)).join('\n') +
    "\nfile '" + frames[frames.length - 1].file + "'\n";
  const listFile = path.join(WORK, 'frames.txt');
  fs.writeFileSync(listFile, list);
  const vpath = listFile;
  await browser.close();

  /* ---------- الدمج: الفيديو + الصوت في مواضعه → MP4 ---------- */
  const keys = marks.map(m => m.key);
  // الإطار الأول يبدأ عند (أول إطار − البداية)؛ نملأ الفجوة بتأخير بسيط إن وُجدت
  const lead = frames.length ? Math.max(0, (frames[0].t - base) / 1000) : 0;
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', vpath];
  keys.forEach(k => args.push('-i', voice[k].file));
  const delays = marks.map((m, i) => '[' + (i + 1) + ':a]adelay=' + Math.round(m.at * 1000) + '|' + Math.round(m.at * 1000) + '[a' + i + ']').join(';');
  const mix = delays + ';' + marks.map((m, i) => '[a' + i + ']').join('') + 'amix=inputs=' + marks.length + ':normalize=0[aout]';
  const mp4 = path.join(OUT, 'masar-nurse-tutorial-en.mp4');
  args.push('-filter_complex', '[0:v]tpad=start_duration=' + lead.toFixed(3) + ':start_mode=clone,fps=25,scale=' + W + ':' + H + ',format=yuv420p[vout];' + mix, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-t', String(Math.ceil(total)), '-movflags', '+faststart', mp4);
  execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  // ملف ترجمة SRT (للمنصات التي تعرض الترجمة)
  const ts = s => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), sec = Math.floor(ms % 6e4 / 1000); return [h, m, sec].map(x => String(x).padStart(2, '0')).join(':') + ',' + String(ms % 1000).padStart(3, '0'); };
  fs.writeFileSync(path.join(OUT, 'masar-nurse-tutorial-en.srt'), marks.map((m, i) => (i + 1) + '\n' + ts(m.at) + ' --> ' + ts(m.at + voice[m.key].dur) + '\n' + voice[m.key].text + '\n').join('\n'));
  console.log('video:', mp4, '(' + Math.round(total) + ' s)');
})().catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
