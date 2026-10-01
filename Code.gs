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
  // Department للمستخدم: تموين أسنان / تموين جلدية (فارغ = كل الأقسام)
  Users:        ['Name', 'Password', 'Role', 'Clinic', 'Email', 'PasswordChangedAt', 'DoctorName', 'Department'],
  Roles:        ['RoleName', 'Screen', 'Permissions'],
  Clinics:      ['ClinicName', 'Branch', 'Type'],
  Doctors:      ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty'],
  // Ownership: مستهلك (افتراضي) أو عهدة (على حساب الشركة) · Serialized: نعم للأدوات ذات الرقم التسلسلي (الهاندبيس…)
  // Department: أسنان / جلدية (فارغ = مشترك يظهر للقسمين)
  ItemsCatalog: ['ItemName', 'CommercialName', 'Category', 'Price', 'Ownership', 'Serialized', 'Department'],
  Requests:     ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status',
                 'SubmittedAt', 'SentAt', 'ReceivedAt', 'ReceiverName', 'SignatureURL',
                 'PrepAt', 'VendorWaitAt', 'VendorReceivedAt', 'ReviewAt', 'ReviewedAt',
                 'RejectionReason', 'ReceiptURL', 'Branch', 'ApprovedAt', 'ClientKey', 'Department'],
  // ItemStatus: حالة الصنف داخل الطلبية (قيد التجهيز / بانتظار المندوب / استلم المندوب) قبل إرساله
  RequestItems: ['RequestID', 'ItemName', 'RequestedQty', 'ApprovedQty', 'ReceivedQty', 'DispatchedAt', 'DispatchBatch', 'ItemStatus', 'ItemStatusAt', 'ItemStatusBy'],
  // سجل التراجعات: كل تراجع عن خطوة (شحنة أُرسلت بالغلط، حالة طلب، حالة صنف) مع السبب والوقت — تراه الجودة والإدارة
  Reversals:    ['Timestamp', 'RequestID', 'User', 'Role', 'Scope', 'From', 'To', 'Reason', 'Details'],
  // كل سطر = كمية صنف واحد داخل شحنة واحدة (يسمح بإرسال جزء من كمية الصنف)
  ShipmentItems: ['RequestID', 'Batch', 'ItemName', 'Qty', 'DispatchedAt', 'DispatchedBy', 'ReceivedQty'],
  Shipments:    ['RequestID', 'Batch', 'ReceivedAt', 'ReceiverName', 'ReceivedBy', 'SignatureURL', 'SignatureFileID', 'ReceiptURL'],
  ItemNotes:    ['Timestamp', 'RequestID', 'ItemName', 'Author', 'Role', 'Note'],
  Log:          ['Timestamp', 'RequestID', 'Action', 'User'],
  Comments:     ['Timestamp', 'RequestID', 'Author', 'Role', 'Message'],
  Notices:      ['Timestamp', 'FromRole', 'FromName', 'ToRole', 'Message'],
  Complaints:   ['ComplaintID', 'Timestamp', 'RequestID', 'Author', 'Role', 'Type', 'Message',
                 'Resolved', 'ResolvedBy', 'ResolvedAt'],
  // المعمل: المعامل وأنواع الأعمال تُعبّأ يدوياً؛ الإرساليات وأسطرها وملاحظاتها تُنشأ من النظام
  Labs:         ['LabName', 'Type', 'Email', 'Phone', 'Active', 'TurnaroundDays'],
  LabWorkTypes: ['WorkType'],
  LabMaterials: ['Material'],
  // إعدادات عامة قابلة للتعديل من الشيت (مثل LabTurnaroundDays = أيام تنفيذ المعمل الافتراضية)
  Settings:     ['Key', 'Value', 'Notes'],
  LabCases:     ['CaseID', 'Date', 'Nurse', 'Doctor', 'Clinic', 'Branch', 'Patient', 'FileNo', 'NeededBy', 'Urgent',
                 'RedoOf', 'RedoReason', 'RedoNote', 'Attachments', 'ClientKey', 'ScanDate', 'Notes', 'Source'],
  LabItems:     ['ItemID', 'CaseID', 'Lab', 'LabType', 'WorkType', 'Details', 'Status', 'ReceivedAt', 'StartedAt',
                 'ExternalLab', 'ExternalAt', 'ExpectedAt', 'ReadyAt', 'SentAt', 'DeliveredAt', 'Cost', 'RedoOfItem', 'RedoReason', 'UpdatedBy',
                 'Material', 'PatientAt', 'Attachments'],
  LabNotes:     ['Timestamp', 'CaseID', 'ItemID', 'Author', 'Role', 'Message'],
  // عُهدة العيادة: المعيار لكل عيادة، القطع المصروفة (بالرقم التسلسلي)، وبلاغات الأدوات
  ClinicStandards: ['Clinic', 'Item', 'StandardQty', 'UpdatedBy', 'UpdatedAt'],
  Assets:       ['AssetID', 'Item', 'Serial', 'Clinic', 'Branch', 'Qty', 'Status', 'IssuedAt', 'IssuedBy', 'Cost', 'TicketID', 'Notes', 'UpdatedAt', 'UpdatedBy'],
  AssetTickets: ['TicketID', 'Date', 'AssetID', 'Item', 'Serial', 'Clinic', 'Branch', 'Nurse', 'Problem', 'Description', 'Photo', 'Status',
                 'ReceivedAt', 'ReceivedBy', 'InspectPhoto', 'InspectNote', 'Decision', 'DecidedAt', 'RepairVendor', 'RepairCost', 'LossValue',
                 'ReturnedAt', 'ReplacementAssetID', 'ClosedAt', 'UpdatedBy', 'ClientKey']
};

const ST = {
  NEW: 'جديد', PREP: 'قيد التجهيز', VENDOR_WAIT: 'بانتظار المندوب', VENDOR_RECV: 'استلم المندوب',
  REVIEW: 'مراجعة الطبيب', APPROVED: 'معتمد من الطبيب', REJECTED: 'مرفوض',
  SENT: 'تم الإرسال', RECEIVED: 'تم الاستلام'
};

/*
 * التسلسل: رفع الطلب ← مراجعة الطبيب واعتماده ← التجهيز (← المندوب اختياري) ← الإرسال للفرع ← الاستلام بالتوقيع.
 * طبيب بدون حساب في النظام: يذهب الطلب للتموين مباشرة بحالة «جديد».
 * الرفض يعيد الطلب للممرضة مع السبب لتعيد إرساله للطبيب.
 */
const TRANSITIONS = {};
// إرسال (أو إعادة إرسال) للطبيب: طلب جديد/مرفوض، أو طلب قديم جُهّز قبل اعتماده (المسار السابق)
TRANSITIONS[ST.REVIEW]      = { from: [ST.NEW, ST.REJECTED, ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV], stamp: 'ReviewAt' };
TRANSITIONS[ST.PREP]        = { from: [ST.APPROVED, ST.NEW], stamp: 'PrepAt' };
TRANSITIONS[ST.VENDOR_WAIT] = { from: [ST.PREP], stamp: 'VendorWaitAt' };
TRANSITIONS[ST.VENDOR_RECV] = { from: [ST.VENDOR_WAIT], stamp: 'VendorReceivedAt' };
TRANSITIONS[ST.SENT]        = { from: [ST.APPROVED, ST.PREP, ST.VENDOR_RECV], stamp: 'SentAt' };
// حالات يمكن فيها إرسال أصناف (بعد الاعتماد)
const DISPATCHABLE = [ST.APPROVED, ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV];

const REQUEST_TYPES = ['شهري', 'طارئ'];
const SCREENS = ['nurse', 'procurement', 'doctor', 'lab', 'quality', 'executive', 'finance', 'dashboard', 'admin'];
/** شاشات الإدارة: ما يظهر فيها تحدده صلاحيات الدور (Permissions في تبويب Roles) */
const MGMT_SCREENS = ['quality', 'executive', 'finance', 'dashboard', 'admin'];
const DEFAULT_ROLES = [
  ['ممرضة', 'nurse'], ['تموين', 'procurement'], ['طبيب', 'doctor'],
  ['جودة', 'quality'], ['جوده', 'quality'], ['مالية', 'finance'], ['تنفيذي', 'executive'], ['أدمن', 'admin'], ['المعمل', 'lab']
];
/**
 * الصلاحيات القابلة للتحديد لكل دور إداري. الأدمن له كل شيء دائماً.
 * overview: نظرة عامة · reports: التقارير والإحصائيات · complaints: عرض البلاغات · complaints_close: إغلاقها
 * notices: إرسال التنبيهات · monitor: متابعة التموين والمواعيد · finance: شاشة المالية
 * prices_edit: تعديل أسعار الكتالوج · users: المستخدمون والأدوار
 */
const PERMS = ['overview', 'reports', 'complaints', 'complaints_close', 'notices', 'monitor', 'finance', 'prices_edit', 'lab_view', 'assets', 'users'];
const DEFAULT_PERMS = {
  admin: PERMS,
  executive: ['overview', 'reports', 'complaints', 'complaints_close', 'notices', 'monitor', 'lab_view', 'assets'],
  quality: ['overview', 'reports', 'complaints', 'complaints_close', 'notices', 'monitor', 'lab_view', 'assets'],
  finance: ['finance', 'prices_edit', 'reports', 'monitor', 'assets'],
  dashboard: ['overview', 'reports', 'complaints', 'notices']
};
/* الطلب الشهري يُرفع من يوم 15 إلى 20، ويجب أن يُستلم قبل يوم 1 من الشهر التالي؛ الطارئ خلال 24 ساعة */
const MONTHLY_WINDOW = [15, 20];
const EMERGENCY_DUE_HOURS = 24;
const AT_RISK_DAYS = 5;
const NOTICE_TARGET_BY_SCREEN = { nurse: 'ممرضة', procurement: 'تموين', doctor: 'طبيب' };
const COMPLAINT_TYPES = ['تأخير', 'نقص', 'زيادة', 'أخرى'];

/* =====================================================================
 *  الإعداد لأول مرة
 * ===================================================================== */

/**
 * شغّل هذه الدالة مرة واحدة من محرر Apps Script. آمنة للتشغيل أكثر من مرة:
 * تضيف التبويبات/الأعمدة الناقصة فقط ولا تمسح أي بيانات.
 */
/* =====================================================================
 *  التجهيز التلقائي بعد النشر (مرة واحدة لكل إصدار) — بلا أي خطوة يدوية:
 *  تبويبات الإعداد (Settings / LabMaterials)، قائمة العيادات المعتمدة، المشغّلات (النسخ الليلي + onChange)
 * ===================================================================== */
const SETUP_VERSION_ = '2026-10-setup-v2';
function autoSetup_() {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('setup:ok') === SETUP_VERSION_) return;
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('setup:done') !== SETUP_VERSION_) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(5000)) return; // يُعاد في الاستدعاء التالي
      try {
        if (props.getProperty('setup:done') !== SETUP_VERSION_) {
          const res = runSetupSteps_(false);
          if (res.ok) props.setProperty('setup:done', SETUP_VERSION_);
          else { cache.put('setup:ok', SETUP_VERSION_, 1800); return; } // فشل خطوة: نعيد المحاولة بعد 30 دقيقة (والأدمن يرى السبب)
        }
      } finally { lock.releaseLock(); }
    }
    cache.put('setup:ok', SETUP_VERSION_, 21600);
  } catch (e) { console.error('autoSetup_', e); } // التجهيز لا يمنع النظام من العمل أبداً
}

/** خطوات التجهيز — كل خطوة مستقلة (فشل واحدة لا يوقف البقية)، والنتيجة تُحفظ ليراها الأدمن */
function runSetupSteps_(force) {
  const steps = [
    ['lab', 'إعدادات المعمل (Settings / LabMaterials)', seedLabSetup_],
    ['clinics', 'قائمة العيادات المعتمدة', migrateClinics_],
    ['perms', 'صلاحية العهدة للإدارة والجودة والمالية', function () { grantPerm_('assets', ['executive', 'quality', 'finance']); }],
    ['demo', 'أدوات العهدة التجريبية TEST101', function () { seedDemoAssets_(force); }],
    ['triggers', 'المشغّلات (النسخ الليلي + تغييرات الشيت)', function () { if (typeof ScriptApp !== 'undefined') installTriggers(); }]
  ];
  const log = steps.map(function (st) {
    try { st[2](); flushDirty_(); return { step: st[0], label: st[1], ok: true }; }
    catch (e) { console.error('setup ' + st[0], e); try { flushDirty_(); } catch (x) { /* تجاهل */ } return { step: st[0], label: st[1], ok: false, error: String((e && e.message) || e) }; }
  });
  const out = { version: SETUP_VERSION_, at: new Date().toISOString(), ok: log.every(function (l) { return l.ok; }), log: log };
  try { PropertiesService.getScriptProperties().setProperty('setup:log', JSON.stringify(out)); } catch (e) { /* تجاهل */ }
  return out;
}

/** حالة التجهيز للأدمن: إصدار الكود الذي يعمل الآن، آخر تشغيل وخطواته، وعدد أدوات TEST101 */
function getSetupStatus_() {
  const props = PropertiesService.getScriptProperties();
  let last = null;
  try { last = JSON.parse(props.getProperty('setup:log') || 'null'); } catch (e) { last = null; }
  return { version: SETUP_VERSION_, done: props.getProperty('setup:done') === SETUP_VERSION_, last: last,
    demoTools: read_('ItemsCatalog').rows.filter(function (r) { return /TEST101$/i.test(str_(r.ItemName)); }).length,
    assetTools: read_('ItemsCatalog').rows.filter(function (r) { return isAssetOwnership_(r.Ownership); }).length };
}
function runSetupNow_(user) {
  return withLock_(function () {
    const res = runSetupSteps_(true);
    if (res.ok) PropertiesService.getScriptProperties().setProperty('setup:done', SETUP_VERSION_);
    logAction_('', 'تشغيل التجهيز يدوياً: ' + (res.ok ? 'نجح' : 'فيه أخطاء'), user.name);
    return getSetupStatus_();
  });
}

/** صلاحية جديدة تُضاف للأدوار التي حُفظت صلاحياتها يدوياً (الافتراضية تأخذها تلقائياً) */
function grantPerm_(perm, screens) {
  const t = read_('Roles');
  if (t.headers.indexOf('Permissions') === -1) return;
  const ups = t.rows.filter(function (r) {
    const v = str_(r.Permissions);
    return screens.indexOf(str_(r.Screen)) !== -1 && v && v !== '*' && v !== 'none' && v.split(/[,،\s]+/).indexOf(perm) === -1;
  }).map(function (r) { return { row: r, obj: { Permissions: str_(r.Permissions) + ',' + perm } }; });
  if (ups.length) setMany_(t, ups);
}

/**
 * أدوات عهدة تجريبية (اسمها ينتهي بـ TEST101) — مثال لمن يضيف الأدوات الحقيقية:
 * Ownership = عهدة، Serialized = نعم للأدوات ذات الرقم التسلسلي، وسعر للوحدة. تُضاف مرة واحدة ولا تتكرر، ويمكن حذفها لاحقاً.
 */
const DEMO_ASSETS_ = [
  ['Handpiece Low Speed TEST101', 'NSK', 'Handpiece', 1450, 'نعم'],
  ['Handpiece High Speed TEST101', 'NSK', 'Handpiece', 2150, 'نعم'],
  ['Ultrasonic Scaler TEST101', 'Woodpecker', 'Equipment', 3200, 'نعم'],
  ['Apex Locator TEST101', 'Morita', 'Equipment', 1875, 'نعم'],
  ['Intraoral Camera TEST101', 'Acteon', 'Equipment', 2730, 'نعم'],
  ['Curing Light TEST101', 'Woodpecker', 'Equipment', 785, ''],
  ['Amalgamator TEST101', 'SDI', 'Equipment', 640, ''],
  ['Dental Loupes TEST101', 'Univet', 'Equipment', 1190, '']
];
function seedDemoAssets_(force) {
  // تلقائياً: شيت العيادة فقط (بريدة/عنيزة) · يدوياً من الأدمن: دائماً
  if (!force && !read_('Clinics').rows.some(function (r) { return /buraydah|unayzah|بريدة|عنيزة/i.test(str_(r.Branch)); })) return;
  const have = {};
  read_('ItemsCatalog').rows.forEach(function (r) { have[str_(r.ItemName).toLowerCase()] = true; });
  DEMO_ASSETS_.forEach(function (d) {
    if (have[d[0].toLowerCase()]) return;
    append_('ItemsCatalog', { ItemName: d[0], CommercialName: d[1], Category: d[2], Price: d[3], Ownership: 'عهدة', Serialized: d[4] });
  });
}

function seedLabSetup_() {
  if (read_('LabMaterials').rows.length === 0) LAB_MATERIALS_DEFAULT.forEach(function (m) { append_('LabMaterials', { Material: m }); });
  if (!read_('Settings').rows.some(function (r) { return str_(r.Key) === 'LabTurnaroundDays'; })) {
    append_('Settings', { Key: 'LabTurnaroundDays', Value: LAB_TURNAROUND_DEFAULT, Notes: 'أيام تنفيذ المعمل الافتراضية: موعد المعمل = تاريخ السكان + هذا العدد (ولكل معمل عمود TurnaroundDays في تبويب Labs)' });
  }
}

/** مفتاح مقارنة أسماء العيادات: بلا مسافات/شرطات/حالة أحرف، ويصحح تهجئة Steralization */
function clinicMatchKey_(v) { return str_(v).toLowerCase().replace(/steraliz/g, 'steriliz').replace(/[\s\-–—_]+/g, ''); }

/**
 * يجعل تبويب Clinics مطابقاً للقائمة المعتمدة (22 عيادة: بريدة وعنيزة) — فقط في شيت عيادات بريدة/عنيزة.
 * قبل التعديل تُؤخذ نسخة احتياطية، وتُصحَّح أسماء العيادات في Users وDoctors إن تطابقت (مثل Steralization- Buraydah).
 */
function migrateClinics_() {
  const t = read_('Clinics');
  if (!t.rows.some(function (r) { return /buraydah|unayzah|بريدة|عنيزة/i.test(str_(r.Branch)); })) return; // ليس شيت العيادة
  const target = DEFAULT_CLINICS_;
  const same = t.rows.filter(function (r) { return str_(r.ClinicName); }).map(function (r) { return [str_(r.ClinicName), str_(r.Branch), str_(r.Type)].join('|'); });
  if (same.length === target.length && target.every(function (c, i) { return same[i] === c.join('|'); })) return;
  try { runBackup_('النظام (قبل تحديث العيادات)'); } catch (e) { console.error(e); }
  const sh = sheet_('Clinics');
  const values = sheetValues_('Clinics');
  const head = values[0];
  const width = head.length;
  const iName = head.indexOf('ClinicName'), iBranch = head.indexOf('Branch'), iType = head.indexOf('Type');
  const oldCount = Math.max(0, sh.getLastRow() - 1);
  const rows = [];
  for (let k = 0; k < Math.max(oldCount, target.length); k++) {
    const row = []; for (let j = 0; j < width; j++) row.push('');
    if (k < target.length) { row[iName] = target[k][0]; row[iBranch] = target[k][1]; row[iType] = target[k][2]; }
    rows.push(row);
  }
  sh.getRange(2, 1, rows.length, width).setValues(rows);
  markDirty_('Clinics');
  // تصحيح المراجع في Users/Doctors (قائمة مفصولة بفواصل)
  const byKey = {};
  target.forEach(function (c) { byKey[clinicMatchKey_(c[0])] = c[0]; });
  const unknown = {};
  [['Users', 'Clinic'], ['Doctors', 'Clinic']].forEach(function (pair) {
    const tb = read_(pair[0]);
    const ups = [];
    tb.rows.forEach(function (r) {
      const raw = str_(r[pair[1]]); if (!raw) return;
      let changed = false;
      const parts = raw.split(/[,،]/).map(function (x) {
        const v = x.trim(), hit = byKey[clinicMatchKey_(v)];
        if (hit && hit !== v) { changed = true; return hit; }
        if (!hit && /clinic|steril|derma/i.test(v) && !isSpecialtyWord_(v)) unknown[v] = true;
        return v;
      });
      if (changed) ups.push({ row: r, obj: (function () { const o = {}; o[pair[1]] = parts.join(', '); return o; })() });
    });
    if (ups.length) setMany_(tb, ups);
  });
  logAction_('', 'تحديث تبويب العيادات للقائمة المعتمدة (' + target.length + ' عيادة)' +
    (Object.keys(unknown).length ? ' — أسماء قديمة تحتاج ربطاً في Users/Doctors: ' + Object.keys(unknown).join('، ') : ''), 'النظام');
}

/** العيادات الافتراضية لتجهيز نظام جديد فقط — بعدها تبويب Clinics هو المرجع (أضف/احذف صفوفاً منه مباشرة) */
const DEFAULT_CLINICS_ = (function () {
  const out = [];
  for (let i = 1; i <= 12; i++) out.push(['Dental Clinic ' + i + ' - Buraydah', 'Buraydah', 'Dentistry']);
  ['Derma Hydrafacial', 'Derma Clarity', 'Derma Gentle Pro', 'Derma CLINIC'].forEach(function (n) { out.push([n, 'Buraydah', 'Dermatology']); });
  for (let j = 1; j <= 4; j++) out.push(['Dental Clinic ' + j + ' - Unayzah', 'Unayzah', 'Dentistry']);
  out.push(['Sterilization - Buraydah', 'Buraydah', 'Sterilization'], ['Sterilization - Unayzah', 'Unayzah', 'Sterilization']);
  return out;
})();

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
    append_('Users', { Name: 'المدير', Password: '1234', Role: 'أدمن' });
  }
  if (read_('Clinics').rows.length === 0) {
    DEFAULT_CLINICS_.forEach(function (c) { append_('Clinics', { ClinicName: c[0], Branch: c[1], Type: c[2] }); });
  }
  if (read_('LabWorkTypes').rows.length === 0) {
    LAB_WORK_TYPES_DEFAULT.forEach(function (w) { append_('LabWorkTypes', { WorkType: w }); });
  }
  if (read_('Labs').rows.length === 0) append_('Labs', { LabName: 'المعمل الداخلي', Type: 'داخلي', Active: 'نعم' });
  if (read_('LabMaterials').rows.length === 0) LAB_MATERIALS_DEFAULT.forEach(function (m) { append_('LabMaterials', { Material: m }); });
  if (!read_('Settings').rows.some(function (r) { return str_(r.Key) === 'LabTurnaroundDays'; })) {
    append_('Settings', { Key: 'LabTurnaroundDays', Value: LAB_TURNAROUND_DEFAULT, Notes: 'أيام تنفيذ المعمل الافتراضية: موعد المعمل = تاريخ السكان + هذا العدد (ولكل معمل عمود TurnaroundDays في تبويب Labs)' });
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
  flushDirty_(); // يُبطل كاش التبويبات التي أنشأناها/ملأناها
  migrateRoles_();
  try { installTriggers(); } catch (e) { console.error(e); } // يحتاج صلاحية المشغّلات
  try {
    SpreadsheetApp.getUi().alert('تم تجهيز التبويبات. غيّر كلمة سر "المدير" بعد أول دخول، ثم أضف العيادات والأطباء والمستخدمين.');
  } catch (e) { /* يعمل بدون واجهة (مثلاً من المشغّلات) */ }
}

/* =====================================================================
 *  نقاط الدخول
 * ===================================================================== */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('مسار — ApexCare')
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
  MEMO_ = {};
  args = Array.isArray(args) ? args : [];
  fn = String(fn);
  // القراءة من الكاش في كل العمليات؛ الكتابات تتحقق من الشيت الحي (withLock_ / setMany_)
  CACHED_READS_ = true;
  autoSetup_();
  try {
    if (fn === 'login') return sanitize_(login_(args[0], args[1], args[2]));
    if (fn === 'logout') { logout_(token); return true; }
    // إيقاظ الخادم وتسخين كاش المستخدمين والأدوار أثناء كتابة بيانات الدخول (بدون جلسة، لا يُرجع بيانات)
    if (fn === 'ping') { read_('Users'); getRoles_(); return true; }
    if (fn === 'batch') return batch_(token, args[0]);
    const def = API_[fn];
    if (!def) throw new Error('ERR_UNKNOWN_FN');
    const user = session_(token);
    if (!allowed_(def, user)) throw new Error('ERR_FORBIDDEN');
    return sanitize_(def.fn.apply(null, [user].concat(args)));
  } finally {
    flushDirty_();
    CACHED_READS_ = false;
  }
}

/**
 * عدة عمليات قراءة في تنفيذ واحد (تقلل عدد الاستدعاءات المتزامنة على Apps Script).
 * calls = [[fn, args], ...] → [{ok, data} | {ok:false, error}, ...]
 */
const BATCH_MAX = 12;
/** يسمح بالدالة إن كانت شاشة المستخدم ضمن screens، أو لديه الصلاحية perm (للأدوار الإدارية) */
function allowed_(def, user) {
  if (def.screens === '*' || def.screens.indexOf(user.screen) !== -1) return true;
  return !!def.perm && (user.perms || []).indexOf(def.perm) !== -1;
}

function batch_(token, calls) {
  if (!Array.isArray(calls) || !calls.length || calls.length > BATCH_MAX) throw new Error('ERR_BAD_BATCH');
  return runBatch_(session_(token), calls);
}

function runBatch_(user, calls) {
  return calls.map(function (c) {
    try {
      const fn = String(c && c[0]);
      const def = API_[fn];
      if (!def || fn.indexOf('get') !== 0) throw new Error('ERR_UNKNOWN_FN'); // القراءة فقط
      if (!allowed_(def, user)) throw new Error('ERR_FORBIDDEN');
      return { ok: true, data: sanitize_(def.fn.apply(null, [user].concat(Array.isArray(c[1]) ? c[1] : []))) };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
}

const ALL = '*';
const MGMT = MGMT_SCREENS;
const API_ = {
  getConfig:                 { screens: ALL, fn: getConfig_ },
  changePassword:            { screens: ALL, fn: changePassword_ },
  getAlerts:                 { screens: ALL, fn: getAlerts_ },
  getNotices:                { screens: ALL, fn: getNotices_ },
  getDoctors:                { screens: ['nurse'], fn: getDoctors_ },
  getDoctorProfile:          { screens: ['nurse'], fn: getDoctorProfile_ },
  createRequest:             { screens: ['nurse'], fn: createRequest_ },
  getMyRequests:             { screens: ['nurse'], fn: getMyRequests_ },
  receiveShipment:           { screens: ['nurse'], fn: receiveShipment_ },
  resubmitRequest:           { screens: ['nurse'], fn: resubmitRequest_ },
  getShipmentSignatures:     { screens: ['nurse'], fn: getShipmentSignatures_ },
  getRequests:               { screens: ['procurement'].concat(MGMT), fn: getRequestsApi_ },
  getRequestItemsFull:       { screens: ['procurement'].concat(MGMT), fn: getRequestItemsFull_ },
  updateItemApproval:        { screens: ['procurement'], fn: updateItemApproval_ },
  dispatchItems:             { screens: ['procurement'], fn: dispatchItems_ },
  setItemsStatus:            { screens: ['procurement'], fn: setItemsStatus_ },
  getRevertPlan:             { screens: ['procurement'], fn: function (u, id) { return cachedRead_(function () { return revertPlan_(id).plan; }); } },
  revertStep:                { screens: ['procurement'], fn: revertStep_ },
  getReversals:              { screens: ['procurement'], perm: 'monitor', fn: getReversals_ },
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
  getComplaints:             { screens: ['procurement'], perm: 'complaints', fn: getComplaints_ },
  // إغلاق البلاغات للجودة والإدارة التنفيذية فقط (التموين يطّلع ويعلّق)
  resolveComplaint:          { screens: [], perm: 'complaints_close', fn: resolveComplaint_ },
  getDoctorReport:           { screens: ['doctor'], perm: 'reports', fn: getDoctorReport_ },
  getReportDoctors:          { screens: [], perm: 'reports', fn: getReportDoctors_ },
  getStatsReport:            { screens: [], perm: 'reports', fn: getStatsReport_ },
  addNotice:                 { screens: [], perm: 'notices', fn: addNotice_ },
  getExecutiveStats:         { screens: [], perm: 'overview', fn: getExecutiveStats_ },
  getQualityReport:          { screens: [], perm: 'overview', fn: function (u, m) { return getQualityReport_(m); } },
  getQualityTrend:           { screens: [], perm: 'overview', fn: function (u, n) { return getQualityTrend_(n); } },
  getUsers:                  { screens: [], perm: 'users', fn: getUsers_ },
  getBackupStatus:           { screens: [], perm: 'users', fn: function () { return backupStatus_(); } },
  getSetupStatus:            { screens: [], perm: 'users', fn: function () { return getSetupStatus_(); } },
  runSetupNow:               { screens: [], perm: 'users', fn: runSetupNow_ },
  backupNow:                 { screens: [], perm: 'users', fn: function (user) { return runBackup_(user.name); } },
  getDoctorLinks:            { screens: [], perm: 'users', fn: getDoctorLinks_ },
  createUser:                { screens: [], perm: 'users', fn: createUser_ },
  updateUser:                { screens: [], perm: 'users', fn: updateUser_ },
  deleteUser:                { screens: [], perm: 'users', fn: deleteUser_ },
  getRoles:                  { screens: [], perm: 'users', fn: function () { return getRoles_(); } },
  getMonitor:                { screens: [], perm: 'monitor', fn: getMonitor_ },
  // المعمل
  getLabConfig:              { screens: ['nurse', 'doctor', 'lab'], perm: 'lab_view', fn: getLabConfig_ },
  createLabCase:             { screens: ['nurse'], fn: createLabCase_ },
  getMyLabCases:             { screens: ['nurse'], fn: function (u, o) { return queryLabCases_(u, { nurse: u.name }, o); } },
  getDoctorLabCases:         { screens: ['doctor'], fn: function (u, o) { return queryLabCases_(u, { doctorUser: u }, o); } },
  getLabCases:               { screens: ['lab'], perm: 'lab_view', fn: function (u, o) { return queryLabCases_(u, {}, o); } },
  getLabCase:                { screens: ['nurse', 'doctor', 'lab'], perm: 'lab_view', fn: getLabCase_ },
  addLabNote:                { screens: ['nurse', 'doctor', 'lab'], perm: 'lab_view', fn: addLabNote_ },
  updateLabItems:            { screens: ['lab'], fn: updateLabItems_ },
  findLabCases:              { screens: ['nurse', 'lab'], perm: 'lab_view', fn: findLabCases_ },
  confirmLabReceipt:         { screens: ['nurse'], fn: confirmLabReceipt_ },
  getLabStats:               { screens: ['lab'], perm: 'lab_view', fn: getLabStats_ },
  nudgeLab:                  { screens: [], perm: 'lab_view', fn: nudgeLab_ },
  // عُهدة العيادة
  getAssetConfig:            { screens: ['nurse', 'doctor', 'procurement'], perm: 'assets', fn: getAssetConfig_ },
  getClinicAssets:           { screens: ['nurse', 'doctor', 'procurement'], perm: 'assets', fn: getClinicAssets_ },
  getAssetTickets:           { screens: ['nurse', 'doctor', 'procurement'], perm: 'assets', fn: getAssetTickets_ },
  getAssetTicket:            { screens: ['nurse', 'doctor', 'procurement'], perm: 'assets', fn: getAssetTicket_ },
  findAsset:                 { screens: ['procurement'], perm: 'assets', fn: findAsset_ },
  getAssetStats:             { screens: ['procurement'], perm: 'assets', fn: getAssetStats_ },
  reportAsset:               { screens: ['nurse'], fn: reportAsset_ },
  issueAssets:               { screens: ['procurement'], perm: 'users', fn: issueAssets_ },
  setClinicStandard:         { screens: ['procurement'], perm: 'users', fn: setClinicStandard_ },
  updateAssetTicket:         { screens: ['procurement'], fn: updateAssetTicket_ },
  setAssetTicketCost:        { screens: ['procurement'], perm: 'finance', fn: setAssetTicketCost_ },
  nudgeProcurement:          { screens: [], perm: 'monitor', fn: nudgeProcurement_ },
  getFinance:                { screens: [], perm: 'finance', fn: getFinance_ },
  getPriceList:              { screens: [], perm: 'prices_edit', fn: getPriceList_ },
  setItemPrice:              { screens: [], perm: 'prices_edit', fn: setItemPrice_ },
  saveRole:                  { screens: [], perm: 'users', fn: saveRole_ },
  deleteRole:                { screens: [], perm: 'users', fn: deleteRole_ }
};

/* =====================================================================
 *  أدوات الشيت (قراءة/كتابة بالاسم)
 * ===================================================================== */

let MEMO_ = {};
function resetMemo_() {
  const dirty = MEMO_.dirty; // التبويبات المعدّلة تبقى معلّمة حتى يُرفع إصدار كاشها
  MEMO_ = {};
  if (dirty) MEMO_.dirty = dirty;
}
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

/* ---------------------------------------------------------------------
 *  كاش القراءة: كل تبويب يُحفظ في CacheService (مقسّماً) مع رقم إصدار.
 *  - استدعاءات القراءة (get… و batch) تقرأ من الكاش: استدعاء واحد بدل 3-4 رحلات للشيت.
 *  - أي كتابة عبر النظام ترفع إصدار التبويب فوراً، وonEdit يرفعه عند التعديل اليدوي.
 *  - عمليات الكتابة تقرأ دائماً من الشيت مباشرة (لا تُبنى كتابة على بيانات قديمة).
 * --------------------------------------------------------------------- */
const READ_CACHE_TTL = 600;      // ثوانٍ — حد أعلى للتغييرات اليدوية البنيوية (إضافة صفوف/أعمدة)
const READ_CACHE_CHUNK = 45000;  // حروف لكل جزء (حد CacheService ‏100KB، والعربي بايتان)
let CACHED_READS_ = false;
const LOOKUP_SHEETS_ = ['Users', 'Roles', 'Clinics', 'Doctors', 'ItemsCatalog', 'Settings', 'Labs', 'LabWorkTypes', 'LabMaterials'];

function cache_() { return CacheService.getScriptCache(); }

function versions_() {
  if (!MEMO_.ver) {
    const keys = Object.keys(SCHEMA).map(function (n) { return 'v:' + n; });
    let got = {};
    try { got = cache_().getAll(keys) || {}; } catch (e) { got = {}; }
    MEMO_.ver = got;
  }
  return MEMO_.ver;
}

/** إبطال كاش تبويب (بعد أي كتابة أو تعديل يدوي) */
function bumpVersion_(name) {
  const v = Utilities.getUuid().slice(0, 8);
  try { cache_().put('v:' + name, v, 21600); } catch (e) { /* الكاش اختياري */ }
  if (MEMO_.ver) MEMO_.ver['v:' + name] = v;
}

function markDirty_(name) {
  invalidate_(name);
  (MEMO_.dirty = MEMO_.dirty || {})[name] = true;
  delete MEMO_.qr; // الحسابات المشتقة من الطلبات تُعاد بعد أي كتابة
}

function flushDirty_() {
  const names = Object.keys(MEMO_.dirty || {});
  if (!names.length) return;
  // نضمن وصول الكتابات للشيت قبل إعلان الإصدار الجديد (وإلا قد يُخزَّن محتوى قديم تحته)
  try { SpreadsheetApp.flush(); } catch (e) { /* تجاهل */ }
  names.forEach(bumpVersion_);
  MEMO_.dirty = {};
}

function encodeValues_(values) {
  return JSON.stringify(values.map(function (row) {
    return row.map(function (v) { return isDate_(v) ? { d: v.getTime() } : v; });
  }));
}
function decodeValues_(json) {
  return JSON.parse(json).map(function (row) {
    return row.map(function (v) { return v && typeof v === 'object' && 'd' in v ? new Date(v.d) : v; });
  });
}

function cachedValues_(name) {
  const ver = versions_()['v:' + name];
  if (!ver) return null;
  try {
    const cache = cache_();
    // استدعاء واحد: عدد الأجزاء + أول 40 جزءاً (المفاتيح غير الموجودة لا تكلف شيئاً)
    const nKey = 'n:' + name + ':' + ver;
    const keys = [];
    for (let i = 0; i < 40; i++) keys.push('c:' + name + ':' + ver + ':' + i);
    let parts = cache.getAll([nKey].concat(keys)) || {};
    const n = Number(parts[nKey]);
    if (!n) return null;
    if (n > 40) {
      const more = [];
      for (let i = 40; i < n; i++) { more.push('c:' + name + ':' + ver + ':' + i); keys.push(more[more.length - 1]); }
      parts = Object.assign(parts, cache.getAll(more) || {});
    }
    let json = '';
    for (let i = 0; i < n; i++) { const p = parts[keys[i]]; if (p === undefined || p === null) return null; json += p; }
    return decodeValues_(json);
  } catch (e) { return null; }
}

function storeValues_(name, values) {
  try {
    let ver = versions_()['v:' + name];
    if (!ver) { bumpVersion_(name); ver = versions_()['v:' + name]; }
    const json = encodeValues_(values);
    const out = {};
    let n = 0;
    for (let i = 0; i < json.length; i += READ_CACHE_CHUNK) out['c:' + name + ':' + ver + ':' + (n++)] = json.slice(i, i + READ_CACHE_CHUNK);
    if (n > 200) return; // تبويب ضخم جداً: يُقرأ مباشرة
    out['n:' + name + ':' + ver] = String(n || 1);
    if (!n) out['c:' + name + ':' + ver + ':0'] = '[]';
    cache_().putAll(out, READ_CACHE_TTL);
  } catch (e) { /* الكاش اختياري */ }
}

/** Trigger بسيط: أي تعديل يدوي في الشيت يُبطل كاش ذلك التبويب */
function onEdit(e) {
  try { bumpVersion_(e.range.getSheet().getName()); } catch (err) { /* تجاهل */ }
}

function sheet_(name) {
  const key = 'sh:' + name;
  if (MEMO_[key]) return MEMO_[key];
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (SCHEMA[name]) sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold');
  }
  MEMO_[key] = sh;
  return sh;
}

function headerRow_(sh) {
  const lastCol = sh.getLastColumn();
  if (!lastCol) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}

/** يضيف الأعمدة الناقصة لصف العناوين (يعدّل values[0] في مكانه) */
function ensureHeaders_(sh, values, required) {
  const headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  const missing = (required || []).filter(function (h) { return headers.indexOf(h) === -1; });
  if (!missing.length) return false;
  sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  const width = headers.length + missing.length;
  values[0] = headers.concat(missing);
  for (let i = 1; i < values.length; i++) while (values[i].length < width) values[i].push('');
  return true;
}

function sheetValues_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length === 1 && values[0].every(function (v) { return v === '' || v === null; })) values[0] = [];
  if (ensureHeaders_(sh, values, SCHEMA[name])) markDirty_(name);
  return values;
}

function read_(name) {
  const key = 'rd:' + name;
  if (MEMO_[key]) return MEMO_[key];
  // تبويب كُتب فيه خلال هذا الاستدعاء يُقرأ من الشيت (إصدار الكاش يُرفع في نهاية الاستدعاء).
  // الجداول المرجعية تُقرأ من الكاش حتى داخل القفل (أي كتابة عليها تمر بتحقق setMany_/deleteRow_).
  const useCache = (CACHED_READS_ || LOOKUP_SHEETS_.indexOf(name) !== -1) && !(MEMO_.dirty && MEMO_.dirty[name]);
  let values = useCache ? cachedValues_(name) : null;
  const fromCache = !!values;
  if (!values) {
    values = sheetValues_(name);
    if (useCache) storeValues_(name, values);
  }
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
  const t = { name: name, headers: headers, col: col, rows: rows, cached: fromCache };
  if (!fromCache) MEMO_['hd:' + name] = headers;
  MEMO_[key] = t;
  return t;
}

function invalidate_(name) { delete MEMO_['rd:' + name]; }

function freshTable_(name) {
  const was = CACHED_READS_;
  CACHED_READS_ = false;
  try { invalidate_(name); return read_(name); } finally { CACHED_READS_ = was; }
}

function cellKey_(v) { return isDate_(v) ? 'd' + v.getTime() : String(v === null || v === undefined ? '' : v); }
function sameRow_(a, b, headers) {
  return headers.every(function (h) { return !h || cellKey_(a[h]) === cellKey_(b[h]); });
}

/** يحذف الجداول المقروءة من الكاش من الذاكرة (داخل القفل نقرأ الشيت الحي فقط) */
function dropCachedTables_() {
  Object.keys(MEMO_).forEach(function (k) {
    if (k.indexOf('rd:') === 0 && MEMO_[k] && MEMO_[k].cached && LOOKUP_SHEETS_.indexOf(MEMO_[k].name) === -1) delete MEMO_[k];
  });
}

/** كتابة حقول صف واحد — الأعمدة المتجاورة تُكتب في استدعاء واحد */
function setCells_(t, row, obj) { setMany_(t, [{ row: row, obj: obj }]); }

/**
 * كتابة عدة صفوف دفعة واحدة: الصفوف المتتالية التي تعدّل نفس الأعمدة المتجاورة
 * تُكتب بـ setValues واحد (بدل استدعاء لكل خلية).
 */
function setMany_(t, updates) {
  if (!updates.length) return;
  if (t.cached) {
    // الجدول من الكاش: نتحقق أن كل صف لم يتغيّر في الشيت قبل الكتابة عليه
    const fresh = freshTable_(t.name);
    updates = updates.map(function (u) {
      const fr = fresh.rows.filter(function (r) { return r._row === u.row._row; })[0];
      if (!fr || !sameRow_(fr, u.row, t.headers)) throw new Error('ERR_CONFLICT');
      Object.keys(u.obj).forEach(function (k) { u.row[k] = u.obj[k]; });
      return { row: fr, obj: u.obj };
    });
    t = fresh;
  }
  const sh = sheet_(t.name);
  updates.forEach(function (u) { Object.keys(u.obj).forEach(function (k) { u.row[k] = u.obj[k]; }); });
  const groups = {};
  updates.forEach(function (u) {
    const cols = Object.keys(u.obj).map(function (k) {
      if (!(k in t.col)) throw new Error('ERR_NO_COLUMN:' + k);
      return t.col[k] + 1;
    }).sort(function (a, b) { return a - b; });
    // أعمدة متجاورة فقط
    let start = 0;
    for (let i = 1; i <= cols.length; i++) {
      if (i === cols.length || cols[i] !== cols[i - 1] + 1) {
        const key = cols[start] + '-' + cols[i - 1];
        (groups[key] = groups[key] || []).push(u.row);
        start = i;
      }
    }
  });
  Object.keys(groups).forEach(function (key) {
    const c0 = Number(key.split('-')[0]), c1 = Number(key.split('-')[1]);
    const hs = t.headers.slice(c0 - 1, c1);
    const rows = groups[key].slice().sort(function (a, b) { return a._row - b._row; });
    let start = 0;
    for (let i = 1; i <= rows.length; i++) {
      if (i === rows.length || rows[i]._row !== rows[i - 1]._row + 1) {
        const block = rows.slice(start, i).map(function (r) { return hs.map(function (h) { return r[h] === undefined ? '' : r[h]; }); });
        sh.getRange(rows[start]._row, c0, block.length, c1 - c0 + 1).setValues(block);
        start = i;
      }
    }
  });
  (MEMO_.dirty = MEMO_.dirty || {})[t.name] = true;
}

function deleteRow_(t, row) {
  if (t.cached) {
    const fr = freshTable_(t.name).rows.filter(function (r) { return r._row === row._row; })[0];
    if (!fr || !sameRow_(fr, row, t.headers)) throw new Error('ERR_CONFLICT');
  }
  sheet_(t.name).deleteRow(row._row);
  markDirty_(t.name);
}

function append_(name, obj) {
  const sh = sheet_(name);
  let headers = MEMO_['hd:' + name];
  if (!headers) {
    const vals = [headerRow_(sh)];
    ensureHeaders_(sh, vals, SCHEMA[name]);
    headers = MEMO_['hd:' + name] = vals[0];
  }
  sh.appendRow(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; }));
  markDirty_(name);
}

/** نص من المستخدم: تنظيف + منع حقن الصيغ داخل الشيت */
function clean_(s, max) {
  s = String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (max && s.length > max) s = s.slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function str_(v) {
  if (typeof v === 'string') return v.trim();
  return v === null || v === undefined ? '' : String(v).trim();
}
function isDate_(v) {
  return v !== null && typeof v === 'object' && (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]');
}
function toMs_(v) {
  if (!v) return 0;
  const d = isDate_(v) ? v : new Date(v);
  const ms = d.getTime();
  return isNaN(ms) ? 0 : ms;
}
/** 'yyyy-MM-dd' بتوقيت الرياض بحساب مباشر (UTC+3 ثابت بلا توقيت صيفي) — أسرع بكثير من Utilities.formatDate في الحلقات */
function riyadh_(ms) { return new Date(ms + 3 * 36e5).toISOString().slice(0, 10); }

function monthOf_(v) {
  const ms = toMs_(v);
  return ms ? riyadh_(ms).slice(0, 7) : '';
}
function round1_(n) { return Math.round(n * 10) / 10; }
function round2_(n) { return Math.round(n * 100) / 100; }

/** يحوّل كل التواريخ لنصوص ISO (google.script.run لا يقبل Date كقيمة مرجعة) */
function sanitize_(v) {
  if (v === null || typeof v !== 'object') return v;
  if (isDate_(v)) return isNaN(v.getTime()) ? '' : v.toISOString();
  if (Array.isArray(v)) {
    const a = new Array(v.length);
    for (let i = 0; i < v.length; i++) a[i] = sanitize_(v[i]);
    return a;
  }
  const o = {};
  for (const k in v) {
    if (Object.prototype.hasOwnProperty.call(v, k) && k.charAt(0) !== '_') o[k] = sanitize_(v[k]);
  }
  return o;
}

/** قراءة من الكاش داخل عملية كتابة (للتحقق المبدئي فقط — لا يُبنى عليها أي كتابة) */
function cachedRead_(fn) {
  const was = CACHED_READS_;
  CACHED_READS_ = true;
  try { return fn(); } finally { CACHED_READS_ = was; resetMemo_(); }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  // ضغط كتابة عالٍ: إن لم يتوفر القفل خلال 28 ثانية نرجع «مشغول» بدون أي كتابة (الواجهة تعيد المحاولة تلقائياً)
  if (!lock.tryLock(28000)) throw new Error('ERR_BUSY');
  const cached = CACHED_READS_;
  CACHED_READS_ = false;
  dropCachedTables_();
  try { return fn(); } finally { flushDirty_(); CACHED_READS_ = cached; lock.releaseLock(); }
}

/**
 * حجز رقم تسلسلي يومي (REQ-yyMMdd-NNN / LAB-…) بقفل قصير جداً ومنفصل عن قفل الكتابة العام:
 * العدّاد في Script Properties (فوري ومتسق)، فرفع الطلبات لا ينتظر عمليات التموين والطبيب ولا يعطّلها.
 * مع الحجز نفسه يُسجَّل مفتاح المسودة (clientKey) وبصمة الطلب — حماية من التكرار حتى مع الإرسال المتزامن.
 * scanMax(prefix): أعلى رقم موجود في الشيت لهذا اليوم (يُقرأ مرة واحدة يومياً عند أول حجز).
 * guard(): يُستدعى داخل القفل؛ إن أعاد قيمة فهي طلب مكرر ولا يُحجز رقم.
 */
function reserveId_(base, scanMax, guard) {
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ERR_BUSY');
  try {
    const dup = guard ? guard() : null;
    if (dup) return { duplicate: true, id: dup };
    const day = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
    const prefix = base + day + '-';
    const props = PropertiesService.getScriptProperties();
    const key = 'seq:' + base + day;
    let n = Number(props.getProperty(key));
    if (!n) {
      n = scanMax(prefix);
      // تنظيف عدّادات الأيام السابقة
      props.getKeys().forEach(function (k) { if (k.indexOf('seq:' + base) === 0 && k !== key) props.deleteProperty(k); });
    }
    n += 1;
    props.setProperty(key, String(n));
    const tail = String(n);
    return { duplicate: false, id: prefix + (tail.length < 3 ? ('00' + tail).slice(-3) : tail) };
  } finally { lock.releaseLock(); }
}
function maxSeq_(rows, col, prefix) {
  let max = 0;
  rows.forEach(function (r) { const id = str_(r[col]); if (id.indexOf(prefix) === 0) max = Math.max(max, Number(id.slice(prefix.length)) || 0); });
  return max;
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

/**
 * preload (اختياري) = { screen: [[fn, args], ...] } — قراءات الشاشة الأولى تُنفَّذ مع الدخول
 * فتفتح الصفحة ببياناتها بدون رحلة ثانية للخادم.
 */
function login_(name, password, preload) {
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
  if (String(row.Password).indexOf('h1$') !== 0) {
    try {
      withLock_(function () {
        const fr = read_('Users').rows.filter(function (r) { return r._row === row._row && String(r.Password) === String(row.Password); })[0];
        if (fr) setCells_(read_('Users'), fr, { Password: hashPassword_(latinDigits_(matched).trim()) });
      });
    } catch (e) { console.error(e); } // الترقية تحسين فقط — لا تمنع الدخول
  }

  migrateRoles_();
  const screen = roleScreen_(row.Role);
  if (!screen) throw new Error('ERR_ROLE_UNMAPPED');
  const user = {
    name: str_(row.Name), role: str_(row.Role), clinic: str_(row.Clinic),
    email: str_(row.Email), screen: screen
  };
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('s:' + token, JSON.stringify(Object.assign({ _at: Date.now() }, user)), SESSION_TTL);
  user.perms = permsOf_(user);
  const out = { success: true, token: token, user: user, config: getConfig_(user) };
  const calls = preload && typeof preload === 'object' ? preload[screen] : null;
  if (Array.isArray(calls) && calls.length && calls.length <= BATCH_MAX) out.preload = runBatch_(user, calls);
  return out;
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove('s:' + token);
}

function session_(token) {
  if (!token) throw new Error('ERR_SESSION');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('s:' + token);
  if (!raw) throw new Error('ERR_SESSION');
  const user = JSON.parse(raw);
  // الدور وصلاحياته تُقرأ في كل طلب: تعديل الأدمن لدور ينعكس فوراً بدون إعادة دخول
  const sc = roleScreen_(user.role);
  if (!sc) throw new Error('ERR_SESSION');
  user.screen = sc;
  user.perms = permsOf_(user);
  // تمديد الجلسة مع النشاط — مرة كل 20 دقيقة تكفي (توفّر رحلة كاش في كل طلب)
  if (!(Date.now() - (user._at || 0) < 20 * 60 * 1000)) {
    user._at = Date.now();
    cache.put('s:' + token, JSON.stringify(user), SESSION_TTL);
  }
  return user;
}

/* =====================================================================
 *  الأقسام: أسنان / جلدية — المستهلكات والتموين والطلبات مصنفة بالقسم
 * ===================================================================== */
const DEPTS = ['أسنان', 'جلدية'];
function normDept_(v) {
  v = str_(v).toLowerCase();
  if (/dent|أسنان|اسنان/.test(v)) return 'أسنان';
  if (/derm|جلد|skin/.test(v)) return 'جلدية';
  return '';
}
/** قسم العيادة من نوعها (Dentistry / Dermatology) أو اسمها — التعقيم وغيره بلا قسم (مشترك) */
function clinicDept_(name) {
  if (!MEMO_.cDept) {
    MEMO_.cDept = {};
    getClinics_().forEach(function (c) { MEMO_.cDept[c.name] = normDept_(c.type) || normDept_(c.name); });
  }
  name = str_(name);
  return name in MEMO_.cDept ? MEMO_.cDept[name] : normDept_(name);
}
/** قسم المستخدم من تبويب Users (يُقرأ كل مرة حتى ينعكس تعديل الأدمن فوراً) */
function userDept_(user) {
  const r = read_('Users').rows.filter(function (u) { return str_(u.Name) === user.name; })[0];
  return r ? normDept_(r.Department) : '';
}
/** هل يخص الطلب قسم المستخدم؟ (بلا قسم = للجميع) */
function deptMatch_(userDept, reqDept) { return !userDept || !reqDept || userDept === reqDept; }
/** إيميل للتموين: حسابات القسم نفسه + حسابات التموين العامة (بلا قسم) */
function notifyProcurement_(dept, subject, body) {
  const emails = read_('Users').rows.filter(function (u) {
    return str_(u.Email) && roleScreen_(u.Role) === 'procurement' && deptMatch_(normDept_(u.Department), dept);
  }).map(function (u) { return str_(u.Email); });
  if (emails.length) sendMail_(emails.join(','), subject, body);
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

/** كل الفروع المعرّفة في تبويب Clinics (بدون تكرار، بترتيب ظهورها) */
function getBranches_() {
  const out = [];
  getClinics_().forEach(function (c) { if (c.branch && out.indexOf(c.branch) === -1) out.push(c.branch); });
  return out;
}

/** اسم العرض في التقارير: العيادة المتكررة بنفس الاسم في أكثر من فرع تُميَّز بفرعها (مثل «Sterilization — بريدة») */
function clinicKey_(clinic, branch) {
  if (!MEMO_.cDup) {
    MEMO_.cDup = {};
    const seen = {};
    getClinics_().forEach(function (c) { if (seen[c.name] !== undefined && seen[c.name] !== c.branch) MEMO_.cDup[c.name] = true; seen[c.name] = c.branch; });
  }
  clinic = str_(clinic);
  return clinic && branch && MEMO_.cDup[clinic] ? clinic + ' — ' + branch : clinic;
}

/** فرع العيادة الافتراضي (للطلبات القديمة التي لم يُحفظ فيها فرع) */
function clinicBranch_(clinic) {
  if (!MEMO_.cBranch) {
    MEMO_.cBranch = {};
    getClinics_().forEach(function (c) { MEMO_.cBranch[c.name] = c.branch; });
  }
  return MEMO_.cBranch[str_(clinic)] || '';
}

/**
 * رقم من خلية شيت: يرفض التواريخ (Sheets يحوّل «3/8» إلى تاريخ، و Number(تاريخ) = رقم ضخم بالملي ثانية)
 * ويقبل النصوص مثل «1,250.50 ر.س» والأرقام العربية.
 */
function num_(v) {
  if (v === null || v === undefined || v === '' || isDate_(v)) return NaN;
  if (typeof v === 'number') return v;
  const m = latinDigits_(String(v)).replace(/[٬,\s]/g, '').replace(/٫/g, '.').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN; // أول رقم في النص («1250.50ر.س» → 1250.5)
}
const CLINIC_ONLY_LABEL = 'مستهلكات عيادة';
const PRICE_MAX = 1000000; // أي سعر أعلى من مليون ريال للوحدة يُعد خطأ إدخال
/** سعر صالح أو null (فارغ/تاريخ/نص غير رقمي/سالب/غير منطقي) */
function price_(v) {
  const n = num_(v);
  return n >= 0 && n <= PRICE_MAX ? round2_(n) : null;
}
function priceProblem_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (isDate_(v)) return 'date';
  const n = num_(v);
  if (isNaN(n)) return 'text';
  if (n < 0) return 'negative';
  if (n > PRICE_MAX) return 'too_big';
  return '';
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
    if (isAssetOwnership_(r.Ownership)) { o.asset = true; o.serialized = isYes_(r.Serialized); }
    const dp = normDept_(r.Department); if (dp) o.dept = dp;
    if (withPrice) {
      o.price = price_(r.Price) || 0;
      const issue = priceProblem_(r.Price);
      if (issue) o.priceIssue = issue;
    }
    return o;
  });
}

function getRoles_() {
  return read_('Roles').rows.filter(function (r) { return str_(r.RoleName); })
    .map(function (r) {
      const screen = str_(r.Screen);
      const o = { name: str_(r.RoleName), screen: screen };
      if (MGMT_SCREENS.indexOf(screen) !== -1) {
        o.custom = !!str_(r.Permissions) && screen !== 'admin';
        o.perms = rolePerms_(screen, r.Permissions);
      }
      return o;
    });
}

/** صلاحيات دور: الأدمن كل شيء؛ وإلا المحفوظ في عمود Permissions (أو «none»)، وإلا الافتراضي لشاشته */
function rolePerms_(screen, stored) {
  if (screen === 'admin') return PERMS.slice();
  if (MGMT_SCREENS.indexOf(screen) === -1) return [];
  const v = str_(stored);
  if (v === 'none') return [];
  if (!v || v === '*') return (DEFAULT_PERMS[screen] || []).slice();
  return v.split(/[,،\s]+/).filter(function (p) { return PERMS.indexOf(p) !== -1; });
}

/** هل يوجد حساب واحد على الأقل بدور شاشته admin؟ */
function hasAdmin_() {
  return read_('Users').rows.some(function (u) { return str_(u.Name) && roleScreen_(u.Role) === 'admin'; });
}

/** صلاحيات المستخدم الحالي. قبل إنشاء أي حساب أدمن تبقى الإدارة التنفيذية بكل الصلاحيات (حتى لا يُقفل النظام) */
function permsOf_(user) {
  if (MGMT_SCREENS.indexOf(user.screen) === -1) return [];
  // الإدارة التنفيذية (أو لوحة المؤشرات القديمة) بكل الصلاحيات ما دام لا يوجد أدمن
  if ((user.screen === 'executive' || user.screen === 'dashboard') && !hasAdmin_()) return PERMS.slice();
  const r = read_('Roles').rows.filter(function (x) { return str_(x.RoleName) === str_(user.role); })[0];
  return rolePerms_(user.screen, r ? r.Permissions : '');
}

/** أدوار الإدارة الأساسية (جودة / مالية / تنفيذي / أدمن) تُضاف لتبويب Roles إن لم تكن موجودة، لتظهر عند إنشاء المستخدمين */
function ensureMgmtRoles_() {
  const have = {};
  read_('Roles').rows.forEach(function (r) { if (str_(r.RoleName)) have[str_(r.RoleName)] = str_(r.Screen); });
  const missing = [['جودة', 'quality'], ['مالية', 'finance'], ['تنفيذي', 'executive'], ['أدمن', 'admin'], ['المعمل', 'lab']].filter(function (d) {
    // لا نضيف «جودة» إن كان «جوده» موجوداً، ولا أي دور شاشته موجودة مسبقاً باسم آخر
    if (have[d[0]] !== undefined || (d[0] === 'جودة' && have['جوده'] !== undefined) || (d[0] === 'مالية' && have['ماليه'] !== undefined)) return false;
    return !Object.keys(have).some(function (n) { return have[n] === d[1]; });
  });
  if (!missing.length) return;
  withLock_(function () {
    const now = {};
    read_('Roles').rows.forEach(function (r) { now[str_(r.RoleName)] = true; });
    missing.forEach(function (d) { if (!now[d[0]]) append_('Roles', { RoleName: d[0], Screen: d[1] }); });
  });
}

/**
 * ترقية الأدوار القديمة مرة واحدة: كانت الجودة والتنفيذي على شاشة admin والمالية على dashboard.
 * تُفصل الآن (جودة ← quality، تنفيذي ← executive، مالية ← finance) ويُضاف دور «أدمن».
 * الصف الذي فيه Permissions محفوظة يُعتبر مقصوداً ولا يُمس.
 */
const LEGACY_ROLE_MAP_ = { 'جودة|admin': 'quality', 'جوده|admin': 'quality', 'جودة|dashboard': 'quality', 'جوده|dashboard': 'quality',
  'تنفيذي|admin': 'executive', 'تنفيذي|dashboard': 'executive', 'إدارة تنفيذية|admin': 'executive', 'إدارة تنفيذية|dashboard': 'executive',
  'ادارة تنفيذية|admin': 'executive', 'ادارة تنفيذية|dashboard': 'executive',
  'مالية|dashboard': 'finance', 'ماليه|dashboard': 'finance', 'مالية|admin': 'finance', 'ماليه|admin': 'finance' };
function migrateRoles_() {
  const legacy = function (r) { return !str_(r.Permissions) && LEGACY_ROLE_MAP_[str_(r.RoleName) + '|' + str_(r.Screen)]; };
  ensureMgmtRoles_();
  if (!read_('Roles').rows.some(legacy)) return;
  withLock_(function () {
    const t = read_('Roles');
    t.rows.forEach(function (r) { const to = legacy(r); if (to) setCells_(t, r, { Screen: to }); });
    if (!read_('Roles').rows.some(function (r) { return str_(r.Screen) === 'admin'; })) append_('Roles', { RoleName: 'أدمن', Screen: 'admin', Permissions: '*' });
    logAction_('', 'فصل الأدوار: الجودة / الإدارة التنفيذية / المالية / الأدمن', 'النظام');
  });
}

function getConfig_(user) {
  // كل العيادات متاحة للجميع في «مستهلكات عيادة» (مثل طلبات التعقيم لأي فرع)؛ عيادات المستخدم تُعرض أولاً
  user.department = userDept_(user);
  return {
    user: user,
    clinics: getClinics_(),
    myClinics: userClinics_(user),
    branches: getBranches_(),
    catalog: getCatalog_(user.screen !== 'nurse'),
    roles: (user.perms || []).indexOf('users') !== -1 ? getRoles_() : [],
    hasAdmin: (user.perms || []).indexOf('users') !== -1 ? hasAdmin_() : true,
    serverTime: new Date()
  };
}

/** تطبيع نص للمقارنة: مسافات، حالة الأحرف، والتشكيل */
function t0len_(t) { return t && t.length >= 6; } // جزء ملتصق طويل بما يكفي لتجنب التطابق العشوائي

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
  let list = allDoctors_().filter(function (d) { return doctorMatchesClinic_(d, clinic); });
  // بدون عيادة: أطباء عيادات الممرضة فقط (إن كانت مقيّدة بعيادات)، وإلا كل الأطباء
  const mine = user ? userClinics_(user) : [];
  if (!clinic && mine.length) {
    const cs = getClinics_().filter(function (c) { return mine.indexOf(c.name) !== -1; });
    const inMine = list.filter(function (d) { return cs.some(function (c) { return doctorMatchesClinic_(d, c); }); });
    if (inMine.length) list = inMine;
  }
  return list.map(function (d) { return { name: d.name, clinic: d.clinic, nurse: d.nurse, subspecialty: d.subspecialty || d.specialty }; });
}

/** عيادة الطبيب (من تبويب Clinics) — تُفضَّل عيادات المستخدم إن وُجدت؛ '' إن لم تتضح */
function doctorClinic_(user, doctor) {
  const d = allDoctors_().filter(function (x) { return x.name === doctor; })[0];
  if (!d) return '';
  const mine = userClinics_(user);
  const cs = getClinics_().filter(function (c) { return doctorMatchesClinic_(d, c) && str_(d.clinic || d.specialty); });
  const pick = cs.filter(function (c) { return mine.indexOf(c.name) !== -1; })[0] || (mine.length ? null : cs[0]);
  return pick ? pick.name : (mine.length === 1 ? mine[0] : '');
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
    id: str_(r.RequestID), date: r.Date, clinic: str_(r.Clinic), branch: str_(r.Branch) || clinicBranch_(r.Clinic), doctor: str_(r.Doctor),
    department: normDept_(r.Department) || clinicDept_(r.Clinic),
    nurse: str_(r.Nurse), type: str_(r.Type), status: str_(r.Status) || ST.NEW,
    submittedAt: r.SubmittedAt, prepAt: r.PrepAt, vendorWaitAt: r.VendorWaitAt,
    vendorReceivedAt: r.VendorReceivedAt, reviewAt: r.ReviewAt, reviewedAt: r.ReviewedAt,
    sentAt: r.SentAt, receivedAt: r.ReceivedAt, receiver: str_(r.ReceiverName), approvedAt: r.ApprovedAt,
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
    if (filters.branch && r.branch !== filters.branch) return false;
    if (filters.nurse && r.nurse !== filters.nurse) return false;
    if (filters.doctorUser && !isMyDoctor_(filters.doctorUser, r.doctor)) return false;
    if (filters.month && monthOf_(r.date) !== filters.month) return false;
    if (filters.recent && (r.status === ST.RECEIVED || r.status === ST.REJECTED) &&
        (Date.now() - toMs_(r.receivedAt || r.reviewedAt || r.date)) > ARCHIVE_DAYS * 864e5) return false;
    return true;
  }).map(function (r) {
    // الإثراء (الشحنات/المواعيد/حالة الطبيب) يُحسب مرة واحدة لكل طلب في نفس الاستدعاء —
    // الدخول والمزامنة يطلبان عدة قوائم معاً (الطلبات، التنبيهات، الإحصائيات…) على نفس البيانات
    const memo = MEMO_.qr || (MEMO_.qr = {});
    if (memo[r.id]) return memo[r.id];
    memo[r.id] = r;
    const st = shipState_(r, byReq[r.id] || []);
    r.itemCount = st.total;
    r.dispatchedCount = st.dispatched;
    r.partialItems = st.partialItems;
    r.totalQty = st.totalQty;
    r.sentQty = st.sentQty;
    r.remainingQty = st.remainingQty;
    r.remainingItems = st.sentQty > 0 && st.remainingQty > 0 ? st.remaining : [];
    r.shipmentCount = st.ships.length;
    r.lastShipAt = st.ships.length ? st.ships.reduce(function (m, g) { return toMs_(g.sentAt) > toMs_(m) ? g.sentAt : m; }, '') : '';
    r.pendingShipments = st.pending;
    r.needsReview = !!reviewers[r.doctor];
    r.cleared = !r.needsReview || r.status === ST.APPROVED || !!r.approvedAt;
    r.awaitingDoctor = r.needsReview && !r.cleared && AWAITING_DOCTOR.indexOf(r.status) !== -1;
    if (r.awaitingDoctor && r.status === ST.NEW) r.status = ST.REVIEW; // طلب قديم «جديد» = لدى الطبيب
    r.doctorApproved = r.needsReview && r.cleared;
    Object.assign(r, deadline_(r));
    r._ms = toMs_(r.date);
    return r;
  }).sort(function (a, b) { return b._ms - a._ms; });
}

/* =====================================================================
 *  مواعيد الطلبات: الشهري يُرفع 15–20 ويُستلم قبل نهاية يوم 1 من الشهر التالي؛ الطارئ خلال 24 ساعة
 * ===================================================================== */

/** بداية يوم 1 من الشهر التالي لـ 'yyyy-MM' بتوقيت الرياض */
function nextMonthStart_(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return new Date(ny + '-' + ('0' + nm).slice(-2) + '-01T00:00:00+03:00');
}

/** موعد الاستلام المستحق وحالة التأخير لطلب (بعد mapRequest_) */
function deadline_(r, nowMs) {
  const now = nowMs || Date.now();
  const sub = toMs_(r.submittedAt || r.date);
  if (!sub) return { dueAt: '', overdue: false, atRisk: false, lateSubmit: false };
  // الرفع بعد يوم 20 مسموح عادي، لكنه يُعلَّم «رُفع متأخراً» (قبل 15 = مبكر، لا مشكلة)
  let due, lateSubmit = false;
  if (r.type === 'طارئ') due = sub + EMERGENCY_DUE_HOURS * 36e5;
  else {
    const ymd = riyadh_(sub);
    const day = Number(ymd.slice(8, 10));
    lateSubmit = day > MONTHLY_WINDOW[1];
    due = nextMonthStart_(ymd.slice(0, 7)).getTime() + 864e5 - 1; // نهاية يوم 1
  }
  const done = r.status === ST.RECEIVED || r.status === ST.REJECTED;
  const recv = toMs_(r.receivedAt);
  const overdue = !done && now > due;
  // قريب من الموعد: لم يُرسل منه شيء بعد والمتبقي أقل من 5 أيام (أو نصف مهلة الطارئ)
  const window = r.type === 'طارئ' ? EMERGENCY_DUE_HOURS * 36e5 / 2 : AT_RISK_DAYS * 864e5;
  const atRisk = !done && !overdue && due - now < window && !(r.sentQty > 0) && !toMs_(r.sentAt);
  return { dueAt: new Date(due), overdue: overdue, atRisk: atRisk, lateSubmit: lateSubmit,
    lateReceipt: r.status === ST.RECEIVED && recv > due };
}

/** أين يقف الطلب الآن ومن المسؤول عنه */
function stageOf_(r) {
  if (r.status === ST.REJECTED || r.status === ST.RECEIVED) return { stage: 'done', owner: '' };
  if (r.awaitingDoctor) return { stage: 'doctor', owner: 'doctor' };
  if (r.sentQty > 0 && r.remainingQty > 0) return { stage: 'partial', owner: 'procurement' };
  if (r.status === ST.SENT || r.pendingShipments > 0) return { stage: 'receipt', owner: 'nurse' };
  if ([ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV].indexOf(r.status) !== -1) return { stage: 'dispatch', owner: 'procurement' };
  return { stage: 'prep', owner: 'procurement' };
}

/**
 * متابعة التموين والمواعيد (للجودة ومن لديه صلاحية monitor):
 * المتأخرات والقريبة من الموعد، أداء التموين للشهر، ودورة الطلب الشهري الحالية لكل عيادة.
 */
function getMonitor_(user, opts) {
  opts = opts || {};
  const now = Date.now();
  const month = /^\d{4}-\d{2}$/.test(str_(opts.month)) ? str_(opts.month) : Utilities.formatDate(new Date(now), TZ, 'yyyy-MM');
  const all = queryRequests_({}).filter(function (r) { return r.status !== ST.REJECTED; });
  function row(r) {
    const s = stageOf_(r);
    return { id: r.id, type: r.type, branch: r.branch, clinic: r.clinic, doctor: r.doctor, nurse: r.nurse, status: r.status,
      submittedAt: r.submittedAt || r.date, dueAt: r.dueAt, stage: s.stage, owner: s.owner, lateSubmit: r.lateSubmit,
      hoursLate: r.overdue ? round1_((now - toMs_(r.dueAt)) / 36e5) : 0,
      hoursLeft: !r.overdue ? round1_((toMs_(r.dueAt) - now) / 36e5) : 0,
      remainingQty: r.remainingQty, sentQty: r.sentQty };
  }
  const late = all.filter(function (r) { return r.overdue; }).map(row).sort(function (a, b) { return b.hoursLate - a.hoursLate; });
  const atRisk = all.filter(function (r) { return r.atRisk; }).map(row).sort(function (a, b) { return a.hoursLeft - b.hoursLeft; });

  // أداء التموين للشهر المختار (حسب شهر الرفع)
  const H = 36e5;
  function hrs(a, b) { const x = toMs_(a), y = toMs_(b); return x && y && y >= x ? (y - x) / H : null; }
  function avg(a) { return a.length ? round1_(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; }
  const inMonth = all.filter(function (r) { return monthOf_(r.submittedAt || r.date) === month; });
  const toPrep = [], toSend = [], toRecv = [], emergencyHrs = [];
  let received = 0, onTime = 0, lateSubmits = 0, monthly = 0, emergency = 0;
  inMonth.forEach(function (r) {
    const clearedAt = r.approvedAt || (!r.needsReview ? (r.submittedAt || r.date) : '');
    const sentAt = r.sentAt || r.lastShipAt;
    const a = hrs(clearedAt, r.prepAt || sentAt); if (a !== null) toPrep.push(a);
    const b = hrs(r.prepAt, sentAt); if (b !== null) toSend.push(b);
    const c = hrs(sentAt, r.receivedAt); if (c !== null) toRecv.push(c);
    if (r.type === 'طارئ') { emergency++; const e = hrs(r.submittedAt || r.date, sentAt); if (e !== null) emergencyHrs.push(e); }
    else { monthly++; if (r.lateSubmit) lateSubmits++; }
    if (r.status === ST.RECEIVED) { received++; if (!r.lateReceipt) onTime++; }
  });
  const kpis = {
    month: month, requests: inMonth.length, monthly: monthly, emergency: emergency, received: received,
    onTimeRate: received ? Math.round(onTime / received * 100) : null,
    lateNow: late.length, atRisk: atRisk.length, lateSubmits: lateSubmits,
    lateProcurement: late.filter(function (x) { return x.owner === 'procurement'; }).length,
    avgClearToPrepHrs: avg(toPrep), avgPrepToSendHrs: avg(toSend), avgSendToReceiveHrs: avg(toRecv), avgEmergencyHrs: avg(emergencyHrs)
  };

  // دورة الطلب الشهري حسب الطبيب: هل رُفع طلبه الشهري لهذا الشهر؟ ومتى (في الفترة أو متأخراً)؟
  const cycleMonth = Utilities.formatDate(new Date(now), TZ, 'yyyy-MM');
  const today = Number(Utilities.formatDate(new Date(now), TZ, 'dd'));
  const passed = today > MONTHLY_WINDOW[1];
  const byDoc = {};
  all.forEach(function (r) {
    if (r.type !== 'طارئ' && r.doctor && monthOf_(r.submittedAt || r.date) === cycleMonth) (byDoc[r.doctor] = byDoc[r.doctor] || []).push(r);
  });
  const cycle = allDoctors_().map(function (d) {
    const rs = byDoc[d.name] || [];
    const first = rs[rs.length - 1];
    return { doctor: d.name, clinic: d.clinic, nurse: d.nurse, count: rs.length,
      lateSubmit: !!first && first.lateSubmit, submittedAt: first ? first.submittedAt || first.date : '',
      state: rs.length ? (first.lateSubmit ? 'late' : 'ok') : (passed ? 'missing' : 'pending') };
  }).sort(function (a, b) {
    const o = { missing: 0, late: 1, pending: 2, ok: 3 };
    return o[a.state] - o[b.state] || a.doctor.localeCompare(b.doctor);
  });
  return {
    now: new Date(now), late: late, atRisk: atRisk, kpis: kpis,
    cycle: { month: cycleMonth, window: MONTHLY_WINDOW, today: today, open: today >= MONTHLY_WINDOW[0] && today <= MONTHLY_WINDOW[1],
      due: nextMonthStart_(cycleMonth), doctors: cycle, missing: cycle.filter(function (c) { return !c.count; }).length,
      lateSubmits: cycle.filter(function (c) { return c.state === 'late'; }).length, passed: passed },
    rules: { window: MONTHLY_WINDOW, emergencyHours: EMERGENCY_DUE_HOURS, atRiskDays: AT_RISK_DAYS }
  };
}

/**
 * تنبيه على طلب متأخر — يصل لصاحب المرحلة الحالية («أين يقف»):
 * بانتظار استلام العيادة ← الممرضة · بانتظار اعتماد الطبيب ← الطبيب · التجهيز/الإرسال ← التموين.
 * يُضاف تعليق على الطلب ويُرسل الإيميل للجهة المسؤولة فقط.
 */
function nudgeProcurement_(user, requestId, message) {
  const g = guardSee_(user, requestId);
  const r = queryRequests_({}).filter(function (x) { return x.id === g.req.id; })[0] || g.req;
  const owner = stageOf_(r).owner || 'procurement';
  const ownerAr = { nurse: 'التمريض', doctor: 'الطبيب', procurement: 'التموين' }[owner] || 'التموين';
  message = clean_(message, 500) || (owner === 'nurse' ? 'يرجى تأكيد استلام الطلب والتوقيع من داخل النظام — تجاوز الموعد المحدد.'
    : owner === 'doctor' ? 'يرجى اعتماد الطلب — تجاوز الموعد المحدد.' : 'يرجى الإسراع في إنهاء هذا الطلب — تجاوز الموعد المحدد.');
  append_('Comments', { Timestamp: new Date(), RequestID: g.req.id, Author: user.name, Role: user.role, Message: '⏰ (' + ownerAr + ') ' + message });
  logAction_(g.req.id, 'تنبيه ' + ownerAr + ' (متابعة)', user.name);
  const subject = '⏰ متابعة طلب متأخر - ' + g.req.id;
  const body = user.name + ' (' + user.role + ') يطلب الإسراع في الطلب ' + g.req.id + ' — ' + (g.req.doctor || g.req.clinic) +
    (g.req.clinic && g.req.doctor ? ' / ' + g.req.clinic : '') + (g.req.branch ? ' / فرع ' + g.req.branch : '') + '.\n\n' + message;
  let to = '', emailed = true;
  if (owner === 'nurse') { to = g.req.nurse; emailed = notifyUser_(to, subject, body); }
  else if (owner === 'doctor' && doctorAccounts_()[g.req.doctor]) { to = doctorAccounts_()[g.req.doctor]; emailed = notifyUser_(to, subject, body); }
  else notifyProcurement_(r.department, subject, body);
  // بدون إيميل مسجل: يبقى التنبيه تعليقاً على الطلب يراه صاحبه في النظام
  return { owner: owner, to: to, emailed: emailed, comments: comments_(g.req.id) };
}

/**
 * ملخص يومي بالمتأخرات للتموين ولمن لديه صلاحية المتابعة (الجودة…).
 * يعمل من مشغّل زمني يومي (installTriggers). لا يرسل شيئاً إن لم يوجد تأخير.
 * الاستدعاء اليدوي من المتصفح يُتجاهل (المشغّل يمرر triggerUid).
 */
function dailyDigest(e) {
  if (!e || !e.triggerUid) return 0;
  return sendDigest_();
}
function sendDigest_() {
  const m = getMonitor_({}, {});
  if (!m.late.length && !m.atRisk.length) return 0;
  const line = function (r) {
    return '- ' + r.id + ' · ' + (r.doctor || r.clinic) + (r.branch ? ' · ' + r.branch : '') + ' · ' + r.type +
      ' · ' + (r.hoursLate ? 'متأخر ' + Math.round(r.hoursLate) + ' ساعة' : 'باقي ' + Math.round(r.hoursLeft) + ' ساعة') + ' (' + STAGE_AR_[r.stage] + ')';
  };
  const body = (m.late.length ? 'طلبات تجاوزت الموعد (' + m.late.length + '):\n' + m.late.map(line).join('\n') + '\n\n' : '') +
    (m.atRisk.length ? 'قريبة من الموعد ولم تُرسل بعد (' + m.atRisk.length + '):\n' + m.atRisk.map(line).join('\n') : '');
  const subject = '⏰ متابعة المواعيد: ' + m.late.length + ' متأخر · ' + m.atRisk.length + ' قريب من الموعد';
  notifyRole_('procurement', subject, body);
  notifyPerm_('monitor', subject, body);
  return m.late.length + m.atRisk.length;
}
const STAGE_AR_ = { doctor: 'بانتظار اعتماد الطبيب', prep: 'بانتظار التجهيز', dispatch: 'بانتظار الإرسال', partial: 'متبقي من الإرسال', receipt: 'بانتظار استلام العيادة', done: 'مكتمل' };

/** يثبّت المشغّل اليومي للملخص (مرة واحدة؛ يُستدعى من setupSheets أو يدوياً من المحرر) */
function installTriggers() {
  const names = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  const hasDigest = names.indexOf('dailyDigest') !== -1, hasChange = names.indexOf('onSheetChange') !== -1;
  const hasBackup = names.indexOf('dailyBackup') !== -1;
  if (!hasDigest) ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
  if (!hasBackup) ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(2).inTimezone(TZ).create();
  // حذف/إدراج صفوف يدوياً (مثل حذف عيادة) لا يُطلق onEdit — هذا المشغّل يلتقطه فيظهر التغيير فوراً
  if (!hasChange) ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss_()).onChange().create();
  return !hasDigest || !hasChange || !hasBackup;
}

/* =====================================================================
 *  النسخ الاحتياطي: نسخة كاملة من الشيت كل ليلة في مجلد Drive مستقل (آخر 30 نسخة)
 * ===================================================================== */
const BACKUP_FOLDER_ = 'مسار — نسخ احتياطية';
const BACKUP_PREFIX_ = 'مسار — نسخة ';
const BACKUP_KEEP_ = 30;

function backupFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('backup:folder');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!(f.isTrashed && f.isTrashed())) return f; } catch (e) { /* حُذف؟ ننشئه من جديد */ }
  }
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER_);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER_);
  props.setProperty('backup:folder', folder.getId());
  return folder;
}

/** مشغّل ليلي (الساعة 2 فجراً) — يُثبَّت عبر installTriggers */
function dailyBackup() { return runBackup_('النظام (تلقائي)'); }

function runBackup_(by) {
  const props = PropertiesService.getScriptProperties();
  const folder = backupFolder_();
  const name = BACKUP_PREFIX_ + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  const copy = DriveApp.getFileById(ss_().getId()).makeCopy(name, folder);
  // الاحتفاظ بآخر 30 نسخة فقط (الأقدم تذهب لسلة Drive وتبقى فيها 30 يوماً)
  const list = [];
  const it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (String(f.getName()).indexOf(BACKUP_PREFIX_) === 0) list.push(f); }
  list.sort(function (a, b) { return toMs_(b.getDateCreated()) - toMs_(a.getDateCreated()); });
  list.slice(BACKUP_KEEP_).forEach(function (f) { try { f.setTrashed(true); } catch (e) { console.error(e); } });
  const last = { at: new Date().toISOString(), name: name, url: copy.getUrl(), by: str_(by), kept: Math.min(list.length, BACKUP_KEEP_) };
  props.setProperty('backup:last', JSON.stringify(last));
  logAction_('', 'نسخة احتياطية: ' + name, str_(by));
  flushDirty_();
  return backupStatus_();
}

function backupStatus_() {
  const props = PropertiesService.getScriptProperties();
  let last = null;
  try { last = JSON.parse(props.getProperty('backup:last') || 'null'); } catch (e) { last = null; }
  const folderId = props.getProperty('backup:folder');
  const auto = (function () { try { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyBackup'; }); } catch (e) { return null; } })();
  return { last: last, keep: BACKUP_KEEP_, auto: auto, folderUrl: folderId ? 'https://drive.google.com/drive/folders/' + folderId : '' };
}

/** مشغّل onChange: أي تغيير بنيوي (حذف/إدراج صفوف أو أعمدة) يُبطل كاش تبويبات الإعداد والتبويب النشط */
function onSheetChange(e) {
  try {
    LOOKUP_SHEETS_.forEach(bumpVersion_);
    const sh = e && e.source && e.source.getActiveSheet && e.source.getActiveSheet();
    if (sh && LOOKUP_SHEETS_.indexOf(sh.getName()) === -1) bumpVersion_(sh.getName());
  } catch (err) { /* تجاهل */ }
}

/* =====================================================================
 *  المالية: الصرف والتكلفة + أسعار الكتالوج
 * ===================================================================== */

function getFinance_(user, opts) {
  opts = opts || {};
  const rep = getStatsReport_(user, opts);
  const from = parseDay_(opts.from), to = parseDay_(opts.to, true);
  const branch = str_(opts.branch);
  const price = {};
  getCatalog_(true).forEach(function (c) { price[c.name.toLowerCase()] = Number(c.price) || 0; });
  const pr = function (n) { return price[str_(n).toLowerCase()] || 0; };
  const all = queryRequests_({}).filter(function (r) { return r.status !== ST.REJECTED && (!branch || r.branch === branch); });
  const inRange = {};
  all.forEach(function (r) {
    const ms = toMs_(r.submittedAt || r.date);
    if ((!from || ms >= from.getTime()) && (!to || ms <= to.getTime())) inRange[r.id] = r;
  });
  let requested = 0, received = 0, dispatched = 0;
  const byType = {};
  read_('RequestItems').rows.forEach(function (it) {
    const r = inRange[str_(it.RequestID)];
    if (!r) return;
    const p = pr(it.ItemName);
    requested += (num_(it.RequestedQty) || 0) * p;
    if (it.ReceivedQty !== '' && it.ReceivedQty !== null) received += (num_(it.ReceivedQty) || 0) * p;
    const t = r.type || '—';
    byType[t] = round2_((byType[t] || 0) + targetQty_(it) * p);
  });
  read_('ShipmentItems').rows.forEach(function (s) { if (inRange[str_(s.RequestID)]) dispatched += (num_(s.Qty) || 0) * pr(s.ItemName); });
  // اتجاه 12 شهراً (قيمة المعتمد حسب شهر الرفع) — مستقل عن الفترة المختارة
  const byMonth = {};
  const items = itemsByRequest_();
  all.forEach(function (r) {
    const m = monthOf_(r.submittedAt || r.date);
    (items[r.id] || []).forEach(function (it) { byMonth[m] = (byMonth[m] || 0) + targetQty_(it) * pr(it.ItemName); });
  });
  const now = new Date(), trend = [];
  for (let i = 11; i >= 0; i--) {
    const m = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() - i, 15), TZ, 'yyyy-MM');
    trend.push({ month: m, value: round2_(byMonth[m] || 0) });
  }
  return {
    from: rep.from, to: rep.to, branch: branch, generatedAt: new Date(),
    summary: { requests: rep.summary.requests - rep.summary.rejected, requested: round2_(requested), approved: rep.summary.value,
      dispatched: round2_(dispatched), received: round2_(received), reviewSaving: round2_(Math.max(0, requested - rep.summary.value)),
      avgValue: rep.summary.avgValue, emergency: rep.summary.emergency },
    byType: byType, branches: rep.branches, clinics: rep.clinics, doctors: rep.doctors, topItems: rep.topItems,
    badPrices: rep.badPrices, trend: trend
  };
}

/** قائمة الأسعار كما في تبويب ItemsCatalog (مع التنبيه على الخلايا الخاطئة) */
function getPriceList_() {
  return read_('ItemsCatalog').rows.filter(function (r) { return str_(r.ItemName); }).map(function (r) {
    return { name: str_(r.ItemName), commercial: str_(r.CommercialName), category: str_(r.Category),
      price: price_(r.Price), issue: priceProblem_(r.Price) };
  });
}

/** تعديل سعر صنف: يُكتب مباشرة في عمود Price بتبويب ItemsCatalog (بتنسيق رقمي حتى لا يتحول لتاريخ) */
function setItemPrice_(user, item, value) {
  item = str_(item);
  const n = num_(value);
  if (!item) throw new Error('ERR_REQUIRED');
  if (!(n >= 0 && n <= PRICE_MAX)) throw new Error('ERR_BAD_PRICE');
  const v = round2_(n);
  return withLock_(function () {
    const t = read_('ItemsCatalog');
    const row = t.rows.filter(function (r) { return str_(r.ItemName).toLowerCase() === item.toLowerCase(); })[0];
    if (!row) throw new Error('ERR_NOT_FOUND');
    const old = row.Price;
    const sh = sheet_('ItemsCatalog');
    sh.getRange(row._row, t.col.Price + 1).setNumberFormat('#,##0.00').setValue(v);
    row.Price = v;
    markDirty_('ItemsCatalog');
    logAction_('', 'تعديل سعر: ' + str_(row.ItemName) + ' ' + (isDate_(old) ? '(خلية تاريخ)' : str_(old) || '—') + ' ← ' + v, user.name);
    return { name: str_(row.ItemName), price: v, issue: '' };
  });
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

/*
 * قوائم الشاشات: كل الطلبات المفتوحة + المكتملة (مستلمة/مرفوضة) خلال آخر 60 يوماً.
 * الأقدم تُجلب عند الطلب فقط ({ archive: true }) — حتى لا يكبر الرد والصفحة مع آلاف الطلبات.
 */
const ARCHIVE_DAYS = 60;
function withArchive_(filters, opts) {
  filters = filters || {};
  if (!(opts && opts.archive === true)) filters.recent = true;
  return filters;
}
function getRequestsApi_(user, filters) {
  filters = filters || {};
  const list = queryRequests_(withArchive_({ status: filters.status, clinic: filters.clinic, branch: filters.branch, nurse: filters.nurse, month: filters.month }, filters));
  // تموين الأسنان يرى طلبات الأسنان، وتموين الجلدية طلبات الجلدية (والمشتركة للجميع)
  const dept = user.screen === 'procurement' ? userDept_(user) : '';
  return dept ? list.filter(function (r) { return deptMatch_(dept, r.department); }) : list;
}
function getMyRequests_(user, opts) { return queryRequests_(withArchive_({ nurse: user.name }, opts)); }
function getDoctorRequests_(user, opts) { return queryRequests_(withArchive_({ doctorUser: user }, opts)); }


function createRequest_(user, payload) {
  payload = payload || {};
  const doctor = str_(payload.doctor);
  const type = str_(payload.type);
  // الطلب الاعتيادي مبني على طبيب (والعيادة اختيارية وتُستنتج منه)؛
  // «مستهلكات العيادة» فقط تكون بلا طبيب والعيادة فيها إلزامية
  const clinicOnly = !doctor;
  let clinic = str_(payload.clinic);
  if (clinicOnly && !clinic) throw new Error('ERR_REQUIRED');
  if (REQUEST_TYPES.indexOf(type) === -1) throw new Error('ERR_BAD_TYPE');
  const mine = userClinics_(user);
  if (clinic) {
    // مستهلكات العيادة مفتوحة لكل العيادات؛ طلب الطبيب يبقى ضمن عيادات الممرضة
    if (!clinicOnly && mine.length && mine.indexOf(clinic) === -1) throw new Error('ERR_FORBIDDEN');
    if (!getClinics_().some(function (c) { return c.name === clinic; })) throw new Error('ERR_BAD_CLINIC');
  }
  if (!clinicOnly) {
    if (!getDoctors_(user, clinic).some(function (d) { return d.name === doctor; })) throw new Error('ERR_BAD_DOCTOR');
    if (!clinic) clinic = doctorClinic_(user, doctor);
  }
  // الفرع الذي ستُرسل له الطلبية: يختاره المستخدم، والافتراضي فرع العيادة
  const branches = getBranches_();
  const branch = str_(payload.branch) || (clinic ? clinicBranch_(clinic) : '');
  if (branches.length && branches.indexOf(branch) === -1) throw new Error(branch ? 'ERR_BAD_BRANCH' : 'ERR_BRANCH_REQUIRED');

  // دمج الأصناف المكررة + التحقق من الكميات
  const merged = {};
  const order = [];
  (payload.items || []).forEach(function (it) {
    const name = clean_(it && it.name, 200);
    const qty = Math.floor(Number(it && it.qty));
    if (!name) return;
    if (!(qty >= 1)) throw new Error('ERR_QTY_MIN1'); // لا يُقبل طلب صفر (أقل كمية 1)
    if (!(qty <= 100000)) throw new Error('ERR_BAD_QTY');
    const key = name.toLowerCase();
    if (!merged[key]) { merged[key] = { name: name, qty: 0 }; order.push(key); }
    merged[key].qty += qty;
  });
  const items = order.map(function (k) { return merged[k]; });
  if (!items.length) throw new Error('ERR_NO_ITEMS');
  // الطلب من الكتالوج فقط — لا أصناف بأسماء حرة (يُعتمد اسم الكتالوج بحروفه)
  const catalog = {}, catDept = {};
  getCatalog_(false).forEach(function (c) { catalog[c.name.toLowerCase()] = c.name; catDept[c.name.toLowerCase()] = c.dept || ''; });
  // قسم الطلب من عيادته: طلب الأسنان لا يقبل مستهلكات الجلدية والعكس (المشترك مسموح للقسمين)
  const dept = clinic ? clinicDept_(clinic) : '';
  items.forEach(function (it) {
    const canon = catalog[it.name.toLowerCase()];
    if (!canon) throw new Error('ERR_UNKNOWN_ITEM');
    const d = catDept[it.name.toLowerCase()];
    if (dept && d && d !== dept) throw new Error('ERR_ITEM_DEPT:' + canon);
    it.name = canon;
  });
  if (items.length > 200) throw new Error('ERR_TOO_MANY_ITEMS');

  // منع الإرسال المزدوج لنفس الطلب خلال دقيقتين
  const sig = [user.name, clinic, branch, doctor, type].concat(items.map(function (i) { return i.name + ':' + i.qty; })).join('|');
  const dupKey = 'dup:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sig, Utilities.Charset.UTF_8));
  const cache = CacheService.getScriptCache();

  // الطبيب الذي له حساب يراجع الطلب أولاً؛ غير ذلك يذهب للتموين مباشرة
  const needsReview = !clinicOnly && doctorHasAccount_(doctor);
  // مفتاح المسودة من الجهاز: إعادة إرسال نفس المسودة بعد انقطاع الاتصال لا تنشئ طلباً مكرراً أبداً
  const clientKey = /^[A-Za-z0-9-]{8,64}$/.test(str_(payload.clientKey)) ? str_(payload.clientKey) : '';
  // بدون قفل الكتابة العام: رقم الطلب يُحجز بقفل قصير (أجزاء من الثانية)، والكتابة إلحاق ذري (appendRow)
  // لا يتعارض مع كتابات الآخرين — فلا ينتظر رفعُ الطلب التموينَ ولا يطلع «الخادم مشغول» وقت الذروة (15–20 من الشهر)
  if (clientKey) {
    const same = requestRows_().filter(function (r) { return str_(r.ClientKey) === clientKey && str_(r.Nurse) === user.name; })[0];
    if (same) return { duplicate: true, id: str_(same.RequestID) };
  }
  const ckKey = clientKey ? 'ck:' + user.name + ':' + clientKey : '';
  const res = reserveId_('REQ-', function (prefix) { return maxSeq_(freshTable_('Requests').rows, 'RequestID', prefix); }, function () {
    const prev = cache.get(dupKey) || (ckKey && cache.get(ckKey));
    if (prev) return prev;
    return null;
  });
  if (res.duplicate) return res;
  const id = res.id;
  cache.put(dupKey, id, DUP_WINDOW_SECONDS);
  if (ckKey) cache.put(ckKey, id, 21600);
  try {
    const now = new Date();
    append_('Requests', {
      RequestID: id, Date: now, Clinic: clinic, Branch: branch, Doctor: doctor, Nurse: user.name,
      Type: type, Status: needsReview ? ST.REVIEW : ST.NEW, SubmittedAt: now, ReviewAt: needsReview ? now : '', ClientKey: clientKey, Department: dept
    });
    items.forEach(function (it) { append_('RequestItems', { RequestID: id, ItemName: it.name, RequestedQty: it.qty }); });
  } catch (e) {
    // فشل الكتابة: نفك الحجز حتى تنجح إعادة الإرسال بنفس المسودة
    cache.remove(dupKey); if (ckKey) cache.remove(ckKey);
    throw e;
  }
  logAction_(id, 'إنشاء طلب (' + type + ')', user.name);

  const details = '\nرقم الطلب: ' + id + (dept ? '\nالقسم: ' + dept : '') + '\nالفرع: ' + (branch || '—') + '\nالعيادة: ' + (clinic || '—') + '\nالطبيب: ' + (doctor || 'مستهلكات عيادة') +
    '\nالممرضة: ' + user.name + '\nنوع الطلب: ' + type + '\nعدد الأصناف: ' + items.length;
  if (needsReview) {
    notifyUser_(doctorAccounts_()[doctor], (type === 'طارئ' ? '🚨 طلب طارئ بانتظار مراجعتك - ' : 'طلب جديد بانتظار مراجعتك - ') + id,
      'رُفع طلب جديد لعيادتك بانتظار مراجعتك واعتمادك من داخل النظام.' + details);
    // الطارئ: التموين يعلم مبكراً (للاستعداد) رغم انتظار الاعتماد
    if (type === 'طارئ') notifyProcurement_(dept, '🚨 طلب طارئ (بانتظار اعتماد الطبيب) - ' + id, 'رُفع طلب طارئ وهو الآن لدى الطبيب للاعتماد.' + details);
  } else {
    notifyProcurement_(dept, (type === 'طارئ' ? '🚨 طلب طارئ - ' : 'طلب مستلزمات جديد - ') + id,
      (clinicOnly ? 'تم رفع طلب مستهلكات عيادة (بدون طبيب — لا يحتاج اعتماداً).' : 'تم رفع طلب جديد (الطبيب ليس له حساب — لا يحتاج اعتماداً في النظام).') + details);
  }
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
    itemStatus: str_(r.ItemStatus), itemStatusAt: r.ItemStatusAt,
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
/** الكمية المستهدفة للصنف = المعتمدة إن حُددت وإلا المطلوبة */
function targetQty_(r) {
  const a = num_(r.ApprovedQty);
  const q = isNaN(a) ? num_(r.RequestedQty) : a; // تاريخ/نص في خلية الكمية لا يتحول لرقم ضخم
  return Math.max(0, Math.min(100000, isNaN(q) ? 0 : Math.floor(q)));
}

/** أسطر الشحنات لكل الطلبات: { requestId: [rows] } */
function shipItemsIndex_() {
  if (MEMO_.sitems) return MEMO_.sitems;
  const out = {};
  read_('ShipmentItems').rows.forEach(function (r) {
    const id = str_(r.RequestID);
    if (id && Number(r.Batch) > 0) (out[id] = out[id] || []).push(r);
  });
  MEMO_.sitems = out;
  return out;
}

/**
 * حالة إرسال الطلب على مستوى الكمية:
 *  - لكل صنف: المستهدف، المُرسل حتى الآن، المتبقي، وأجزاؤه في كل شحنة.
 *  - لكل شحنة: أصنافها بكمياتها، وحالة استلامها وتوقيعها.
 * الأصناف القديمة (قبل تبويب ShipmentItems) تُعد مُرسلة بكامل كميتها في شحنتها،
 * والطلب القديم «مرسل/مستلم» بلا بيانات إرسال يُعامل كشحنة واحدة.
 */
function shipState_(req, rows) {
  const b = batchesOf_(rows);
  const si = shipItemsIndex_()[req.id] || [];
  const whole = req.status === ST.SENT || req.status === ST.RECEIVED;
  const rec = receiptsIndex_()[req.id] || {};
  const byItem = {};
  si.forEach(function (r) { (byItem[str_(r.ItemName)] = byItem[str_(r.ItemName)] || []).push(r); });
  let maxBatch = b.count;
  si.forEach(function (r) { maxBatch = Math.max(maxBatch, Number(r.Batch) || 0); });
  let extra = 0;
  const groups = {};
  const items = rows.map(function (r) {
    const it = mapItem_(r, b);
    const target = targetQty_(r);
    const parts = [];
    const mine = byItem[it.item] || [];
    if (mine.length) {
      mine.forEach(function (x) {
        parts.push({ batch: Number(x.Batch), qty: Number(x.Qty) || 0, at: x.DispatchedAt, receivedQty: x.ReceivedQty });
      });
    } else {
      let n = it.batch, at = it.dispatchedAt;
      if (!n && whole) { n = extra || (extra = maxBatch + 1); at = req.sentAt; }
      if (n) parts.push({ batch: n, qty: target, at: at, receivedQty: r.ReceivedQty, legacy: true });
    }
    parts.sort(function (x, y) { return x.batch - y.batch; });
    let sent = 0;
    parts.forEach(function (p) {
      sent += p.qty;
      const g = groups[p.batch] || (groups[p.batch] = { batch: p.batch, sentAt: p.at, items: [] });
      if (!g.sentAt || (p.at && toMs_(p.at) < toMs_(g.sentAt))) g.sentAt = p.at;
      g.items.push({
        item: it.item, qty: p.qty, target: target, requestedQty: it.requestedQty, approvedQty: it.approvedQty,
        receivedQty: p.receivedQty === undefined || p.receivedQty === null ? '' : p.receivedQty
      });
    });
    it.target = target;
    it.sentQty = sent;
    it.remainingQty = Math.max(0, target - sent);
    it.done = it.remainingQty === 0;
    it.partial = sent > 0 && it.remainingQty > 0;
    it.parts = parts.map(function (p) { return { batch: p.batch, qty: p.qty }; });
    it.batch = parts.length ? parts[parts.length - 1].batch : 0;
    it.dispatchedAt = parts.length ? parts[parts.length - 1].at : '';
    return it;
  });
  const ships = Object.keys(groups).map(Number).sort(function (x, y) { return x - y; }).map(function (n) {
    const g = groups[n], x = rec[n], legacy = !x && req.status === ST.RECEIVED;
    g.received = !!x || legacy;
    g.receivedAt = x ? x.ReceivedAt : (legacy ? req.receivedAt : '');
    g.receiver = x ? str_(x.ReceiverName) : (legacy ? req.receiver : '');
    g.signatureUrl = x ? str_(x.SignatureURL) : (legacy ? req.signature : '');
    g.receiptUrl = x ? str_(x.ReceiptURL) : (legacy ? req.receiptUrl : '');
    g.units = g.items.reduce(function (a, i) { return a + i.qty; }, 0);
    return g;
  });
  const sum = function (f) { return items.reduce(function (a, i) { return a + f(i); }, 0); };
  return {
    items: items, ships: ships, total: rows.length,
    dispatched: items.filter(function (i) { return i.done && i.sentQty > 0; }).length,
    partialItems: items.filter(function (i) { return i.partial; }).length,
    totalQty: sum(function (i) { return i.target; }),
    sentQty: sum(function (i) { return Math.min(i.sentQty, i.target); }),
    remainingQty: sum(function (i) { return i.remainingQty; }),
    remaining: items.filter(function (i) { return i.remainingQty > 0; })
      .map(function (i) { return { item: i.item, qty: i.remainingQty, sent: i.sentQty, target: i.target }; }),
    maxBatch: Math.max(maxBatch, ships.length ? ships[ships.length - 1].batch : 0),
    pending: ships.filter(function (g) { return !g.received; }).length,
    allDispatched: rows.length > 0 && items.every(function (i) { return i.done; }) && ships.length > 0
  };
}

/**
 * يسجّل شحنة جديدة: lines = [{ name, qty }] (الكمية لا تتجاوز المتبقي).
 * يُحدّث تاريخ اكتمال الصنف في RequestItems عند إرسال كامل كميته.
 */
function writeShipment_(req, rows, st, lines, user, now) {
  const batch = st.maxBatch + 1;
  const sh = sheet_('ShipmentItems');
  const vals = [headerRow_(sh)];
  ensureHeaders_(sh, vals, SCHEMA.ShipmentItems);
  const headers = vals[0];
  const block = lines.map(function (l) {
    const o = { RequestID: req.id, Batch: batch, ItemName: l.name, Qty: l.qty, DispatchedAt: now, DispatchedBy: user.name };
    return headers.map(function (h) { return h in o ? o[h] : ''; });
  });
  if (block.length) sh.getRange(sh.getLastRow() + 1, 1, block.length, headers.length).setValues(block);
  markDirty_('ShipmentItems');
  delete MEMO_.sitems;
  const byName = {};
  st.items.forEach(function (i) { byName[i.item] = i; });
  const ri = read_('RequestItems');
  setMany_(ri, rows.filter(function (r) {
    const i = byName[str_(r.ItemName)];
    const l = lines.filter(function (x) { return x.name === str_(r.ItemName); })[0];
    return i && l && l.qty >= i.remainingQty;
  }).map(function (r) { return { row: r, obj: { DispatchedAt: now, DispatchBatch: batch } }; }));
  return batch;
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
  st.items.forEach(function (it) { if (it.done && it.sentQty > 0) dispatchStatus[it.item] = true; });
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

// الكميات تُعدَّل قبل المراجعة أو بعد الاعتماد (حسب المتوفر) — وتُقفل أثناء مراجعة الطبيب وبعد الإرسال
const EDITABLE_APPROVAL = [ST.NEW, ST.APPROVED, ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV, ST.REJECTED];

function updateItemApproval_(user, requestId, itemName, approvedQty) {
  const req = mapRequest_(findRequest_(requestId).row);
  if (EDITABLE_APPROVAL.indexOf(req.status) === -1) throw new Error('ERR_LOCKED');
  // كميات الطلب الذي يراجعه الطبيب يحددها الطبيب فقط (والنقص يُعالَج بالإرسال الجزئي)
  if (doctorHasAccount_(req.doctor)) throw new Error('ERR_DOCTOR_QTY');
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
  // «ZakhirRais» → «Zakhir Rais» (اسم حساب ملتصق بحروف كبيرة)
  return norm_(String(v === null || v === undefined ? '' : v).replace(/([a-z])([A-Z])/g, '$1 $2')).replace(/[._\-]/g, ' ')
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
      const compact = function (x) { return x.replace(/\s+/g, '').replace(/^(al)/, ''); };
      matches = all.filter(function (n) { return doctorKey_(n) === key || compact(doctorKey_(n)) === compact(key); });
      if (!matches.length && key) {
        const toks = key.split(' ');
        const fuzzy = all.filter(function (n) {
          const nt = doctorKey_(n).split(' ');
          const joined = nt.join('');
          // كل مقاطع اسم الحساب موجودة في اسم الطبيب، أو الاسم الملتصق جزء من اسم الطبيب بدون مسافات
          return toks.every(function (t) { return nt.indexOf(t) !== -1; }) ||
            (toks.length === 1 && t0len_(toks[0]) && joined.replace(/al/g, '').indexOf(toks[0].replace(/al/g, '')) !== -1);
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

/** هل الطلب مسموح له بالتجهيز/الإرسال؟ (اعتمده الطبيب، أو لا يوجد حساب للطبيب) */
function cleared_(row) {
  const st = str_(row.Status);
  return !doctorHasAccount_(str_(row.Doctor)) || st === ST.APPROVED || !!row.ApprovedAt;
}

/**
 * طلب ينتظر قرار الطبيب: طبيبه له حساب ولم يُعتمد بعد.
 * يشمل «مراجعة الطبيب»، والطلبات القديمة «جديد» أو المجهّزة قبل الاعتماد (المسار السابق) — تظهر عند الطبيب تلقائياً.
 */
const AWAITING_DOCTOR = [ST.REVIEW, ST.NEW, ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV];
function awaitingDoctor_(row) {
  return AWAITING_DOCTOR.indexOf(str_(row.Status) || ST.NEW) !== -1 && doctorHasAccount_(str_(row.Doctor)) && !cleared_(row);
}

/** سبب منع الانتقال (أو '' إن كان مسموحاً) */
function transitionError_(row, newStatus) {
  const cur = str_(row.Status) || ST.NEW;
  const tr = TRANSITIONS[newStatus];
  if (!tr || tr.from.indexOf(cur) === -1) return 'ERR_BAD_TRANSITION';
  if (newStatus === ST.REVIEW) {
    if (!doctorHasAccount_(str_(row.Doctor))) return 'ERR_NO_DOCTOR_ACCOUNT';
    if ([ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV].indexOf(cur) !== -1 && cleared_(row)) return 'ERR_BAD_TRANSITION';
  }
  if ((newStatus === ST.PREP || newStatus === ST.SENT) && !cleared_(row)) return 'ERR_NEEDS_APPROVAL';
  return '';
}

function bulkUpdateStatus_(user, requestIds, newStatus) {
  const tr = TRANSITIONS[newStatus];
  // المراجعة تبدأ تلقائياً برفع الممرضة للطلب — التموين لا يرسل للطبيب
  if (!tr || newStatus === ST.REVIEW) throw new Error('ERR_BAD_STATUS');
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
      const why = transitionError_(row, newStatus);
      if (why) { result.skipped.push({ id: id, from: cur, reason: why }); return; }
      const upd = { Status: newStatus };
      upd[tr.stamp] = new Date();
      if (newStatus === ST.REVIEW) { upd.RejectionReason = ''; upd.ApprovedAt = ''; }
      setCells_(t, row, upd);
      if (newStatus === ST.SENT) {
        // إرسال كل المتبقي (بالكمية) كشحنة واحدة
        const req = mapRequest_(row);
        req.status = cur; // المتبقي يُحسب على الحالة قبل التغيير (وإلا عُدّ كل شيء مُرسلاً)
        const mine = read_('RequestItems').rows.filter(function (r) { return str_(r.RequestID) === id; });
        const st = shipState_(req, mine);
        const lines = st.items.filter(function (i) { return i.remainingQty > 0; }).map(function (i) { return { name: i.item, qty: i.remainingQty }; });
        if (lines.length) writeShipment_(req, mine, st, lines, user, upd.SentAt);
      }
      logAction_(id, 'تغيير الحالة: ' + cur + ' ← ' + newStatus, user.name);
      result.updated.push(id);
      toNotify.push(mapRequest_(row));
    });
  });
  toNotify.forEach(function (req) {
    if (newStatus === ST.SENT) notifyNurseSent_(req);
    if (newStatus === ST.REVIEW) notifyUser_(doctorAccounts_()[req.doctor] || req.doctor, 'طلب بانتظار مراجعتك - ' + req.id,
      'الطلب ' + req.id + ' (عيادة ' + req.clinic + (req.branch ? ' · فرع ' + req.branch : '') + ') جاهز لمراجعتك واعتمادك من داخل النظام.');
  });
  return result;
}

/**
 * إرسال شحنة: lines = [{ name, qty }] — qty اختيارية (الافتراضي كل المتبقي من الصنف)،
 * ويُقبل أيضاً ['اسم صنف', ...] للتوافق. يبقى الطلب مفتوحاً حتى تُرسل كل الكميات.
 */
function dispatchItems_(user, requestId, lines) {
  lines = (lines || []).map(function (l) {
    if (l && typeof l === 'object') return { name: str_(l.name), qty: l.qty === '' || l.qty === null || l.qty === undefined ? null : Number(l.qty) };
    return { name: str_(l), qty: null };
  }).filter(function (l) { return l.name; });
  if (!lines.length) throw new Error('ERR_NO_ITEMS');
  let res;
  withLock_(function () {
    resetMemo_();
    const f = findRequest_(requestId);
    const cur = str_(f.row.Status);
    if (DISPATCHABLE.indexOf(cur) === -1 || !cleared_(f.row)) throw new Error('ERR_NEEDS_APPROVAL');
    const req = mapRequest_(f.row);
    const rows = read_('RequestItems').rows.filter(function (r) { return str_(r.RequestID) === req.id; });
    const st = shipState_(req, rows);
    const byName = {};
    st.items.forEach(function (i) { byName[i.item] = i; });
    const out = [];
    lines.forEach(function (l) {
      const it = byName[l.name];
      if (!it || it.remainingQty <= 0 || out.some(function (o) { return o.name === l.name; })) return;
      const q = l.qty === null ? it.remainingQty : Math.floor(l.qty);
      if (!(q >= 1)) throw new Error('ERR_BAD_QTY');
      if (q > it.remainingQty) throw new Error('ERR_QTY_EXCEEDS');
      out.push({ name: l.name, qty: q, remainingAfter: it.remainingQty - q, target: it.target });
    });
    if (!out.length) throw new Error('ERR_NO_ITEMS');
    const now = new Date();
    const batch = writeShipment_(req, rows, st, out, user, now);
    const after = shipState_(req, read_('RequestItems').rows.filter(function (r) { return str_(r.RequestID) === req.id; }));
    const units = out.reduce(function (a, l) { return a + l.qty; }, 0);
    logAction_(req.id, 'إرسال الشحنة ' + batch + ': ' + out.map(function (l) {
      return l.name + ' ×' + l.qty + (l.remainingAfter ? ' (باقي ' + l.remainingAfter + ')' : '');
    }).join('، ') + ' — المتبقي من الطلب ' + after.remainingQty + ' قطعة', user.name);
    if (after.allDispatched) {
      setCells_(f.t, f.row, { Status: ST.SENT, SentAt: now });
      logAction_(req.id, 'تغيير الحالة: ' + cur + ' ← ' + ST.SENT, user.name);
    }
    res = {
      allSent: after.allDispatched, batch: batch, count: out.length, units: units,
      items: out.map(function (l) { return { item: l.name, qty: l.qty, remaining: l.remainingAfter }; }),
      sent: after.dispatched, total: after.total, remaining: after.total - after.dispatched,
      remainingQty: after.remainingQty, remainingItems: after.remaining, req: mapRequest_(f.row)
    };
  });
  if (res.allSent) notifyNurseSent_(res.req);
  else notifyNursePartial_(res.req, res);
  delete res.req;
  return res;
}

/* =====================================================================
 *  حالة كل صنف داخل الطلبية + التراجع عن خطوة (مع السبب) وسجل التراجعات
 * ===================================================================== */
const ITEM_ST = [ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV]; // قيد التجهيز ← بانتظار المندوب ← استلم المندوب (ثم الإرسال بالشحنات)

function addReversal_(user, requestId, scope, from, to, reason, details) {
  append_('Reversals', { Timestamp: new Date(), RequestID: str_(requestId), User: user.name, Role: user.role, Scope: scope,
    From: from, To: to, Reason: reason, Details: clean_(details, 500) });
  append_('Comments', { Timestamp: new Date(), RequestID: str_(requestId), Author: user.name, Role: user.role,
    Message: '↩️ تراجع (' + scope + '): ' + from + ' ← ' + to + ' — السبب: ' + reason });
  logAction_(requestId, 'تراجع (' + scope + '): ' + from + ' ← ' + to + ' — السبب: ' + reason, user.name);
}

/**
 * التموين يحدد حالة صنف أو أكثر داخل الطلبية (قبل إرسالها). status = '' لإلغاء الحالة.
 * الرجوع لحالة سابقة يحتاج سبباً ويُسجَّل في سجل التراجعات.
 */
function setItemsStatus_(user, requestId, items, status, reason) {
  status = str_(status);
  reason = clean_(reason, 500);
  if (status && ITEM_ST.indexOf(status) === -1) throw new Error('ERR_BAD_STATUS');
  items = (Array.isArray(items) ? items : [items]).map(str_).filter(String);
  if (!items.length) throw new Error('ERR_NO_ITEMS');
  withLock_(function () {
    resetMemo_();
    const f = findRequest_(requestId);
    const cur = str_(f.row.Status);
    if ((DISPATCHABLE.indexOf(cur) === -1 && cur !== ST.NEW) || !cleared_(f.row)) throw new Error('ERR_NEEDS_APPROVAL');
    const req = mapRequest_(f.row);
    const ri = read_('RequestItems');
    const rows = ri.rows.filter(function (r) { return str_(r.RequestID) === req.id; });
    const st = shipState_(req, rows);
    const left = {};
    st.items.forEach(function (i) { left[i.item] = i.remainingQty; });
    const now = new Date();
    const ups = [], back = [];
    items.forEach(function (name) {
      const row = rows.filter(function (r) { return str_(r.ItemName) === name; })[0];
      if (!row) throw new Error('ERR_NOT_FOUND');
      if (!(left[name] > 0)) throw new Error('ERR_ITEM_SENT'); // الصنف أُرسل بالكامل — للتراجع استخدم «تراجع خطوة»
      const was = str_(row.ItemStatus);
      if (was === status) return;
      if (ITEM_ST.indexOf(status) < ITEM_ST.indexOf(was)) back.push({ name: name, from: was });
      ups.push({ row: row, obj: { ItemStatus: status, ItemStatusAt: now, ItemStatusBy: user.name }, from: was });
    });
    if (back.length && !reason) throw new Error('ERR_REASON_REQUIRED');
    if (!ups.length) return;
    setMany_(ri, ups.map(function (u) { return { row: u.row, obj: u.obj }; }));
    ups.forEach(function (u) {
      const to = status || 'بدون حالة';
      if (back.some(function (b) { return b.name === str_(u.row.ItemName); })) addReversal_(user, req.id, 'حالة صنف: ' + str_(u.row.ItemName), u.from, to, reason, '');
      else logAction_(req.id, 'حالة صنف: ' + str_(u.row.ItemName) + ' — ' + (u.from || 'بدون حالة') + ' ← ' + to, user.name);
    });
    // بدء العمل على أي صنف = الطلب «قيد التجهيز» (إن لم يكن بدأ)
    if (status && (cur === ST.APPROVED || cur === ST.NEW)) {
      setCells_(f.t, f.row, { Status: ST.PREP, PrepAt: now });
      logAction_(req.id, 'تغيير الحالة: ' + cur + ' ← ' + ST.PREP + ' (بدء تجهيز الأصناف)', user.name);
    }
  });
  return getRequestItemsFull_(user, requestId);
}

/** الحالة السابقة لطلب حسب أختامه الزمنية (للتراجع) */
function prevStatus_(row, from) {
  if (from === ST.SENT) return row.VendorReceivedAt ? ST.VENDOR_RECV : row.PrepAt ? ST.PREP : (row.ApprovedAt ? ST.APPROVED : ST.NEW);
  if (from === ST.VENDOR_RECV) return ST.VENDOR_WAIT;
  if (from === ST.VENDOR_WAIT) return ST.PREP;
  if (from === ST.PREP) return row.ApprovedAt ? ST.APPROVED : ST.NEW;
  return '';
}
/**
 * ما الذي سيُتراجع عنه: آخر شحنة لم تستلمها العيادة (أُرسلت بالغلط) — وإلا حالة الطلب خطوة للخلف.
 * الشحنة المستلمة بالتوقيع لا يُتراجع عنها.
 */
function revertPlan_(requestId) {
  const f = findRequest_(requestId);
  const req = mapRequest_(f.row);
  const rows = itemsOf_(req.id);
  const st = shipState_(req, rows);
  const cur = str_(f.row.Status) || ST.NEW;
  const last = st.ships.length ? st.ships[st.ships.length - 1] : null;
  if (last && !last.received) {
    const to = cur === ST.SENT ? prevStatus_(f.row, ST.SENT) : cur;
    return { f: f, req: req, st: st, plan: { can: true, kind: 'shipment', batch: last.batch, from: 'الشحنة ' + last.batch + ' (' + last.units + ' قطعة)', status: cur, to: to,
      items: last.items.map(function (i) { return { item: i.item, qty: i.qty }; }) } };
  }
  const to = [ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV].indexOf(cur) !== -1 ? prevStatus_(f.row, cur) : '';
  if (to) return { f: f, req: req, st: st, plan: { can: true, kind: 'status', from: cur, status: cur, to: to } };
  return { f: f, req: req, st: st, plan: { can: false, status: cur, reason: last && last.received ? 'ERR_SHIPMENT_RECEIVED' : 'ERR_NOTHING_TO_REVERT' } };
}

/** التراجع عن خطوة (التموين) — السبب إلزامي ويُسجَّل مع الوقت في سجل التراجعات */
function revertStep_(user, requestId, reason, expected) {
  reason = clean_(reason, 500);
  if (reason.length < 3) throw new Error('ERR_REASON_REQUIRED');
  let out, notify = null;
  withLock_(function () {
    resetMemo_();
    const p = revertPlan_(requestId), plan = p.plan, f = p.f;
    if (!plan.can) throw new Error(plan.reason);
    // ما عرضته الواجهة يجب أن يطابق الحالة الآن (لا نتراجع عن شيء غيّره شخص آخر للتو)
    if (expected && (expected.kind !== plan.kind || (plan.kind === 'shipment' && Number(expected.batch) !== plan.batch) || expected.status !== plan.status)) throw new Error('ERR_CONFLICT');
    const now = new Date();
    if (plan.kind === 'shipment') {
      const si = freshTable_('ShipmentItems');
      si.rows.filter(function (r) { return str_(r.RequestID) === p.req.id && Number(r.Batch) === plan.batch; })
        .sort(function (a, b) { return b._row - a._row; })
        .forEach(function (r) { sheet_('ShipmentItems').deleteRow(r._row); });
      markDirty_('ShipmentItems'); delete MEMO_.sitems;
      const ri = read_('RequestItems');
      const b = batchesOf_(ri.rows.filter(function (r) { return str_(r.RequestID) === p.req.id; }));
      setMany_(ri, ri.rows.filter(function (r) { return str_(r.RequestID) === p.req.id && r.DispatchedAt && b.of(r) === plan.batch; })
        .map(function (r) { return { row: r, obj: { DispatchedAt: '', DispatchBatch: '' } }; }));
      if (plan.status === ST.SENT) setCells_(f.t, f.row, { Status: plan.to, SentAt: '' });
      addReversal_(user, p.req.id, 'إلغاء شحنة أُرسلت', plan.from + ' · ' + plan.status, plan.to, reason,
        plan.items.map(function (i) { return i.item + ' ×' + i.qty; }).join('، '));
      notify = { nurse: p.req.nurse, subject: 'إلغاء شحنة من طلبك - ' + p.req.id + ' (الشحنة ' + plan.batch + ')',
        body: 'أُلغيت الشحنة رقم ' + plan.batch + ' من طلبك ' + p.req.id + ' (أُرسلت بالخطأ).\nالسبب: ' + reason + '\nالأصناف:\n- ' +
          plan.items.map(function (i) { return i.item + ' ×' + i.qty; }).join('\n- ') + '\n\nلا تؤكدي استلامها — ستصلك شحنة صحيحة لاحقاً.' };
    } else {
      const clear = {}; clear[TRANSITIONS[plan.status].stamp] = '';
      setCells_(f.t, f.row, Object.assign({ Status: plan.to }, clear));
      addReversal_(user, p.req.id, 'حالة الطلب', plan.status, plan.to, reason, '');
    }
    out = plan;
  });
  if (notify) notifyUser_(notify.nurse, notify.subject, notify.body);
  return { reverted: out, request: getRequestItemsFull_(user, requestId) };
}

/** سجل التراجعات للجودة والإدارة (والتموين): opts = { from, to } */
function getReversals_(user, opts) {
  opts = opts || {};
  const from = parseDay_(opts.from), to = parseDay_(opts.to, true);
  return read_('Reversals').rows.filter(function (r) {
    const ms = toMs_(r.Timestamp);
    return str_(r.RequestID) && (!from || ms >= from.getTime()) && (!to || ms <= to.getTime());
  }).map(function (r) {
    return { time: r.Timestamp, requestId: str_(r.RequestID), user: str_(r.User), role: str_(r.Role), scope: str_(r.Scope),
      from: str_(r.From), to: str_(r.To), reason: str_(r.Reason), details: str_(r.Details) };
  }).sort(function (a, b) { return toMs_(b.time) - toMs_(a.time); }).slice(0, 300);
}

/**
 * قرار الطبيب على طلب الممرضة: اعتماد (مع تعديل الكميات اختيارياً) أو رفض مع السبب.
 * qtys = [{ item, qty }] — الكمية المعتمدة لكل صنف (0 = لا يُصرف).
 */
function doctorReview_(user, requestId, decision, reason, itemNotes, qtys) {
  reason = clean_(reason, 1000);
  if (decision !== 'اعتمد' && decision !== 'رفض') throw new Error('ERR_BAD_DECISION');
  if (decision === 'رفض' && !reason) throw new Error('ERR_REASON_REQUIRED');
  let req;
  withLock_(function () {
    resetMemo_();
    const f = findRequest_(requestId);
    req = mapRequest_(f.row);
    if (!isMyDoctor_(user, req.doctor)) throw new Error('ERR_FORBIDDEN');
    if (req.status !== ST.REVIEW && !awaitingDoctor_(f.row)) throw new Error('ERR_BAD_TRANSITION');
    const status = decision === 'اعتمد' ? ST.APPROVED : ST.REJECTED;
    const now = new Date();
    if (decision === 'اعتمد' && Array.isArray(qtys) && qtys.length) {
      const ri = read_('RequestItems');
      const rows = ri.rows.filter(function (r) { return str_(r.RequestID) === req.id; });
      const changes = [];
      const ups = [];
      qtys.forEach(function (x) {
        const row = rows.filter(function (r) { return str_(r.ItemName) === str_(x && x.item); })[0];
        if (!row) return;
        const q = Math.floor(Number(x.qty));
        if (!(q >= 0 && q <= 100000) || String(x.qty).trim() === '') throw new Error('ERR_BAD_QTY');
        if (q !== targetQty_(row)) { changes.push(str_(row.ItemName) + ': ' + targetQty_(row) + ' ← ' + q); }
        ups.push({ row: row, obj: { ApprovedQty: q } });
      });
      if (ups.length && ups.every(function (u) { return u.obj.ApprovedQty === 0; })) throw new Error('ERR_ALL_ZERO');
      setMany_(ri, ups);
      if (changes.length) logAction_(requestId, 'الطبيب عدّل الكميات: ' + changes.join('، '), user.name);
    }
    setCells_(f.t, f.row, { Status: status, ReviewedAt: now, ApprovedAt: decision === 'اعتمد' ? now : '', RejectionReason: decision === 'رفض' ? reason : '' });
    req.status = status;
    logAction_(requestId, (decision === 'اعتمد' ? 'اعتماد الطبيب' : 'رفض الطبيب: ' + reason), user.name);
  });
  (itemNotes || []).forEach(function (n) {
    if (n && str_(n.note)) addItemNote_(user, requestId, n.item, n.note);
  });
  if (reason && decision === 'اعتمد') addComment_(user, requestId, reason);
  const where = ' (عيادة ' + req.clinic + (req.branch ? ' · فرع ' + req.branch : '') + ')';
  if (decision === 'اعتمد') {
    notifyProcurement_(req.department, (req.type === 'طارئ' ? '🚨 طلب طارئ معتمد - ' : 'طلب معتمد جاهز للتجهيز - ') + requestId,
      'اعتمد الطبيب ' + user.name + ' الطلب ' + requestId + where + ' وهو جاهز للتجهيز.' + (reason ? '\nملاحظة الطبيب: ' + reason : ''));
  } else {
    notifyUser_(req.nurse, 'رفض الطبيب للطلب - ' + requestId,
      'رفض الطبيب ' + user.name + ' الطلب ' + requestId + where + '.\nالسبب: ' + reason +
      '\nيمكنك مراجعة الطلب وإعادة إرساله للطبيب من شاشة «طلباتي».');
  }
  return true;
}

/** الممرضة تعيد إرسال طلب مرفوض للطبيب (مع ملاحظة اختيارية) */
function resubmitRequest_(user, requestId, note) {
  note = clean_(note, 1000);
  guardSee_(user, requestId);
  let req;
  withLock_(function () {
    resetMemo_();
    const f = findRequest_(requestId);
    const why = transitionError_(f.row, ST.REVIEW);
    if (why || str_(f.row.Status) !== ST.REJECTED) throw new Error(why || 'ERR_BAD_TRANSITION');
    setCells_(f.t, f.row, { Status: ST.REVIEW, ReviewAt: new Date(), RejectionReason: '', ApprovedAt: '' });
    req = mapRequest_(f.row);
    logAction_(requestId, 'إعادة إرسال للطبيب بعد الرفض', user.name);
  });
  if (note) addComment_(user, requestId, note);
  notifyUser_(doctorAccounts_()[req.doctor] || req.doctor, 'طلب مُعاد لمراجعتك - ' + requestId,
    'أعادت الممرضة ' + user.name + ' إرسال الطلب ' + requestId + ' (عيادة ' + req.clinic + ') لمراجعتك بعد الرفض.' + (note ? '\nملاحظتها: ' + note : ''));
  return true;
}

/**
 * استلام شحنة واحدة وتوقيعها. عند استلام آخر شحنة (وكل الأصناف مُرسلة) يكتمل الطلب
 * ويُحفظ إيصال موحّد يجمع كل الشحنات وتواقيعها (يرسمه المتصفح بـ mergedReceiptDataUrl).
 */
function receiveShipment_(user, requestId, batch, receivedItems, receiverName, signatureDataUrl, receiptDataUrl, mergedReceiptDataUrl) {
  // اسم المستلم هو صاحب الحساب المسجّل دخوله فقط — لا يُقبل اسم حر من الواجهة
  receiverName = clean_(user.name, 120);
  batch = Math.floor(Number(batch)) || 0;
  // فحص مبدئي سريع من الكاش؛ التحقق النهائي يتم داخل القفل على بيانات الشيت الحية
  const pre = cachedRead_(function () {
    const g = guardSee_(user, requestId);
    const st = shipState_(g.req, itemsOf_(requestId));
    pendingShip_(g.req, st, batch);
    return st;
  });
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
    // المستلم فعلياً لكل صنف داخل هذه الشحنة، ثم مجموعه على الصنف في RequestItems
    const si = read_('ShipmentItems');
    const siRows = si.rows.filter(function (r) { return str_(r.RequestID) === req.id && Number(r.Batch) === batch && str_(r.ItemName) in qty; });
    setMany_(si, siRows.map(function (r) { return { row: r, obj: { ReceivedQty: qty[str_(r.ItemName)] } }; }));
    delete MEMO_.sitems;
    const withSi = {};
    siRows.forEach(function (r) { withSi[str_(r.ItemName)] = true; });
    const allSi = si.rows.filter(function (r) { return str_(r.RequestID) === req.id; });
    setMany_(ri, rows.filter(function (r) { return str_(r.ItemName) in qty; }).map(function (r) {
      const n = str_(r.ItemName);
      if (!withSi[n]) return { row: r, obj: { ReceivedQty: qty[n] } }; // صنف قديم أُرسل كاملاً
      const total = allSi.filter(function (x) { return str_(x.ItemName) === n && x.ReceivedQty !== '' && x.ReceivedQty !== null; })
        .reduce(function (a, x) { return a + (Number(x.ReceivedQty) || 0); }, 0);
      return { row: r, obj: { ReceivedQty: total } };
    }));
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
      complete: complete, batch: batch, pendingShipments: after.pending, notDispatched: after.total - after.dispatched, remainingQty: after.remainingQty,
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

/** مجلد التواقيع — معرّفه محفوظ في الكاش بدل البحث عنه بالاسم في كل حفظ */
function signaturesFolder_() {
  const cache = cache_();
  const id = cache.get('folder:signatures');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* حُذف؟ نبحث من جديد */ } }
  const folderName = 'ApexCare-Signatures';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  try { cache.put('folder:signatures', folder.getId(), 21600); } catch (e) { /* تجاهل */ }
  return folder;
}

/** يحفظ صورة PNG في Drive ويعيد { url, id } */
function saveImage_(fileName, dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw new Error('ERR_BAD_IMAGE');
  if (m[1].length > 4 * 1024 * 1024) throw new Error('ERR_BAD_IMAGE');
  const folder = signaturesFolder_();
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
  req.reversals = read_('Reversals').rows.filter(function (r) { return str_(r.RequestID) === req.id; })
    .map(function (r) { return { time: r.Timestamp, user: str_(r.User), scope: str_(r.Scope), from: str_(r.From), to: str_(r.To), reason: str_(r.Reason) }; });
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
  const approved = req.approvedAt || (req.status !== ST.REJECTED ? req.reviewedAt : '');
  return {
    unit: hours ? 'hours' : 'days',
    reviewTime: span(req.reviewAt || req.submittedAt, req.reviewedAt),
    approvalToPrep: span(approved || req.submittedAt, req.prepAt),
    vendorWait: span(req.vendorWaitAt, req.vendorReceivedAt),
    prepToSent: span(req.vendorReceivedAt || req.prepAt || approved, req.sentAt),
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
  notifyPerm_('complaints_close', subject, body);
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
    .filter(function (r) { return str_(r.Message) && (str_(r.ToRole) === 'الكل' || (target && str_(r.ToRole) === target) || MGMT_SCREENS.indexOf(user.screen) !== -1); })
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
    const labIn = queryLabCases_(user, { nurse: user.name }).filter(function (c) { return c.toReceive; }).length;
    if (labIn) alerts.push({ type: 'info', code: 'alert_lab_to_receive', n: labIn });
  } else if (user.screen === 'procurement') {
    const myDept = userDept_(user);
    const tkNew = read_('AssetTickets').rows.filter(function (r) { return str_(r.TicketID) && (str_(r.Status) || TK_ST.NEW) === TK_ST.NEW; }).length;
    if (tkNew) alerts.push({ type: 'warning', code: 'alert_asset_new', n: tkNew });
    const all = queryRequests_({}).filter(function (r) { return deptMatch_(myDept, r.department); });
    const ready = all.filter(function (r) { return r.cleared && (r.status === ST.APPROVED || r.status === ST.NEW); });
    const urgent = ready.filter(function (r) { return r.type === 'طارئ'; }).length;
    const toSend = all.filter(function (r) { return r.cleared && (r.status === ST.PREP || r.status === ST.VENDOR_RECV); }).length;
    const urgentReview = all.filter(function (r) { return r.awaitingDoctor && r.type === 'طارئ'; }).length;
    const stale = all.filter(function (r) {
      return [ST.NEW, ST.APPROVED, ST.PREP, ST.VENDOR_WAIT, ST.VENDOR_RECV].indexOf(r.status) !== -1 && hoursSince(r.submittedAt) > 72;
    }).length;
    if (urgent) alerts.push({ type: 'danger', code: 'alert_urgent_new', n: urgent });
    if (ready.length - urgent) alerts.push({ type: 'info', code: 'alert_new', n: ready.length - urgent });
    if (toSend) alerts.push({ type: 'success', code: 'alert_approved_ready', n: toSend });
    // طلبات أُرسل جزء منها وما زالت لها كميات/أصناف متبقية
    const partial = all.filter(function (r) { return r.sentQty > 0 && r.remainingQty > 0; }).length;
    if (partial) alerts.push({ type: 'warning', code: 'alert_partial', n: partial });
    if (urgentReview) alerts.push({ type: 'warning', code: 'alert_urgent_review', n: urgentReview });
    if (stale) alerts.push({ type: 'warning', code: 'alert_stale', n: stale });
    const overdue = all.filter(function (r) { return r.overdue && stageOf_(r).owner === 'procurement'; }).length;
    if (overdue) alerts.push({ type: 'danger', code: 'alert_overdue_proc', n: overdue });
  } else if (user.screen === 'lab') {
    const lc = queryLabCases_(user, {});
    const fresh = lc.filter(function (c) { return c.items.some(function (i) { return i.status === LAB_ST.NEW; }); });
    const redo = fresh.filter(function (c) { return c.redoOf; }).length;
    const late = lc.filter(function (c) { return c.overdue || c.externalLate; }).length;
    if (redo) alerts.push({ type: 'danger', code: 'alert_lab_redo', n: redo });
    if (fresh.length - redo) alerts.push({ type: 'info', code: 'alert_lab_new', n: fresh.length - redo });
    if (late) alerts.push({ type: 'warning', code: 'alert_lab_late', n: late });
  } else if (user.screen === 'doctor') {
    const pending = queryRequests_({ doctorUser: user }).filter(function (r) { return r.awaitingDoctor; }).length;
    if (pending) alerts.push({ type: 'warning', code: 'alert_pending_review', n: pending });
  } else {
    const perms = user.perms || [];
    const open = perms.indexOf('complaints') !== -1 ? getComplaints_(user, true).length : 0;
    if (open) alerts.push({ type: 'danger', code: 'alert_open_complaints', n: open });
    if (perms.indexOf('monitor') !== -1) {
      // متأخر = تجاوز موعد الاستلام (الشهري: يوم 1 من الشهر التالي، الطارئ: 24 ساعة)
      const q = queryRequests_({});
      const late = q.filter(function (r) { return r.overdue; }).length;
      const risk = q.filter(function (r) { return r.atRisk; }).length;
      if (late) alerts.push({ type: 'danger', code: 'alert_overdue', n: late });
      if (risk) alerts.push({ type: 'warning', code: 'alert_at_risk', n: risk });
    } else if (perms.indexOf('overview') !== -1) {
      const stale = reqs.filter(function (r) {
        return [ST.RECEIVED, ST.REJECTED].indexOf(r.status) === -1 && hoursSince(r.submittedAt) > 72;
      }).length;
      if (stale) alerts.push({ type: 'warning', code: 'alert_stale', n: stale });
    }
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

/** إيميل لكل من لديه صلاحية معيّنة (مثلاً المتابعة أو إغلاق البلاغات) */
function notifyPerm_(perm, subject, body) {
  const emails = read_('Users').rows.filter(function (u) {
    if (!str_(u.Email) || !str_(u.Name)) return false;
    return permsOf_({ role: str_(u.Role), screen: roleScreen_(u.Role) }).indexOf(perm) !== -1;
  }).map(function (u) { return str_(u.Email); });
  if (emails.length) sendMail_(emails.join(','), subject, body);
}

function notifyUser_(name, subject, body) {
  const u = read_('Users').rows.filter(function (r) { return str_(r.Name) === str_(name); })[0];
  if (u && str_(u.Email)) { sendMail_(str_(u.Email), subject, body); return true; }
  return false;
}

function notifyNursePartial_(req, r) {
  notifyUser_(req.nurse, 'شحنة جزئية من طلبك - ' + req.id + ' (الشحنة ' + r.batch + ')',
    'تم إرسال الشحنة رقم ' + r.batch + ' من طلبك ' + req.id + ' الخاص بعيادة ' + req.clinic + (req.branch ? ' (فرع ' + req.branch + ')' : '') + ':\n- ' +
    r.items.map(function (i) { return i.item + ' ×' + i.qty + (i.remaining ? ' (باقي ' + i.remaining + ')' : ''); }).join('\n- ') +
    '\n\nالمتبقي من الطلب (' + r.remainingQty + ' قطعة) سيُرسل لاحقاً:\n- ' +
    r.remainingItems.map(function (i) { return i.item + ': باقي ' + i.qty + ' من ' + i.target; }).join('\n- ') +
    '\n\nيرجى تأكيد استلام هذه الشحنة والتوقيع عليها من داخل النظام عند وصولها.');
}

function notifyNurseSent_(req) {
  notifyUser_(req.nurse, 'تم إرسال طلبك - ' + req.id,
    'تم إرسال طلبك رقم ' + req.id + ' الخاص بعيادة ' + req.clinic + (req.branch ? ' (فرع ' + req.branch + ')' : '') +
    '.\nيرجى تأكيد الاستلام والتوقيع من داخل النظام عند وصول الطلب.');
}

/* =====================================================================
 *  تقرير طلبات الطبيب (الأصناف × السعر + الإجمالي) لشهر أو فترة تراكمية
 * ===================================================================== */

/** 'YYYY-MM-DD' بتوقيت الرياض → Date (بداية اليوم أو نهايته) */
function parseDay_(v, endOfDay) {
  v = str_(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + (endOfDay ? 'T23:59:59.999+03:00' : 'T00:00:00+03:00'));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * opts = { from: 'YYYY-MM-DD' | '', to: 'YYYY-MM-DD' | '', doctor: (للإدارة فقط) }
 * الطبيب يرى طلباته فقط. الطلبات المرفوضة لا تدخل في الإجمالي.
 * الكمية = المعتمدة إن وُجدت وإلا المطلوبة، والسعر من كتالوج الأصناف.
 */
function getDoctorReport_(user, opts) {
  opts = opts || {};
  const isDoctor = user.screen === 'doctor';
  const doctor = isDoctor ? '' : str_(opts.doctor);
  if (!isDoctor && !doctor) throw new Error('ERR_REQUIRED');
  const from = parseDay_(opts.from), to = parseDay_(opts.to, true);
  if (from && to && from > to) throw new Error('ERR_BAD_RANGE');
  const cat = {};
  getCatalog_(true).forEach(function (c) { cat[c.name.toLowerCase()] = c; });
  const badPrices = {};
  const byReq = itemsByRequest_();
  const reqs = queryRequests_(isDoctor ? { doctorUser: user } : {}).filter(function (r) {
    if (r.status === ST.REJECTED) return false;
    if (doctor && r.doctor !== doctor) return false;
    const ms = toMs_(r.submittedAt || r.date);
    return (!from || ms >= from.getTime()) && (!to || ms <= to.getTime());
  });
  const top = {};
  const sum = { requests: 0, lines: 0, qty: 0, total: 0, unpriced: 0 };
  const rows = reqs.map(function (r) {
    const items = (byReq[r.id] || []).map(function (it) {
      const name = str_(it.ItemName);
      const c = cat[name.toLowerCase()] || {};
      const qty = Number(it.ApprovedQty !== '' && it.ApprovedQty !== null && it.ApprovedQty !== undefined ? it.ApprovedQty : it.RequestedQty) || 0;
      const price = c.asset ? 0 : (Number(c.price) || 0); // مُنقّى في getCatalog_؛ أصناف العهدة على حساب الشركة لا الطبيب
      const total = round2_(qty * price);
      if (!price && !c.asset) sum.unpriced++;
      if (c.priceIssue) badPrices[name] = c.priceIssue;
      const k = name.toLowerCase();
      top[k] = top[k] || { item: name, qty: 0, total: 0 };
      top[k].qty += qty; top[k].total = round2_(top[k].total + total);
      sum.lines++; sum.qty += qty;
      return { item: name, commercial: c.commercial || '', category: c.category || '', qty: qty, price: price, total: total, company: !!c.asset };
    });
    const total = round2_(items.reduce(function (a, i) { return a + i.total; }, 0));
    sum.requests++; sum.total = round2_(sum.total + total);
    return { id: r.id, date: r.submittedAt || r.date, clinic: r.clinic, branch: r.branch, type: r.type, status: r.status, items: items, total: total };
  }).sort(function (a, b) { return toMs_(a.date) - toMs_(b.date); });
  return {
    doctor: isDoctor ? user.name : doctor,
    from: from, to: to, generatedAt: new Date(), rows: rows, summary: sum,
    badPrices: Object.keys(badPrices).map(function (k) { return { item: k, issue: badPrices[k] }; }),
    top: Object.keys(top).map(function (k) { return top[k]; }).sort(function (a, b) { return b.total - a.total || b.qty - a.qty; }).slice(0, 8)
  };
}

/**
 * إحصائيات الجودة والإدارة لفترة (من/إلى) وفرع اختياري:
 * ملخص + حسب الطبيب + حسب الفرع + حسب العيادة + الأصناف الأعلى قيمة + توزيع الحالات.
 * القيمة = الكمية المعتمدة (أو المطلوبة) × سعر الكتالوج، ولا تُحسب قيمة المرفوض.
 */
function getStatsReport_(user, opts) {
  opts = opts || {};
  const from = parseDay_(opts.from), to = parseDay_(opts.to, true);
  if (from && to && from > to) throw new Error('ERR_BAD_RANGE');
  const branch = str_(opts.branch);
  const cat = {}, badPrices = [];
  getCatalog_(true).forEach(function (c) {
    cat[c.name.toLowerCase()] = c.asset ? 0 : (Number(c.price) || 0); // العهدة لا تُحسب على الطبيب/العيادة كمستهلك
    if (c.priceIssue) badPrices.push({ item: c.name, issue: c.priceIssue });
  });
  const byReq = itemsByRequest_();
  const reqs = queryRequests_({}).filter(function (r) {
    if (branch && r.branch !== branch) return false;
    const ms = toMs_(r.submittedAt || r.date);
    return (!from || ms >= from.getTime()) && (!to || ms <= to.getTime());
  });
  const H = 36e5;
  function hrs(a, b) { const x = toMs_(a), y = toMs_(b); return x && y && y >= x ? (y - x) / H : null; }
  function bucket() { return { requests: 0, approved: 0, rejected: 0, pending: 0, received: 0, emergency: 0, value: 0, qty: 0, approvalHrs: [], fulfilHrs: [] }; }
  function avg(a) { return a.length ? round1_(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; }
  const sum = bucket(), byDoc = {}, byBranch = {}, byClinic = {}, items = {}, statuses = {};
  let partial = 0;
  reqs.forEach(function (r) {
    let value = 0, qty = 0;
    if (r.status !== ST.REJECTED) {
      (byReq[r.id] || []).forEach(function (it) {
        const q = targetQty_(it), n = str_(it.ItemName), k = n.toLowerCase(), v = round2_(q * (cat[k] || 0));
        value += v; qty += q;
        items[k] = items[k] || { item: n, qty: 0, value: 0, requests: 0 };
        items[k].qty += q; items[k].value = round2_(items[k].value + v); items[k].requests++;
      });
    }
    const approvalH = r.approvedAt || r.status === ST.REJECTED ? hrs(r.reviewAt || r.submittedAt, r.reviewedAt || r.approvedAt) : null;
    const fulfilH = hrs(r.submittedAt, r.sentAt);
    if (r.sentQty > 0 && r.remainingQty > 0) partial++;
    statuses[r.status] = (statuses[r.status] || 0) + 1;
    [sum, byDoc[r.doctor || CLINIC_ONLY_LABEL] = byDoc[r.doctor || CLINIC_ONLY_LABEL] || bucket(), byBranch[r.branch || '—'] = byBranch[r.branch || '—'] || bucket(),
      byClinic[clinicKey_(r.clinic, r.branch)] = byClinic[clinicKey_(r.clinic, r.branch)] || bucket()].forEach(function (b) {
      b.requests++;
      if (r.status === ST.REJECTED) b.rejected++;
      else if (r.cleared && r.needsReview) b.approved++;
      if (r.awaitingDoctor) b.pending++;
      if (r.status === ST.RECEIVED) b.received++;
      if (r.type === 'طارئ') b.emergency++;
      b.value = round2_(b.value + value); b.qty += qty;
      if (approvalH !== null) b.approvalHrs.push(approvalH);
      if (fulfilH !== null) b.fulfilHrs.push(fulfilH);
    });
  });
  function out(name, b) {
    return {
      name: name, requests: b.requests, approved: b.approved, rejected: b.rejected, pending: b.pending, received: b.received,
      emergency: b.emergency, value: b.value, qty: b.qty, avgValue: b.requests ? round2_(b.value / (b.requests - b.rejected || 1)) : 0,
      avgApprovalHrs: avg(b.approvalHrs), avgFulfilHrs: avg(b.fulfilHrs),
      rejectRate: b.requests ? Math.round(b.rejected / b.requests * 100) : 0
    };
  }
  function list(m) { return Object.keys(m).map(function (k) { return out(k, m[k]); }).sort(function (a, b) { return b.value - a.value || b.requests - a.requests; }); }
  return {
    from: from, to: to, branch: branch, generatedAt: new Date(),
    summary: Object.assign(out('', sum), { partial: partial }),
    doctors: list(byDoc), branches: list(byBranch), clinics: list(byClinic), statuses: statuses, badPrices: badPrices,
    topItems: Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return b.value - a.value || b.qty - a.qty; }).slice(0, 12)
  };
}

/** أسماء الأطباء الذين لهم طلبات (لاختيار التقرير من شاشة الإدارة) */
function getReportDoctors_() {
  const out = [];
  requestRows_().forEach(function (r) { const d = str_(r.Doctor); if (d && out.indexOf(d) === -1) out.push(d); });
  return out.sort();
}

/* =====================================================================
 *  تقارير الجودة والإدارة
 * ===================================================================== */

function getQualityReport_(month) {
  const rows = queryRequests_(month ? { month: month } : {})
    .filter(function (r) { return toMs_(r.submittedAt) && toMs_(r.sentAt); })
    .map(function (r) {
      return { id: r.id, branch: r.branch, clinic: r.clinic, doctor: r.doctor, type: r.type, status: r.status,
        hours: round1_((toMs_(r.sentAt) - toMs_(r.submittedAt)) / 36e5) };
    });
  const byClinic = {};
  rows.forEach(function (r) { const k = clinicKey_(r.clinic, r.branch); (byClinic[k] = byClinic[k] || []).push(r.hours); });
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
  const acc = doctorAccounts_();
  const linked = {};
  // اسم الحساب نفسه يُحسب ربطاً فقط إن كان اسم طبيب فعلي (في Doctors أو الطلبات)
  const real = {};
  read_('Doctors').rows.forEach(function (r) { if (str_(r.DoctorName)) real[str_(r.DoctorName)] = true; });
  requestRows_().forEach(function (r) { if (str_(r.Doctor)) real[str_(r.Doctor)] = true; });
  Object.keys(acc).forEach(function (n) { if (n !== acc[n] || real[n]) (linked[acc[n]] = linked[acc[n]] || []).push(n); });
  return read_('Users').rows.filter(function (r) { return str_(r.Name); }).map(function (r) {
    const u = { name: str_(r.Name), role: str_(r.Role), clinic: str_(r.Clinic), email: str_(r.Email), screen: roleScreen_(r.Role), doctorName: str_(r.DoctorName), department: normDept_(r.Department) };
    if (u.screen === 'doctor') u.linked = linked[u.name] || [];
    return u;
  });
}

/** أسماء الأطباء (تبويب Doctors + الطلبات) ومن منهم بلا حساب مرتبط — طلباتهم تتخطى مراجعة الطبيب */
function getDoctorLinks_() {
  const acc = doctorAccounts_();
  const names = {};
  read_('Doctors').rows.forEach(function (r) { if (str_(r.DoctorName)) names[str_(r.DoctorName)] = true; });
  const all = Object.keys(names).sort();
  return { names: all, unlinked: all.filter(function (n) { return !acc[n]; }) };
}

function validateUserFields_(u) {
  if (u.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) throw new Error('ERR_BAD_EMAIL');
  if (!roleScreen_(u.role)) throw new Error('ERR_ROLE_UNMAPPED');
}

const PW_MIN = 4, PW_MAX = 64;
const PW_CHANGE_MAX_FAILS = 5;

/**
 * كل مستخدم (طبيب، ممرضة، تموين، إدارة) يغيّر رقمه السري بنفسه:
 * يُتحقق من الرقم الحالي، ثم يُحفظ الجديد مشفّراً (بعد توحيد الأرقام العربية والمسافات كما في الدخول).
 * محاولات خاطئة متكررة للرقم الحالي تقفل التغيير مؤقتاً.
 */
function changePassword_(user, current, next) {
  current = String(current === null || current === undefined ? '' : current);
  next = String(next === null || next === undefined ? '' : next);
  if (!current || !next) throw new Error('ERR_REQUIRED');
  const norm = latinDigits_(next).trim();
  if (norm.length < PW_MIN) throw new Error('ERR_WEAK_PASSWORD');
  if (norm.length > PW_MAX) throw new Error('ERR_PASSWORD_TOO_LONG');
  const cache = CacheService.getScriptCache();
  const failKey = 'cp:' + loginKey_(user.name);
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= PW_CHANGE_MAX_FAILS) throw new Error('ERR_LOGIN_LOCKED');
  withLock_(function () {
    resetMemo_();
    invalidate_('Users');
    const t = freshTable_('Users');
    const row = t.rows.filter(function (r) { return str_(r.Name) === user.name; })[0];
    if (!row) throw new Error('ERR_SESSION');
    const candidates = [current, latinDigits_(current).trim()].filter(function (p, i, a) { return p && a.indexOf(p) === i; });
    if (!candidates.some(function (p) { return verifyPassword_(row.Password, p); })) {
      cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);
      throw new Error('ERR_WRONG_PASSWORD');
    }
    if (verifyPassword_(row.Password, norm)) throw new Error('ERR_SAME_PASSWORD');
    setCells_(t, row, { Password: hashPassword_(norm), PasswordChangedAt: new Date() });
  });
  cache.remove(failKey);
  logAction_('', 'تغيير الرقم السري', user.name);
  return true;
}

function createUser_(user, u) {
  u = u || {};
  const name = clean_(u.name, 80);
  const password = String(u.password || '');
  if (!name || !password) throw new Error('ERR_REQUIRED');
  if (password.length < 4) throw new Error('ERR_WEAK_PASSWORD');
  const fields = { role: str_(u.role), clinic: clean_(u.clinic, 500), email: str_(u.email), doctorName: clean_(u.doctorName, 120), department: normDept_(u.department) };
  validateUserFields_(fields);
  if (getUsers_().some(function (x) { return loginKey_(x.name) === loginKey_(name); })) throw new Error('ERR_USER_EXISTS');
  append_('Users', { Name: name, Password: hashPassword_(latinDigits_(password).trim()), Role: fields.role, Clinic: fields.clinic, Email: fields.email,
    DoctorName: roleScreen_(fields.role) === 'doctor' ? fields.doctorName : '', Department: fields.department });
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
  const fields = { role: str_(u.role), clinic: clean_(u.clinic, 500), email: str_(u.email), doctorName: clean_(u.doctorName, 120), department: normDept_(u.department) };
  validateUserFields_(fields);
  if (roleScreen_(row.Role) === 'admin' && roleScreen_(fields.role) !== 'admin' && countAdmins_(str_(name)) === 0) {
    throw new Error('ERR_LAST_ADMIN');
  }
  const upd = { Role: fields.role, Clinic: fields.clinic, Email: fields.email, DoctorName: roleScreen_(fields.role) === 'doctor' ? fields.doctorName : '', Department: fields.department };
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
  deleteRow_(t, row);
  logAction_('', 'حذف مستخدم: ' + name, user.name);
  return getUsers_();
}

function saveRole_(user, name, screen, perms) {
  name = clean_(name, 60);
  screen = str_(screen);
  // صلاحيات الأدوار الإدارية: قائمة مختارة من PERMS (فارغة = لا شيء، غير مرسلة = الافتراضي). الأدمن «*» دائماً
  let permCell = '';
  if (screen === 'admin') permCell = '*';
  else if (MGMT_SCREENS.indexOf(screen) !== -1 && Array.isArray(perms)) {
    const list = perms.map(str_).filter(function (p, i, a) { return PERMS.indexOf(p) !== -1 && a.indexOf(p) === i; });
    permCell = list.length ? list.join(',') : 'none';
  }
  if (!name) throw new Error('ERR_REQUIRED');
  if (SCREENS.indexOf(screen) === -1) throw new Error('ERR_BAD_SCREEN');
  const t = read_('Roles');
  const row = t.rows.filter(function (r) { return str_(r.RoleName) === name; })[0];
  if (row) {
    if (roleScreen_(name) === 'admin' && screen !== 'admin') {
      const others = getUsers_().filter(function (u) { return u.screen === 'admin' && u.role !== name; }).length;
      if (!others) throw new Error('ERR_LAST_ADMIN');
    }
    setCells_(t, row, { Screen: screen, Permissions: permCell });
  } else {
    append_('Roles', { RoleName: name, Screen: screen, Permissions: permCell });
  }
  logAction_('', 'حفظ دور: ' + name + ' (' + screen + (permCell ? ': ' + permCell : '') + ')', user.name);
  return getRoles_();
}

function deleteRole_(user, name) {
  name = str_(name);
  if (getUsers_().some(function (u) { return u.role === name; })) throw new Error('ERR_ROLE_IN_USE');
  const t = read_('Roles');
  const row = t.rows.filter(function (r) { return str_(r.RoleName) === name; })[0];
  if (!row) throw new Error('ERR_NOT_FOUND');
  deleteRow_(t, row);
  return getRoles_();
}


/* =====================================================================
 *  المعمل: إرساليات المرضى من العيادة للمعمل (داخلي أو خارجي)
 *  كل إرسالية = مريض + رقم ملف + طبيب، وفيها سطر أو أكثر (عمل لمعمل معيّن).
 *  مسار السطر: أُرسل من العيادة ← استلمه المعمل ← قيد العمل (داخلي) أو عند معمل خارجي ← جاهز ← أُرسل للعيادة ← استلمته العيادة
 * ===================================================================== */

const LAB_ST = {
  NEW: 'أُرسل من العيادة', RECEIVED: 'استلمه المعمل', WORK: 'قيد العمل', EXTERNAL: 'عند معمل خارجي',
  READY: 'جاهز', SENT: 'أُرسل للعيادة', DELIVERED: 'استلمته العيادة', PATIENT: 'سُلِّم للمريض'
};
const LAB_ORDER = [LAB_ST.NEW, LAB_ST.RECEIVED, LAB_ST.WORK, LAB_ST.EXTERNAL, LAB_ST.READY, LAB_ST.SENT, LAB_ST.DELIVERED, LAB_ST.PATIENT];
const LAB_DONE = [LAB_ST.READY, LAB_ST.SENT, LAB_ST.DELIVERED, LAB_ST.PATIENT];
const LAB_CLOSED = [LAB_ST.DELIVERED, LAB_ST.PATIENT]; // وصلت العيادة (أو المريض) — تُؤرشف بعد 60 يوماً
const LAB_REDO_REASONS = ['مقاس', 'لون', 'كسر', 'خطأ تصميم', 'تأخير', 'أخرى'];
const LAB_WORK_TYPES_DEFAULT = ['Crown', 'Veneer', 'Bridge', 'Inlay', 'Onlay', 'Denture', 'Night Guard', 'Implant Crown', 'Temporary', 'Surgical Guide'];
const LAB_WORK_TYPES_OLD_ = ['تاج', 'جسر', 'طقم كامل', 'طقم جزئي', 'حافظ مسافة', 'واقي ليلي', 'تقويم متحرك', 'قشور (فينير)', 'حشوة خزفية (إنلاي/أونلاي)', 'زراعة — تاج على زرعة', 'أخرى'];
const LAB_MATERIALS_DEFAULT = ['Zirconia', 'Emax', 'PFM', 'PMMA', 'Composite', 'Acrylic', 'Metal', 'Other'];
const LAB_TURNAROUND_DEFAULT = 10;
const LAB_MAX_ITEMS = 20, LAB_MAX_PHOTOS = 3, LAB_LINE_PHOTOS = 3;

function isYes_(v) { return v === true || /^(نعم|yes|true|1|y|✓)$/i.test(str_(v)); }

function getLabs_() {
  return read_('Labs').rows.filter(function (r) { return str_(r.LabName) && (str_(r.Active) === '' || isYes_(r.Active)); })
    .map(function (r) {
      const days = Math.floor(num_(r.TurnaroundDays));
      return { name: str_(r.LabName), type: /خارج|external/i.test(str_(r.Type)) ? 'خارجي' : 'داخلي', email: str_(r.Email), phone: str_(r.Phone),
        turnaround: days >= 1 && days <= 120 ? days : null };
    });
}
function getLabWorkTypes_() {
  const list = read_('LabWorkTypes').rows.map(function (r) { return str_(r.WorkType); }).filter(String);
  // القائمة العربية القديمة التلقائية (لم يعدّلها أحد) تُستبدل بقائمة العيادة
  if (!list.length || list.join('|') === LAB_WORK_TYPES_OLD_.join('|')) return LAB_WORK_TYPES_DEFAULT.slice();
  return list;
}
function getLabMaterials_() {
  const list = read_('LabMaterials').rows.map(function (r) { return str_(r.Material); }).filter(String);
  return list.length ? list : LAB_MATERIALS_DEFAULT.slice();
}
/** قيمة من تبويب Settings (Key / Value) */
function getSetting_(key, def) {
  const r = read_('Settings').rows.filter(function (x) { return str_(x.Key) === key; })[0];
  return r && str_(r.Value) !== '' ? r.Value : def;
}
function labTurnaroundDefault_() {
  const d = Math.floor(num_(getSetting_('LabTurnaroundDays', LAB_TURNAROUND_DEFAULT)));
  return d >= 1 && d <= 120 ? d : LAB_TURNAROUND_DEFAULT;
}
/** موعد المعمل = تاريخ السكان + أيام التنفيذ (الأطول بين معامل الأعمال، أو الافتراضي من Settings) — نهاية اليوم */
function labDueFrom_(scanDate, labNames, labs) {
  const def = labTurnaroundDefault_();
  let days = 0;
  (labNames || []).forEach(function (n) { const l = labs[n]; days = Math.max(days, (l && l.turnaround) || def); });
  if (!days) days = def;
  const d = new Date(scanDate.getTime() + days * 864e5);
  return parseDay_(Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), true);
}
function getLabConfig_() {
  return { labs: getLabs_(), workTypes: getLabWorkTypes_(), materials: getLabMaterials_(), redoReasons: LAB_REDO_REASONS,
    statuses: LAB_ORDER, turnaround: labTurnaroundDefault_() };
}


/** صورة مرفقة (PNG/JPEG) تُحفظ في Drive */
function saveLabPhoto_(fileName, dataUrl) {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m || m[2].length > 4 * 1024 * 1024) throw new Error('ERR_BAD_IMAGE');
  const type = 'image/' + m[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), type, fileName + (m[1] === 'png' ? '.png' : '.jpg'));
  const file = signaturesFolder_().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* سياسة النطاق */ }
  return file.getUrl();
}

/**
 * رفع حالة للمعمل (New Case) أو إعادة عمل (Remake).
 * payload = { doctor, fileNo, patient?, branch?, scanDate:'YYYY-MM-DD', urgent, notes, delivered (حالة قديمة مسلّمة),
 *             lines:[{lab, workType, material, details}],
 *             redoOf, redoItems:[ItemID], redoReason, redoNote, redoScanDate, redoLab, photos:[dataUrl], clientKey }
 * موعد المعمل يُحسب تلقائياً: تاريخ السكان + أيام التنفيذ (Settings / Labs.TurnaroundDays).
 */
function createLabCase_(user, payload) {
  payload = payload || {};
  const doctor = str_(payload.doctor);
  const patient = clean_(payload.patient, 120);
  const fileNo = clean_(payload.fileNo, 40);
  const labs = {};
  getLabs_().forEach(function (l) { labs[l.name] = l; });
  const types = getLabWorkTypes_(), materials = getLabMaterials_();
  const today = parseDay_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), true);

  // إعادة: أي حالة موجودة (يُوصَل لها برقم الملف)، والأعمال المختارة منها، وسبب وتاريخ سكان جديد
  const redoOf = str_(payload.redoOf);
  let origin = null, redoLines = [];
  if (redoOf) {
    origin = labCaseRow_(redoOf);
    if (!origin) throw new Error('ERR_NOT_FOUND');
    if (LAB_REDO_REASONS.indexOf(str_(payload.redoReason)) === -1) throw new Error('ERR_REDO_REASON');
    const want = (payload.redoItems || []).map(str_);
    redoLines = labItemsOf_(redoOf).filter(function (it) { return want.indexOf(str_(it.ItemID)) !== -1; });
    if (!redoLines.length) throw new Error('ERR_NO_ITEMS');
    if (str_(payload.redoLab) && !labs[str_(payload.redoLab)]) throw new Error('ERR_BAD_LAB');
  }
  const doctorName = redoOf ? str_(origin.Doctor) : doctor;
  const fileNum = redoOf ? str_(origin.FileNo) : fileNo;
  if (!doctorName || !fileNum) throw new Error('ERR_REQUIRED');
  if (!redoOf && !getDoctors_(user, '').some(function (d) { return d.name === doctor; })) throw new Error('ERR_BAD_DOCTOR');
  const scan = parseDay_(redoOf ? payload.redoScanDate : payload.scanDate);
  if (!scan) throw new Error('ERR_SCAN_DATE');
  if (scan.getTime() > today.getTime()) throw new Error('ERR_SCAN_FUTURE');

  const lines = redoOf
    ? redoLines.map(function (it) {
        return { lab: str_(payload.redoLab) || str_(it.Lab), workType: str_(it.WorkType), material: str_(it.Material), details: str_(it.Details), redoOfItem: str_(it.ItemID) };
      })
    : (payload.lines || []).map(function (l) {
        return { lab: str_(l && l.lab), workType: str_(l && l.workType), material: str_(l && l.material), details: clean_(l && l.details, 500),
          photos: ((l && l.photos) || []).slice(0, LAB_LINE_PHOTOS) };
      }).filter(function (l) { return l.lab || l.workType || l.details; });
  if (!lines.length) throw new Error('ERR_NO_ITEMS');
  if (lines.length > LAB_MAX_ITEMS) throw new Error('ERR_TOO_MANY_ITEMS');
  lines.forEach(function (l) {
    if (!labs[l.lab] && !(redoOf && !str_(payload.redoLab))) throw new Error('ERR_BAD_LAB');
    if (!l.workType || (types.indexOf(l.workType) === -1 && !redoOf)) throw new Error('ERR_BAD_WORKTYPE');
    if (!redoOf && l.material && materials.indexOf(l.material) === -1) throw new Error('ERR_BAD_MATERIAL'); // المادة اختيارية
  });
  const needed = labDueFrom_(scan, lines.map(function (l) { return l.lab; }), labs);
  const delivered = !redoOf && !!payload.delivered; // إدخال حالة قديمة سُلّمت للمريض
  const photos = (payload.photos || []).slice(0, LAB_MAX_PHOTOS);
  const clientKey = /^[A-Za-z0-9-]{8,64}$/.test(str_(payload.clientKey)) ? str_(payload.clientKey) : '';
  const clinic = redoOf ? str_(origin.Clinic) : doctorClinic_(user, doctor);
  const branches = getBranches_();
  let branch = redoOf ? str_(origin.Branch) : str_(payload.branch);
  if (branch && branches.length && branches.indexOf(branch) === -1) throw new Error('ERR_BAD_BRANCH');
  if (!branch) branch = clinic ? clinicBranch_(clinic) : '';
  const pName = redoOf ? str_(origin.Patient) : patient;

  // مثل الطلبات: حجز رقم بقفل قصير، ثم إلحاق ذري ورفع الصور خارج أي قفل
  if (clientKey) {
    const same = read_('LabCases').rows.filter(function (r) { return str_(r.ClientKey) === clientKey && str_(r.Nurse) === user.name; })[0];
    if (same) return { duplicate: true, id: str_(same.CaseID) };
  }
  const cache = CacheService.getScriptCache();
  const ckKey = clientKey ? 'lck:' + user.name + ':' + clientKey : '';
  // الإعادة رقم فرعي تابع للإرسالية الأساسية: LAB-yyMMdd-001-R1، R2…
  const root = redoOf ? labRootId_(redoOf) : '';
  const guard = function () { return ckKey ? cache.get(ckKey) : null; };
  const res = redoOf ? reserveRedoId_(root, guard)
    : reserveId_('LAB-', function (prefix) { return maxSeq_(freshTable_('LabCases').rows, 'CaseID', prefix); }, guard);
  if (!res.duplicate) {
    const id = res.id;
    if (ckKey) cache.put(ckKey, id, 21600);
    try {
      const urls = [];
      photos.forEach(function (ph, i) { try { urls.push(saveLabPhoto_(id + '-photo' + (i + 1), ph)); } catch (e) { console.error(e); } });
      lines.forEach(function (l, i) {
        l.urls = [];
        (l.photos || []).forEach(function (ph, k) { try { l.urls.push(saveLabPhoto_(id + '-' + (i + 1) + '-photo' + (k + 1), ph)); } catch (e) { console.error(e); } });
      });
      const now = new Date();
      append_('LabCases', {
        CaseID: id, Date: now, Nurse: user.name, Doctor: doctorName, Clinic: clinic, Branch: branch, Patient: pName, FileNo: fileNum,
        NeededBy: needed, Urgent: payload.urgent ? 'نعم' : '', RedoOf: redoOf, RedoReason: redoOf ? str_(payload.redoReason) : '',
        RedoNote: redoOf ? clean_(payload.redoNote, 1000) : '', Attachments: urls.join(' '), ClientKey: clientKey,
        ScanDate: scan, Notes: clean_(payload.notes, 1000), Source: delivered ? 'إدخال سابق' : ''
      });
      if (redoOf) highlightLastRow_('LabCases', id, '#FFE0B2'); // الإعادة برتقالية في الشيت
      lines.forEach(function (l, i) {
        append_('LabItems', { ItemID: id + '-' + (i + 1), CaseID: id, Lab: l.lab, LabType: (labs[l.lab] || {}).type || '', WorkType: l.workType,
          Material: l.material, Details: l.details, Status: delivered ? LAB_ST.PATIENT : LAB_ST.NEW, PatientAt: delivered ? now : '', Attachments: (l.urls || []).join(' '),
          RedoOfItem: l.redoOfItem || '', RedoReason: l.redoOfItem ? str_(payload.redoReason) : '' });
      });
    } catch (e) { if (ckKey) cache.remove(ckKey); throw e; }
    logAction_(id, redoOf ? 'إعادة للمعمل (' + redoOf + '): ' + payload.redoReason : (delivered ? 'حالة معمل سابقة (مسلّمة)' : 'حالة جديدة للمعمل'), user.name);
  }
  if (!res.duplicate && !delivered) {
    const body = 'رقم الحالة: ' + res.id + '\nرقم الملف: ' + fileNum + (pName ? ' — ' + pName : '') + '\nالطبيب: ' + doctorName + (clinic ? '\nالعيادة: ' + clinic : '') +
      (branch ? '\nالفرع: ' + branch : '') + '\nتاريخ السكان: ' + Utilities.formatDate(scan, TZ, 'yyyy-MM-dd') +
      '\nموعد المعمل: ' + Utilities.formatDate(needed, TZ, 'yyyy-MM-dd') + '\nبواسطة: ' + user.name +
      '\n\nالأعمال:\n- ' + lines.map(function (l) { return l.workType + (l.material ? ' (' + l.material + ')' : '') + ' · ' + l.lab + (l.details ? ' · ' + l.details : ''); }).join('\n- ') +
      (payload.notes ? '\n\nملاحظات: ' + str_(payload.notes) : '') +
      (redoOf ? '\n\n⚠️ إعادة (Remake) للحالة ' + redoOf + '\nالسبب: ' + payload.redoReason + (payload.redoNote ? '\nالمشكلة: ' + payload.redoNote : '') : '');
    notifyRole_('lab', (redoOf ? '⚠️ Remake - ' : (payload.urgent ? '🚨 حالة عاجلة للمعمل - ' : 'حالة جديدة للمعمل - ')) + res.id, body);
    if (redoOf) notifyUser_(doctorAccounts_()[doctorName], '⚠️ إعادة عمل معمل لمريضك - ' + res.id, body);
  }
  return res;
}

/* =====================================================================
 *  استيراد حالات فورم قوقل القديمة (مرة واحدة) — شغّل importLabCases من محرر Apps Script
 *  1) انسخ تبويب الحالات من شيت الفورم إلى تبويب جديد هنا اسمه LabImport (الصف الأول = العناوين)
 *  2) شغّل importLabCases — الحالات تُضاف برقمها القديم (مثل CASE-00012) وتُتخطى الموجودة (آمن للتكرار)
 * ===================================================================== */
const LAB_IMPORT_SHEET_ = 'LabImport';
function importLabCases() {
  const res = importLabCases_();
  try { SpreadsheetApp.getUi().alert('استيراد حالات المعمل: أُضيفت ' + res.added + ' حالة، وتُخطيت ' + res.skipped + (res.errors.length ? '\n\nملاحظات:\n' + res.errors.slice(0, 15).join('\n') : '')); } catch (e) { /* بدون واجهة */ }
  return res;
}
function importLabCases_() {
  const sh = ss_().getSheetByName(LAB_IMPORT_SHEET_);
  if (!sh) throw new Error('أنشئ تبويب ' + LAB_IMPORT_SHEET_ + ' والصق فيه حالات الفورم أولاً');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { added: 0, skipped: 0, errors: [] };
  const head = values[0].map(function (h) { return str_(h).toLowerCase(); });
  const col = function (re, not) { for (let i = 0; i < head.length; i++) if (re.test(head[i]) && !(not && not.test(head[i]))) return i; return -1; };
  const C = {
    id: col(/case\s*id|رقم الحالة/), file: col(/file|ملف/), branch: col(/branch|فرع/), doctor: col(/doctor|طبيب/),
    work: col(/work\s*type|نوع العمل/), material: col(/material|مادة|خامة/), lab: col(/\blab\b|معمل/, /due|date|status|remake|تاريخ|موعد|حالة/),
    scan: col(/scan|سكان/, /remake/), due: col(/due|موعد/), status: col(/status|حالة/, /remake|\bid\b|رقم/), delivered: col(/deliver|سُلِّم|تسليم/),
    notes: col(/note|ملاحظ/, /remake/), time: col(/timestamp|created|تاريخ الإنشاء|الطابع/), remake: col(/remake\s*reason|سبب الإعادة|remake/, /date|scan|note|to\b/)
  };
  if (C.file === -1) throw new Error('لم أجد عمود رقم الملف (File No.) في ' + LAB_IMPORT_SHEET_);
  const cell = function (r, k) { return C[k] === -1 ? '' : r[C[k]]; };
  const asDate = function (v) {
    if (isDate_(v)) return v;
    const t = str_(v); if (!t) return '';
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t); // mm/dd/yyyy (فورم قوقل)
    const d = m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), 12) : new Date(t);
    return isNaN(d.getTime()) ? '' : d;
  };
  const labs = {};
  getLabs_().forEach(function (l) { labs[l.name] = l; });
  const existing = {};
  read_('LabCases').rows.forEach(function (c) { existing[str_(c.CaseID).toLowerCase()] = true; });
  const cases = [], items = [], errors = [];
  let skipped = 0, seq = 0;
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  values.slice(1).forEach(function (r, k) {
    const fileNo = clean_(cell(r, 'file'), 40);
    if (!fileNo) { if (r.some(function (v) { return str_(v); })) skipped++; return; }
    let id = clean_(cell(r, 'id'), 40);
    if (!id) id = 'IMP-' + stamp + '-' + ('000' + (++seq)).slice(-4);
    if (existing[id.toLowerCase()]) { skipped++; return; }
    existing[id.toLowerCase()] = true;
    const st = str_(cell(r, 'status')).toLowerCase(), dl = str_(cell(r, 'delivered')).toLowerCase();
    const status = /deliver.*patient|سُلِّم|للمريض/.test(st) || /^(yes|نعم|true)$/.test(dl) ? LAB_ST.PATIENT
      : /received|استلم|العيادة/.test(st) ? LAB_ST.DELIVERED
      : /still|at lab|المعمل/.test(st) ? LAB_ST.RECEIVED : LAB_ST.NEW;
    const scan = asDate(cell(r, 'scan')), created = asDate(cell(r, 'time')) || scan || new Date();
    const lab = str_(cell(r, 'lab'));
    let due = asDate(cell(r, 'due'));
    if (!due && scan) due = labDueFrom_(scan, [lab], labs);
    const remake = str_(cell(r, 'remake'));
    const doctor = str_(cell(r, 'doctor'));
    let clinic = '';
    try { clinic = doctor ? doctorClinic_({ name: '', clinic: '' }, doctor) : ''; } catch (e) { clinic = ''; }
    cases.push({ CaseID: id, Date: created, Nurse: 'استيراد الفورم', Doctor: doctor, Clinic: clinic, Branch: str_(cell(r, 'branch')) || (clinic ? clinicBranch_(clinic) : ''),
      Patient: '', FileNo: fileNo, NeededBy: due, ScanDate: scan, Notes: clean_(cell(r, 'notes'), 1000), Source: 'فورم قوقل',
      RedoReason: remake ? clean_(remake, 100) : '', RedoNote: remake ? 'Remake (من الفورم)' : '' });
    const now = new Date();
    items.push({ ItemID: id + '-1', CaseID: id, Lab: lab, LabType: (labs[lab] || {}).type || '', WorkType: str_(cell(r, 'work')), Material: str_(cell(r, 'material')),
      Details: '', Status: status, ReceivedAt: status !== LAB_ST.NEW ? created : '',
      DeliveredAt: status === LAB_ST.DELIVERED || status === LAB_ST.PATIENT ? now : '', PatientAt: status === LAB_ST.PATIENT ? now : '',
      RedoReason: remake ? clean_(remake, 100) : '', UpdatedBy: 'استيراد' });
    if (!doctor) errors.push('صف ' + (k + 2) + ': بدون طبيب (' + id + ')');
  });
  appendMany_('LabCases', cases);
  appendMany_('LabItems', items);
  if (cases.length) logAction_('', 'استيراد ' + cases.length + ' حالة معمل من الفورم', 'النظام');
  flushDirty_();
  return { added: cases.length, skipped: skipped, errors: errors };
}
/** إلحاق عدة صفوف دفعة واحدة (setValues) — أسرع بكثير من appendRow لكل صف */
function appendMany_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name);
  const vals = [headerRow_(sh)];
  ensureHeaders_(sh, vals, SCHEMA[name]);
  const headers = vals[0];
  const rows = objs.map(function (o) { return headers.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; }); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  markDirty_(name);
}

/** الإرسالية الأساسية لسلسلة الإعادات (الرقم قبل -R) */
function labRootId_(id) {
  let c = labCaseRow_(id), guard = 0;
  while (c && str_(c.RedoOf) && guard++ < 20) { const up = labCaseRow_(str_(c.RedoOf)); if (!up) break; c = up; }
  return str_(c ? c.CaseID : id).replace(/-R\d+$/, '');
}
/** حجز رقم إعادة فرعي (ROOT-R1، R2…) بقفل قصير وعدّاد لكل إرسالية أساسية */
function reserveRedoId_(root, guard) {
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ERR_BUSY');
  try {
    const dup = guard ? guard() : null;
    if (dup) return { duplicate: true, id: dup };
    const props = PropertiesService.getScriptProperties();
    const key = 'rseq:' + root;
    const n = Math.max(Number(props.getProperty(key)) || 0, maxSeq_(freshTable_('LabCases').rows, 'CaseID', root + '-R')) + 1;
    props.setProperty(key, String(n));
    return { duplicate: false, id: root + '-R' + n };
  } finally { lock.releaseLock(); }
}

/** تلوين آخر صف مُلحق (إن كان هو صف المعرّف) — تمييز بصري في الشيت فقط */
function highlightLastRow_(name, id, color) {
  try {
    const sh = sheet_(name);
    const r = sh.getLastRow();
    if (r > 1 && str_(sh.getRange(r, 1).getValue()) === str_(id)) sh.getRange(r, 1, 1, sh.getLastColumn()).setBackground(color);
  } catch (e) { console.error(e); }
}

/** بحث بالرقم: رقم الملف (مطابق) أو رقم الحالة — للمعمل (التحديث) وللممرضة (الإعادة) من أي ممرضة */
function findLabCases_(user, q) {
  q = str_(q).toLowerCase();
  if (q.length < 2) return [];
  const now = Date.now();
  const byCase = {};
  read_('LabItems').rows.forEach(function (it) { (byCase[str_(it.CaseID)] = byCase[str_(it.CaseID)] || []).push(it); });
  return read_('LabCases').rows.filter(function (c) {
    return str_(c.CaseID) && (str_(c.FileNo).toLowerCase() === q || str_(c.CaseID).toLowerCase() === q);
  }).map(function (c) { return mapLabCase_(c, byCase[str_(c.CaseID)] || [], now); })
    .sort(function (a, b) { return toMs_(b.date) - toMs_(a.date); }).slice(0, 30);
}

function labCaseRow_(id) {
  id = str_(id);
  return read_('LabCases').rows.filter(function (r) { return str_(r.CaseID) === id; })[0] || null;
}
function labItemsOf_(id) {
  id = str_(id);
  return read_('LabItems').rows.filter(function (r) { return str_(r.CaseID) === id; });
}
/** من يرى الإرسالية: الممرضة صاحبتها، الطبيب نفسه، المعمل، ومن لديه صلاحية متابعة المعمل */
function canSeeLab_(user, c) {
  if (user.screen === 'lab' || (user.perms || []).indexOf('lab_view') !== -1) return true;
  if (user.screen === 'nurse') return str_(c.Nurse) === user.name;
  if (user.screen === 'doctor') return isMyDoctor_(user, str_(c.Doctor));
  return false;
}
function mapLabItem_(it, c, now) {
  const needed = toMs_(c && c.NeededBy);
  const done = LAB_DONE.indexOf(str_(it.Status)) !== -1;
  const exp = toMs_(it.ExpectedAt);
  return {
    id: str_(it.ItemID), caseId: str_(it.CaseID), lab: str_(it.Lab), labType: str_(it.LabType), workType: str_(it.WorkType), material: str_(it.Material), details: str_(it.Details),
    patientAt: it.PatientAt, attachments: str_(it.Attachments).split(/\s+/).filter(String),
    status: str_(it.Status) || LAB_ST.NEW, receivedAt: it.ReceivedAt, startedAt: it.StartedAt, externalLab: str_(it.ExternalLab), externalAt: it.ExternalAt,
    expectedAt: it.ExpectedAt, readyAt: it.ReadyAt, sentAt: it.SentAt, deliveredAt: it.DeliveredAt, cost: price_(it.Cost),
    redoOfItem: str_(it.RedoOfItem), redoReason: str_(it.RedoReason), updatedBy: str_(it.UpdatedBy),
    overdue: !done && !!needed && now > needed,
    externalLate: str_(it.Status) === LAB_ST.EXTERNAL && !!exp && now > exp + 864e5 - 1
  };
}
function caseStatus_(items) {
  if (!items.length) return LAB_ST.NEW;
  let min = LAB_ORDER.length;
  items.forEach(function (i) { min = Math.min(min, Math.max(0, LAB_ORDER.indexOf(i.status))); });
  return LAB_ORDER[min];
}
function mapLabCase_(c, items, now) {
  const its = items.map(function (it) { return mapLabItem_(it, c, now); });
  return {
    id: str_(c.CaseID), date: c.Date, nurse: str_(c.Nurse), doctor: str_(c.Doctor), clinic: str_(c.Clinic), branch: str_(c.Branch),
    patient: str_(c.Patient), fileNo: str_(c.FileNo), neededBy: c.NeededBy, urgent: isYes_(c.Urgent),
    scanDate: c.ScanDate, caseNotes: str_(c.Notes), source: str_(c.Source),
    root: str_(c.CaseID).replace(/-R\d+$/, ''), remakeNo: Number((/-R(\d+)$/.exec(str_(c.CaseID)) || [])[1]) || 0,
    redoOf: str_(c.RedoOf), redoReason: str_(c.RedoReason), redoNote: str_(c.RedoNote),
    attachments: str_(c.Attachments).split(/\s+/).filter(String), items: its, status: caseStatus_(its),
    overdue: its.some(function (i) { return i.overdue; }), externalLate: its.some(function (i) { return i.externalLate; }),
    toReceive: its.some(function (i) { return i.status === LAB_ST.SENT; }),
    atClinic: its.some(function (i) { return i.status === LAB_ST.DELIVERED; }),
    labs: its.map(function (i) { return i.lab; }).filter(function (l, k, a) { return a.indexOf(l) === k; })
  };
}
function queryLabCases_(user, filters, opts) {
  filters = filters || {}; opts = opts || {};
  const now = Date.now();
  const byCase = {};
  read_('LabItems').rows.forEach(function (it) { (byCase[str_(it.CaseID)] = byCase[str_(it.CaseID)] || []).push(it); });
  const redone = {};
  read_('LabCases').rows.forEach(function (c) { if (str_(c.RedoOf)) (redone[str_(c.RedoOf)] = redone[str_(c.RedoOf)] || []).push(str_(c.CaseID)); });
  return read_('LabCases').rows.filter(function (c) {
    if (!str_(c.CaseID)) return false;
    if (filters.nurse && str_(c.Nurse) !== filters.nurse) return false;
    if (filters.doctorUser && !isMyDoctor_(filters.doctorUser, str_(c.Doctor))) return false;
    return canSeeLab_(user, c);
  }).map(function (c) {
    const o = mapLabCase_(c, byCase[str_(c.CaseID)] || [], now);
    o.redoneBy = redone[o.id] || [];
    return o;
  }).filter(function (o) {
    // الأرشيف: الإرساليات المستلمة الأقدم من 60 يوماً لا تُحمّل إلا عند الطلب
    return opts.archive || LAB_CLOSED.indexOf(o.status) === -1 || (now - toMs_(o.date)) < ARCHIVE_DAYS * 864e5;
  }).sort(function (a, b) { return toMs_(b.date) - toMs_(a.date); });
}
function labNotes_(id) {
  return read_('LabNotes').rows.filter(function (r) { return str_(r.CaseID) === str_(id); })
    .map(function (r) { return { time: r.Timestamp, item: str_(r.ItemID), author: str_(r.Author), role: str_(r.Role), message: str_(r.Message) }; })
    .sort(function (a, b) { return toMs_(a.time) - toMs_(b.time); });
}
function getLabCase_(user, id) {
  const c = labCaseRow_(id);
  if (!c) throw new Error('ERR_NOT_FOUND');
  if (!canSeeLab_(user, c)) throw new Error('ERR_FORBIDDEN');
  const o = mapLabCase_(c, labItemsOf_(id), Date.now());
  o.notes = labNotes_(id);
  o.redoneBy = read_('LabCases').rows.filter(function (r) { return str_(r.RedoOf) === o.id; }).map(function (r) { return str_(r.CaseID); });
  // سلسلة التتبع: الإرسالية الأساسية وكل إعاداتها بحالتها
  const now = Date.now();
  o.chain = read_('LabCases').rows.filter(function (r) { const id = str_(r.CaseID); return id === o.root || id.indexOf(o.root + '-R') === 0; })
    .map(function (r) { const m = mapLabCase_(r, labItemsOf_(str_(r.CaseID)), now); return { id: m.id, status: m.status, date: m.date, remakeNo: m.remakeNo, redoReason: m.redoReason }; })
    .sort(function (a, b) { return a.remakeNo - b.remakeNo; });
  if (o.redoOf) {
    const orig = labCaseRow_(o.redoOf);
    if (orig) o.origin = mapLabCase_(orig, labItemsOf_(o.redoOf), Date.now());
  }
  return o;
}
function addLabNote_(user, id, message, itemId) {
  const c = labCaseRow_(id);
  if (!c) throw new Error('ERR_NOT_FOUND');
  if (!canSeeLab_(user, c)) throw new Error('ERR_FORBIDDEN');
  message = clean_(message, 1000);
  if (!message) throw new Error('ERR_REQUIRED');
  append_('LabNotes', { Timestamp: new Date(), CaseID: str_(id), ItemID: str_(itemId), Author: user.name, Role: user.role, Message: message });
  return labNotes_(id);
}

/**
 * موظف المعمل يحدّث أسطراً (واحداً أو أكثر): action =
 *  receive (استلام) · start (بدء العمل داخلياً) · external (إرسال لمعمل خارجي: lab, expectedAt, cost) ·
 *  ready (جاهز — ومنه الرجوع من الخارجي) · send (أُرسل للعيادة) · reroute (تغيير المعمل: lab, note) · cost (تسجيل التكلفة)
 */
const LAB_ACTIONS = {
  receive:  { from: [LAB_ST.NEW], to: LAB_ST.RECEIVED, stamp: 'ReceivedAt' },
  start:    { from: [LAB_ST.NEW, LAB_ST.RECEIVED], to: LAB_ST.WORK, stamp: 'StartedAt' },
  external: { from: [LAB_ST.NEW, LAB_ST.RECEIVED, LAB_ST.WORK], to: LAB_ST.EXTERNAL, stamp: 'ExternalAt' },
  ready:    { from: [LAB_ST.NEW, LAB_ST.RECEIVED, LAB_ST.WORK, LAB_ST.EXTERNAL], to: LAB_ST.READY, stamp: 'ReadyAt' },
  send:     { from: [LAB_ST.READY], to: LAB_ST.SENT, stamp: 'SentAt' },
  // Received from Lab: العمل وصل العيادة · Delivered to Patient: سُلِّم للمريض (تُغلق الحالة)
  clinic:   { from: [LAB_ST.READY, LAB_ST.SENT], to: LAB_ST.DELIVERED, stamp: 'DeliveredAt' },
  patient:  { from: [LAB_ST.READY, LAB_ST.SENT, LAB_ST.DELIVERED], to: LAB_ST.PATIENT, stamp: 'PatientAt' },
  reroute:  { from: [LAB_ST.NEW, LAB_ST.RECEIVED, LAB_ST.WORK, LAB_ST.EXTERNAL], to: null },
  cost:     { from: LAB_ORDER, to: null }
};
function updateLabItems_(user, itemIds, action, data) {
  data = data || {};
  const def = LAB_ACTIONS[str_(action)];
  if (!def) throw new Error('ERR_BAD_ACTION');
  itemIds = (Array.isArray(itemIds) ? itemIds : [itemIds]).map(str_).filter(String);
  if (!itemIds.length) throw new Error('ERR_NO_ITEMS');
  const labs = {};
  getLabs_().forEach(function (l) { labs[l.name] = l; });
  const note = clean_(data.note, 500);
  const out = withLock_(function () {
    const t = read_('LabItems');
    const rows = t.rows.filter(function (r) { return itemIds.indexOf(str_(r.ItemID)) !== -1; });
    if (rows.length !== itemIds.length) throw new Error('ERR_NOT_FOUND');
    const now = new Date();
    const updates = rows.map(function (r) {
      const st = str_(r.Status) || LAB_ST.NEW;
      if (def.from.indexOf(st) === -1) throw new Error('ERR_BAD_TRANSITION');
      const o = { UpdatedBy: user.name };
      if (def.to) { o.Status = def.to; o[def.stamp] = now; }
      if (action === 'receive' || action === 'start' || action === 'ready') { if (!r.ReceivedAt) o.ReceivedAt = now; }
      if (action === 'patient' && !r.DeliveredAt) o.DeliveredAt = now;
      if ((action === 'clinic' || action === 'patient') && !r.ReadyAt) o.ReadyAt = now;
      if (action === 'external') {
        const ext = str_(data.lab);
        if (!labs[ext] || labs[ext].type !== 'خارجي') throw new Error('ERR_BAD_LAB');
        const exp = parseDay_(data.expectedAt, true);
        if (!exp) throw new Error('ERR_REQUIRED');
        o.ExternalLab = ext; o.ExpectedAt = exp; o.Lab = ext; o.LabType = 'خارجي';
        if (!r.ReceivedAt) o.ReceivedAt = now;
      }
      if (action === 'reroute') {
        const to = str_(data.lab);
        if (!labs[to]) throw new Error('ERR_BAD_LAB');
        o.Lab = to; o.LabType = labs[to].type;
      }
      if (action === 'external' || action === 'cost') {
        if (data.cost !== undefined && data.cost !== '' && data.cost !== null) {
          const c = num_(data.cost);
          if (!(c >= 0 && c <= PRICE_MAX)) throw new Error('ERR_BAD_PRICE');
          o.Cost = round2_(c);
        } else if (action === 'cost') throw new Error('ERR_REQUIRED');
      }
      return { row: r, obj: o };
    });
    setMany_(t, updates);
    const cases = {};
    rows.forEach(function (r) { cases[str_(r.CaseID)] = (cases[str_(r.CaseID)] || []).concat(str_(r.ItemID)); });
    Object.keys(cases).forEach(function (cid) {
      const label = { receive: 'استلام', start: 'بدء العمل', external: 'إرسال لمعمل خارجي: ' + str_(data.lab), ready: 'جاهز', send: 'أُرسل للعيادة',
        clinic: 'وصل العيادة (Received from Lab)', patient: 'سُلِّم للمريض (Delivered to Patient)', reroute: 'تحويل إلى ' + str_(data.lab), cost: 'تسجيل تكلفة' }[action];
      logAction_(cid, 'معمل — ' + label + ' (' + cases[cid].join('، ') + ')', user.name);
      if (note) append_('LabNotes', { Timestamp: now, CaseID: cid, ItemID: cases[cid].join(','), Author: user.name, Role: user.role, Message: note });
    });
    return Object.keys(cases);
  });
  // جاهز / أُرسل للعيادة: إشعار الممرضة والطبيب
  if (action === 'ready' || action === 'send') {
    out.forEach(function (cid) {
      const c = labCaseRow_(cid); if (!c) return;
      const subj = (action === 'ready' ? 'عمل المعمل جاهز - ' : 'أُرسل عمل المعمل للعيادة - ') + cid;
      const body = 'المريض: ' + str_(c.Patient) + ' — ملف ' + str_(c.FileNo) + '\nالطبيب: ' + str_(c.Doctor) +
        (action === 'send' ? '\n\nيرجى تأكيد الاستلام من داخل النظام عند الوصول.' : '');
      notifyUser_(str_(c.Nurse), subj, body);
      notifyUser_(doctorAccounts_()[str_(c.Doctor)], subj, body);
    });
  }
  return out.map(function (cid) { return getLabCase_(user, cid); });
}

/** الممرضة تؤكد استلام ما أُرسل للعيادة من هذه الإرسالية */
function confirmLabReceipt_(user, id) {
  const c = labCaseRow_(id);
  if (!c || str_(c.Nurse) !== user.name) throw new Error('ERR_NOT_FOUND');
  withLock_(function () {
    const t = read_('LabItems');
    const rows = t.rows.filter(function (r) { return str_(r.CaseID) === str_(id) && str_(r.Status) === LAB_ST.SENT; });
    if (!rows.length) throw new Error('ERR_BAD_TRANSITION');
    const now = new Date();
    setMany_(t, rows.map(function (r) { return { row: r, obj: { Status: LAB_ST.DELIVERED, DeliveredAt: now, UpdatedBy: user.name } }; }));
    logAction_(str_(id), 'استلام عمل المعمل في العيادة', user.name);
  });
  return getLabCase_(user, id);
}

/** تنبيه المعمل على إرسالية متأخرة (الجودة / الإدارة) */
function nudgeLab_(user, id, message) {
  const c = labCaseRow_(id);
  if (!c) throw new Error('ERR_NOT_FOUND');
  message = clean_(message, 500) || 'يرجى الإسراع — الإرسالية تجاوزت الموعد المطلوب.';
  append_('LabNotes', { Timestamp: new Date(), CaseID: str_(id), ItemID: '', Author: user.name, Role: user.role, Message: '⏰ ' + message });
  notifyRole_('lab', '⏰ متابعة إرسالية متأخرة - ' + id, user.name + ' (' + user.role + '): ' + message + '\n\nالمريض: ' + str_(c.Patient) + ' — ملف ' + str_(c.FileNo));
  return labNotes_(id);
}

/**
 * مؤشرات المعمل للفترة (حسب تاريخ الإرسالية): زمن الإنجاز، الالتزام بالموعد، الإعادات وأسبابها،
 * مقارنة المعامل (داخلي/خارجي) وأنواع الأعمال، التكلفة، والمتأخرات الآن.
 */
function getLabStats_(user, opts) {
  opts = opts || {};
  const from = parseDay_(opts.from), to = parseDay_(opts.to, true);
  const now = Date.now(), D = 864e5;
  const cases = {};
  read_('LabCases').rows.forEach(function (c) { if (str_(c.CaseID)) cases[str_(c.CaseID)] = c; });
  const items = read_('LabItems').rows.filter(function (it) { return cases[str_(it.CaseID)]; });
  const inRange = function (c) { const ms = toMs_(c.Date); return (!from || ms >= from.getTime()) && (!to || ms <= to.getTime()); };
  // الأسطر التي أُعيدت: كل سطر إعادة يشير لسطره الأصلي — تُحسب الإعادة على معمل/نوع السطر الأصلي
  const redoneItem = {}, reasons = {};
  items.forEach(function (it) {
    if (!str_(it.RedoOfItem)) return;
    redoneItem[str_(it.RedoOfItem)] = str_(it.RedoReason);
    if (inRange(cases[str_(it.CaseID)])) reasons[str_(it.RedoReason) || 'أخرى'] = (reasons[str_(it.RedoReason) || 'أخرى'] || 0) + 1;
  });
  function bucket() { return { items: 0, done: 0, onTime: 0, withDue: 0, days: [], redo: 0, cost: 0, overdue: 0 }; }
  function avg(a) { return a.length ? round1_(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; }
  const sum = bucket(), byLab = {}, byType = {}, byMat = {}, byKind = { 'داخلي': bucket(), 'خارجي': bucket() };
  let redoCases = 0, caseCount = 0;
  Object.keys(cases).forEach(function (id) { if (inRange(cases[id])) { caseCount++; if (str_(cases[id].RedoOf)) redoCases++; } });
  const overdueNow = [];
  items.forEach(function (it) {
    const c = cases[str_(it.CaseID)];
    const m = mapLabItem_(it, c, now);
    if (m.overdue || m.externalLate) overdueNow.push({ caseId: m.caseId, item: m.id, patient: str_(c.Patient), fileNo: str_(c.FileNo), doctor: str_(c.Doctor),
      lab: m.lab, workType: m.workType, status: m.status, neededBy: c.NeededBy, expectedAt: m.expectedAt, externalLate: m.externalLate,
      daysLate: round1_((now - (m.externalLate ? toMs_(m.expectedAt) : toMs_(c.NeededBy))) / D) });
    if (!inRange(c)) return;
    const kind = str_(it.LabType) === 'خارجي' ? 'خارجي' : 'داخلي';
    const mat = m.material || '—';
    [sum, byLab[m.lab] = byLab[m.lab] || bucket(), byType[m.workType] = byType[m.workType] || bucket(), byMat[mat] = byMat[mat] || bucket(), byKind[kind]].forEach(function (b) {
      b.items++;
      if (m.overdue) b.overdue++;
      if (m.cost) b.cost = round2_(b.cost + m.cost);
      if (redoneItem[m.id] !== undefined) b.redo++;
      const readyMs = toMs_(m.readyAt);
      if (readyMs) {
        b.done++;
        b.days.push((readyMs - toMs_(m.receivedAt || c.Date)) / D);
        if (toMs_(c.NeededBy)) { b.withDue++; if (readyMs <= toMs_(c.NeededBy)) b.onTime++; }
      }
    });
  });
  function out(name, b) {
    return { name: name, items: b.items, done: b.done, avgDays: avg(b.days), onTimeRate: b.withDue ? Math.round(b.onTime / b.withDue * 100) : null,
      redo: b.redo, redoRate: b.items ? Math.round(b.redo / b.items * 100) : 0, cost: b.cost, overdue: b.overdue };
  }
  function list(m) { return Object.keys(m).map(function (k) { return out(k, m[k]); }).sort(function (a, b) { return b.items - a.items; }); }
  const labTypes = {}, labDays = {}, defDays = labTurnaroundDefault_();
  getLabs_().forEach(function (l) { labTypes[l.name] = l.type; labDays[l.name] = l.turnaround || defDays; });
  // اتجاه 6 أشهر: عدد الأسطر ومتوسط أيام الإنجاز
  const trend = [], nowD = new Date();
  for (let i = 5; i >= 0; i--) {
    const mth = Utilities.formatDate(new Date(nowD.getFullYear(), nowD.getMonth() - i, 15), TZ, 'yyyy-MM');
    const its = items.filter(function (it) { return monthOf_(cases[str_(it.CaseID)].Date) === mth; });
    const ds = its.filter(function (it) { return toMs_(it.ReadyAt); }).map(function (it) { return (toMs_(it.ReadyAt) - toMs_(it.ReceivedAt || cases[str_(it.CaseID)].Date)) / D; });
    trend.push({ month: mth, items: its.length, avgDays: avg(ds) || 0 });
  }
  const openBy = {};
  items.forEach(function (it) { const st = str_(it.Status) || LAB_ST.NEW; openBy[st] = (openBy[st] || 0) + 1; });
  return {
    from: from, to: to, generatedAt: new Date(),
    summary: Object.assign(out('', sum), { cases: caseCount, redoCases: redoCases }),
    // setDays = أيام التنفيذ المحددة للمعمل مقابل avgDays الفعلي — لمعرفة الأيام الحقيقية لكل معمل مع الوقت
    labs: list(byLab).map(function (x) { x.type = labTypes[x.name] || ''; x.setDays = labDays[x.name] || defDays; return x; }),
    workTypes: list(byType), materials: list(byMat), turnaround: defDays, kinds: [out('داخلي', byKind['داخلي']), out('خارجي', byKind['خارجي'])],
    reasons: Object.keys(reasons).map(function (k) { return { reason: k, count: reasons[k] }; }).sort(function (a, b) { return b.count - a.count; }),
    overdueNow: overdueNow.sort(function (a, b) { return b.daysLate - a.daysLate; }), byStatus: openBy, trend: trend
  };
}

/* =====================================================================
 *  عُهدة العيادة — الأدوات على حساب الشركة (ليست مستهلكاً للطبيب)
 *  الكتالوج: Ownership = عهدة · Serialized = نعم (مثل الهاندبيس اللو/الهاي)
 *  المعيار لكل عيادة (ClinicStandards) ← الصرف (Assets، سطر لكل رقم تسلسلي) ←
 *  بلاغ الممرضة (AssetTickets) ← التموين: استلام بصورة الحالة ← قابلة للتصليح / تالفة / مفقودة ← بديل يدوي
 * ===================================================================== */
const AS_ST = { IN: 'في العيادة', SENT: 'مُرسلة للتموين', REPAIR: 'قيد الصيانة', DAMAGED: 'تالفة', LOST: 'مفقودة' };
const TK_ST = { NEW: 'بلاغ جديد', RECEIVED: 'استلمها التموين', REPAIR: 'قيد الصيانة', RETURNED: 'رجعت للعيادة', DAMAGED: 'تالفة', LOST: 'مفقودة' };
const TK_OPEN = [TK_ST.NEW, TK_ST.RECEIVED, TK_ST.REPAIR];
const ASSET_PROBLEMS = ['خربانة', 'كفاءتها متدنية', 'مفقودة', 'أخرى'];

function isAssetOwnership_(v) { return /عهد|asset|company|شركة|custody/i.test(str_(v)); }

function assetCatalog_() {
  const out = {};
  getCatalog_(true).forEach(function (c) { if (c.asset) out[c.name] = { name: c.name, serialized: !!c.serialized, price: c.price || 0, category: c.category }; });
  return out;
}
/** العيادات التي يراها المستخدم: الممرضة عياداتها (أو الكل إن لم تُقيَّد)، الطبيب عيادات سجله، والبقية الكل */
function assetClinicsFor_(user) {
  const all = getClinics_().map(function (c) { return c.name; });
  if (user.screen === 'nurse') { const mine = userClinics_(user); return mine.length ? mine : all; }
  if (user.screen === 'doctor') {
    const names = (doctorNamesFor_(user) || []);
    const out = [];
    names.forEach(function (n) { const c = doctorClinic_({ name: '', clinic: '' }, n); if (c && out.indexOf(c) === -1) out.push(c); });
    return out;
  }
  return all;
}
function doctorNamesFor_(user) {
  try { return allDoctors_().filter(function (d) { return isMyDoctor_(user, d.name); }).map(function (d) { return d.name; }); } catch (e) { return []; }
}

function getAssetConfig_(user) {
  const cat = assetCatalog_();
  return { items: Object.keys(cat).map(function (k) { return cat[k]; }), problems: ASSET_PROBLEMS, clinics: assetClinicsFor_(user),
    canIssue: user.screen === 'procurement' || (user.perms || []).indexOf('users') !== -1 };
}

function mapAsset_(r) {
  return { id: str_(r.AssetID), item: str_(r.Item), serial: str_(r.Serial), clinic: str_(r.Clinic), branch: str_(r.Branch),
    qty: Math.max(1, Math.floor(num_(r.Qty)) || 1), status: str_(r.Status) || AS_ST.IN, issuedAt: r.IssuedAt, cost: price_(r.Cost) || 0,
    ticket: str_(r.TicketID), notes: str_(r.Notes) };
}

/** عهدة العيادات: لكل عيادة ولكل أداة: المعيار، الموجود في العيادة، الغائب (عند التموين/الصيانة)، والنقص */
function getClinicAssets_(user, opts) {
  opts = opts || {};
  const allowed = assetClinicsFor_(user);
  const want = str_(opts.clinic);
  const clinics = getClinics_().filter(function (c) { return allowed.indexOf(c.name) !== -1 && (!want || c.name === want); });
  const std = {};
  read_('ClinicStandards').rows.forEach(function (r) {
    const q = Math.floor(num_(r.StandardQty));
    if (str_(r.Clinic) && str_(r.Item) && q > 0) (std[str_(r.Clinic)] = std[str_(r.Clinic)] || {})[str_(r.Item)] = q;
  });
  const byClinic = {};
  read_('Assets').rows.forEach(function (r) {
    const a = mapAsset_(r);
    if (!a.id || a.status === AS_ST.DAMAGED || a.status === AS_ST.LOST) return;
    ((byClinic[a.clinic] = byClinic[a.clinic] || {})[a.item] = byClinic[a.clinic][a.item] || []).push(a);
  });
  return clinics.map(function (c) {
    const s = std[c.name] || {}, have = byClinic[c.name] || {};
    const names = Object.keys(s).concat(Object.keys(have).filter(function (k) { return !(k in s); }));
    const items = names.map(function (item) {
      const list = have[item] || [];
      const inClinic = list.filter(function (a) { return a.status === AS_ST.IN; }).reduce(function (x, a) { return x + a.qty; }, 0);
      const away = list.filter(function (a) { return a.status !== AS_ST.IN; }).reduce(function (x, a) { return x + a.qty; }, 0);
      const standard = s[item] || 0;
      return { item: item, standard: standard, inClinic: inClinic, away: away, shortage: Math.max(0, standard - inClinic), assets: list };
    }).sort(function (a, b) { return b.shortage - a.shortage || a.item.localeCompare(b.item); });
    return { clinic: c.name, branch: c.branch, items: items, shortage: items.reduce(function (x, i) { return x + i.shortage; }, 0) };
  });
}

/** المعيار: عدد الأداة المطلوب دائماً في العيادة (التموين/الأدمن) */
function setClinicStandard_(user, clinic, item, qty) {
  clinic = str_(clinic); item = str_(item);
  qty = Math.floor(Number(qty));
  if (!getClinics_().some(function (c) { return c.name === clinic; })) throw new Error('ERR_BAD_CLINIC');
  if (!assetCatalog_()[item]) throw new Error('ERR_NOT_ASSET');
  if (!(qty >= 0 && qty <= 1000)) throw new Error('ERR_BAD_QTY');
  withLock_(function () {
    const t = read_('ClinicStandards');
    const row = t.rows.filter(function (r) { return str_(r.Clinic) === clinic && str_(r.Item) === item; })[0];
    if (row) setMany_(t, [{ row: row, obj: { StandardQty: qty, UpdatedBy: user.name, UpdatedAt: new Date() } }]);
    else append_('ClinicStandards', { Clinic: clinic, Item: item, StandardQty: qty, UpdatedBy: user.name, UpdatedAt: new Date() });
    logAction_('', 'معيار عهدة: ' + clinic + ' — ' + item + ' = ' + qty, user.name);
  });
  return getClinicAssets_(user, { clinic: clinic })[0];
}

/**
 * صرف عهدة لعيادة (التموين). payload = { clinic, item, qty, serials:[...], cost, notes, ticketId (بديل لبلاغ) }
 * الأداة ذات الرقم التسلسلي: سطر لكل قطعة (5 هاندبيس = 5 أرقام)، والرقم لا يتكرر لنفس الأداة وهي نشطة.
 */
function issueAssets_(user, payload) {
  payload = payload || {};
  const clinic = str_(payload.clinic), item = str_(payload.item);
  const c = getClinics_().filter(function (x) { return x.name === clinic; })[0];
  if (!c) throw new Error('ERR_BAD_CLINIC');
  const cat = assetCatalog_()[item];
  if (!cat) throw new Error('ERR_NOT_ASSET');
  const serials = (payload.serials || []).map(function (x) { return clean_(x, 60); }).filter(String);
  let qty = Math.floor(Number(payload.qty));
  if (cat.serialized) {
    if (!serials.length) throw new Error('ERR_SERIAL_REQUIRED');
    if (serials.some(function (x, i) { return serials.indexOf(x) !== i; })) throw new Error('ERR_SERIAL_DUP');
    qty = serials.length;
  } else if (!(qty >= 1 && qty <= 500)) throw new Error('ERR_BAD_QTY');
  const costIn = payload.cost === undefined || payload.cost === '' || payload.cost === null ? null : num_(payload.cost);
  if (costIn !== null && !(costIn >= 0 && costIn <= PRICE_MAX)) throw new Error('ERR_BAD_PRICE');
  const unitCost = costIn !== null ? round2_(costIn) : (cat.price || 0);
  const ticketId = str_(payload.ticketId);
  const ids = withLock_(function () {
    if (cat.serialized) {
      const active = {};
      read_('Assets').rows.forEach(function (r) {
        if (str_(r.Item) === item && str_(r.Serial) && [AS_ST.DAMAGED, AS_ST.LOST].indexOf(str_(r.Status)) === -1) active[str_(r.Serial).toLowerCase()] = true;
      });
      const taken = serials.filter(function (x) { return active[x.toLowerCase()]; });
      if (taken.length) throw new Error('ERR_SERIAL_EXISTS:' + taken.join('، '));
    }
    let tk = null;
    if (ticketId) {
      tk = read_('AssetTickets').rows.filter(function (r) { return str_(r.TicketID) === ticketId; })[0];
      if (!tk || [TK_ST.DAMAGED, TK_ST.LOST].indexOf(str_(tk.Status)) === -1 || str_(tk.ReplacementAssetID)) throw new Error('ERR_BAD_TRANSITION');
    }
    const now = new Date();
    const n = cat.serialized ? serials.length : 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const id = reserveId_('AST-', function (prefix) { return maxSeq_(freshTable_('Assets').rows, 'AssetID', prefix); }).id;
      append_('Assets', { AssetID: id, Item: item, Serial: cat.serialized ? serials[i] : '', Clinic: clinic, Branch: c.branch, Qty: cat.serialized ? 1 : qty,
        Status: AS_ST.IN, IssuedAt: now, IssuedBy: user.name, Cost: unitCost, Notes: clean_(payload.notes, 300) + (ticketId ? (payload.notes ? ' · ' : '') + 'بديل للبلاغ ' + ticketId : ''),
        UpdatedAt: now, UpdatedBy: user.name });
      out.push(id);
    }
    if (tk) setMany_(read_('AssetTickets'), [{ row: read_('AssetTickets').rows.filter(function (r) { return str_(r.TicketID) === ticketId; })[0], obj: { ReplacementAssetID: out.join(','), UpdatedBy: user.name } }]);
    logAction_(ticketId, 'صرف عهدة: ' + item + ' × ' + (cat.serialized ? serials.length + ' (' + serials.join('، ') + ')' : qty) + ' → ' + clinic, user.name);
    return out;
  });
  return { ids: ids, clinic: getClinicAssets_(user, { clinic: clinic })[0] };
}

function mapTicket_(r) {
  return { id: str_(r.TicketID), date: r.Date, assetId: str_(r.AssetID), item: str_(r.Item), serial: str_(r.Serial), clinic: str_(r.Clinic), branch: str_(r.Branch),
    nurse: str_(r.Nurse), problem: str_(r.Problem), description: str_(r.Description), photo: str_(r.Photo), status: str_(r.Status) || TK_ST.NEW,
    receivedAt: r.ReceivedAt, receivedBy: str_(r.ReceivedBy), inspectPhoto: str_(r.InspectPhoto), inspectNote: str_(r.InspectNote),
    decision: str_(r.Decision), decidedAt: r.DecidedAt, repairVendor: str_(r.RepairVendor), repairCost: price_(r.RepairCost) || 0,
    lossValue: price_(r.LossValue) || 0, returnedAt: r.ReturnedAt, replacement: str_(r.ReplacementAssetID), closedAt: r.ClosedAt,
    open: TK_OPEN.indexOf(str_(r.Status) || TK_ST.NEW) !== -1 };
}
function canSeeTicket_(user, tk) {
  if (user.screen === 'procurement' || (user.perms || []).indexOf('assets') !== -1) return true;
  return assetClinicsFor_(user).indexOf(tk.clinic) !== -1;
}
function getAssetTickets_(user, opts) {
  opts = opts || {};
  return read_('AssetTickets').rows.filter(function (r) { return str_(r.TicketID); }).map(mapTicket_)
    .filter(function (tk) {
      if (!canSeeTicket_(user, tk)) return false;
      if (opts.open && !tk.open) return false;
      return opts.archive || tk.open || (Date.now() - toMs_(tk.closedAt || tk.date)) < ARCHIVE_DAYS * 864e5;
    }).sort(function (a, b) { return toMs_(b.date) - toMs_(a.date); });
}
function getAssetTicket_(user, id) {
  const r = read_('AssetTickets').rows.filter(function (x) { return str_(x.TicketID) === str_(id); })[0];
  if (!r) throw new Error('ERR_NOT_FOUND');
  const tk = mapTicket_(r);
  if (!canSeeTicket_(user, tk)) throw new Error('ERR_FORBIDDEN');
  // سجل القطعة: كل بلاغاتها السابقة (مفيد للأرقام التسلسلية كثيرة الأعطال)
  tk.history = read_('AssetTickets').rows.filter(function (x) { return str_(x.AssetID) === tk.assetId && str_(x.TicketID) !== tk.id; }).map(mapTicket_);
  return tk;
}

/** بلاغ أداة من الممرضة: payload = { assetId, problem, description, photo (dataUrl — إلزامية للخربانة), clientKey } */
function reportAsset_(user, payload) {
  payload = payload || {};
  const problem = str_(payload.problem);
  if (ASSET_PROBLEMS.indexOf(problem) === -1) throw new Error('ERR_BAD_PROBLEM');
  const desc = clean_(payload.description, 1000);
  if (problem === 'خربانة' && !payload.photo) throw new Error('ERR_PHOTO_REQUIRED');
  if ((problem === 'أخرى' || problem === 'كفاءتها متدنية') && !desc) throw new Error('ERR_REQUIRED');
  const clientKey = /^[A-Za-z0-9-]{8,64}$/.test(str_(payload.clientKey)) ? str_(payload.clientKey) : '';
  const allowed = assetClinicsFor_(user);
  const assetId = str_(payload.assetId);
  if (clientKey) {
    const same = read_('AssetTickets').rows.filter(function (r) { return str_(r.ClientKey) === clientKey && str_(r.Nurse) === user.name; })[0];
    if (same) return { duplicate: true, id: str_(same.TicketID) };
  }
  const res = withLock_(function () {
    const t = read_('Assets');
    const row = t.rows.filter(function (r) { return str_(r.AssetID) === assetId; })[0];
    if (!row) throw new Error('ERR_NOT_FOUND');
    const a = mapAsset_(row);
    if (allowed.indexOf(a.clinic) === -1) throw new Error('ERR_FORBIDDEN');
    if (a.status !== AS_ST.IN) throw new Error('ERR_ASSET_BUSY');
    const now = new Date();
    const id = reserveId_('TKT-', function (prefix) { return maxSeq_(freshTable_('AssetTickets').rows, 'TicketID', prefix); }).id;
    let target = assetId;
    if (a.qty > 1) {
      // أداة بدون رقم تسلسلي وبكمية: قطعة واحدة تُفصل وتُرسل، والباقي يبقى في العيادة
      setMany_(t, [{ row: row, obj: { Qty: a.qty - 1, UpdatedAt: now, UpdatedBy: user.name } }]);
      target = reserveId_('AST-', function (prefix) { return maxSeq_(freshTable_('Assets').rows, 'AssetID', prefix); }).id;
      append_('Assets', { AssetID: target, Item: a.item, Serial: '', Clinic: a.clinic, Branch: a.branch, Qty: 1, Status: AS_ST.SENT, IssuedAt: row.IssuedAt,
        IssuedBy: str_(row.IssuedBy), Cost: a.cost, TicketID: id, Notes: 'مفصولة من ' + assetId, UpdatedAt: now, UpdatedBy: user.name });
    } else {
      setMany_(t, [{ row: row, obj: { Status: AS_ST.SENT, TicketID: id, UpdatedAt: now, UpdatedBy: user.name } }]);
    }
    return { id: id, asset: a, target: target };
  });
  let photoUrl = '';
  if (payload.photo) { try { photoUrl = saveLabPhoto_(res.id + '-report', payload.photo); } catch (e) { if (problem === 'خربانة') throw e; } }
  const a = res.asset;
  append_('AssetTickets', { TicketID: res.id, Date: new Date(), AssetID: res.target, Item: a.item, Serial: a.serial, Clinic: a.clinic, Branch: a.branch,
    Nurse: user.name, Problem: problem, Description: desc, Photo: photoUrl, Status: TK_ST.NEW, ClientKey: clientKey });
  logAction_(res.id, 'بلاغ أداة: ' + a.item + (a.serial ? ' #' + a.serial : '') + ' — ' + problem, user.name);
  notifyRole_('procurement', '🔧 بلاغ أداة - ' + res.id + ' — ' + a.item, 'العيادة: ' + a.clinic + (a.branch ? ' (' + a.branch + ')' : '') +
    '\nالأداة: ' + a.item + (a.serial ? '\nالرقم التسلسلي: ' + a.serial : '') + '\nالمشكلة: ' + problem + (desc ? '\nالوصف: ' + desc : '') +
    '\nالممرضة: ' + user.name + '\n\nيرجى استلام الأداة وتحديث حالتها من داخل النظام.');
  return { duplicate: false, id: res.id };
}

/**
 * التموين يحدّث البلاغ: action =
 *  receive (استلام + صورة الحالة إلزامية + ملاحظة) · repair (قابلة للتصليح: الجهة + التكلفة) ·
 *  return (رجعت للعيادة بعد التصليح: التكلفة النهائية) · damaged (تالفة: قيمة الخسارة) · lost (مفقودة) · note (صورة/ملاحظة إضافية)
 */
function updateAssetTicket_(user, id, action, data) {
  data = data || {};
  action = str_(action);
  const flow = {
    receive: [TK_ST.NEW], repair: [TK_ST.RECEIVED], 'return': [TK_ST.REPAIR],
    damaged: [TK_ST.RECEIVED, TK_ST.REPAIR], lost: [TK_ST.NEW, TK_ST.RECEIVED], note: TK_OPEN
  };
  if (!flow[action]) throw new Error('ERR_BAD_ACTION');
  if (action === 'receive' && !data.photo) throw new Error('ERR_PHOTO_REQUIRED');
  const money = function (v) {
    if (v === undefined || v === null || v === '') return null;
    const n = num_(v); if (!(n >= 0 && n <= PRICE_MAX)) throw new Error('ERR_BAD_PRICE'); return round2_(n);
  };
  const cost = money(data.cost), loss = money(data.loss);
  let photoUrl = '';
  if (data.photo) photoUrl = saveLabPhoto_(str_(id) + '-' + action + '-' + Date.now(), data.photo);
  const note = clean_(data.note, 500);
  const out = withLock_(function () {
    const t = read_('AssetTickets');
    const row = t.rows.filter(function (r) { return str_(r.TicketID) === str_(id); })[0];
    if (!row) throw new Error('ERR_NOT_FOUND');
    const st = str_(row.Status) || TK_ST.NEW;
    if (flow[action].indexOf(st) === -1) throw new Error('ERR_BAD_TRANSITION');
    const now = new Date();
    const o = { UpdatedBy: user.name };
    let assetStatus = null;
    if (photoUrl) o.InspectPhoto = [str_(row.InspectPhoto), photoUrl].filter(String).join(' ');
    if (note) o.InspectNote = [str_(row.InspectNote), note].filter(String).join(' · ');
    if (action === 'receive') { o.Status = TK_ST.RECEIVED; o.ReceivedAt = now; o.ReceivedBy = user.name; }
    if (action === 'repair') {
      o.Status = TK_ST.REPAIR; o.Decision = 'قابلة للتصليح'; o.DecidedAt = now; o.RepairVendor = clean_(data.vendor, 120);
      if (cost !== null) o.RepairCost = cost;
      assetStatus = AS_ST.REPAIR;
    }
    if (action === 'return') {
      o.Status = TK_ST.RETURNED; o.ReturnedAt = now; o.ClosedAt = now;
      if (cost !== null) o.RepairCost = cost;
      assetStatus = AS_ST.IN;
    }
    if (action === 'damaged' || action === 'lost') {
      const asset = read_('Assets').rows.filter(function (r) { return str_(r.AssetID) === str_(row.AssetID); })[0];
      const cat = assetCatalog_()[str_(row.Item)] || {};
      o.Status = action === 'damaged' ? TK_ST.DAMAGED : TK_ST.LOST;
      o.Decision = action === 'damaged' ? 'تالفة' : 'مفقودة'; o.DecidedAt = now; o.ClosedAt = now;
      o.LossValue = loss !== null ? loss : (asset && price_(asset.Cost)) || cat.price || 0;
      assetStatus = action === 'damaged' ? AS_ST.DAMAGED : AS_ST.LOST;
    }
    setMany_(t, [{ row: row, obj: o }]);
    if (assetStatus) {
      const at = read_('Assets');
      const ar = at.rows.filter(function (r) { return str_(r.AssetID) === str_(row.AssetID); })[0];
      if (ar) setMany_(at, [{ row: ar, obj: { Status: assetStatus, TicketID: assetStatus === AS_ST.IN ? '' : str_(id), UpdatedAt: now, UpdatedBy: user.name } }]);
    }
    logAction_(str_(id), 'عهدة — ' + { receive: 'استلام الأداة', repair: 'قابلة للتصليح', 'return': 'رجعت للعيادة', damaged: 'تالفة', lost: 'مفقودة', note: 'ملاحظة/صورة' }[action] +
      (cost !== null ? ' · تكلفة ' + cost : '') + (o.LossValue !== undefined ? ' · خسارة ' + o.LossValue : ''), user.name);
    return { nurse: str_(row.Nurse), item: str_(row.Item), serial: str_(row.Serial), status: o.Status };
  });
  if (out.status && action !== 'note') {
    notifyUser_(out.nurse, 'تحديث بلاغ الأداة ' + id + ': ' + out.status, 'الأداة: ' + out.item + (out.serial ? ' #' + out.serial : '') + '\nالحالة: ' + out.status + (note ? '\nملاحظة: ' + note : ''));
  }
  return getAssetTicket_(user, id);
}

/** المالية (أو التموين) تعدّل تكلفة التصليح / قيمة الخسارة */
function setAssetTicketCost_(user, id, data) {
  data = data || {};
  const money = function (v) { const n = num_(v); if (!(n >= 0 && n <= PRICE_MAX)) throw new Error('ERR_BAD_PRICE'); return round2_(n); };
  withLock_(function () {
    const t = read_('AssetTickets');
    const row = t.rows.filter(function (r) { return str_(r.TicketID) === str_(id); })[0];
    if (!row) throw new Error('ERR_NOT_FOUND');
    const o = { UpdatedBy: user.name };
    if (data.repairCost !== undefined && data.repairCost !== '') o.RepairCost = money(data.repairCost);
    if (data.lossValue !== undefined && data.lossValue !== '') o.LossValue = money(data.lossValue);
    if (Object.keys(o).length < 2) throw new Error('ERR_REQUIRED');
    setMany_(t, [{ row: row, obj: o }]);
    logAction_(str_(id), 'تعديل تكلفة العهدة' + (o.RepairCost !== undefined ? ' · تصليح ' + o.RepairCost : '') + (o.LossValue !== undefined ? ' · خسارة ' + o.LossValue : ''), user.name);
  });
  return getAssetTicket_(user, id);
}

/** بحث بالرقم التسلسلي أو رقم الأصل: القطعة وكل بلاغاتها */
function findAsset_(user, q) {
  q = str_(q).toLowerCase();
  if (q.length < 2) return [];
  const tickets = read_('AssetTickets').rows.map(mapTicket_);
  return read_('Assets').rows.map(mapAsset_).filter(function (a) { return a.id && (a.serial.toLowerCase() === q || a.id.toLowerCase() === q || a.serial.toLowerCase().indexOf(q) === 0); })
    .slice(0, 20).map(function (a) { a.tickets = tickets.filter(function (tk) { return tk.assetId === a.id; }); return a; });
}

/**
 * مؤشرات العهدة للإدارة والمالية: البلاغات والقرارات، تكلفة التصليح وقيمة التالف،
 * حسب العيادة والأداة والفرع، الأرقام التسلسلية المتكررة، والنقص عن المعيار الآن.
 */
function getAssetStats_(user, opts) {
  opts = opts || {};
  const from = parseDay_(opts.from), to = parseDay_(opts.to, true);
  const branch = str_(opts.branch);
  const inRange = function (d) { const ms = toMs_(d); return (!from || ms >= from.getTime()) && (!to || ms <= to.getTime()); };
  const tickets = read_('AssetTickets').rows.filter(function (r) { return str_(r.TicketID); }).map(mapTicket_)
    .filter(function (tk) { return inRange(tk.date) && (!branch || tk.branch === branch); });
  function bucket() { return { tickets: 0, open: 0, repaired: 0, damaged: 0, lost: 0, repairCost: 0, lossValue: 0 }; }
  function add(b, tk) {
    b.tickets++;
    if (tk.open) b.open++;
    if (tk.status === TK_ST.RETURNED || tk.status === TK_ST.REPAIR) b.repaired++;
    if (tk.status === TK_ST.DAMAGED) b.damaged++;
    if (tk.status === TK_ST.LOST) b.lost++;
    b.repairCost = round2_(b.repairCost + tk.repairCost);
    b.lossValue = round2_(b.lossValue + tk.lossValue);
  }
  const sum = bucket(), byClinic = {}, byItem = {}, byBranch = {}, bySerial = {}, problems = {};
  tickets.forEach(function (tk) {
    [sum, byClinic[tk.clinic] = byClinic[tk.clinic] || bucket(), byItem[tk.item] = byItem[tk.item] || bucket(), byBranch[tk.branch || '—'] = byBranch[tk.branch || '—'] || bucket()]
      .forEach(function (b) { add(b, tk); });
    if (tk.serial) { const k = tk.item + ' #' + tk.serial; (bySerial[k] = bySerial[k] || { item: tk.item, serial: tk.serial, clinic: tk.clinic, count: 0, cost: 0 }); bySerial[k].count++; bySerial[k].cost = round2_(bySerial[k].cost + tk.repairCost + tk.lossValue); }
    problems[tk.problem] = (problems[tk.problem] || 0) + 1;
  });
  function list(m) { return Object.keys(m).map(function (k) { const b = m[k]; b.name = k; b.total = round2_(b.repairCost + b.lossValue); return b; }).sort(function (a, b) { return b.total - a.total || b.tickets - a.tickets; }); }
  const clinicsNow = getClinicAssets_(user, {}).filter(function (c) { return !branch || c.branch === branch; });
  const shortages = [];
  clinicsNow.forEach(function (c) { c.items.forEach(function (i) { if (i.shortage) shortages.push({ clinic: c.clinic, branch: c.branch, item: i.item, standard: i.standard, inClinic: i.inClinic, away: i.away, shortage: i.shortage }); }); });
  const assets = read_('Assets').rows.map(mapAsset_).filter(function (a) { return a.id && (!branch || a.branch === branch); });
  const activeValue = round2_(assets.filter(function (a) { return a.status !== AS_ST.DAMAGED && a.status !== AS_ST.LOST; }).reduce(function (x, a) { return x + a.cost * a.qty; }, 0));
  sum.total = round2_(sum.repairCost + sum.lossValue);
  return {
    from: from, to: to, generatedAt: new Date(), summary: Object.assign(sum, { units: assets.filter(function (a) { return a.status !== AS_ST.DAMAGED && a.status !== AS_ST.LOST; }).reduce(function (x, a) { return x + a.qty; }, 0), activeValue: activeValue, shortageUnits: shortages.reduce(function (x, s) { return x + s.shortage; }, 0) }),
    byClinic: list(byClinic), byItem: list(byItem), byBranch: list(byBranch),
    serials: Object.keys(bySerial).map(function (k) { return bySerial[k]; }).filter(function (x) { return x.count > 1; }).sort(function (a, b) { return b.count - a.count || b.cost - a.cost; }).slice(0, 15),
    problems: Object.keys(problems).map(function (k) { return { problem: k, count: problems[k] }; }).sort(function (a, b) { return b.count - a.count; }),
    shortages: shortages.sort(function (a, b) { return b.shortage - a.shortage; }), tickets: tickets
  };
}
