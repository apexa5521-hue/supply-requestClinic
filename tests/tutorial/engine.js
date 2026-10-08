/* محرك الفيديوهات التعليمية: يسجّل التطبيق الحقيقي (بيانات تجريبية بالإنجليزية) بمؤشر ظاهر،
   صوت شرح إنجليزي طبيعي (Edge — Ava)، ومزامنة دقيقة (إطارات CDP بتوقيتها)، وترجمة في شريط أسفل الصفحة
   لكل لغة مطلوبة (ar / ur / id / bn / hi) → MP4 لكل لغة + ملفات SRT.
   يحتاج: pip install edge-tts imageio-ffmpeg (gTTS احتياطي) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..', '..');
const OUT_ROOT = process.env.TUTORIAL_OUT || path.join(ROOT, 'tutorials');
const CACHE = path.join(OUT_ROOT, '.work');
const FFMPEG = execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const VOICES = { en: process.env.TUTORIAL_VOICE || 'en-US-AvaNeural', ar: process.env.TUTORIAL_VOICE_AR || 'ar-SA-HamedNeural' };
const W = 1280, H = 720, STRIP = 120, VH = H + STRIP;

const LANGS = {
  ar: { name: 'Arabic', font: 'Noto Naskh Arabic', file: 'NotoNaskhArabic.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf', size: 44, rtl: true },
  ur: { name: 'Urdu', font: 'Noto Nastaliq Urdu', file: 'NotoNastaliqUrdu.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notonastaliqurdu/NotoNastaliqUrdu%5Bwght%5D.ttf', size: 58, rtl: true },
  id: { name: 'Indonesian', font: 'DejaVu Sans', size: 25 },
  bn: { name: 'Bengali', font: 'Noto Sans Bengali', file: 'NotoSansBengali.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansbengali/NotoSansBengali%5Bwdth%2Cwght%5D.ttf', size: 34 },
  hi: { name: 'Hindi', font: 'Noto Sans Devanagari', file: 'NotoSansDevanagari.ttf', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf', size: 34 },
  en: { name: 'English', font: 'DejaVu Sans', size: 25 }
};

function durationOf(file) {
  let txt = '';
  try { execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { txt = String(e.stderr || ''); }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(txt);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 4;
}
function tts(text, lang) {
  lang = lang || 'en';
  const VOICE = VOICES[lang];
  fs.mkdirSync(path.join(CACHE, 'voice'), { recursive: true });
  const f = path.join(CACHE, 'voice', crypto.createHash('md5').update(VOICE + '|' + text).digest('hex').slice(0, 16) + '.mp3');
  if (!fs.existsSync(f) || !fs.statSync(f).size) {
    try { execFileSync('python3', [path.join(__dirname, '..', 'tts-edge.py'), text, VOICE, f, '+4%'], { stdio: ['ignore', 'ignore', 'pipe'] }); if (!fs.statSync(f).size) throw new Error('empty'); }
    catch (e) { console.log('edge-tts unavailable, using gTTS'); execFileSync('python3', ['-c', 'import sys;from gtts import gTTS;gTTS(sys.argv[1],lang=sys.argv[3]).save(sys.argv[2])', text, f, lang]); }
  }
  return { file: f, dur: durationOf(f) };
}
function fontsDir() {
  const d = path.join(CACHE, 'fonts');
  fs.mkdirSync(d, { recursive: true });
  Object.values(LANGS).forEach(l => {
    if (!l.file) return;
    const f = path.join(d, l.file);
    if (!fs.existsSync(f)) execFileSync('curl', ['-sSfL', '-o', f, l.url]);
  });
  // DejaVu للاتيني
  const dv = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  if (fs.existsSync(dv) && !fs.existsSync(path.join(d, 'DejaVuSans.ttf'))) fs.copyFileSync(dv, path.join(d, 'DejaVuSans.ttf'));
  return d;
}

/* ---------- بيانات تجريبية بالإنجليزية لكل الأدوار + سجل تاريخي للوحات ---------- */
function seedScript(cfg) {
  cfg = cfg || {};
  return [
    fs.readFileSync(path.join(ROOT, 'tests', 'gas-mock.js'), 'utf8'),
    `(function () {
    const gas = GasMock.createGas();
    const D = 864e5, Hr = 36e5, now = Date.now();
    gas.seed('Roles', ['RoleName', 'Screen'], [['Nurse', 'nurse'], ['Procurement', 'procurement'], ['Doctor', 'doctor'], ['Lab', 'lab'], ['Quality', 'quality'], ['Executive', 'executive'], ['Finance', 'finance'], ['Branch manager', 'branch'], ['Admin', 'admin']]);
    gas.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email', 'PasswordChangedAt', 'DoctorName', 'Department', 'Branch', 'PriceView'], [
      ['Sara', '1111', 'Nurse', 'Dental Clinic 1', 'sara@example.com', '', '', '', ''],
      ['Mona', '1212', 'Nurse', 'Dental Clinic 2', 'mona@example.com', '', '', '', ''],
      ['Huda', '1313', 'Nurse', 'Derma Clinic 1', 'huda@example.com', '', '', '', ''],
      // في فيديوهات بلا أسعار لا أحد يرى الأسعار (ولا الطبيب الذي تفتح الممرضة صفحته)
      ['Dr. Khalid', '4444', 'Doctor', '', 'khalid@example.com', '', 'Dr. Khalid', '', '', ${cfg.noMoney ? "''" : "'يرى الأسعار'"}],
      ['Dr. Saad', '4545', 'Doctor', '', 'saad@example.com', '', 'Dr. Saad', '', ''],
      ['Dr. Lama', '4646', 'Doctor', '', 'lama@example.com', '', 'Dr. Lama', 'جلدية', ''],
      ['Ali', '3333', 'Procurement', '', 'ali@example.com', '', '', 'أسنان', ''],
      ['Omar', '3434', 'Procurement', '', 'omar@example.com', '', '', 'جلدية', ''],
      ['Lab Tech', '8888', 'Lab', '', 'lab@example.com', '', '', '', ''],
      ['Noor', '5555', 'Quality', '', 'noor@example.com', '', '', '', ''],
      ['Faisal', '6666', 'Executive', '', 'faisal@example.com', '', '', '', ''],
      ['Nawaf', '7777', 'Branch manager', '', 'nawaf@example.com', '', '', '', 'Buraydah'],
      ['Hessa', '2222', 'Finance', '', 'hessa@example.com', '', '', '', ''],
      ['Admin', '9999', 'Admin', '', '', '', '', '', '']
    ]);
    // الاستبيان مفتوح في العرض (في النظام الحقيقي أول دورة بعد 50 يوماً من التحديث)
    gas.seed('Settings', ['Key', 'Value', 'Notes'], [['SurveyStart', new Date(now - 3 * D).toISOString().slice(0, 10), '']]);
    gas.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [['Sterilization', 'Buraydah', 'Sterilization'], ['Sterilization', 'Unayzah', 'Sterilization'],
      ['Dental Clinic 1', 'Buraydah', 'Dentistry'], ['Derma Clinic 1', 'Buraydah', 'Dermatology'], ['Dental Clinic 2', 'Unayzah', 'Dentistry']]);
    gas.seed('Doctors', ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty', 'Billing'], [['Dr. Khalid', 'Dental Clinic 1', 'Sara', 'Orthodontics', 'عيادة'], ['Dr. Noura', 'Dental Clinic 1', 'Sara', '', ''],
      ['Dr. Lama', 'Derma Clinic 1', 'Huda', 'Laser', ''], ['Dr. Saad', 'Dental Clinic 2', 'Mona', '', '']]);
    gas.seed('Labs', ['LabName', 'Type', 'Email', 'Phone', 'Active', 'TurnaroundDays'], [['Internal Lab', 'داخلي', 'lab@example.com', '', 'نعم', 7], ['Elite Dental Lab', 'خارجي', 'elite@example.com', '', 'نعم', 10]]);
    gas.seed('LabWorkTypes', ['WorkType'], [['Crown'], ['Bridge'], ['Denture'], ['Night guard']]);
    gas.seed('LabMaterials', ['Material'], [['Zirconia'], ['Emax'], ['Acrylic']]);
    gas.seed('ItemsCatalog', ['ItemName', 'CommercialName', 'Category', 'Price', 'Ownership', 'Serialized', 'Department'], [
      ['PROPHY PASTE', 'Nupro', 'Hygiene', 60, '', '', 'أسنان'], ['DENTAL FLOSS', 'Oral-B', 'Hygiene', 15, '', '', 'أسنان'], ['MICRO BRUSH FINE', '', 'Disposables', 25, '', '', 'أسنان'],
      ['Etchant Blue Tip', '3M', 'Restorative', 40, '', '', 'أسنان'], ['Composite A2', 'Tetric N', 'Restorative', 120, '', '', 'أسنان'],
      ['Hyaluronic filler 1ml', 'Juvederm', 'Injectables', 450, '', '', 'جلدية'], ['Numbing cream', 'EMLA', 'Topicals', 35, '', '', 'جلدية'],
      ['Gloves M', '', 'Disposables', 30, '', '', ''], ['Cotton rolls', '', 'Disposables', 12, '', '', ''], ['Sterilization pouches', '', 'Sterilization', 45, '', '', ''], ['Indicator tape', '', 'Sterilization', 20, '', '', ''],
      ['Handpiece Low Speed', 'NSK', 'Tools', 1500, 'عهدة', 'نعم', 'أسنان'], ['Curing Light', 'Woodpecker', 'Tools', 900, 'عهدة', '', 'أسنان']
    ]);
    // سجل 5 أشهر + طلبات مفتوحة بمراحل مختلفة
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const C = [['Dental Clinic 1', 'Dr. Khalid', 'Sara', 'Buraydah', ['PROPHY PASTE', 'DENTAL FLOSS', 'Composite A2', 'Gloves M']],
      ['Dental Clinic 2', 'Dr. Saad', 'Mona', 'Unayzah', ['MICRO BRUSH FINE', 'Etchant Blue Tip', 'Cotton rolls']],
      ['Derma Clinic 1', 'Dr. Lama', 'Huda', 'Buraydah', ['Hyaluronic filler 1ml', 'Numbing cream', 'Gloves M']]];
    const reqs = [], ri = [];
    const add = (id, c, sub, st, emerg, opts) => {
      opts = opts || {};
      const prep = new Date(+sub + (3 + rnd() * 20) * Hr), rev = new Date(+sub + 2 * Hr), revd = new Date(+rev + (1 + rnd() * 10) * Hr);
      const sent = new Date(+revd + (6 + rnd() * (emerg ? 8 : 40)) * Hr), recv = new Date(+sent + (4 + rnd() * 24) * Hr);
      const isSent = st === 'تم الإرسال' || st === 'تم الاستلام', isRecv = st === 'تم الاستلام', approved = st !== 'مراجعة الطبيب';
      reqs.push([id, sub, c[0], c[1], c[2], emerg ? 'طارئ' : 'شهري', st, sub, isSent ? sent : '', isRecv ? recv : '', isRecv ? c[2] : '', '',
        st === 'قيد التجهيز' || isSent ? prep : '', '', '', rev, approved ? revd : '', '', '', c[3], approved ? revd : '', '', '']);
      c[4].slice(0, 2 + (reqs.length % 2)).forEach((it, k) => { const q = 2 + ((reqs.length + k) % 6); ri.push([id, it, q, q, isRecv ? q - (opts.short && k === 0 ? 1 : 0) : '', isSent ? sent : '', isSent ? 1 : '']); });
    };
    for (let i = 0; i < 30; i++) add('REQ-H' + String(i + 1).padStart(3, '0'), C[i % 3], new Date(now - (150 - i * 4.6) * D), 'تم الاستلام', i % 6 === 0, { short: i % 7 === 0 });
    add('REQ-260920-011', C[1], new Date(now - 12 * D), 'تم الإرسال', false);
    add('REQ-260925-014', C[0], new Date(now - 7 * D), 'قيد التجهيز', false);
    add('REQ-260927-016', C[1], new Date(now - 5 * D), 'معتمد من الطبيب', false);
    add('REQ-261001-021', C[2], new Date(now - 2 * D), 'معتمد من الطبيب', true);
    add('REQ-261002-024', C[0], new Date(now - 1.2 * D), 'مراجعة الطبيب', false);
    add('REQ-260801-007', C[1], new Date(now - 60 * D), 'تم الإرسال', true);
    gas.seed('Requests', ['RequestID','Date','Clinic','Doctor','Nurse','Type','Status','SubmittedAt','SentAt','ReceivedAt','ReceiverName','SignatureURL','PrepAt','VendorWaitAt','VendorReceivedAt','ReviewAt','ReviewedAt','RejectionReason','ReceiptURL','Branch','ApprovedAt','ClientKey','Department'], reqs);
    gas.seed('RequestItems', ['RequestID','ItemName','RequestedQty','ApprovedQty','ReceivedQty','DispatchedAt','DispatchBatch'], ri);
    gas.seed('Comments', ['Timestamp','RequestID','Author','Role','Message'], [[new Date(now - 30 * Hr), 'REQ-260925-014', 'Ali', 'Procurement', 'Preparing now — composite comes tomorrow']]);
    gas.seed('Complaints', ['ComplaintID','Timestamp','RequestID','Author','Role','Type','Message','Resolved','ResolvedBy','ResolvedAt'], [
      ['CMP-1', new Date(now - 26 * Hr), 'REQ-260801-007', 'Mona', 'Nurse', 'تأخير', 'Emergency request still not received', false, '', ''],
      ['CMP-2', new Date(now - 9 * D), 'REQ-H028', 'Sara', 'Nurse', 'نقص', 'One box of prophy paste was missing', true, 'Noor', new Date(now - 8 * D)]]);
    gas.seed('Notices', ['Timestamp','FromRole','FromName','ToRole','Message'], [[new Date(now - 20 * Hr), 'Quality', 'Noor', 'الكل', 'Reminder: monthly requests are submitted between the 15th and the 20th']]);
    const g = globalThis;
    Object.assign(g, gas.globals);
    g.__gas = gas;
    (function () {
      ${fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8')}
      // بيانات العرض بأسماء عيادات ثابتة: لا ترحيل للقائمة الرسمية ولا أدوات TEST101
      migrateClinics_ = function () {}; seedDemoAssets_ = function () {}; ensureUnayzahClinics_ = function () {};
      g.__api = api;
    })();
    // إرساليات معمل وعهدة وبوكسات عبر واجهة النظام نفسها
    try {
      const T = (n, p) => g.__api(null, 'login', [n, p]).token;
      const sara = T('Sara', '1111'), mona = T('Mona', '1212'), lab = T('Lab Tech', '8888'), ali = T('Ali', '3333');
      const scan = d => new Date(now - d * D).toISOString().slice(0, 10);
      const c1 = g.__api(sara, 'createLabCase', [{ doctor: 'Dr. Khalid', fileNo: '20117', scanDate: scan(9), lines: [{ lab: 'Internal Lab', workType: 'Crown', details: 'Tooth 26, A3' }] }]).id;
      const c2 = g.__api(mona, 'createLabCase', [{ doctor: 'Dr. Saad', fileNo: '30452', scanDate: scan(4), lines: [{ lab: 'Elite Dental Lab', workType: 'Bridge', details: '14-16, A2' }, { lab: 'Internal Lab', workType: 'Night guard', details: 'Upper' }] }]).id;
      const c3 = g.__api(sara, 'createLabCase', [{ doctor: 'Dr. Noura', fileNo: '20563', scanDate: scan(14), lines: [{ lab: 'Internal Lab', workType: 'Denture', details: 'Lower complete' }] }]).id;
      g.__api(lab, 'updateLabItems', [[c1 + '-1'], 'start', {}]);
      g.__api(lab, 'updateLabItems', [[c3 + '-1'], 'ready', {}]); g.__api(lab, 'updateLabItems', [[c3 + '-1'], 'send', {}]);
      g.__api(ali, 'setClinicStandard', ['Dental Clinic 1', 'Handpiece Low Speed', 4]);
      g.__api(ali, 'setClinicStandard', ['Dental Clinic 2', 'Handpiece Low Speed', 3]);
      g.__api(ali, 'issueAssets', [{ clinic: 'Dental Clinic 1', item: 'Handpiece Low Speed', serials: ['NSK-1001', 'NSK-1002', 'NSK-1003'] }]);
      g.__api(ali, 'issueAssets', [{ clinic: 'Dental Clinic 2', item: 'Handpiece Low Speed', serials: ['NSK-2001', 'NSK-2002', 'NSK-2003'] }]);
      g.__api(ali, 'issueAssets', [{ clinic: 'Dental Clinic 1', item: 'Curing Light', qty: 1 }]);
      g.__api(ali, 'addBox', ['Dr. Khalid']); g.__api(ali, 'addBox', ['Dr. Saad']); g.__api(ali, 'addBox', ['Dr. Lama']);
      // حالة iTero لمعمل خارجي (تظهر للمعمل «للعلم فقط»)
      g.__api(sara, 'createLabCase', [{ itero: '77120', lab: 'Elite Dental Lab', doctor: 'Dr. Khalid', fileNo: '20990', scanDate: scan(1) }]);
      // إجابات استبيان الأطباء (إلا الطبيب الذي يُعرض له الاستبيان في الفيديو)
      const svAns = [[4, 5, 4, 5, 4, 3, 4, 5, 4, 4, 5, 9, 'Box sometimes arrives late on Thursdays', 'Add a shipment ETA'], [5, 4, 5, 5, 3, 4, 4, 4, 3, 5, 4, 8, '', 'Great tracking'], [4, 4, 4, 5, 5, 4, 5, 4, 4, 4, 4, 10, '', '']];
      [['Dr. Saad', '4545'], ['Dr. Lama', '4646'], ['Dr. Khalid', '4444']].forEach(([n, pw], i) => {
        if (${JSON.stringify(cfg.surveyFor || '')} === n) return;
        const tk = T(n, pw), sv = g.__api(tk, 'getMySurvey', []);
        if (!sv.open || sv.done) return;
        const a = {}; sv.questions.forEach((q, k) => { a[q.id] = svAns[i][k]; });
        g.__api(tk, 'submitSurvey', [a]);
      });
      g.__api(null, 'logout', []);
    } catch (e) { console.error('demo seed', e); }
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
  })();`].join('\n');
}

const overlayScript = `
  window.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '#tvCursor{position:fixed;z-index:2147483647;left:0;top:0;width:26px;height:26px;pointer-events:none;transition:transform .75s cubic-bezier(.4,.1,.2,1);transform:translate(640px,360px)}' +
      '#tvCursor svg{width:26px;height:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}' +
      '.tvRipple{position:fixed;z-index:2147483646;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(59,130,246,.35);border:2px solid rgba(59,130,246,.9);pointer-events:none;animation:tvR .6s ease-out forwards}' +
      '@keyframes tvR{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}' +
      '.tvHi{outline:3px solid rgba(37,99,235,.9)!important;outline-offset:3px;border-radius:10px;transition:outline .2s}';
    document.head.appendChild(st);
    const c = document.createElement('div'); c.id = 'tvCursor';
    c.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  });`;

/**
 * cfg = { id, langs: ['ar', ...], scenes: { key: { en, ar, ur, id } }, steps: { key: { en, ar, ... } }, flow: async (h) => {} }
 */
/* كلمات المال (الأسعار، القيمة، التكلفة، على حساب من) — ممنوعة في فيديو noMoney: في الصوت والترجمة وعلى الشاشة */
const MONEY_RE = /\bSAR\b|ر\.س|\bprices?\b|\bpriced\b|\bcosts?\b|\bvalue\b|est\.? total|\bestimated\b|grand total|request total|الإجمالي التقديري|إجمالي الطلب|\btotal \(|\bbill(ed|ing)\b|\bcharged?\b|\bspend\b|\bcompany\b|سعر|أسعار|تكلفة|قيمة|ريال|على الشركة|حساب الشركة|يتحمل|تُحسب على|يُحسب على|يحسب على/i;
async function makeTutorial(cfg) {
  if (cfg.noMoney) {
    const bad = [];
    Object.keys(cfg.scenes).forEach(k => Object.keys(cfg.scenes[k]).forEach(l => { if (MONEY_RE.test(cfg.scenes[k][l])) bad.push(k + '/' + l); }));
    Object.keys(cfg.steps || {}).forEach(k => Object.keys(cfg.steps[k]).forEach(l => { if (MONEY_RE.test(cfg.steps[k][l])) bad.push('step ' + k + '/' + l); }));
    if (bad.length) throw new Error('money words in the narration of a no-price video: ' + bad.join(', '));
  }
  const OUT = path.join(OUT_ROOT, cfg.id);
  const WORK = path.join(CACHE, cfg.id);
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });
  const voice = {};
  // صوت الشرح: إنجليزي (افتراضي) أو عربي (voiceLang: 'ar')
  const VL = cfg.voiceLang || 'en';
  Object.keys(cfg.scenes).forEach(k => { const tx = cfg.scenes[k][VL]; if (!tx) throw new Error('no ' + VL + ' narration for scene ' + k); voice[k] = Object.assign({ text: tx }, tts(tx, VL)); });
  console.log('[' + cfg.id + '] voice-over:', Object.keys(voice).length, 'clips,', Math.round(Object.values(voice).reduce((a, v) => a + v.dur, 0)), 's');

  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(seedScript(cfg));
  await ctx.addInitScript(overlayScript);
  const page = await ctx.newPage();
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
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /demo seed/.test(m.text())) console.log('[' + cfg.id + '] ' + m.text()); });
  await page.goto('http://masar.demo/');
  await page.waitForSelector('#loginView:not(.hidden)');
  await page.waitForTimeout(600);
  // فيديو بلا أسعار (كل الأدوار عدا المالية والتنفيذي والجودة): لا سعر ولا قيمة ولا تكلفة ولا «على حساب فلان».
  // 1) أي عنصر يعرضها يُخفى تلقائياً (وعمودها كاملاً في الجداول)  2) وإن ظهر شيء رغم ذلك ولو لحظة يفشل التسجيل
  if (cfg.noMoney) await page.evaluate(src => {
    const re = new RegExp(src, 'i');
    window.__money = [];
    const SEL = '.mt,.rp-tile,.kpi,.field,.sum-row,.meta-grid > div,label,li,.tag,.badge,.chip,.hint,dt,dd,th,td,tr,.card-head,section.card';
    const hideEl = el => {
      if (!el || el.dataset.tvHidden) return;
      el.dataset.tvHidden = '1';
      if (el.tagName === 'TH' && el.closest('table')) {
        const i = el.cellIndex;
        el.closest('table').querySelectorAll('tr').forEach(tr => { const c = tr.cells[i]; if (c) c.style.setProperty('display', 'none', 'important'); });
        return;
      }
      (el.classList.contains('card-head') ? el.closest('section.card') || el : el).style.setProperty('display', 'none', 'important');
    };
    const scan = root => {
      const w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!re.test(n.nodeValue) || !n.parentElement || n.parentElement.closest('#tvCursor')) continue;
        hideEl(n.parentElement.closest(SEL) || n.parentElement);
      }
      document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(i => { if (re.test(i.placeholder)) hideEl(i.closest(SEL) || i); });
    };
    scan();
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(nd => { if (nd.nodeType === 1) scan(nd); else if (nd.nodeType === 3 && nd.parentElement) scan(nd.parentElement); }))).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(() => {
      const txt = document.body.innerText || '';
      const m = re.exec(txt);
      if (m && window.__money.length < 20) window.__money.push(txt.slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, ' '));
    }, 250);
  }, MONEY_RE.source);

  const wait = ms => page.waitForTimeout(ms);
  const marks = [];
  const h = { page, wait };
  h.scene = async (key, step, fn) => {
    const v = voice[key];
    if (!v) throw new Error('no scene ' + key);
    const start = Date.now();
    marks.push({ key, step: step || '', at: (start - t0) / 1000 });
    await fn();
    const left = v.dur * 1000 + 450 - (Date.now() - start);
    if (left > 0) await wait(left);
  };
  h.point = async (sel, opts) => {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox();
    if (!b) return { el, x: 640, y: 360 };
    const x = b.x + Math.min(b.width / 2, (opts && opts.dx) || b.width / 2), y = b.y + b.height / 2;
    await page.evaluate(([x, y]) => { document.getElementById('tvCursor').style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; }, [x, y]);
    await wait(800);
    return { el, x, y };
  };
  h.click = async (sel, opts) => {
    const p = await h.point(sel, opts);
    await page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = 'tvRipple'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, [p.x, p.y]);
    await page.locator(sel).first().click();
    await wait(350);
  };
  h.type = async (sel, text) => { await h.click(sel); await page.locator(sel).first().fill(''); await page.locator(sel).first().pressSequentially(text, { delay: 80 }); };
  h.select = async (sel, valueOrFn) => {
    await h.point(sel);
    const v = typeof valueOrFn === 'function' ? await page.$eval(sel, valueOrFn) : valueOrFn;
    await page.selectOption(sel, v);
    await wait(500);
  };
  h.highlight = async (sel, ms) => {
    const el = page.locator(sel).first();
    if (!(await el.count())) { await wait(ms || 1200); return; }
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.evaluate(e => e.classList.add('tvHi')).catch(() => {});
    await wait(ms || 1200);
    await el.evaluate(e => e.classList.remove('tvHi')).catch(() => {});
  };
  h.scroll = async (top, sel) => { await page.evaluate(([t, s]) => { const el = s ? document.querySelector(s) : null; (el || window).scrollTo({ top: t, behavior: 'smooth' }); }, [top, sel || '']); await wait(700); };
  h.nav = async view => { await h.click('.sidebar [data-view="' + view + '"]'); await wait(900); };
  h.logout = async () => { await page.click('.sidebar [data-act="logout"]'); await page.waitForSelector('#loginView:not(.hidden)'); };
  h.login = async (name, pass) => {
    await h.type('#loginName', name);
    await h.type('#loginPass', pass);
    await h.click('#loginBtn');
    await page.waitForSelector('#appShell:not(.hidden)');
    await wait(800);
  };
  h.api = (fn, args, user) => page.evaluate(([fn, args, user]) => { const tk = __api(null, 'login', user).token; return __api(tk, fn, args); }, [fn, args, user]);
  h.png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  h.sign = async () => {
    const pad = await page.$('#sigPad');
    await pad.scrollIntoViewIfNeeded();
    const bb = await pad.boundingBox();
    await page.evaluate(([x, y]) => { document.getElementById('tvCursor').style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, [bb.x + 40, bb.y + 100]);
    await wait(800);
    await page.mouse.move(bb.x + 40, bb.y + 100); await page.mouse.down();
    for (let i = 0; i <= 30; i++) {
      const x = bb.x + 40 + i * 11, y = bb.y + 85 + Math.sin(i / 2.6) * 34;
      await page.mouse.move(x, y);
      await page.evaluate(([x, y]) => { const c = document.getElementById('tvCursor'); c.style.transition = 'none'; c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, [x, y]);
      await wait(25);
    }
    await page.mouse.up();
    await page.evaluate(() => { document.getElementById('tvCursor').style.transition = ''; });
  };

  try { await cfg.flow(h); }
  catch (e) { await page.screenshot({ path: path.join(WORK, 'fail.png') }); throw e; }
  await wait(900);
  if (cfg.noMoney) {
    const hits = await page.evaluate(() => window.__money || []);
    if (hits.length) { await browser.close(); throw new Error('money shown in a no-price video: ' + Array.from(new Set(hits)).slice(0, 5).join(' || ')); }
  }
  const tEnd = Date.now();
  await cdp.send('Page.stopScreencast').catch(() => {});
  await ctx.close(); await browser.close();
  if (errors.length) console.log('[' + cfg.id + '] page errors:', errors.slice(0, 3).join(' | '));

  /* ---------- تجميع: إطارات بتوقيتها + صوت في مواضعه ---------- */
  const base = Math.min(t0, frames.length ? frames[0].t : t0);
  marks.forEach(m => { m.at += (t0 - base) / 1000; });
  const total = (tEnd - base) / 1000;
  const list = frames.map((fr, i) => "file '" + fr.file + "'\nduration " + (((i + 1 < frames.length ? frames[i + 1].t : tEnd) - fr.t) / 1000).toFixed(3)).join('\n') + "\nfile '" + frames[frames.length - 1].file + "'\n";
  fs.writeFileSync(path.join(WORK, 'frames.txt'), list);
  const lead = Math.max(0, (frames[0].t - base) / 1000);
  // الصوت مرة واحدة (m4a) ثم يُدمج مع كل نسخة لغة
  const audio = path.join(WORK, 'voice.m4a');
  {
    const a = ['-y'];
    marks.forEach(m => a.push('-i', voice[m.key].file));
    const f = marks.map((m, i) => '[' + i + ':a]adelay=' + Math.round(m.at * 1000) + '|' + Math.round(m.at * 1000) + '[a' + i + ']').join(';') + ';' +
      marks.map((m, i) => '[a' + i + ']').join('') + 'amix=inputs=' + marks.length + ':normalize=0,apad[aout]';
    a.push('-filter_complex', f, '-map', '[aout]', '-t', total.toFixed(2), '-c:a', 'aac', '-b:a', '128k', audio);
    execFileSync(FFMPEG, a, { stdio: ['ignore', 'ignore', 'pipe'] });
  }
  // مقاطع قصيرة متزامنة مع الصوت (الجملة الطويلة تُقسم بنسبة طولها)
  function chunks(text, lang) {
    const max = lang === 'ur' ? 90 : 115;
    const sent = (text.match(/[^.!?:؟۔]+[.!?:؟۔]?/g) || [text]).map(x => x.trim()).filter(Boolean);
    const out = [];
    sent.forEach(x => {
      if (out.length && (out[out.length - 1] + ' ' + x).length <= max) out[out.length - 1] += ' ' + x;
      else if (x.length <= max) out.push(x);
      else { let cur = ''; x.split(' ').forEach(z => { if ((cur + ' ' + z).trim().length > max - 10) { out.push(cur.trim()); cur = z; } else cur += ' ' + z; }); if (cur.trim()) out.push(cur.trim()); }
    });
    return out;
  }
  const v0 = k => voice[k].text;
  function cues(lang) {
    const out = [];
    marks.forEach(m => {
      const s = cfg.scenes[m.key], text = s[lang] || s.en || v0(m.key), v = voice[m.key];
      const parts = chunks(text, lang), tot = parts.reduce((a, x) => a + x.length, 0);
      let t = m.at;
      const stp = m.step && cfg.steps && cfg.steps[m.step] ? (cfg.steps[m.step][lang] || cfg.steps[m.step].en || cfg.steps[m.step][VL] || '') : '';
      parts.forEach(x => { const d = v.dur * x.length / tot; out.push({ a: t, b: t + d, text: x, step: stp }); t += d; });
    });
    return out;
  }
  const ts = s => { const ms = Math.round(s * 1000); return [Math.floor(ms / 36e5), Math.floor(ms % 36e5 / 6e4), Math.floor(ms % 6e4 / 1000)].map(x => String(x).padStart(2, '0')).join(':') + ',' + String(ms % 1000).padStart(3, '0'); };
  const assT = s => { const cs = Math.round(s * 100); return Math.floor(cs / 360000) + ':' + String(Math.floor(cs % 360000 / 6000)).padStart(2, '0') + ':' + String(Math.floor(cs % 6000 / 100)).padStart(2, '0') + '.' + String(cs % 100).padStart(2, '0'); };
  const FONTS = fontsDir();
  if (VL === 'en') fs.writeFileSync(path.join(OUT, cfg.id + '-en.srt'), cues('en').map((c, i) => (i + 1) + '\n' + ts(c.a) + ' --> ' + ts(c.b) + '\n' + c.text + '\n').join('\n'));
  const made = [];
  for (const lang of cfg.langs) {
    const L = LANGS[lang];
    const cs = cues(lang);
    fs.writeFileSync(path.join(OUT, cfg.id + '-' + lang + '.srt'), cs.map((c, i) => (i + 1) + '\n' + ts(c.a) + ' --> ' + ts(c.b) + '\n' + c.text + '\n').join('\n'));
    // الشريط: الترجمة في الوسط، واسم الخطوة على الجانب (يمين للعربي/الأردو)
    const capX = Math.round(W / 2), stepX = L.rtl ? W - 28 : 28, stepAn = L.rtl ? 6 : 4;
    const ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: ' + W, 'PlayResY: ' + VH, 'WrapStyle: 0', '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Cap,' + L.font + ',' + L.size + ',&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,230,230,0,1',
      'Style: Step,' + L.font + ',' + Math.round(L.size * (L.rtl ? 0.6 : 0.68)) + ',&H00F7C36B,&H00F7C36B,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,' + stepAn + ',24,24,0,1', '',
      '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'];
    // اتجاه النص من اليمين للعربي/الأردو (وإلا تنتقل علامات الترقيم للجهة الخطأ)
    const dir = x => L.rtl ? '\u202b' + x + '\u202c' : x;
    cs.forEach(c => {
      ass.push('Dialogue: 0,' + assT(c.a) + ',' + assT(c.b) + ',Cap,,0,0,0,,{\\pos(' + capX + ',' + (H + STRIP / 2) + ')}' + dir(c.text.replace(/[{}]/g, '')));
      if (c.step) ass.push('Dialogue: 0,' + assT(c.a) + ',' + assT(c.b) + ',Step,,0,0,0,,{\\pos(' + stepX + ',' + (H + STRIP / 2) + ')}' + dir(c.step.replace(/[{}]/g, '')));
    });
    const assFile = path.join(WORK, 'cap-' + lang + '.ass');
    fs.writeFileSync(assFile, ass.join('\n'));
    const mp4 = path.join(OUT, cfg.id + '-tutorial-' + lang + '.mp4');
    execFileSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'frames.txt'), '-i', audio,
      '-filter_complex', '[0:v]tpad=start_duration=' + lead.toFixed(3) + ':start_mode=clone,fps=25,scale=' + W + ':' + H + ',pad=' + W + ':' + VH + ':0:0:color=0x0f172a,ass=' + assFile + ':fontsdir=' + FONTS + ',format=yuv420p[v]',
      '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'copy', '-t', total.toFixed(2), '-movflags', '+faststart', mp4], { stdio: ['ignore', 'ignore', 'pipe'] });
    made.push(mp4);
  }
  console.log('[' + cfg.id + '] done (' + Math.round(total) + ' s):', made.map(f => path.basename(f)).join(', '));
  return made;
}

module.exports = { makeTutorial };
