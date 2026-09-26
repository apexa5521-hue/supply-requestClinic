/**
 * SupplyFlow — نظام طلبات المستلزمات - ApexCare Clinics
 *
 * كل استدعاءات الواجهة تمر عبر دالة واحدة `api(token, fn, args)` (أو doPost عند
 * الاستضافة الخارجية). الدوال الداخلية تنتهي بـ "_" حتى لا يمكن استدعاؤها
 * مباشرة من المتصفح عبر google.script.run.
 *
 * الأعمدة تُقرأ بالاسم (وليس بالترتيب)، وأي عمود/تبويب ناقص يُنشأ تلقائياً،
 * لذلك يعمل الملف مع الشيت القديم بدون فقدان بيانات.
 */

const TZ = 'Asia/Riyadh';
const SESSION_TTL = 6 * 60 * 60;        // أقصى مدة يسمح بها CacheService
const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_SECONDS = 3 * 60;
const DUP_WINDOW_SECONDS = 120;

const SCHEMA = {
  Users:        ['Name', 'Password', 'Role', 'Clinic', 'Email'],
  Roles:        ['RoleName', 'Screen'],
  Clinics:      ['ClinicName', 'Branch', 'Type'],
  Doctors:      ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty'],
  ItemsCatalog: ['ItemName', 'CommercialName', 'Category', 'Price'],
  Requests:     ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status',
                 'SubmittedAt', 'SentAt', 'ReceivedAt', 'ReceiverName', 'SignatureURL',
                 'PrepAt', 'VendorWaitAt', 'VendorReceivedAt', 'ReviewAt', 'ReviewedAt',
                 'RejectionReason', 'ReceiptURL'],
  RequestItems: ['RequestID', 'ItemName', 'RequestedQty', 'ApprovedQty', 'ReceivedQty', 'DispatchedAt', 'DispatchBatch'],
  Shipments:    ['RequestID', 'Batch', 'ReceivedAt', 'ReceiverName', 'ReceivedBy', 'SignatureURL', 'SignatureFileID', 'ReceiptURL'],
  ItemNotes:    ['Timestamp', 'RequestID', 'ItemName', 'Author', 'Role', 'Note'],
  Log:          ['Timestamp', 'RequestID', 'Action', 'User'],
  Comments:     ['Timestamp', 'RequestID', 'Author', 'Role', 'Message'],
  Notices:      ['Timestamp', 'FromRole', 'FromName', 'ToRole', 'Message'],
  Complaints:   ['ComplaintID', 'Timestamp', 'RequestID', 'Author', 'Role', 'Type', 'Message',
                 'Resolved', 'ResolvedBy', 'ResolvedAt']
};

const ST = {
  NEW: 'جديد', PREP: 'قيد التجهيز', VENDOR_WAIT: 'بانتظار المندوب', VENDOR_RECV: 'استلم المندوب',
  REVIEW: 'مراجعة الطبيب', APPROVED: 'معتمد من الطبيب', REJECTED: 'مرفوض',
  SENT: 'تم الإرسال', RECEIVED: 'تم الاستلام'
};

// الانتقالات المسموحة بين الحالات + عمود الختم الزمني لكل انتقال
const TRANSITIONS = {};
TRANSITIONS[ST.PREP]        = { from: [ST.NEW, ST.REJECTED], stamp: 'PrepAt' };
TRANSITIONS[ST.VENDOR_WAIT] = { from: [ST.PREP], stamp: 'VendorWaitAt' };
TRANSITIONS[ST.VENDOR_RECV] = { from: [ST.VENDOR_WAIT], stamp: 'VendorReceivedAt' };
TRANSITIONS[ST.REVIEW]      = { from: [ST.PREP, ST.VENDOR_RECV], stamp: 'ReviewAt' };
TRANSITIONS[ST.SENT]        = { from: [ST.APPROVED], stamp: 'SentAt' };

const REQUEST_TYPES = ['شهري', 'طارئ'];
const SCREENS = ['nurse', 'procurement', 'doctor', 'dashboard', 'admin'];
const DEFAULT_ROLES = [
  ['ممرضة', 'nurse'], ['تموين', 'procurement'], ['طبيب', 'doctor'],
  ['جودة', 'admin'], ['جوده', 'admin'], ['مالية', 'dashboard'], ['تنفيذي', 'admin']
];
const NOTICE_TARGET_BY_SCREEN = { nurse: 'ممرضة', procurement: 'تموين', doctor: 'طبيب' };
const COMPLAINT_TYPES = ['تأخير', 'نقص', 'زيادة', 'أخرى'];

/* =====================================================================
 *  الإعداد لأول مرة
 * ===================================================================== */

/**
 * شغّل هذه الدالة مرة واحدة من محرر Apps Script. آمنة للتشغيل أكثر من مرة:
 * تضيف التبويبات/الأعمدة الناقصة فقط ولا تمسح أي بيانات.
 */
function setupSheets() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) { sheet_(name); });
  ['Users', 'Requests', 'RequestItems'].forEach(function (n) { sheet_(n).setFrozenRows(1); });

  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  if (read_('Roles').rows.length === 0) {
    DEFAULT_ROLES.forEach(function (r) { append_('Roles', { RoleName: r[0], Screen: r[1] }); });
  }
  if (read_('Users').rows.length === 0) {
    append_('Users', { Name: 'المدير', Password: '1234', Role: 'تنفيذي' });
  }
  if (read_('ItemsCatalog').rows.length === 0) {
    [
      'MICRO BRUSH FINE', 'MICRO BRUSH SUPER FINE', 'PROPHY PASTE', 'PROPHY BRUSH',
      'MIXING PED', 'Itero Sleeve', 'IVOCLAR TETRIC N BOND 6G', 'Etchant Blue Tip',
      'INVISALIGN REMOVAL', 'Ivoclar Tetric-N A2', 'Shofu Flowable Plus A2',
      'B&E ACID ETCH x3 Sy x5ml', 'Ver-Dent Needle bur', 'JOTA WHITE STONE',
      'PD METAL STRIP DUBBLE SAID x12', 'PD METAL STRIP ONE SIDE x12', 'DENTAL FLOSS'
    ].forEach(function (i) { append_('ItemsCatalog', { ItemName: i }); });
  }
  try {
    SpreadsheetApp.getUi().alert('تم تجهيز التبويبات. غيّر كلمة سر "المدير" بعد أول دخول، ثم أضف العيادات والأطباء والمستخدمين.');
  } catch (e) { /* يعمل بدون واجهة (مثلاً من المشغّلات) */ }
}

/* =====================================================================
 *  نقاط الدخول
 * ===================================================================== */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('SupplyFlow — ApexCare')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** يضمّن ملف HTML آخر (مثل JavaScript.html) داخل Index عبر <?!= include_('JavaScript'); ?>
 *  ينتهي بـ "_" فلا يمكن استدعاؤه من المتصفح عبر google.script.run */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** للاستضافة الخارجية (GitHub Pages...) عبر fetch — نفس عقد api() */
function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { ok: true, data: api(body.token, body.fn, body.args) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * الموزّع الوحيد المكشوف للواجهة.
 * كل دالة معرّفة بالشاشات المسموح لها؛ '*' = أي مستخدم مسجّل.
 */
function api(token, fn, args) {
  resetMemo_();
  args = Array.isArray(args) ? args : [];
  if (fn === 'login') return sanitize_(login_(args[0], args[1]));
  if (fn === 'logout') { logout_(token); return true; }
  if (fn === 'batch') return batch_(token, args[0]);
  const def = API_[fn];
  if (!def) throw new Error('ERR_UNKNOWN_FN');
  const user = session_(token);
  if (def.screens !== '*' && def.screens.indexOf(user.screen) === -1) throw new Error('ERR_FORBIDDEN');
  return sanitize_(def.fn.apply(null, [user].concat(args)));
}

/**
 * عدة عمليات قراءة في تنفيذ واحد (تقلل عدد الاستدعاءات المتزامنة على Apps Script).
 * calls = [[fn, args], ...] → [{ok, data} | {ok:false, error}, ...]
 */
const BATCH_MAX = 12;
function batch_(token, calls) {
  if (!Array.isArray(calls) || !calls.length || calls.length > BATCH_MAX) throw new Error('ERR_BAD_BATCH');
  const user = session_(token);
  return calls.map(function (c) {
    try {
      const fn = String(c && c[0]);
      const def = API_[fn];
      if (!def || fn.indexOf('get') !== 0) throw new Error('ERR_UNKNOWN_FN'); // القراءة فقط
      if (def.screens !== '*' && def.screens.indexOf(user.screen) === -1) throw new Error('ERR_FORBIDDEN');
      return { ok: true, data: sanitize_(def.fn.apply(null, [user].concat(Array.isArray(c[1]) ? c[1] : []))) };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
}

const ALL = '*';
const MGMT = ['dashboard', 'admin'];
const API_ = {
  getConfig:                 { screens: ALL, fn: getConfig_ },
  getAlerts:                 { screens: ALL, fn: getAlerts_ },
  getNotices:                { screens: ALL, fn: getNotices_ },
  getDoctors:                { screens: ['nurse'], fn: getDoctors_ },
  getDoctorProfile:          { screens: ['nurse'], fn: getDoctorProfile_ },
  createRequest:             { screens: ['nurse'], fn: createRequest_ },
  getMyRequests:             { screens: ['nurse'], fn: getMyRequests_ },
  receiveShipment:           { screens: ['nurse'], fn: receiveShipment_ },
  getShipmentSignatures:     { screens: ['nurse'], fn: getShipmentSignatures_ },
  getRequests:               { screens: ['procurement'].concat(MGMT), fn: getRequestsApi_ },
  getRequestItemsFull:       { screens: ['procurement'].concat(MGMT), fn: getRequestItemsFull_ },
  updateItemApproval:        { screens: ['procurement'], fn: updateItemApproval_ },
  dispatchItems:             { screens: ['procurement'], fn: dispatchItems_ },
  bulkUpdateStatus:          { screens: ['procurement'], fn: bulkUpdateStatus_ },
  getDoctorRequests:         { screens: ['doctor'], fn: getDoctorRequests_ },
  getRequestItemsWithCatalog:{ screens: ['doctor', 'procurement'].concat(MGMT), fn: getRequestItemsWithCatalog_ },
  doctorReview:              { screens: ['doctor'], fn: doctorReview_ },
  getRequestItems:           { screens: ALL, fn: getRequestItemsApi_ },
  getRequestDetail:          { screens: ALL, fn: getRequestDetail_ },
  getComments:               { screens: ALL, fn: getCommentsApi_ },
  addComment:                { screens: ALL, fn: addComment_ },
  getItemNotes:              { screens: ALL, fn: getItemNotesApi_ },
  addItemNote:               { screens: ALL, fn: addItemNote_ },
  addComplaint:              { screens: ALL, fn: addComplaint_ },
  getComplaints:             { screens: ['procurement'].concat(MGMT), fn: getComplaints_ },
  resolveComplaint:          { screens: ['procurement'].concat(MGMT), fn: resolveComplaint_ },
  addNotice:                 { screens: MGMT, fn: addNotice_ },
  getExecutiveStats:         { screens: MGMT, fn: getExecutiveStats_ },
  getQualityReport:          { screens: MGMT, fn: function (u, m) { return getQualityReport_(m); } },
  getQualityTrend:           { screens: MGMT, fn: function (u, n) { return getQualityTrend_(n); } },
  getUsers:                  { screens: ['admin'], fn: getUsers_ },
  createUser:                { screens: ['admin'], fn: createUser_ },
  updateUser:                { screens: ['admin'], fn: updateUser_ },
  deleteUser:                { screens: ['admin'], fn: deleteUser_ },
  getRoles:                  { screens: ['admin'], fn: function () { return getRoles_(); } },
  saveRole:                  { screens: ['admin'], fn: saveRole_ },
  deleteRole:                { screens: ['admin'], fn: deleteRole_ }
};

/* =====================================================================
 *  أدوات الشيت (قراءة/كتابة بالاسم)
 * ===================================================================== */

let MEMO_ = {};
function resetMemo_() { MEMO_ = {}; }
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  const key = 'sh:' + name;
  if (MEMO_[key]) return MEMO_[key];
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  ensureHeaders_(sh, SCHEMA[name] || []);
  MEMO_[key] = sh;
  return sh;
}

function headerRow_(sh) {
  const lastCol = sh.getLastColumn();
  if (!lastCol) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}

function ensureHeaders_(sh, required) {
  const headers = headerRow_(sh);
  const missing = required.filter(function (h) { return headers.indexOf(h) === -1; });
  if (!missing.length) return;
  sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
}

function read_(name) {
  const key = 'rd:' + name;
  if (MEMO_[key]) return MEMO_[key];
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  const col = {};
  headers.forEach(function (h, i) { if (h && !(h in col)) col[h] = i; });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const o = { _row: i + 1 };
    let empty = true;
    headers.forEach(function (h, j) {
      if (!h) return;
      o[h] = values[i][j];
      if (values[i][j] !== '' && values[i][j] !== null) empty = false;
    });
    if (!empty) rows.push(o);
  }
  const t = { name: name, sh: sh, headers: headers, col: col, rows: rows };
  MEMO_[key] = t;
  return t;
}

function invalidate_(name) { delete MEMO_['rd:' + name]; }

function setCells_(t, row, obj) {
  Object.keys(obj).forEach(function (k) {
    t.sh.getRange(row._row, t.col[k] + 1).setValue(obj[k]);
    row[k] = obj[k];
  });
}

function append_(name, obj) {
  const sh = sheet_(name);
  const headers = headerRow_(sh);
  sh.appendRow(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; }));
  invalidate_(name);
}

/** نص من المستخدم: تنظيف + منع حقن الصيغ داخل الشيت */
function clean_(s, max) {
  s = String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (max && s.length > max) s = s.slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function str_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function toMs_(v) {
  if (!v) return 0;
  const d = isDate_(v) ? v : new Date(v);
  const ms = d.getTime();
  return isNaN(ms) ? 0 : ms;
}
function monthOf_(v) {
  const ms = toMs_(v);
  return ms ? Utilities.formatDate(new Date(ms), TZ, 'yyyy-MM') : '';
}
function round1_(n) { return Math.round(n * 10) / 10; }

/** يحوّل كل التواريخ لنصوص ISO (google.script.run لا يقبل Date كقيمة مرجعة) */
function sanitize_(v) {
  if (isDate_(v)) return isNaN(v.getTime()) ? '' : v.toISOString();
  if (Array.isArray(v)) return v.map(sanitize_);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = sanitize_(v[k]); });
    return o;
  }
  return v;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function logAction_(requestId, action, user) {
  append_('Log', { Timestamp: new Date(), RequestID: requestId, Action: action, User: user });
}

/* =====================================================================
 *  المصادقة والجلسات
 * ===================================================================== */

function hashPassword_(pw, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8);
  const hex = bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  return 'h1$' + salt + '$' + hex;
}

function verifyPassword_(stored, pw) {
  stored = String(stored);
  if (stored.indexOf('h1$') === 0) {
    const salt = stored.split('$')[1];
    return hashPassword_(pw, salt) === stored;
  }
  return stored !== '' && latinDigits_(stored).trim() === latinDigits_(pw).trim(); // كلمات سر قديمة نصية
}

function roleScreen_(roleName) {
  roleName = str_(roleName);
  const r = getRoles_().filter(function (x) { return x.name === roleName; })[0];
  if (r && SCREENS.indexOf(r.screen) !== -1) return r.screen;
  const d = DEFAULT_ROLES.filter(function (x) { return x[0] === roleName; })[0];
  return d ? d[1] : '';
}

/** أرقام عربية/فارسية → لاتينية (لوحة المفاتيح العربية تكتب ١٢٣٤ بدل 1234) */
function latinDigits_(s) {
  return String(s).replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
    .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
}
/** مفتاح مقارنة اسم الدخول: بدون فرق حروف كبيرة/صغيرة أو مسافات زائدة أو أحرف خفية */
function loginKey_(s) {
  return latinDigits_(String(s || '')).replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function login_(name, password) {
  name = str_(name);
  password = String(password || '');
  if (!name || !password) throw new Error('ERR_LOGIN_EMPTY');
  const key = loginKey_(name);
  const cache = CacheService.getScriptCache();
  const failKey = 'lf:' + key;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= LOGIN_MAX_FAILS) throw new Error('ERR_LOGIN_LOCKED');

  const t = read_('Users');
  const rows = t.rows.filter(function (r) { return str_(r.Name) && loginKey_(r.Name) === key; });
  const row = rows.filter(function (r) { return str_(r.Name) === name; })[0] || rows[0];
  // نجرب الرقم كما كُتب، ثم بعد تحويل الأرقام العربية وحذف المسافات الطرفية
  const candidates = [password, latinDigits_(password).trim()].filter(function (p, i, a) { return p && a.indexOf(p) === i; });
  const matched = row && candidates.filter(function (p) { return verifyPassword_(row.Password, p); })[0];
  if (!matched) {
    cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);
    return { success: false };
  }
  cache.remove(failKey);
  // ترقية كلمة السر النصية القديمة إلى مشفّرة
  if (String(row.Password).indexOf('h1$') !== 0) setCells_(t, row, { Password: hashPassword_(latinDigits_(matched).trim()) });

  const screen = roleScreen_(row.Role);
  if (!screen) throw new Error('ERR_ROLE_UNMAPPED');
  const user = {
    name: str_(row.Name), role: str_(row.Role), clinic: str_(row.Clinic),
    email: str_(row.Email), screen: screen
  };
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('s:' + token, JSON.stringify(user), SESSION_TTL);
  return { success: true, token: token, user: user, config: getConfig_(user) };
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove('s:' + token);
}

function session_(token) {
  if (!token) throw new Error('ERR_SESSION');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('s:' + token);
  if (!raw) throw new Error('ERR_SESSION');
  cache.put('s:' + token, raw, SESSION_TTL); // تمديد الجلسة مع النشاط
  return JSON.parse(raw);
}

function userClinics_(user) {
  return user.clinic ? user.clinic.split(',').map(function (s) { return s.trim(); }).filter(String) : [];
}

/* =====================================================================
 *  بيانات مرجعية
 * ===================================================================== */

function getClinics_() {
  return read_('Clinics').rows.filter(function (r) { return str_(r.ClinicName); })
    .map(function (r) { return { name: str_(r.ClinicName), branch: str_(r.Branch), type: str_(r.Type) }; });
}

function getCatalog_(withPrice) {
  const seen = {};
  return read_('ItemsCatalog').rows.filter(function (r) {
    const n = str_(r.ItemName);
    if (!n || seen[n.toLowerCase()]) return false;
    seen[n.toLowerCase()] = true;
    return true;
  }).map(function (r) {
    const o = { name: str_(r.ItemName), commercial: str_(r.CommercialName), category: str_(r.Category) };
    if (withPrice) o.price = Number(r.Price) || 0;
    return o;
  });
}

function getRoles_() {
  return read_('Roles').rows.filter(function (r) { return str_(r.RoleName); })
    .map(function (r) { return { name: str_(r.RoleName), screen: str_(r.Screen) }; });
}

function getConfig_(user) {
  let clinics = getClinics_();
  if (user.screen === 'nurse') {
    const mine = userClinics_(user);
    if (mine.length) clinics = clinics.filter(function (c) { return mine.indexOf(c.name) !== -1; });
  }
  return {
    user: user,
    clinics: clinics,
    catalog: getCatalog_(user.screen !== 'nurse'),
    roles: user.screen === 'admin' ? getRoles_() : [],
    serverTime: new Date()
  };
}

/** تطبيع نص للمقارنة: مسافات، حالة الأحرف، والتشكيل */
function norm_(v) {
  return str_(v).toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
}

// مرادفات التخصصات حتى يتطابق "أسنان" مع "Dental" وهكذا
const SPECIALTY_ALIASES_ = [
  ['اسنان', 'dental', 'dentistry', 'dent'],
  ['جلديه', 'derma', 'dermatology', 'skin', 'جلدية']
];
function specialtyKey_(v) {
  const n = norm_(v);
  if (!n) return '';
  for (let i = 0; i < SPECIALTY_ALIASES_.length; i++) {
    if (SPECIALTY_ALIASES_[i].some(function (a) { return n === a || n.indexOf(a) !== -1; })) return 'sp' + i;
  }
  return n;
}

/** كلمة تخصص مجردة (مثل "أسنان" أو "Dental Clinic") وليست اسم عيادة محددة */
function isSpecialtyWord_(n) {
  n = n.replace(/\b(clinic|clinics|dept|department)\b|عياده|عيادات|قسم/g, '').trim();
  return SPECIALTY_ALIASES_.some(function (a) { return a.indexOf(n) !== -1; });
}

/**
 * هل الطبيب يتبع هذه العيادة؟ عمود Clinic في Doctors يقبل:
 *  - فارغ → متاح لكل العيادات
 *  - اسم العيادة (أو عدة أسماء مفصولة بفاصلة)
 *  - نوع/تخصص العيادة (مثل "أسنان" أو "Dental") أو الفرع (مثل "Buraydah")
 * ويُقرأ أيضاً عمود اختياري Specialty / Type / التخصص إن وُجد.
 */
function doctorMatchesClinic_(d, clinic) {
  if (!clinic) return true;
  const targets = str_(d.clinic).split(/[,،]/).map(norm_).filter(String);
  const spec = specialtyKey_(d.specialty);
  if (!targets.length && !spec) return true;
  const cName = norm_(clinic.name);
  const cType = specialtyKey_(clinic.type) || specialtyKey_(clinic.name);
  const cBranch = norm_(clinic.branch);
  if (spec && cType && spec === cType) return true;
  return targets.some(function (tg) {
    return tg === cName || (cBranch && tg === cBranch) || (cType && isSpecialtyWord_(tg) && specialtyKey_(tg) === cType);
  });
}

function allDoctors_() {
  return read_('Doctors').rows.filter(function (r) { return str_(r.DoctorName); }).map(function (r) {
    return {
      name: str_(r.DoctorName), clinic: str_(r.Clinic), nurse: str_(r.NurseName), subspecialty: str_(r.Subspecialty),
      specialty: str_(r.Specialty || r.Type || r['التخصص'] || r['النوع'])
    };
  });
}

function getDoctors_(user, clinicFilter) {
  clinicFilter = str_(clinicFilter);
  const clinic = getClinics_().filter(function (c) { return c.name === clinicFilter; })[0] ||
    (clinicFilter ? { name: clinicFilter, type: '', branch: '' } : null);
  return allDoctors_().filter(function (d) { return doctorMatchesClinic_(d, clinic); })
    .map(function (d) { return { name: d.name, clinic: d.clinic, nurse: d.nurse, subspecialty: d.subspecialty || d.specialty }; });
}

/** البكج المعتاد: من تبويب DoctorProfiles إن وُجد، وإلا من آخر 10 طلبات للطبيب */
function getDoctorProfile_(user, doctor) {
  doctor = str_(doctor);
  if (!doctor) return [];
  const ps = ss_().getSheetByName('DoctorProfiles');
  if (ps && ps.getLastRow() > 1) {
    const rows = ps.getDataRange().getValues().slice(1)
      .filter(function (r) { return str_(r[0]) === doctor && str_(r[1]); })
      .map(function (r) { return { item: str_(r[1]), qty: Number(r[2]) || 1 }; });
    if (rows.length) return rows;
  }
  const ids = requestRows_().filter(function (r) { return str_(r.Doctor) === doctor; })
    .sort(function (a, b) { return toMs_(b.Date) - toMs_(a.Date); })
    .slice(0, 10).map(function (r) { return str_(r.RequestID); });
  if (!ids.length) return [];
  const agg = {};
  read_('RequestItems').rows.forEach(function (r) {
    if (ids.indexOf(str_(r.RequestID)) === -1) return;
    const n = str_(r.ItemName);
    agg[n] = agg[n] || { item: n, count: 0, total: 0 };
    agg[n].count++;
    agg[n].total += Number(r.RequestedQty) || 0;
  });
  return Object.keys(agg).map(function (k) { return agg[k]; })
    .sort(function (a, b) { return b.count - a.count || a.item.localeCompare(b.item); })
    .slice(0, 20)
    .map(function (a) { return { item: a.item, qty: Math.max(1, Math.round(a.total / a.count)), times: a.count }; });
}

/* =====================================================================
 *  الطلبات
 * ===================================================================== */

function requestRows_() { return read_('Requests').rows.filter(function (r) { return str_(r.RequestID); }); }

function findRequest_(id) {
  id = str_(id);
  const t = read_('Requests');
  const row = t.rows.filter(function (r) { return str_(r.RequestID) === id; })[0];
  if (!row) throw new Error('ERR_NOT_FOUND');
  return { t: t, row: row };
}

function mapRequest_(r) {
  return {
    id: str_(r.RequestID), date: r.Date, clinic: str_(r.Clinic), doctor: str_(r.Doctor),
    nurse: str_(r.Nurse), type: str_(r.Type), status: str_(r.Status) || ST.NEW,
    submittedAt: r.SubmittedAt, prepAt: r.PrepAt, vendorWaitAt: r.VendorWaitAt,
    vendorReceivedAt: r.VendorReceivedAt, reviewAt: r.ReviewAt, reviewedAt: r.ReviewedAt,
    sentAt: r.SentAt, receivedAt: r.ReceivedAt, receiver: str_(r.ReceiverName),
    signature: str_(r.SignatureURL), receiptUrl: str_(r.ReceiptURL),
    rejectionReason: str_(r.RejectionReason)
  };
}

/** صلاحية رؤية طلب معيّن */
function canSee_(user, req) {
  if (user.screen === 'nurse') return req.nurse === user.name;
  if (user.screen === 'doctor') return isMyDoctor_(user, req.doctor);
  return true;
}

function queryRequests_(filters) {
  filters = filters || {};
  const byReq = itemsByRequest_();
  const reviewers = doctorAccounts_();
  return requestRows_().map(mapRequest_).filter(function (r) {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.clinic && r.clinic !== filters.clinic) return false;
    if (filters.nurse && r.nurse !== filters.nurse) return false;
    if (filters.doctorUser && !isMyDoctor_(filters.doctorUser, r.doctor)) return false;
    if (filters.month && monthOf_(r.date) !== filters.month) return false;
    return true;
  }).map(function (r) {
    const st = shipState_(r, byReq[r.id] || []);
    r.itemCount = st.total;
    r.dispatchedCount = st.dispatched;
    r.shipmentCount = st.ships.length;
    r.pendingShipments = st.pending;
    r.needsReview = !!reviewers[r.doctor];
    return r;
  }).sort(function (a, b) { return toMs_(b.date) - toMs_(a.date); });
}

function itemsByRequest_() {
  const out = {};
  read_('RequestItems').rows.forEach(function (r) { (out[str_(r.RequestID)] = out[str_(r.RequestID)] || []).push(r); });
  return out;
}

/**
 * رقم شحنة كل صنف مُرسل. الأصناف القديمة (قبل عمود DispatchBatch) تُرقَّم حسب وقت إرسالها.
 * يعيد { of: function(row) -> رقم الشحنة أو 0, count: عدد الشحنات }
 */
function batchesOf_(rows) {
  let max = 0;
  rows.forEach(function (r) { const b = Number(r.DispatchBatch) || 0; if (r.DispatchedAt && b > max) max = b; });
  const legacy = {};
  rows.filter(function (r) { return r.DispatchedAt && !(Number(r.DispatchBatch) > 0); })
    .map(function (r) { return toMs_(r.DispatchedAt); })
    .sort(function (a, b) { return a - b; })
    .forEach(function (ms) { if (!legacy[ms]) legacy[ms] = ++max; });
  return {
    of: function (r) {
      if (!r.DispatchedAt) return 0;
      return Number(r.DispatchBatch) > 0 ? Number(r.DispatchBatch) : legacy[toMs_(r.DispatchedAt)];
    },
    count: max
  };
}

function getRequestsApi_(user, filters) { return queryRequests_(filters); }
function getMyRequests_(user) { return queryRequests_({ nurse: user.name }); }
function getDoctorRequests_(user) { return queryRequests_({ doctorUser: user }); }

function nextRequestId_() {
  const prefix = 'REQ-' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-';
  let max = 0;
  requestRows_().forEach(function (r) {
    const id = str_(r.RequestID);
    if (id.indexOf(prefix) === 0) max = Math.max(max, Number(id.slice(prefix.length)) || 0);
  });
  return prefix + ('00' + (max + 1)).slice(-3);
}

function createRequest_(user, payload) {
  payload = payload || {};
  const clinic = str_(payload.clinic);
  const doctor = str_(payload.doctor);
  const type = str_(payload.type);
  if (!clinic || !doctor) throw new Error('ERR_REQUIRED');
  if (REQUEST_TYPES.indexOf(type) === -1) throw new Error('ERR_BAD_TYPE');
  const mine = userClinics_(user);
  if (mine.length && mine.indexOf(clinic) === -1) throw new Error('ERR_FORBIDDEN');
  if (!getClinics_().some(function (c) { return c.name === clinic; })) throw new Error('ERR_BAD_CLINIC');
  if (!getDoctors_(user, clinic).some(function (d) { return d.name === doctor; })) {
    throw new Error('ERR_BAD_DOCTOR');
  }

  // دمج الأصناف المكررة + التحقق من الكميات
  const merged = {};
  const order = [];
  (payload.items || []).forEach(function (it) {
    const name = clean_(it && it.name, 200);
    const qty = Math.floor(Number(it && it.qty));
    if (!name) return;
    if (!(qty >= 1 && qty <= 100000)) throw new Error('ERR_BAD_QTY');
    const key = name.toLowerCase();
    if (!merged[key]) { merged[key] = { name: name, qty: 0 }; order.push(key); }
    merged[key].qty += qty;
  });
  const items = order.map(function (k) { return merged[k]; });
  if (!items.length) throw new Error('ERR_NO_ITEMS');
  if (items.length > 200) throw new Error('ERR_TOO_MANY_ITEMS');

  // منع الإرسال المزدوج لنفس الطلب خلال دقيقتين
  const sig = [user.name, clinic, doctor, type].concat(items.map(function (i) { return i.name + ':' + i.qty; })).join('|');
  const dupKey = 'dup:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sig, Utilities.Charset.UTF_8));
  const cache = CacheService.getScriptCache();

  const id = withLock_(function () {
    const prev = cache.get(dupKey);
    if (prev) return { duplicate: true, id: prev };
    resetMemo_();
    const newId = nextRequestId_();
    const now = new Date();
    append_('Requests', {
      RequestID: newId, Date: now, Clinic: clinic, Doctor: doctor, Nurse: user.name,
      Type: type, Status: ST.NEW, SubmittedAt: now
    });
    const ri = sheet_('RequestItems');
    const riHeaders = headerRow_(ri);
    const rows = items.map(function (it) {
      const o = { RequestID: newId, ItemName: it.name, RequestedQty: it.qty };
      return riHeaders.map(function (h) { return h in o ? o[h] : ''; });
    });
    ri.getRange(ri.getLastRow() + 1, 1, rows.length, riHeaders.length).setValues(rows);
    invalidate_('RequestItems');

    const known = {};
    getCatalog_(false).forEach(function (c) { known[c.name.toLowerCase()] = true; });
    items.forEach(function (it) {
      if (!known[it.name.toLowerCase()]) { append_('ItemsCatalog', { ItemName: it.name }); known[it.name.toLowerCase()] = true; }
    });
    cache.put(dupKey, newId, DUP_WINDOW_SECONDS);
    logAction_(newId, 'إنشاء طلب (' + type + ')', user.name);
    return newId;
  });
  if (id && id.duplicate) return id;

  notifyRole_('procurement',
    (type === 'طارئ' ? '🚨 طلب طارئ - ' : 'طلب مستلزمات جديد - ') + id,
    'تم رفع طلب جديد.\nرقم الطلب: ' + id + '\nالعيادة: ' + clinic + '\nالطبيب: ' + doctor +
    '\nالممرضة: ' + user.name + '\nنوع الطلب: ' + type + '\nعدد الأصناف: ' + items.length);
  return { id: id, duplicate: false };
}

function itemsOf_(requestId) {
  requestId = str_(requestId);
  return read_('RequestItems').rows.filter(function (r) { return str_(r.RequestID) === requestId; });
}

function mapItem_(r, batches) {
  return {
    item: str_(r.ItemName), requestedQty: r.RequestedQty, approvedQty: r.ApprovedQty,
    receivedQty: r.ReceivedQty, dispatchedAt: r.DispatchedAt,
    batch: batches ? batches.of(r) : (Number(r.DispatchBatch) || 0)
  };
}

/** استلامات الشحنات: { requestId: { batch: row } } */
function receiptsIndex_() {
  if (MEMO_.rcpt) return MEMO_.rcpt;
  const out = {};
  read_('Shipments').rows.forEach(function (r) {
    const id = str_(r.RequestID), b = Number(r.Batch) || 0;
    if (id && b) (out[id] = out[id] || {})[b] = r;
  });
  MEMO_.rcpt = out;
  return out;
}

/**
 * حالة شحنات الطلب: الأصناف مجمّعة حسب رقم الشحنة + حالة استلام وتوقيع كل شحنة.
 * طلب قديم «مرسل/مستلم» بأصناف بلا تاريخ إرسال يُعامل كشحنة واحدة، والمستلم قديماً يُعد كل شحناته مستلمة.
 */
function shipState_(req, rows) {
  const b = batchesOf_(rows);
  const whole = req.status === ST.SENT || req.status === ST.RECEIVED;
  const rec = receiptsIndex_()[req.id] || {};
  const groups = {};
  let extra = 0;
  const items = rows.map(function (r) {
    const it = mapItem_(r, b);
    if (!it.batch && whole) { it.batch = extra || (extra = b.count + 1); it.dispatchedAt = req.sentAt; }
    if (it.batch) (groups[it.batch] = groups[it.batch] || { batch: it.batch, sentAt: it.dispatchedAt, items: [] }).items.push(it);
    return it;
  });
  const ships = Object.keys(groups).map(Number).sort(function (x, y) { return x - y; }).map(function (n) {
    const g = groups[n], x = rec[n], legacy = !x && req.status === ST.RECEIVED;
    g.received = !!x || legacy;
    g.receivedAt = x ? x.ReceivedAt : (legacy ? req.receivedAt : '');
    g.receiver = x ? str_(x.ReceiverName) : (legacy ? req.receiver : '');
    g.signatureUrl = x ? str_(x.SignatureURL) : (legacy ? req.signature : '');
    g.receiptUrl = x ? str_(x.ReceiptURL) : (legacy ? req.receiptUrl : '');
    return g;
  });
  const dispatched = ships.reduce(function (n, g) { return n + g.items.length; }, 0);
  return {
    items: items, ships: ships, total: rows.length, dispatched: dispatched,
    pending: ships.filter(function (g) { return !g.received; }).length,
    allDispatched: rows.length > 0 && dispatched === rows.length
  };
}

/** أصناف الطلب مع رقم الشحنة لكل صنف */
function mappedItems_(requestId) {
  const rows = itemsOf_(requestId);
  const b = batchesOf_(rows);
  return rows.map(function (r) { return mapItem_(r, b); });
}

function guardSee_(user, requestId) {
  const f = findRequest_(requestId);
  const req = mapRequest_(f.row);
  if (!canSee_(user, req)) throw new Error('ERR_FORBIDDEN');
  return { f: f, req: req };
}

function getRequestItemsApi_(user, requestId) {
  guardSee_(user, requestId);
  return mappedItems_(requestId);
}

function getRequestItemsFull_(user, requestId) {
  const req = mapRequest_(findRequest_(requestId).row);
  const st = shipState_(req, itemsOf_(requestId));
  const dispatchStatus = {};
  st.items.forEach(function (it) { if (it.batch) dispatchStatus[it.item] = true; });
  const notes = {};
  itemNotes_(requestId).forEach(function (n) { notes[n.item] = (notes[n.item] || 0) + 1; });
  return { items: st.items, shipments: st.ships, dispatchStatus: dispatchStatus, noteCounts: notes, request: req };
}

function getRequestItemsWithCatalog_(user, requestId) {
  guardSee_(user, requestId);
  const cat = {};
  getCatalog_(true).forEach(function (c) { cat[c.name.toLowerCase()] = c; });
  const noteMap = {};
  itemNotes_(requestId).forEach(function (n) { (noteMap[n.item] = noteMap[n.item] || []).push(n); });
  return mappedItems_(requestId).map(function (it) {
    const c = cat[it.item.toLowerCase()] || {};
    it.commercial = c.commercial || '';
    it.category = c.category || '';
    it.price = c.price || 0;
    it.notes = noteMap[it.item] || [];
    return it;
  });
}

const EDITABLE_APPROVAL = [ST.NEW, ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV, ST.REJECTED];

function updateItemApproval_(user, requestId, itemName, approvedQty) {
  const req = mapRequest_(findRequest_(requestId).row);
  if (EDITABLE_APPROVAL.indexOf(req.status) === -1) throw new Error('ERR_LOCKED');
  const qty = Math.floor(Number(approvedQty));
  if (!(qty >= 0 && qty <= 100000)) throw new Error('ERR_BAD_QTY');
  const t = read_('RequestItems');
  const row = t.rows.filter(function (r) { return str_(r.RequestID) === str_(requestId) && str_(r.ItemName) === str_(itemName); })[0];
  if (!row) throw new Error('ERR_NOT_FOUND');
  setCells_(t, row, { ApprovedQty: qty });
  logAction_(requestId, 'تعديل الكمية المعتمدة: ' + itemName + ' = ' + qty, user.name);
  return true;
}

/** مفتاح مقارنة لاسم طبيب: بدون ألقاب (Dr / د. / دكتور) ونقاط وشرطات */
function doctorKey_(v) {
  return norm_(v).replace(/[._\-]/g, ' ')
    .replace(/^(dr|doctor|الدكتور|الدكتوره|دكتور|دكتوره|د)\s+/, '').replace(/\s+/g, ' ').trim();
}

/**
 * ربط أسماء الأطباء (كما في Doctors والطلبات) بحسابات المستخدمين ذوي شاشة doctor.
 * لكل حساب طبيب: عمود اختياري DoctorName في Users يحدد الاسم صراحةً؛ وإلا تطابق الاسم
 * بعد التطبيع ("Dr.Sami" = "Dr Sami")؛ وإلا اسم مختصر يطابق طبيباً واحداً فقط
 * ("Dr.Sami" ← "Dr. Sami Al-Duwaihi"). عند وجود أكثر من طبيب محتمل لا يُخمَّن.
 * يرجع { اسم الطبيب: اسم الحساب }.
 */
function doctorAccounts_() {
  if (MEMO_.docAcc) return MEMO_.docAcc;
  const names = {};
  read_('Doctors').rows.forEach(function (r) { if (str_(r.DoctorName)) names[str_(r.DoctorName)] = true; });
  requestRows_().forEach(function (r) { if (str_(r.Doctor)) names[str_(r.Doctor)] = true; });
  const all = Object.keys(names);
  const out = {};
  read_('Users').rows.forEach(function (u) {
    if (roleScreen_(u.Role) !== 'doctor' || !str_(u.Name)) return;
    const acc = str_(u.Name);
    out[acc] = acc;
    const explicit = str_(u.DoctorName);
    let matches;
    if (explicit) {
      matches = all.filter(function (n) { return n === explicit || doctorKey_(n) === doctorKey_(explicit); });
      if (!matches.length) matches = [explicit];
    } else {
      const key = doctorKey_(acc);
      matches = all.filter(function (n) { return doctorKey_(n) === key; });
      if (!matches.length && key) {
        const toks = key.split(' ');
        const fuzzy = all.filter(function (n) {
          const nt = doctorKey_(n).split(' ');
          return toks.every(function (t) { return nt.indexOf(t) !== -1; });
        });
        if (fuzzy.length === 1) matches = fuzzy;
      }
    }
    matches.forEach(function (n) { if (!out[n]) out[n] = acc; });
  });
  MEMO_.docAcc = out;
  return out;
}

/** هل هذا الطبيب (باسمه في الطلب) هو صاحب الحساب المسجّل؟ */
function isMyDoctor_(user, doctorName) { return doctorAccounts_()[str_(doctorName)] === user.name; }

/** هل للطبيب حساب يستطيع المراجعة به؟ (إن لم يوجد، يُسمح بالإرسال بدون مراجعة) */
function doctorHasAccount_(doctorName) { return !!doctorAccounts_()[str_(doctorName)]; }

function bulkUpdateStatus_(user, requestIds, newStatus) {
  const tr = TRANSITIONS[newStatus];
  if (!tr) throw new Error('ERR_BAD_STATUS');
  const result = { updated: [], skipped: [] };
  const toNotify = [];
  withLock_(function () {
    resetMemo_();
    const t = read_('Requests');
    (requestIds || []).forEach(function (id) {
      id = str_(id);
      const row = t.rows.filter(function (r) { return str_(r.RequestID) === id; })[0];
      if (!row) { result.skipped.push({ id: id, reason: 'ERR_NOT_FOUND' }); return; }
      const cur = str_(row.Status) || ST.NEW;
      let allowed = tr.from.indexOf(cur) !== -1;
      if (!allowed && newStatus === ST.SENT && (cur === ST.PREP || cur === ST.VENDOR_RECV) && !doctorHasAccount_(str_(row.Doctor))) {
        allowed = true; // لا يوجد حساب طبيب للمراجعة
      }
      if (!allowed) {
        result.skipped.push({ id: id, from: cur, reason: newStatus === ST.SENT ? 'ERR_NEEDS_APPROVAL' : 'ERR_BAD_TRANSITION' });
        return;
      }
      const upd = { Status: newStatus };
      upd[tr.stamp] = new Date();
      if (newStatus === ST.PREP) upd.RejectionReason = '';
      setCells_(t, row, upd);
      if (newStatus === ST.SENT) {
        const ri = read_('RequestItems');
        const mine = ri.rows.filter(function (r) { return str_(r.RequestID) === id; });
        const next = batchesOf_(mine).count + 1;
        mine.forEach(function (r) {
          if (!r.DispatchedAt) setCells_(ri, r, { DispatchedAt: upd.SentAt, DispatchBatch: next });
        });
      }
      logAction_(id, 'تغيير الحالة: ' + cur + ' ← ' + newStatus, user.name);
      result.updated.push(id);
      toNotify.push(mapRequest_(row));
    });
  });
  toNotify.forEach(function (req) {
    if (newStatus === ST.SENT) notifyNurseSent_(req);
    if (newStatus === ST.REVIEW) notifyUser_(doctorAccounts_()[req.doctor] || req.doctor, 'طلب بانتظار مراجعتك - ' + req.id,
      'الطلب ' + req.id + ' (عيادة ' + req.clinic + ') جاهز لمراجعتك واعتمادك من داخل النظام.');
  });
  return result;
}

/**
 * إرسال أصناف محددة كشحنة مستقلة ضمن نفس الطلب (رقم شحنة متسلسل).
 * يبقى الطلب «معتمد» حتى تُرسل كل أصنافه، ثم يصبح «تم الإرسال» تلقائياً.
 */
function dispatchItems_(user, requestId, itemNames) {
  itemNames = (itemNames || []).map(str_).filter(String);
  if (!itemNames.length) throw new Error('ERR_NO_ITEMS');
  let res;
  withLock_(function () {
    resetMemo_();
    const f = findRequest_(requestId);
    const cur = str_(f.row.Status);
    const ok = cur === ST.APPROVED ||
      ((cur === ST.PREP || cur === ST.VENDOR_RECV) && !doctorHasAccount_(str_(f.row.Doctor)));
    if (!ok) throw new Error('ERR_NEEDS_APPROVAL');
    const ri = read_('RequestItems');
    const now = new Date();
    const mine = ri.rows.filter(function (r) { return str_(r.RequestID) === str_(requestId); });
    const toSend = mine.filter(function (r) { return !r.DispatchedAt && itemNames.indexOf(str_(r.ItemName)) !== -1; });
    if (!toSend.length) throw new Error('ERR_NO_ITEMS');
    const batch = batchesOf_(mine).count + 1;
    toSend.forEach(function (r) { setCells_(ri, r, { DispatchedAt: now, DispatchBatch: batch }); });
    const sent = mine.filter(function (r) { return !!r.DispatchedAt; }).length;
    const allSent = sent === mine.length;
    const names = toSend.map(function (r) { return str_(r.ItemName); });
    logAction_(requestId, 'إرسال الشحنة ' + batch + ' (' + names.length + ' صنف): ' + names.join('، ') +
      ' — المتبقي ' + (mine.length - sent), user.name);
    if (allSent) {
      setCells_(f.t, f.row, { Status: ST.SENT, SentAt: now });
      logAction_(requestId, 'تغيير الحالة: ' + cur + ' ← ' + ST.SENT, user.name);
    }
    res = { allSent: allSent, batch: batch, count: names.length, items: names, sent: sent, total: mine.length,
      remaining: mine.length - sent, req: mapRequest_(f.row) };
  });
  if (res.allSent) notifyNurseSent_(res.req);
  else notifyNursePartial_(res.req, res);
  delete res.req;
  return res;
}

function doctorReview_(user, requestId, decision, reason, itemNotes) {
  reason = clean_(reason, 1000);
  if (decision !== 'اعتمد' && decision !== 'رفض') throw new Error('ERR_BAD_DECISION');
  if (decision === 'رفض' && !reason) throw new Error('ERR_REASON_REQUIRED');
  let req;
  withLock_(function () {
    resetMemo_();
    const f = findRequest_(requestId);
    req = mapRequest_(f.row);
    if (!isMyDoctor_(user, req.doctor)) throw new Error('ERR_FORBIDDEN');
    if (req.status !== ST.REVIEW) throw new Error('ERR_BAD_TRANSITION');
    const status = decision === 'اعتمد' ? ST.APPROVED : ST.REJECTED;
    setCells_(f.t, f.row, { Status: status, ReviewedAt: new Date(), RejectionReason: decision === 'رفض' ? reason : '' });
    req.status = status;
    logAction_(requestId, (decision === 'اعتمد' ? 'اعتماد الطبيب' : 'رفض الطبيب: ' + reason), user.name);
  });
  (itemNotes || []).forEach(function (n) {
    if (n && str_(n.note)) addItemNote_(user, requestId, n.item, n.note);
  });
  if (reason && decision === 'اعتمد') addComment_(user, requestId, reason);
  const subject = (decision === 'اعتمد' ? 'اعتماد الطبيب للطلب - ' : 'رفض الطبيب للطلب - ') + requestId;
  const body = 'الطبيب ' + user.name + (decision === 'اعتمد' ? ' اعتمد ' : ' رفض ') + 'الطلب ' + requestId +
    (reason ? '\nالملاحظة/السبب: ' + reason : '');
  notifyRole_('procurement', subject, body);
  if (decision === 'رفض') notifyUser_(req.nurse, subject, body);
  return true;
}

/**
 * استلام شحنة واحدة وتوقيعها. عند استلام آخر شحنة (وكل الأصناف مُرسلة) يكتمل الطلب
 * ويُحفظ إيصال موحّد يجمع كل الشحنات وتواقيعها (يرسمه المتصفح بـ mergedReceiptDataUrl).
 */
function receiveShipment_(user, requestId, batch, receivedItems, receiverName, signatureDataUrl, receiptDataUrl, mergedReceiptDataUrl) {
  receiverName = clean_(receiverName, 120);
  if (!receiverName) throw new Error('ERR_REQUIRED');
  batch = Math.floor(Number(batch)) || 0;
  const g = guardSee_(user, requestId);
  const pre = shipState_(g.req, itemsOf_(requestId));
  pendingShip_(g.req, pre, batch);
  const lastOne = pre.allDispatched && pre.pending === 1;

  const tag = requestId + '-S' + batch;
  let sig = { url: '', id: '' }, receiptUrl = '', mergedUrl = '';
  try { if (signatureDataUrl) sig = saveImage_(tag + '-signature', signatureDataUrl); } catch (e) { console.error(e); }
  try { if (receiptDataUrl) receiptUrl = saveImage_(tag + '-receipt', receiptDataUrl).url; } catch (e) { console.error(e); }
  try { if (lastOne && mergedReceiptDataUrl) mergedUrl = saveImage_(requestId + '-receipt-all', mergedReceiptDataUrl).url; } catch (e) { console.error(e); }

  let res;
  withLock_(function () {
    resetMemo_();
    const f = findRequest_(requestId);
    const req = mapRequest_(f.row);
    const ri = read_('RequestItems');
    const rows = ri.rows.filter(function (r) { return str_(r.RequestID) === req.id; });
    const ship = pendingShip_(req, shipState_(req, rows), batch);
    const now = new Date();
    append_('Shipments', {
      RequestID: req.id, Batch: batch, ReceivedAt: now, ReceiverName: receiverName, ReceivedBy: user.name,
      SignatureURL: sig.url, SignatureFileID: sig.id, ReceiptURL: receiptUrl
    });
    delete MEMO_.rcpt;
    const inShip = {};
    ship.items.forEach(function (it) { inShip[it.item] = true; });
    const qty = {};
    (receivedItems || []).forEach(function (it) {
      const n = str_(it && it.name);
      if (inShip[n]) qty[n] = Math.max(0, Math.floor(Number(it.qty) || 0));
    });
    rows.forEach(function (r) { const n = str_(r.ItemName); if (n in qty) setCells_(ri, r, { ReceivedQty: qty[n] }); });
    logAction_(req.id, 'استلام الشحنة ' + batch + ' وتوقيعها (' + ship.items.length + ' صنف)', receiverName + ' (' + user.name + ')');

    const after = shipState_(req, rows);
    const complete = after.allDispatched && after.pending === 0;
    if (complete) {
      const names = [];
      after.ships.forEach(function (s) { if (s.receiver && names.indexOf(s.receiver) === -1) names.push(s.receiver); });
      setCells_(f.t, f.row, {
        Status: ST.RECEIVED, ReceivedAt: now, ReceiverName: names.join('، '),
        SignatureURL: sig.url, ReceiptURL: mergedUrl || receiptUrl
      });
      logAction_(req.id, 'اكتمل استلام الطلب (' + after.ships.length + ' شحنة)' + (mergedUrl ? ' — إيصال موحّد بكل التواقيع' : ''), user.name);
    }
    res = {
      complete: complete, batch: batch, pendingShipments: after.pending, notDispatched: after.total - after.dispatched,
      receiptUrl: receiptUrl, signatureUrl: sig.url, mergedReceiptUrl: complete ? (mergedUrl || receiptUrl) : ''
    };
  });
  return res;
}

function pendingShip_(req, st, batch) {
  if (req.status === ST.RECEIVED) throw new Error('ERR_BAD_TRANSITION');
  const ship = st.ships.filter(function (s) { return s.batch === batch; })[0];
  if (!ship) throw new Error('ERR_NOT_FOUND');
  if (ship.received) throw new Error('ERR_ALREADY_RECEIVED');
  return ship;
}

/** تواقيع الشحنات المستلمة (data URL) لرسم الإيصال الموحّد في المتصفح */
function getShipmentSignatures_(user, requestId) {
  const g = guardSee_(user, requestId);
  const rec = receiptsIndex_()[g.req.id] || {};
  return Object.keys(rec).map(Number).sort(function (a, b) { return a - b; }).map(function (b) {
    const id = str_(rec[b].SignatureFileID);
    let data = '';
    if (id) {
      try { data = 'data:image/png;base64,' + Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()); } catch (e) { console.error(e); }
    }
    return { batch: b, dataUrl: data };
  });
}

/** يحفظ صورة PNG في Drive ويعيد { url, id } */
function saveImage_(fileName, dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw new Error('ERR_BAD_IMAGE');
  if (m[1].length > 4 * 1024 * 1024) throw new Error('ERR_BAD_IMAGE');
  const folderName = 'ApexCare-Signatures';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const blob = Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/png', fileName + '.png');
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* سياسة النطاق قد تمنع */ }
  return { url: file.getUrl(), id: file.getId() };
}

/* =====================================================================
 *  تفاصيل الطلب ومؤشرات الأداء
 * ===================================================================== */

function getRequestDetail_(user, requestId) {
  const g = guardSee_(user, requestId);
  const req = g.req;
  const noteMap = {};
  itemNotes_(requestId).forEach(function (n) { (noteMap[n.item] = noteMap[n.item] || []).push(n); });
  const st = shipState_(req, itemsOf_(requestId));
  req.shipments = st.ships;
  req.items = st.items.map(function (it) {
    it.notes = noteMap[it.item] || [];
    it.note = it.notes.map(function (n) { return n.note; }).join(' · ');
    return it;
  });
  req.comments = comments_(requestId);
  req.kpi = kpi_(req);
  req.log = read_('Log').rows.filter(function (r) { return str_(r.RequestID) === req.id; })
    .map(function (r) { return { time: r.Timestamp, action: str_(r.Action), user: str_(r.User) }; });
  return req;
}

/** زمن كل مرحلة: بالساعات للطارئ، بالأيام للشهري */
function kpi_(req) {
  const hours = req.type === 'طارئ';
  const div = hours ? 36e5 : 864e5;
  function span(a, b) {
    const x = toMs_(a), y = toMs_(b);
    return x && y && y >= x ? round1_((y - x) / div) : null;
  }
  const beforeReview = req.vendorReceivedAt || req.prepAt;
  return {
    unit: hours ? 'hours' : 'days',
    submitToPrep: span(req.submittedAt, req.prepAt),
    vendorWait: span(req.vendorWaitAt, req.vendorReceivedAt),
    prepToReview: span(beforeReview, req.reviewAt),
    reviewTime: span(req.reviewAt, req.reviewedAt),
    approvalToSent: span(req.reviewedAt || beforeReview, req.sentAt),
    sentToReceived: span(req.sentAt, req.receivedAt),
    totalCycle: span(req.submittedAt, req.receivedAt || req.sentAt)
  };
}

/* =====================================================================
 *  الملاحظات والشكاوى والتنبيهات
 * ===================================================================== */

function comments_(requestId) {
  return read_('Comments').rows.filter(function (r) { return str_(r.RequestID) === str_(requestId); })
    .map(function (r) { return { time: r.Timestamp, requestId: str_(r.RequestID), author: str_(r.Author), role: str_(r.Role), message: str_(r.Message) }; })
    .sort(function (a, b) { return toMs_(a.time) - toMs_(b.time); });
}

function getCommentsApi_(user, requestId) { guardSee_(user, requestId); return comments_(requestId); }

function addComment_(user, requestId, message) {
  // توافق مع الواجهة القديمة: addComment(id, author, role, message)
  if (arguments.length > 3) message = arguments[arguments.length - 1];
  message = clean_(message, 2000);
  guardSee_(user, requestId);
  if (message) append_('Comments', { Timestamp: new Date(), RequestID: str_(requestId), Author: user.name, Role: user.role, Message: message });
  return comments_(requestId);
}

function itemNotes_(requestId, itemName) {
  return read_('ItemNotes').rows.filter(function (r) {
    return str_(r.RequestID) === str_(requestId) && (itemName === undefined || str_(r.ItemName) === str_(itemName));
  }).map(function (r) {
    return { time: r.Timestamp, item: str_(r.ItemName), author: str_(r.Author), role: str_(r.Role), note: str_(r.Note) };
  }).sort(function (a, b) { return toMs_(a.time) - toMs_(b.time); });
}

function getItemNotesApi_(user, requestId, itemName) { guardSee_(user, requestId); return itemNotes_(requestId, itemName); }

function addItemNote_(user, requestId, itemName, note) {
  if (arguments.length > 4) note = arguments[arguments.length - 1];
  note = clean_(note, 1000);
  guardSee_(user, requestId);
  if (note) append_('ItemNotes', { Timestamp: new Date(), RequestID: str_(requestId), ItemName: str_(itemName), Author: user.name, Role: user.role, Note: note });
  return itemNotes_(requestId, itemName);
}

function addComplaint_(user, requestId, type, message) {
  if (arguments.length > 4) { type = arguments[arguments.length - 2]; message = arguments[arguments.length - 1]; }
  type = COMPLAINT_TYPES.indexOf(str_(type)) !== -1 ? str_(type) : 'أخرى';
  message = clean_(message, 2000);
  if (!message) throw new Error('ERR_REQUIRED');
  guardSee_(user, requestId);
  const id = 'CMP-' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
  append_('Complaints', {
    ComplaintID: id, Timestamp: new Date(), RequestID: str_(requestId), Author: user.name,
    Role: user.role, Type: type, Message: message, Resolved: false
  });
  logAction_(requestId, 'بلاغ (' + type + ')', user.name);
  const subject = 'بلاغ جديد (' + type + ') على الطلب ' + requestId;
  const body = user.name + ' (' + user.role + '):\n' + message;
  notifyRole_('procurement', subject, body);
  notifyRole_('dashboard', subject, body);
  notifyRole_('admin', subject, body);
  return { id: id };
}

function getComplaints_(user, openOnly) {
  return read_('Complaints').rows.filter(function (r) { return str_(r.ComplaintID); })
    .map(function (r) {
      return {
        id: str_(r.ComplaintID), time: r.Timestamp, requestId: str_(r.RequestID), author: str_(r.Author),
        role: str_(r.Role), type: str_(r.Type), message: str_(r.Message),
        resolved: r.Resolved === true || str_(r.Resolved).toUpperCase() === 'TRUE',
        resolvedBy: str_(r.ResolvedBy), resolvedAt: r.ResolvedAt
      };
    })
    .filter(function (c) { return !openOnly || !c.resolved; })
    .sort(function (a, b) { return toMs_(b.time) - toMs_(a.time); });
}

function resolveComplaint_(user, complaintId) {
  const t = read_('Complaints');
  const row = t.rows.filter(function (r) { return str_(r.ComplaintID) === str_(complaintId); })[0];
  if (!row) throw new Error('ERR_NOT_FOUND');
  setCells_(t, row, { Resolved: true, ResolvedBy: user.name, ResolvedAt: new Date() });
  logAction_(str_(row.RequestID), 'إغلاق بلاغ ' + complaintId, user.name);
  return true;
}

function addNotice_(user, toRole, message) {
  if (arguments.length > 3) { toRole = arguments[arguments.length - 2]; message = arguments[arguments.length - 1]; }
  message = clean_(message, 1000);
  toRole = str_(toRole);
  if (['تموين', 'ممرضة', 'طبيب', 'الكل'].indexOf(toRole) === -1) throw new Error('ERR_BAD_TARGET');
  if (!message) throw new Error('ERR_REQUIRED');
  append_('Notices', { Timestamp: new Date(), FromRole: user.role, FromName: user.name, ToRole: toRole, Message: message });
  return true;
}

function getNotices_(user) {
  const target = NOTICE_TARGET_BY_SCREEN[user.screen];
  return read_('Notices').rows
    .filter(function (r) { return str_(r.Message) && (str_(r.ToRole) === 'الكل' || (target && str_(r.ToRole) === target) || MGMT.indexOf(user.screen) !== -1); })
    .map(function (r) { return { time: r.Timestamp, fromRole: str_(r.FromRole), fromName: str_(r.FromName), toRole: str_(r.ToRole), message: str_(r.Message) }; })
    .sort(function (a, b) { return toMs_(b.time) - toMs_(a.time); })
    .slice(0, 10);
}

/** تنبيهات تظهر أعلى الشاشة حسب الدور */
function getAlerts_(user) {
  const now = Date.now();
  const alerts = [];
  const reqs = requestRows_().map(mapRequest_);
  function hoursSince(v) { return (now - toMs_(v)) / 36e5; }
  if (user.screen === 'nurse') {
    const mine = queryRequests_({ nurse: user.name });
    const toReceive = mine.filter(function (r) { return r.pendingShipments > 0; }).length;
    const rejected = mine.filter(function (r) { return r.status === ST.REJECTED; }).length;
    if (toReceive) alerts.push({ type: 'info', code: 'alert_to_receive', n: toReceive });
    if (rejected) alerts.push({ type: 'danger', code: 'alert_rejected', n: rejected });
  } else if (user.screen === 'procurement') {
    const fresh = reqs.filter(function (r) { return r.status === ST.NEW; });
    const urgent = fresh.filter(function (r) { return r.type === 'طارئ'; }).length;
    const stale = reqs.filter(function (r) {
      return [ST.NEW, ST.PREP, ST.APPROVED].indexOf(r.status) !== -1 && hoursSince(r.submittedAt) > 72;
    }).length;
    const approved = reqs.filter(function (r) { return r.status === ST.APPROVED; }).length;
    const rejected = reqs.filter(function (r) { return r.status === ST.REJECTED; }).length;
    if (urgent) alerts.push({ type: 'danger', code: 'alert_urgent_new', n: urgent });
    if (fresh.length - urgent) alerts.push({ type: 'info', code: 'alert_new', n: fresh.length - urgent });
    if (approved) alerts.push({ type: 'success', code: 'alert_approved_ready', n: approved });
    if (rejected) alerts.push({ type: 'warning', code: 'alert_rejected_proc', n: rejected });
    if (stale) alerts.push({ type: 'warning', code: 'alert_stale', n: stale });
  } else if (user.screen === 'doctor') {
    const pending = reqs.filter(function (r) { return isMyDoctor_(user, r.doctor) && r.status === ST.REVIEW; }).length;
    if (pending) alerts.push({ type: 'warning', code: 'alert_pending_review', n: pending });
  } else {
    const open = getComplaints_(user, true).length;
    const stale = reqs.filter(function (r) {
      return [ST.RECEIVED, ST.REJECTED].indexOf(r.status) === -1 && hoursSince(r.submittedAt) > 72;
    }).length;
    if (open) alerts.push({ type: 'danger', code: 'alert_open_complaints', n: open });
    if (stale) alerts.push({ type: 'warning', code: 'alert_stale', n: stale });
  }
  return alerts;
}

/* =====================================================================
 *  الإشعارات البريدية (لا تُفشل العملية الأصلية إذا تعذّر الإرسال)
 * ===================================================================== */

function sendMail_(to, subject, body) {
  if (!to) return;
  try { MailApp.sendEmail(to, subject, body); } catch (e) { console.error('Mail failed', e); }
}

function notifyRole_(screen, subject, body) {
  const emails = read_('Users').rows
    .filter(function (u) { return str_(u.Email) && roleScreen_(u.Role) === screen; })
    .map(function (u) { return str_(u.Email); });
  if (emails.length) sendMail_(emails.join(','), subject, body);
}

function notifyUser_(name, subject, body) {
  const u = read_('Users').rows.filter(function (r) { return str_(r.Name) === str_(name); })[0];
  if (u && str_(u.Email)) sendMail_(str_(u.Email), subject, body);
}

function notifyNursePartial_(req, r) {
  notifyUser_(req.nurse, 'شحنة جزئية من طلبك - ' + req.id + ' (' + r.sent + '/' + r.total + ')',
    'تم إرسال الشحنة رقم ' + r.batch + ' من طلبك ' + req.id + ' الخاص بعيادة ' + req.clinic + ':\n- ' +
    r.items.join('\n- ') + '\n\nأُرسل ' + r.sent + ' من ' + r.total + ' صنف، والمتبقي ' + r.remaining +
    ' صنف سيُرسل لاحقاً.\nيرجى تأكيد استلام هذه الشحنة والتوقيع عليها من داخل النظام عند وصولها.');
}

function notifyNurseSent_(req) {
  notifyUser_(req.nurse, 'تم إرسال طلبك - ' + req.id,
    'تم إرسال طلبك رقم ' + req.id + ' الخاص بعيادة ' + req.clinic +
    '.\nيرجى تأكيد الاستلام والتوقيع من داخل النظام عند وصول الطلب.');
}

/* =====================================================================
 *  تقارير الجودة والإدارة
 * ===================================================================== */

function getQualityReport_(month) {
  const rows = queryRequests_(month ? { month: month } : {})
    .filter(function (r) { return toMs_(r.submittedAt) && toMs_(r.sentAt); })
    .map(function (r) {
      return { id: r.id, clinic: r.clinic, doctor: r.doctor, type: r.type, status: r.status,
        hours: round1_((toMs_(r.sentAt) - toMs_(r.submittedAt)) / 36e5) };
    });
  const byClinic = {};
  rows.forEach(function (r) { (byClinic[r.clinic] = byClinic[r.clinic] || []).push(r.hours); });
  const averages = Object.keys(byClinic).map(function (c) {
    const arr = byClinic[c];
    return { clinic: c, avgHours: round1_(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length), count: arr.length };
  }).sort(function (a, b) { return b.avgHours - a.avgHours; });
  return { rows: rows, averages: averages };
}

function getQualityTrend_(monthsBack) {
  monthsBack = Math.min(Math.max(Number(monthsBack) || 6, 1), 24);
  const byMonth = {};
  requestRows_().forEach(function (r) {
    const a = toMs_(r.SubmittedAt), b = toMs_(r.SentAt);
    if (!a || !b) return;
    const m = monthOf_(r.Date || r.SubmittedAt);
    (byMonth[m] = byMonth[m] || []).push((b - a) / 36e5);
  });
  const now = new Date();
  const out = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const m = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() - i, 15), TZ, 'yyyy-MM');
    const arr = byMonth[m] || [];
    out.push({ month: m, avgHours: arr.length ? round1_(arr.reduce(function (x, y) { return x + y; }, 0) / arr.length) : 0, count: arr.length });
  }
  return out;
}

function getExecutiveStats_(user, month) {
  const all = queryRequests_(month ? { month: month } : {});
  const statusCounts = {};
  const typeCounts = {};
  all.forEach(function (r) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
  });

  // الأصناف الأكثر طلباً (بديل تقريبي عن دوران المخزون - النظام لا يتتبع أرصدة المستودع)
  const ids = {};
  all.forEach(function (r) { ids[r.id] = true; });
  const itemTotals = {};
  let shortages = 0;
  read_('RequestItems').rows.forEach(function (r) {
    if (!ids[str_(r.RequestID)]) return;
    const n = str_(r.ItemName);
    itemTotals[n] = (itemTotals[n] || 0) + (Number(r.RequestedQty) || 0);
    if (r.ReceivedQty !== '' && r.ReceivedQty !== null) {
      const expected = r.ApprovedQty !== '' && r.ApprovedQty !== null ? Number(r.ApprovedQty) : Number(r.RequestedQty);
      if (Number(r.ReceivedQty) < expected) shortages++;
    }
  });
  const topItems = Object.keys(itemTotals)
    .map(function (name) { return { name: name, qty: itemTotals[name] }; })
    .sort(function (a, b) { return b.qty - a.qty; })
    .slice(0, 8);

  const qr = getQualityReport_(month);
  const overallAvg = qr.rows.length
    ? round1_(qr.rows.reduce(function (s, r) { return s + r.hours; }, 0) / qr.rows.length) : 0;
  const recentComments = read_('Comments').rows
    .map(function (r) { return { time: r.Timestamp, requestId: str_(r.RequestID), author: str_(r.Author), role: str_(r.Role), message: str_(r.Message) }; })
    .sort(function (a, b) { return toMs_(b.time) - toMs_(a.time); })
    .slice(0, 10);

  return {
    total: all.length,
    statusCounts: statusCounts,
    typeCounts: typeCounts,
    overallAvgHours: overallAvg,
    byClinic: qr.averages,
    topItems: topItems,
    shortages: shortages,
    openComplaints: getComplaints_(user, true).length,
    recentComments: recentComments
  };
}

/* =====================================================================
 *  إدارة المستخدمين والأدوار
 * ===================================================================== */

function getUsers_() {
  return read_('Users').rows.filter(function (r) { return str_(r.Name); }).map(function (r) {
    return { name: str_(r.Name), role: str_(r.Role), clinic: str_(r.Clinic), email: str_(r.Email), screen: roleScreen_(r.Role) };
  });
}

function validateUserFields_(u) {
  if (u.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) throw new Error('ERR_BAD_EMAIL');
  if (!roleScreen_(u.role)) throw new Error('ERR_ROLE_UNMAPPED');
}

function createUser_(user, u) {
  u = u || {};
  const name = clean_(u.name, 80);
  const password = String(u.password || '');
  if (!name || !password) throw new Error('ERR_REQUIRED');
  if (password.length < 4) throw new Error('ERR_WEAK_PASSWORD');
  const fields = { role: str_(u.role), clinic: clean_(u.clinic, 500), email: str_(u.email) };
  validateUserFields_(fields);
  if (getUsers_().some(function (x) { return loginKey_(x.name) === loginKey_(name); })) throw new Error('ERR_USER_EXISTS');
  append_('Users', { Name: name, Password: hashPassword_(latinDigits_(password).trim()), Role: fields.role, Clinic: fields.clinic, Email: fields.email });
  logAction_('', 'إنشاء مستخدم: ' + name, user.name);
  return getUsers_();
}

function countAdmins_(except) {
  return getUsers_().filter(function (u) { return u.screen === 'admin' && u.name !== except; }).length;
}

function updateUser_(user, name, u) {
  u = u || {};
  const t = read_('Users');
  const row = t.rows.filter(function (r) { return str_(r.Name) === str_(name); })[0];
  if (!row) throw new Error('ERR_NOT_FOUND');
  const fields = { role: str_(u.role), clinic: clean_(u.clinic, 500), email: str_(u.email) };
  validateUserFields_(fields);
  if (roleScreen_(row.Role) === 'admin' && roleScreen_(fields.role) !== 'admin' && countAdmins_(str_(name)) === 0) {
    throw new Error('ERR_LAST_ADMIN');
  }
  const upd = { Role: fields.role, Clinic: fields.clinic, Email: fields.email };
  if (u.password) {
    if (String(u.password).length < 4) throw new Error('ERR_WEAK_PASSWORD');
    upd.Password = hashPassword_(latinDigits_(String(u.password)).trim());
  }
  setCells_(t, row, upd);
  logAction_('', 'تعديل مستخدم: ' + name, user.name);
  return getUsers_();
}

function deleteUser_(user, name) {
  name = str_(name);
  if (name === user.name) throw new Error('ERR_DELETE_SELF');
  const t = read_('Users');
  const row = t.rows.filter(function (r) { return str_(r.Name) === name; })[0];
  if (!row) throw new Error('ERR_NOT_FOUND');
  if (roleScreen_(row.Role) === 'admin' && countAdmins_(name) === 0) throw new Error('ERR_LAST_ADMIN');
  t.sh.deleteRow(row._row);
  invalidate_('Users');
  logAction_('', 'حذف مستخدم: ' + name, user.name);
  return getUsers_();
}

function saveRole_(user, name, screen) {
  name = clean_(name, 60);
  screen = str_(screen);
  if (!name) throw new Error('ERR_REQUIRED');
  if (SCREENS.indexOf(screen) === -1) throw new Error('ERR_BAD_SCREEN');
  const t = read_('Roles');
  const row = t.rows.filter(function (r) { return str_(r.RoleName) === name; })[0];
  if (row) {
    if (roleScreen_(name) === 'admin' && screen !== 'admin') {
      const others = getUsers_().filter(function (u) { return u.screen === 'admin' && u.role !== name; }).length;
      if (!others) throw new Error('ERR_LAST_ADMIN');
    }
    setCells_(t, row, { Screen: screen });
  } else {
    append_('Roles', { RoleName: name, Screen: screen });
  }
  return getRoles_();
}

function deleteRole_(user, name) {
  name = str_(name);
  if (getUsers_().some(function (u) { return u.role === name; })) throw new Error('ERR_ROLE_IN_USE');
  const t = read_('Roles');
  const row = t.rows.filter(function (r) { return str_(r.RoleName) === name; })[0];
  if (!row) throw new Error('ERR_NOT_FOUND');
  t.sh.deleteRow(row._row);
  invalidate_('Roles');
  return getRoles_();
}
