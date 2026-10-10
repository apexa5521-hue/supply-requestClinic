/* اختبارات الباك-إند: تشغيل Code.gs الحقيقي على محاكي Apps Script.
   التشغيل: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { createGas } = require('./gas-mock');
const { seedFixtures } = require('./fixtures');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

function boot(extraSeed, gasOpts) {
  const gas = createGas({
    lockBusy: gasOpts && gasOpts.lockBusy,
    docLockBusy: gasOpts && gasOpts.docLockBusy,
    digest: (str, len) => Array.from(crypto.createHash(len === 16 ? 'md5' : 'sha256').update(str, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b))
  });
  seedFixtures(gas);
  if (extraSeed) extraSeed(gas);
  const ctx = vm.createContext(Object.assign({ Buffer }, gas.globals));
  vm.runInContext(CODE, ctx, { filename: 'Code.gs' });
  // JSON round-trip = نفس تسلسل google.script.run، ويوحّد المصفوفات بين سياقات vm
  const api = (token, fn, ...args) => { const r = ctx.api(token, fn, args); return r === undefined ? r : JSON.parse(JSON.stringify(r)); };
  const login = (name, pass) => {
    const r = api(null, 'login', name, pass);
    assert.equal(r.success, true, 'login failed for ' + name);
    return r.token;
  };
  return { gas, ctx, api, login };
}

function rows(gas, sheet) {
  const d = gas.dump(sheet);
  const h = d[0];
  return d.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

function todayISO() { return new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10); }

function throwsCode(fn, code) {
  assert.throws(fn, e => String(e.message).indexOf(code) !== -1, 'expected ' + code);
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('login: legacy password is accepted, upgraded to a hash, and wrong passwords are rejected', () => {
  const { api, gas } = boot();
  const r = api(null, 'login', 'سارة', '1111');
  assert.equal(r.success, true);
  assert.equal(r.user.screen, 'nurse');
  assert.ok(r.token.length > 30);
  const stored = rows(gas, 'Users').find(u => u.Name === 'سارة').Password;
  assert.match(stored, /^h1\$/, 'password should be hashed after login');
  assert.equal(api(null, 'login', 'سارة', '1111').success, true, 'hashed password still works');
  assert.equal(api(null, 'login', 'سارة', 'nope').success, false);
  assert.equal(api(null, 'login', 'مجهول', 'x').success, false);
  assert.equal(r.password, undefined);
  assert.equal(JSON.stringify(r).indexOf('1111'), -1, 'no password leaks in login response');
});

test('login tolerates case, spaces, invisible chars and Arabic digits', () => {
  const { api, gas } = boot();
  assert.equal(api(null, 'login', '  DR. خالد '.replace('DR', 'د'), '٤٤٤٤').success, true, 'Arabic-Indic digits + extra spaces');
  const ahmedRow = gas.dump('Users').findIndex(r => r[0] === 'علي');
  gas.dump('Users');
  assert.equal(api(null, 'login', 'علي\u200f', ' 3333 ').success, true, 'RTL mark + padded password');
  assert.equal(api(null, 'login', 'علي', '3333').success, true, 'still works after upgrade to hash');
  assert.ok(ahmedRow > 0);
  const g2 = boot(x => x.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email'], [['ahmed', 1234, 'تموين', '', ''], ['المدير', '1234', 'تنفيذي', '', '']]));
  assert.equal(g2.api(null, 'login', 'Ahmed', '1234').success, true, 'mobile auto-capitalised name + numeric password cell');
  assert.equal(g2.api(null, 'login', 'AHMED', '۱۲۳۴').success, true, 'Persian digits after hashing');
  assert.equal(g2.api(null, 'login', 'ahmed', '12345').success, false);
});

test('every user changes their own password: doctors, nurses and the rest', () => {
  const { api, gas } = boot();
  const users = [['د. خالد', '4444', 'doctor'], ['سارة', '1111', 'nurse'], ['علي', '3333', 'procurement'], ['منى', '5555', 'dashboard']];
  const tokens = {};
  for (const [name, pw] of users) tokens[name] = api(null, 'login', name, pw).token;
  users.forEach(([name, pw], i) => {
    const np = 'Pw-' + name.length + '-' + (i + 1) * 1111;
    assert.equal(api(tokens[name], 'changePassword', pw, np), true, name + ' changed their password');
    assert.equal(api(null, 'login', name, pw).success, false, name + ': old password no longer works');
    assert.equal(api(null, 'login', name, np).success, true, name + ': new password works');
    const stored = rows(gas, 'Users').find(u => u.Name === name);
    assert.match(stored.Password, /^h1\$/, 'stored hashed');
    assert.ok(!stored.Password.includes(np), 'plain password never stored');
    assert.ok(stored.PasswordChangedAt, 'change time recorded');
    assert.equal(api(tokens[name], 'getAlerts').constructor.name.length > 0, true, 'session stays valid after the change');
  });
  // المستخدمون الآخرون لم يتأثروا
  assert.equal(api(null, 'login', 'ريم', '2222').success, true);
  assert.equal(api(null, 'login', 'المدير', '1234').success, true);
  // نفس الرقم لمستخدمين مختلفين = تشفير مختلف (salt)
  const t1 = api(null, 'login', 'ريم', '2222').token;
  api(t1, 'changePassword', '2222', 'same-pass');
  const t2 = api(null, 'login', 'المدير', '1234').token;
  api(t2, 'changePassword', '1234', 'same-pass');
  const [h1, h2] = ['ريم', 'المدير'].map(n => rows(gas, 'Users').find(u => u.Name === n).Password);
  assert.notEqual(h1, h2);
});

test('password change: validation, lockout, Arabic digits, and no way to change someone else', () => {
  const { api } = boot();
  const d = api(null, 'login', 'د. خالد', '4444').token;
  throwsCode(() => api(null, 'changePassword', '4444', 'abcd'), 'ERR_SESSION');
  throwsCode(() => api(d, 'changePassword', '', 'abcd'), 'ERR_REQUIRED');
  throwsCode(() => api(d, 'changePassword', '4444', ''), 'ERR_REQUIRED');
  throwsCode(() => api(d, 'changePassword', '4444', '12'), 'ERR_WEAK_PASSWORD');
  throwsCode(() => api(d, 'changePassword', '4444', '   12   '), 'ERR_WEAK_PASSWORD');
  throwsCode(() => api(d, 'changePassword', '4444', 'x'.repeat(65)), 'ERR_PASSWORD_TOO_LONG');
  throwsCode(() => api(d, 'changePassword', '4444', '٤٤٤٤'), 'ERR_SAME_PASSWORD');
  // الرقم الحالي بالأرقام العربية مقبول، والجديد يُوحَّد
  api(d, 'changePassword', '٤٤٤٤', '٩٨٧٦');
  assert.equal(api(null, 'login', 'د. خالد', '9876').success, true, 'new password typed with Arabic digits works with Latin digits');
  assert.equal(api(null, 'login', 'د. خالد', '٩٨٧٦').success, true);
  // محاولة تغيير رقم مستخدم آخر: الوسائط الإضافية تُتجاهل، والتغيير يخص صاحب الجلسة فقط
  const n = api(null, 'login', 'سارة', '1111').token;
  api(n, 'changePassword', '1111', 'nurse-pass', 'د. خالد');
  assert.equal(api(null, 'login', 'د. خالد', '9876').success, true, 'doctor password untouched');
  assert.equal(api(null, 'login', 'سارة', 'nurse-pass').success, true);
  // رقم حالي خاطئ 5 مرات → قفل مؤقت (حتى بالرقم الصحيح)
  for (let i = 0; i < 5; i++) throwsCode(() => api(d, 'changePassword', 'wrong' + i, 'abcd1'), 'ERR_WRONG_PASSWORD');
  throwsCode(() => api(d, 'changePassword', '9876', 'abcd1'), 'ERR_LOGIN_LOCKED');
  assert.equal(api(null, 'login', 'د. خالد', '9876').success, true, 'failed change attempts do not alter the password');
  // المدير يستطيع إعادة تعيين الرقم لمن نسيه
  const a = api(null, 'login', 'المدير', '1234').token;
  api(a, 'updateUser', 'د. خالد', { password: 'reset-1', role: 'طبيب', clinic: '', email: 'khaled@example.com' });
  assert.equal(api(null, 'login', 'د. خالد', 'reset-1').success, true);
});

test('login: wrong name/password, empty fields, per-user lockout, case/space tolerant names', () => {
  const { api } = boot();
  assert.equal(api(null, 'login', 'سارة', '9999').success, false);
  assert.equal(api(null, 'login', 'غير موجود', '1111').success, false, 'unknown user');
  throwsCode(() => api(null, 'login', '', '1111'), 'ERR_LOGIN_EMPTY');
  throwsCode(() => api(null, 'login', 'سارة', ''), 'ERR_LOGIN_EMPTY');
  assert.equal(api(null, 'login', '  سارة  ', '1111').success, true, 'extra spaces are ignored');
  assert.equal(api(null, 'login', 'سارة', ' 1111 ').success, true, 'spaces around the password are ignored');
  assert.equal(api(null, 'login', 'سارة', '١١١١').success, true, 'Arabic digits accepted');
  for (let i = 0; i < 8; i++) api(null, 'login', 'علي', 'bad' + i);
  throwsCode(() => api(null, 'login', 'علي', '3333'), 'ERR_LOGIN_LOCKED');
  assert.equal(api(null, 'login', 'سارة', '1111').success, true, 'lockout is per user');
  const r = api(null, 'login', 'سارة', '1111');
  assert.equal(r.user.screen, 'nurse');
  assert.equal(r.user.password, undefined, 'login response never contains the password');
  assert.equal(JSON.stringify(r).includes('h1$'), false, 'nor its hash');
});

test('login: locks out after 8 failed attempts', () => {
  const { api } = boot();
  for (let i = 0; i < 8; i++) assert.equal(api(null, 'login', 'علي', 'bad').success, false);
  throwsCode(() => api(null, 'login', 'علي', '3333'), 'ERR_LOGIN_LOCKED');
});

test('sessions & permissions: no token, bad token, wrong role', () => {
  const { api, login } = boot();
  throwsCode(() => api(null, 'getConfig'), 'ERR_SESSION');
  throwsCode(() => api('forged', 'getConfig'), 'ERR_SESSION');
  const nurse = login('سارة', '1111');
  throwsCode(() => api(nurse, 'getUsers'), 'ERR_FORBIDDEN');
  throwsCode(() => api(nurse, 'bulkUpdateStatus', [], 'قيد التجهيز'), 'ERR_FORBIDDEN');
  throwsCode(() => api(nurse, 'setupSheets'), 'ERR_UNKNOWN_FN');
  const q = login('منى', '5555');
  throwsCode(() => api(q, 'getUsers'), 'ERR_FORBIDDEN'); // الجودة ليست إدارة تنفيذية
  api(nurse, 'logout');
  throwsCode(() => api(nurse, 'getConfig'), 'ERR_SESSION');
});

test('config: nurse sees every clinic (own clinics flagged) and no prices; clinic consumables open to any clinic', () => {
  const { api, login } = boot();
  const n = login('سارة', '1111');
  const cfg = api(n, 'getConfig');
  assert.ok(cfg.clinics.length >= 5 && cfg.clinics.some(c => c.name === 'Sterilization'));
  assert.deepEqual(cfg.myClinics.sort(), ['عيادة الأسنان 1', 'عيادة الجلدية 1'].sort());
  const dr = api(n, 'createRequest', { clinic: 'عيادة الأسنان 2', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 1 }] });
  assert.match(dr.id, /^REQ-/, 'clinic consumables: any dental clinic, even one that is not the nurse’s');
  const r = api(n, 'createRequest', { clinic: 'Sterilization', branch: 'جدة', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 1 }] });
  assert.match(r.id, /^REQ-/, 'clinic consumables: sterilization / triage in any branch');
  assert.ok(cfg.catalog.length >= 7);
  assert.ok(cfg.catalog.every(c => c.price === undefined));
  const proc = api(login('علي', '3333'), 'getConfig');
  assert.equal(proc.catalog.find(c => c.name === 'PROPHY PASTE').price, 60);
  assert.equal(proc.roles.length, 0, 'roles only for admin');
  assert.equal(api(login('المدير', '1234'), 'getConfig').roles.length, 9);
});

test('createRequest: validation', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111');
  const base = { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 2 }] };
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { clinic: 'عيادة الأسنان 2' })), 'ERR_FORBIDDEN');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { doctor: 'د. غير موجود' })), 'ERR_BAD_DOCTOR');
  assert.ok(api(n, 'getDoctors', 'عيادة الأسنان 1', { all: true }).some(d => d.name === 'د. فهد'), 'any listed doctor can be chosen: doctors are not tied to one clinic');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { type: 'x' })), 'ERR_BAD_TYPE');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { items: [] })), 'ERR_NO_ITEMS');
  // لا يمكن طلب صفر (ولا سالب ولا فارغ) — أقل كمية 1
  for (const q of [0, -3, '', null, '0', 0.4]) {
    throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { items: [{ name: 'A', qty: q }] })), 'ERR_QTY_MIN1');
  }
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { items: [{ name: 'A', qty: 1 }, { name: 'B', qty: 0 }] })), 'ERR_QTY_MIN1');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { items: [{ name: 'A', qty: 100001 }] })), 'ERR_BAD_QTY');
  assert.ok((gas.dump('Requests') || [[]]).length <= 1, 'nothing is saved when a quantity is zero');
});

test('createRequest: success, merge duplicates, catalog items only, email, double-submit guard', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111');
  const payload = {
    clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'طارئ',
    items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'prophy paste', qty: 3 }, { name: 'itero sleeve', qty: 1 }],
    nurse: 'منتحل'
  };
  // لا أصناف بأسماء حرة: صنف خارج الكتالوج يُرفض ولا يُضاف للكتالوج
  const catalogBefore = rows(gas, 'ItemsCatalog').length;
  throwsCode(() => api(n, 'createRequest', Object.assign({}, payload, { items: [{ name: 'PROPHY PASTE', qty: 1 }, { name: 'dw', qty: 1 }] })), 'ERR_UNKNOWN_ITEM');
  assert.equal(rows(gas, 'ItemsCatalog').length, catalogBefore, 'catalog unchanged');
  assert.equal((gas.dump('Requests') || [[]]).length <= 1, true, 'nothing saved');
  const res = api(n, 'createRequest', payload);
  assert.match(res.id, /^REQ-\d{6}-001$/);
  assert.equal(res.duplicate, false);
  const req = rows(gas, 'Requests').find(r => r.RequestID === res.id);
  assert.equal(req.Nurse, 'سارة', 'nurse comes from the session, not the payload');
  assert.equal(req.Status, 'مراجعة الطبيب', 'a doctor with an account reviews the request first');
  assert.ok(req.ReviewAt);
  const items = rows(gas, 'RequestItems').filter(r => r.RequestID === res.id);
  assert.equal(items.length, 2);
  assert.equal(items.find(i => i.ItemName === 'PROPHY PASTE').RequestedQty, 5);
  assert.ok(items.some(i => i.ItemName === 'Itero Sleeve'), 'catalog spelling is used');
  assert.equal(rows(gas, 'ItemsCatalog').length, catalogBefore);
  assert.ok(gas.mails.some(m => m.to === 'khaled@example.com' && /طارئ بانتظار مراجعتك/.test(m.subject)), 'doctor emailed on submit');
  assert.ok(gas.mails.some(m => m.to.indexOf('ali@example.com') !== -1 && /بانتظار اعتماد الطبيب/.test(m.subject)), 'procurement pre-alerted for emergencies');
  const again = api(n, 'createRequest', payload);
  assert.equal(again.duplicate, true);
  assert.equal(again.id, res.id);
  const second = api(n, 'createRequest', Object.assign({}, payload, { type: 'شهري' }));
  assert.match(second.id, /-002$/);
});

test('full workflow: submit → doctor review → approve → prep → partial dispatch → receive', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 4 }, { name: 'DENTAL FLOSS', qty: 10 }] }).id;
  assert.equal(api(n, 'getMyRequests')[0].status, 'مراجعة الطبيب', 'goes to the doctor right after submission');
  assert.ok(gas.mails.some(m => m.to === 'khaled@example.com' && /بانتظار مراجعتك/.test(m.subject)));

  // التموين لا يجهّز ولا يرسل قبل اعتماد الطبيب، والكميات مقفلة أثناء المراجعة
  for (const st of ['قيد التجهيز', 'تم الإرسال']) {
    const r = api(p, 'bulkUpdateStatus', [id], st);
    assert.deepEqual(r.updated, []);
    assert.equal(r.skipped[0].reason, st === 'قيد التجهيز' ? 'ERR_BAD_TRANSITION' : 'ERR_BAD_TRANSITION');
  }
  throwsCode(() => api(p, 'dispatchItems', id, ['PROPHY PASTE']), 'ERR_NEEDS_APPROVAL');
  throwsCode(() => api(p, 'updateItemApproval', id, 'DENTAL FLOSS', 9), 'ERR_LOCKED');

  // الطبيب
  assert.equal(api(d, 'getDoctorRequests').length, 1);
  const withPrices = api(d, 'getRequestItemsWithCatalog', id);
  assert.equal(withPrices.find(i => i.item === 'PROPHY PASTE').price, 60);
  throwsCode(() => api(d, 'doctorReview', id, 'رفض', '', []), 'ERR_REASON_REQUIRED');
  throwsCode(() => api(d, 'doctorReview', id, 'اعتمد', '', [], [{ item: 'DENTAL FLOSS', qty: -1 }]), 'ERR_BAD_QTY');
  throwsCode(() => api(d, 'doctorReview', id, 'اعتمد', '', [], [{ item: 'DENTAL FLOSS', qty: 0 }, { item: 'PROPHY PASTE', qty: 0 }]), 'ERR_ALL_ZERO');
  // الطبيب يعدّل الكمية أثناء المراجعة ثم يعتمد
  api(d, 'doctorReview', id, 'اعتمد', 'تمام', [{ item: 'DENTAL FLOSS', note: 'نوع شمعي' }], [{ item: 'DENTAL FLOSS', qty: 8 }, { item: 'PROPHY PASTE', qty: 4 }]);
  throwsCode(() => api(d, 'doctorReview', id, 'اعتمد', '', []), 'ERR_BAD_TRANSITION');
  assert.equal(api(p, 'getRequestItemsFull', id).items.find(i => i.item === 'DENTAL FLOSS').approvedQty, 8, 'doctor quantity reaches procurement exactly');
  assert.ok(rows(gas, 'Log').some(l => /الطبيب عدّل الكميات: DENTAL FLOSS: 10 ← 8/.test(l.Action)), 'the change is logged');
  assert.ok(gas.mails.some(m => m.to.indexOf('ali@example.com') !== -1 && /معتمد جاهز للتجهيز/.test(m.subject)), 'procurement emailed after approval');
  const pa = api(p, 'getAlerts');
  assert.ok(pa.some(a => a.code === 'alert_new' && a.n === 1), 'approved request shows as ready to prepare');

  // التجهيز بعد الاعتماد — الكميات كما اعتمدها الطبيب (التموين لا يعدّلها)
  assert.deepEqual(api(p, 'bulkUpdateStatus', [id, 'REQ-NOPE'], 'قيد التجهيز').updated, [id]);
  throwsCode(() => api(p, 'updateItemApproval', id, 'DENTAL FLOSS', 5), 'ERR_DOCTOR_QTY');
  throwsCode(() => api(p, 'bulkUpdateStatus', [id], 'مراجعة الطبيب'), 'ERR_BAD_STATUS');
  assert.ok(api(p, 'getAlerts').some(a => a.code === 'alert_approved_ready' && a.n === 1), 'prepared → ready to send');

  // إرسال جزئي ثم كامل
  let ds = api(p, 'dispatchItems', id, ['PROPHY PASTE']);
  assert.equal(ds.allSent, false);
  assert.equal(api(p, 'getRequestItemsFull', id).dispatchStatus['PROPHY PASTE'], true);
  ds = api(p, 'dispatchItems', id, ['DENTAL FLOSS']);
  assert.equal(ds.allSent, true);
  assert.ok(gas.mails.some(m => m.to === 'sara@example.com' && /تم إرسال طلبك/.test(m.subject)));

  // ممرضة أخرى لا تستطيع الاستلام
  const other = login('ريم', '2222');
  throwsCode(() => api(other, 'receiveShipment', id, 1, [], 'ريم', '', ''), 'ERR_FORBIDDEN');
  throwsCode(() => api(n, 'receiveShipment', id, 9, [], 'سارة', '', ''), 'ERR_NOT_FOUND');
  assert.equal(api(n, 'getMyRequests')[0].pendingShipments, 2);

  // الشحنة 1: توقيع مستقل، والطلب لم يكتمل بعد (الأصناف خارج الشحنة تُتجاهل)
  // اسم المستلم ثابت = الممرضة المسجّلة دخولها؛ أي اسم حر من الواجهة يُتجاهل
  let rec = api(n, 'receiveShipment', id, 1, [{ name: 'PROPHY PASTE', qty: 4 }, { name: 'DENTAL FLOSS', qty: 99 }], 'اسم حر', PNG, PNG, PNG);
  assert.equal(rows(gas, 'Shipments')[0].ReceiverName, 'سارة');
  assert.deepEqual([rec.complete, rec.pendingShipments, rec.mergedReceiptUrl], [false, 1, '']);
  assert.ok(rec.signatureUrl && rec.receiptUrl);
  assert.equal(gas.files.length, 2, 'merged receipt is not saved before the last shipment');
  assert.equal(api(n, 'getRequestDetail', id).status, 'تم الإرسال');
  assert.equal(api(n, 'getRequestDetail', id).items.find(i => i.item === 'DENTAL FLOSS').receivedQty, '');
  throwsCode(() => api(n, 'receiveShipment', id, 1, [], 'سارة', '', ''), 'ERR_ALREADY_RECEIVED');
  const sigs = api(n, 'getShipmentSignatures', id);
  assert.equal(sigs.length, 1);
  assert.ok(sigs[0].dataUrl.startsWith('data:image/png;base64,'), 'stored signature can be read back for the merged receipt');

  // الشحنة 2 (الأخيرة): يكتمل الطلب ويُحفظ الإيصال الموحّد
  rec = api(n, 'receiveShipment', id, 2, [{ name: 'DENTAL FLOSS', qty: 6 }], 'منيرة', PNG, PNG, PNG);
  assert.deepEqual([rec.complete, rec.pendingShipments], [true, 0]);
  assert.equal(gas.files.length, 5);
  assert.ok(gas.files[4].name.endsWith('-receipt-all.png'));
  assert.equal(rec.mergedReceiptUrl, 'https://drive.example/file5');
  throwsCode(() => api(n, 'receiveShipment', id, 2, [], 'سارة', '', ''), 'ERR_BAD_TRANSITION');

  const det = api(n, 'getRequestDetail', id);
  assert.equal(det.status, 'تم الاستلام');
  assert.equal(det.receiver, 'سارة', 'receiver is always the logged-in nurse (free names ignored)');
  assert.equal(det.receiptUrl, rec.mergedReceiptUrl);
  assert.deepEqual(det.shipments.map(g => [g.batch, g.received, g.receiver]), [[1, true, 'سارة'], [2, true, 'سارة']]);
  assert.ok(det.shipments[0].receiptUrl && det.shipments[0].signatureUrl);
  assert.equal(typeof det.submittedAt, 'string', 'dates are serialized');
  assert.equal(det.items.find(i => i.item === 'DENTAL FLOSS').receivedQty, 6);
  assert.equal(det.items.find(i => i.item === 'DENTAL FLOSS').notes[0].note, 'نوع شمعي');
  assert.equal(det.comments[0].message, 'تمام');
  assert.equal(det.kpi.unit, 'days');
  assert.ok(det.kpi.reviewTime !== null && det.kpi.approvalToPrep !== null && det.kpi.prepToSent !== null);
  assert.ok(det.approvedAt);
  assert.equal(det.log, undefined, 'the audit log is not sent with every detail (it is heavy)');
  assert.ok(rows(gas, 'Log').filter(r => r.RequestID === id).length >= 6);

  const stats = api(login('منى', '5555'), 'getExecutiveStats', '');
  assert.equal(stats.total, 1);
  assert.equal(stats.shortages, 1, 'DENTAL FLOSS received 6 of approved 8');
});

test('items can be dispatched in numbered shipments with a sent/remaining tracker', () => {
  const { api, login, gas, ctx } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const names = ['MICRO BRUSH FINE', 'PROPHY PASTE', 'DENTAL FLOSS', 'Etchant Blue Tip', 'Ivoclar Tetric-N A2'];
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: names.map(x => ({ name: x, qty: 2 })) }).id;
  api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز');
  throwsCode(() => api(p, 'dispatchItems', id, [names[0]]), 'ERR_NEEDS_APPROVAL');
  api(d, 'doctorReview', id, 'اعتمد', '', []);

  // الشحنة 1: صنفان
  let ds = api(p, 'dispatchItems', id, [names[0], names[1]]);
  assert.deepEqual([ds.batch, ds.count, ds.sent, ds.remaining, ds.total, ds.allSent], [1, 2, 2, 3, 5, false]);
  const mail = gas.mails.find(m => m.to === 'sara@example.com' && /شحنة جزئية/.test(m.subject));
  assert.ok(mail && /PROPHY PASTE ×2/.test(mail.body) && /المتبقي من الطلب \(6 قطعة\)/.test(mail.body) && /DENTAL FLOSS: باقي 2 من 2/.test(mail.body), 'nurse is told what was sent and what remains');

  // الطلب يبقى «معتمد» والتتبع ظاهر للممرضة والتموين
  let mine = api(n, 'getMyRequests').find(r => r.id === id);
  assert.deepEqual([mine.status, mine.itemCount, mine.dispatchedCount, mine.shipmentCount], ['معتمد من الطبيب', 5, 2, 1]);

  // لا يمكن إعادة إرسال صنف أُرسل، ولا أصناف غير موجودة
  throwsCode(() => api(p, 'dispatchItems', id, [names[0]]), 'ERR_NO_ITEMS');
  throwsCode(() => api(p, 'dispatchItems', id, ['NOT IN REQUEST']), 'ERR_NO_ITEMS');

  // الممرضة تستلم الشحنة 1 والطلب ما زال مفتوحاً
  assert.equal(api(n, 'receiveShipment', id, 1, [{ name: names[0], qty: 2 }, { name: names[1], qty: 1 }], 'سارة', '', '').complete, false);
  mine = api(n, 'getMyRequests').find(r => r.id === id);
  assert.deepEqual([mine.status, mine.pendingShipments], ['معتمد من الطبيب', 0]);

  // الشحنة 2: صنف واحد
  ds = api(p, 'dispatchItems', id, [names[2], names[0]]);
  assert.deepEqual([ds.batch, ds.count, ds.remaining], [2, 1, 2], 'already-sent items in the selection are ignored');

  // إرسال الباقي دفعة واحدة من الإجراء الجماعي = شحنة 3
  assert.deepEqual(api(p, 'bulkUpdateStatus', [id], 'تم الإرسال').updated, [id]);
  const det = api(n, 'getRequestDetail', id);
  assert.equal(det.status, 'تم الإرسال');
  assert.deepEqual(det.items.map(i => i.batch), [1, 1, 2, 3, 3]);
  mine = api(n, 'getMyRequests').find(r => r.id === id);
  assert.deepEqual([mine.dispatchedCount, mine.shipmentCount], [5, 3]);
  assert.deepEqual(api(p, 'getRequestItems', id).map(i => i.batch), [1, 1, 2, 3, 3]);

  // استلام بترتيب مختلف: 3 ثم 2 — الأخيرة تُكمل الطلب
  assert.equal(api(n, 'receiveShipment', id, 3, [], 'سارة', '', '').complete, false);
  assert.equal(api(n, 'receiveShipment', id, 2, [], 'سارة', '', '').complete, true);
  assert.equal(api(p, 'getRequestItemsFull', id).shipments.every(g => g.received), true);
  assert.equal(api(n, 'getRequestItems', id).find(i => i.item === names[1]).receivedQty, 1);

  // صفوف قديمة بدون رقم شحنة تُرقَّم حسب وقت الإرسال
  const t = gas.ss.getSheetByName('RequestItems');
  const col = t._data[0].indexOf('DispatchBatch'), at = t._data[0].indexOf('DispatchedAt');
  const rows = t._data.slice(1).filter(r => r[0] === id);
  rows.forEach((r, i) => { r[col] = ''; r[at] = new Date(Date.UTC(2025, 0, i < 3 ? 1 : 2)); });
  ctx.onEdit({ range: { getSheet: () => t } }); // تعديل يدوي في الشيت يُبطل الكاش
  assert.deepEqual(api(p, 'getRequestItems', id).map(i => i.batch), [1, 1, 1, 2, 2]);
});

test('partial quantity of the same item: send 5 of 10 gloves, the rest stays tracked until sent', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'قفازات طبية M', qty: 10 }, { name: 'DENTAL FLOSS', qty: 4 }] }).id;
  api(d, 'doctorReview', id, 'اعتمد', '', []);
  api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز');

  // التحقق من الكميات
  throwsCode(() => api(p, 'dispatchItems', id, [{ name: 'قفازات طبية M', qty: 11 }]), 'ERR_QTY_EXCEEDS');
  throwsCode(() => api(p, 'dispatchItems', id, [{ name: 'قفازات طبية M', qty: 0 }]), 'ERR_BAD_QTY');

  // الشحنة 1: 5 قفازات فقط
  let ds = api(p, 'dispatchItems', id, [{ name: 'قفازات طبية M', qty: 5 }]);
  assert.deepEqual([ds.batch, ds.units, ds.remainingQty, ds.allSent], [1, 5, 9, false]);
  assert.deepEqual(ds.items, [{ item: 'قفازات طبية M', qty: 5, remaining: 5 }]);
  let r = api(p, 'getRequests', {}).find(x => x.id === id);
  assert.deepEqual([r.status, r.totalQty, r.sentQty, r.remainingQty, r.partialItems, r.dispatchedCount], ['قيد التجهيز', 14, 5, 9, 1, 0]);
  assert.deepEqual(r.remainingItems, [{ item: 'قفازات طبية M', qty: 5, sent: 5, target: 10 }, { item: 'DENTAL FLOSS', qty: 4, sent: 0, target: 4 }]);
  assert.ok(api(p, 'getAlerts').some(a => a.code === 'alert_partial' && a.n === 1), 'procurement is alerted about partially-sent requests');
  let full = api(p, 'getRequestItemsFull', id);
  const g = full.items.find(i => i.item === 'قفازات طبية M');
  assert.deepEqual([g.target, g.sentQty, g.remainingQty, g.partial, g.done], [10, 5, 5, true, false]);
  assert.equal(full.dispatchStatus['قفازات طبية M'], undefined, 'not complete yet');
  assert.deepEqual(full.shipments[0].items.map(i => [i.item, i.qty]), [['قفازات طبية M', 5]]);

  // الممرضة تستلم الشحنة 1 (وصل 4 من 5)
  api(n, 'receiveShipment', id, 1, [{ name: 'قفازات طبية M', qty: 4 }], 'سارة', '', '');
  // الشحنة 2: باقي القفازات (5) + الخيط كاملاً (بدون تحديد كمية = كل المتبقي)
  throwsCode(() => api(p, 'dispatchItems', id, [{ name: 'قفازات طبية M', qty: 6 }]), 'ERR_QTY_EXCEEDS');
  ds = api(p, 'dispatchItems', id, [{ name: 'قفازات طبية M', qty: 5 }, 'DENTAL FLOSS']);
  assert.deepEqual([ds.batch, ds.units, ds.remainingQty, ds.allSent], [2, 9, 0, true]);
  assert.equal(api(n, 'getMyRequests')[0].status, 'تم الإرسال');
  full = api(p, 'getRequestItemsFull', id);
  assert.deepEqual(full.items.find(i => i.item === 'قفازات طبية M').parts, [{ batch: 1, qty: 5 }, { batch: 2, qty: 5 }]);
  assert.equal(full.dispatchStatus['قفازات طبية M'], true);

  // استلام الشحنة 2 → المستلم الكلي للصنف = مجموع الشحنتين
  const rec = api(n, 'receiveShipment', id, 2, [{ name: 'قفازات طبية M', qty: 5 }, { name: 'DENTAL FLOSS', qty: 4 }], 'سارة', '', '');
  assert.equal(rec.complete, true);
  const det = api(n, 'getRequestDetail', id);
  assert.equal(det.items.find(i => i.item === 'قفازات طبية M').receivedQty, 9);
  assert.deepEqual(det.shipments.map(s => s.items.map(i => [i.item, i.qty, i.receivedQty])),
    [[['قفازات طبية M', 5, 4]], [['قفازات طبية M', 5, 5], ['DENTAL FLOSS', 4, 4]]]);
  assert.ok(rows(gas, 'ShipmentItems').length === 3);
  // الإرسال الجماعي يرسل كل الكميات المتبقية
  const id2 = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 6 }] }).id;
  api(d, 'doctorReview', id2, 'اعتمد', '', []);
  api(p, 'dispatchItems', id2, [{ name: 'PROPHY PASTE', qty: 2 }]);
  api(p, 'bulkUpdateStatus', [id2], 'تم الإرسال');
  const st2 = api(p, 'getRequestItemsFull', id2);
  assert.deepEqual(st2.items[0].parts, [{ batch: 1, qty: 2 }, { batch: 2, qty: 4 }]);
  assert.equal(st2.items[0].remainingQty, 0);
});

test('read cache: every write is visible immediately, cached reads equal fresh sheet reads', () => {
  const { api, login, gas, ctx } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444'), q = login('منى', '5555');
  // يمسح كاش البيانات فقط (الجلسات تبقى) لقراءة الشيت مباشرة
  const dropCache = () => Object.keys(gas.cache).forEach(k => { if (/^[cnv]:/.test(k)) delete gas.cache[k]; });
  const views = id => [
    [p, 'getRequests', {}], [n, 'getMyRequests'], [n, 'getAlerts'], [p, 'getAlerts'], [d, 'getDoctorRequests'],
    [q, 'getExecutiveStats', ''], [p, 'getComplaints', false], [n, 'getConfig']
  ].concat(id ? [[n, 'getRequestDetail', id], [p, 'getRequestItemsFull', id], [d, 'getRequestItemsWithCatalog', id]] : []);
  const snap = id => views(id).map(([tk, fn, ...a]) => JSON.stringify(api(tk, fn, ...a), (k, v) => (k === 'serverTime' ? undefined : v)));
  const check = (label, id) => {
    snap(id);                         // تسخين الكاش
    const cached = snap(id);          // من الكاش
    dropCache();
    const fresh = snap(id);           // من الشيت مباشرة
    cached.forEach((c, i) => assert.equal(c, fresh[i], label + ': ' + views(id)[i][1] + ' served stale data'));
  };
  const step = (label, fn, id) => { check('before ' + label, id); fn(); check('after ' + label, id); };

  let id;
  step('createRequest', () => { id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'Itero Sleeve', qty: 1 }, { name: 'DENTAL FLOSS', qty: 3 }] }).id; });
  assert.equal(api(p, 'getRequests', {}).find(r => r.id === id).itemCount, 3, 'new request items visible right away');
  step('reject', () => api(d, 'doctorReview', id, 'رفض', 'راجعي الكميات', []), id);
  step('resubmit', () => api(n, 'resubmitRequest', id, 'تم التعديل'), id);
  step('comment', () => api(n, 'addComment', id, 'تعليق'), id);
  step('complaint', () => api(n, 'addComplaint', id, 'تأخير', 'تفاصيل'), id);
  step('approve with doctor quantities', () => api(d, 'doctorReview', id, 'اعتمد', '', [{ item: 'PROPHY PASTE', note: 'ملاحظة' }], [{ item: 'DENTAL FLOSS', qty: 2 }]), id);
  step('prep', () => api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز'), id);
  step('dispatch 1', () => api(p, 'dispatchItems', id, ['PROPHY PASTE']), id);
  step('receive 1', () => api(n, 'receiveShipment', id, 1, [{ name: 'PROPHY PASTE', qty: 2 }], 'سارة', '', ''), id);
  step('dispatch rest', () => api(p, 'bulkUpdateStatus', [id], 'تم الإرسال'), id);
  step('receive 2', () => api(n, 'receiveShipment', id, 2, [], 'سارة', '', ''), id);
  step('manual sheet edit + onEdit', () => {
    const t = gas.ss.getSheetByName('Requests');
    t._data[1][t._data[0].indexOf('Clinic')] = 'عيادة الجلدية 1';
    ctx.onEdit({ range: { getSheet: () => t } });
  }, id);

  // كتابة مبنية على كاش قديم (تعديل في الشيت لم يمر عبر onEdit) تُرفض بدل الكتابة فوق البيانات
  const id2 = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. نورة', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 3 }] }).id;
  api(p, 'getRequestItemsFull', id2); api(p, 'getRequestItemsFull', id2); // الكاش ساخن
  const ri = gas.ss.getSheetByName('RequestItems');
  const line = ri._data.find(r => r[0] === id2);
  line[ri._data[0].indexOf('RequestedQty')] = 7; // تعديل خارجي بدون onEdit
  throwsCode(() => api(p, 'updateItemApproval', id2, 'DENTAL FLOSS', 2), 'ERR_CONFLICT');
  ctx.onEdit({ range: { getSheet: () => ri } });
  api(p, 'updateItemApproval', id2, 'DENTAL FLOSS', 2);
  assert.equal(line[ri._data[0].indexOf('ApprovedQty')], 2);
  assert.equal(line[ri._data[0].indexOf('RequestedQty')], 7, 'external edit is preserved');

  // القراءات المتكررة لا تلمس الشيت
  api(p, 'getRequests', {});
  const before = gas.ops.byKind.read || 0;
  api(p, 'getRequests', {}); api(n, 'getRequestDetail', id); api(n, 'getMyRequests');
  assert.equal((gas.ops.byKind.read || 0) - before, 0, 'warm reads are served from the cache');
});

test('branch: chosen per order, defaults to the clinic branch, validated, filterable', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333');
  assert.deepEqual(api(n, 'getConfig').branches, ['الرياض', 'جدة']);
  const base = { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري' };
  // الافتراضي = فرع العيادة
  const a = api(n, 'createRequest', Object.assign({ items: [{ name: 'PROPHY PASTE', qty: 1 }] }, base)).id;
  // فرع مختلف تختاره الممرضة
  const b = api(n, 'createRequest', Object.assign({ branch: 'جدة', items: [{ name: 'DENTAL FLOSS', qty: 1 }] }, base)).id;
  throwsCode(() => api(n, 'createRequest', Object.assign({ branch: 'الدمام', items: [{ name: 'DENTAL FLOSS', qty: 2 }] }, base)), 'ERR_BAD_BRANCH');
  assert.equal(rows(gas, 'Requests').find(r => r.RequestID === b).Branch, 'جدة');
  const all = api(p, 'getRequests', {});
  assert.equal(all.find(r => r.id === a).branch, 'الرياض');
  assert.equal(all.find(r => r.id === b).branch, 'جدة');
  assert.deepEqual(api(p, 'getRequests', { branch: 'جدة' }).map(r => r.id), [b]);
  assert.equal(api(n, 'getRequestDetail', b).branch, 'جدة');
  assert.ok(gas.mails.some(m => m.body.includes('الفرع: جدة')), 'procurement email names the branch');
  // طلب قديم بلا عمود فرع → فرع العيادة
  const t = gas.ss.getSheetByName('Requests');
  t._data.find(r => r[0] === a)[t._data[0].indexOf('Branch')] = '';
  gas.globals.CacheService.getScriptCache().remove('v:Requests');
  assert.equal(api(p, 'getRequests', {}).find(r => r.id === a).branch, 'الرياض');
});

test('login preloads the first screen data in the same call (reads only)', () => {
  const { api } = boot();
  const plan = {
    nurse: [['getMyRequests', []], ['getAlerts', []], ['createRequest', [{}]], ['getRequests', [{}]]],
    procurement: [['getRequests', [{}]]]
  };
  const r = api(null, 'login', 'سارة', '1111', plan);
  assert.equal(r.success, true);
  assert.equal(r.preload.length, 4);
  assert.deepEqual(r.preload.map(x => x.ok), [true, true, false, false]);
  assert.equal(r.preload[2].error, 'ERR_UNKNOWN_FN', 'writes are never run by preload');
  assert.equal(r.preload[3].error, 'ERR_FORBIDDEN', 'screen permissions still apply');
  assert.equal(api(null, 'login', 'سارة', '0000', plan).preload, undefined);
});

test('approval comes right after the nurse submits, and only her request\'s own doctor can give it', () => {
  const { api, login } = boot();
  const n = login('سارة', '1111'), r2 = login('ريم', '2222'), p = login('علي', '3333'), d = login('د. خالد', '4444'), q = login('منى', '5555');
  const admin = login('المدير', '1234');
  api(admin, 'createUser', { name: 'د. سعد', password: '6666', role: 'طبيب', clinic: '' });
  const d2 = login('د. سعد', '6666');
  // تسخين الكاش عند الطبيب والتموين قبل رفع الطلب
  assert.equal(api(d, 'getDoctorRequests').length, 0);
  api(p, 'getRequests', {});
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 3 }] }).id;
  // يظهر فوراً عند طبيبه، مع تنبيه، ولا يظهر عند طبيب آخر
  const mine = api(d, 'getDoctorRequests');
  assert.deepEqual(mine.map(r => [r.id, r.status, r.nurse]), [[id, 'مراجعة الطبيب', 'سارة']]);
  assert.ok(api(d, 'getAlerts').some(a => a.code === 'alert_pending_review' && a.n === 1));
  assert.equal(api(d2, 'getDoctorRequests').length, 0, 'another doctor does not see it');
  throwsCode(() => api(d2, 'getRequestDetail', id), 'ERR_FORBIDDEN');
  // لا أحد غير طبيبه يعتمد
  throwsCode(() => api(n, 'doctorReview', id, 'اعتمد', '', []), 'ERR_FORBIDDEN');
  throwsCode(() => api(p, 'doctorReview', id, 'اعتمد', '', []), 'ERR_FORBIDDEN');
  throwsCode(() => api(q, 'doctorReview', id, 'اعتمد', '', []), 'ERR_FORBIDDEN');
  throwsCode(() => api(d2, 'doctorReview', id, 'اعتمد', '', []), 'ERR_FORBIDDEN');
  throwsCode(() => api(d, 'doctorReview', id, 'ربما', '', []), 'ERR_BAD_DECISION');
  // التموين لا يتصرف قبل الاعتماد
  assert.equal(api(p, 'getRequests', {}).find(r => r.id === id).cleared, false);
  assert.equal(api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز').skipped.length, 1);
  throwsCode(() => api(p, 'dispatchItems', id, ['PROPHY PASTE']), 'ERR_NEEDS_APPROVAL');
  // ممرضة أخرى لا ترى الطلب
  throwsCode(() => api(r2, 'getRequestDetail', id), 'ERR_FORBIDDEN');
  // الاعتماد → يظهر للتموين جاهزاً للتجهيز، والممرضة ترى «معتمد»
  api(d, 'doctorReview', id, 'اعتمد', '', []);
  throwsCode(() => api(d, 'doctorReview', id, 'رفض', 'متأخر', []), 'ERR_BAD_TRANSITION');
  assert.equal(api(n, 'getMyRequests')[0].status, 'معتمد من الطبيب');
  const pr = api(p, 'getRequests', {}).find(r => r.id === id);
  assert.deepEqual([pr.status, pr.cleared], ['معتمد من الطبيب', true]);
  const det = api(n, 'getRequestDetail', id);
  assert.ok(det.reviewAt && det.approvedAt && new Date(det.approvedAt) >= new Date(det.submittedAt), 'approval is stamped after submission');
  assert.equal(det.prepAt, '', 'not prepared before approval');
});

test('doctor rejection returns to the nurse, who can resubmit it to the doctor', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const other = login('ريم', '2222');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'Itero Sleeve', qty: 50 }] }).id;
  throwsCode(() => api(n, 'resubmitRequest', id, ''), 'ERR_BAD_TRANSITION');
  api(d, 'doctorReview', id, 'رفض', 'الكمية كبيرة', []);
  let req = api(n, 'getMyRequests')[0];
  assert.equal(req.status, 'مرفوض');
  assert.equal(req.rejectionReason, 'الكمية كبيرة');
  assert.ok(gas.mails.some(m => m.to === 'sara@example.com' && /رفض/.test(m.subject) && /إعادة إرساله/.test(m.body)));
  assert.ok(api(n, 'getAlerts').some(a => a.code === 'alert_rejected'));
  // التموين لا يجهّز طلباً مرفوضاً
  assert.equal(api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز').skipped[0].reason, 'ERR_BAD_TRANSITION');
  throwsCode(() => api(other, 'resubmitRequest', id, ''), 'ERR_FORBIDDEN');
  api(n, 'resubmitRequest', id, 'خفّضت الكمية');
  req = api(n, 'getMyRequests')[0];
  assert.deepEqual([req.status, req.rejectionReason], ['مراجعة الطبيب', '']);
  assert.ok(gas.mails.some(m => m.to === 'khaled@example.com' && /مُعاد لمراجعتك/.test(m.subject)));
  assert.equal(api(n, 'getRequestDetail', id).comments.slice(-1)[0].message, 'خفّضت الكمية');
  api(d, 'doctorReview', id, 'اعتمد', '', []);
  assert.deepEqual(api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز').updated, [id]);
});

test('old requests not yet approved (new or prepared under the old order) appear at the doctor automatically', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 1 }] }).id;
  // محاكاة طلب قديم: جُهّز قبل الاعتماد
  const t = gas.ss.getSheetByName('Requests');
  t._data.find(r => r[0] === id)[t._data[0].indexOf('Status')] = 'قيد التجهيز';
  gas.globals.CacheService.getScriptCache().remove('v:Requests');
  assert.deepEqual([api(p, 'getRequests', {})[0].cleared, api(p, 'getRequests', {})[0].awaitingDoctor], [false, true]);
  assert.equal(api(p, 'bulkUpdateStatus', [id], 'تم الإرسال').skipped[0].reason, 'ERR_NEEDS_APPROVAL');
  throwsCode(() => api(p, 'dispatchItems', id, ['PROPHY PASTE']), 'ERR_NEEDS_APPROVAL');
  throwsCode(() => api(p, 'bulkUpdateStatus', [id], 'مراجعة الطبيب'), 'ERR_BAD_STATUS');
  // يظهر عند الطبيب بلا أي إجراء من التموين
  assert.deepEqual(api(d, 'getDoctorRequests').map(r => [r.id, r.awaitingDoctor]), [[id, true]]);
  assert.ok(api(d, 'getAlerts').some(a => a.code === 'alert_pending_review' && a.n === 1));
  api(d, 'doctorReview', id, 'اعتمد', '', []);
  // طلب قديم بحالة «جديد» وطبيبه له حساب → يظهر عند الطبيب كمراجعة
  const id2 = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 2 }] }).id;
  t._data.find(r => r[0] === id2)[t._data[0].indexOf('Status')] = 'جديد';
  gas.globals.CacheService.getScriptCache().remove('v:Requests');
  const legacy = api(d, 'getDoctorRequests').find(r => r.id === id2);
  assert.deepEqual([legacy.status, legacy.awaitingDoctor], ['مراجعة الطبيب', true]);
  api(d, 'doctorReview', id2, 'اعتمد', '', []);
  assert.equal(api(p, 'getRequests', {}).find(r => r.id === id2).status, 'معتمد من الطبيب');
  assert.deepEqual(api(p, 'bulkUpdateStatus', [id], 'تم الإرسال').updated, [id], 'approved → can be sent directly');
});

test('doctor report: priced items and totals for a month or a cumulative period', () => {
  const { api, login, gas } = boot(g => { const d = g.dump('ItemsCatalog'); g.seed('ItemsCatalog', d[0], d.slice(1).concat([['صنف بلا سعر', '', '', '']])); });
  const n = login('سارة', '1111'), d = login('د. خالد', '4444'), q = login('منى', '5555'), p = login('علي', '3333');
  const mk = items => api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items }).id;
  const a = mk([{ name: 'PROPHY PASTE', qty: 2 }, { name: 'DENTAL FLOSS', qty: 4 }]);  // 2×60 + 4×12.5 = 170
  const b = mk([{ name: 'Itero Sleeve', qty: 1 }, { name: 'صنف بلا سعر', qty: 3 }]);  // 300
  const c = mk([{ name: 'PROPHY PASTE', qty: 9 }]);                                     // مرفوض → خارج التقرير
  api(d, 'doctorReview', c, 'رفض', 'لا', []);
  api(d, 'doctorReview', a, 'اعتمد', '', [], [{ item: 'DENTAL FLOSS', qty: 2 }]); // الكمية المعتمدة تُستخدم: 2×60 + 2×12.5 = 145
  api(p, 'bulkUpdateStatus', [a], 'قيد التجهيز');
  // طلب b في شهر سابق
  const t = gas.ss.getSheetByName('Requests');
  const H = t._data[0];
  t._data.find(r => r[0] === b)[H.indexOf('SubmittedAt')] = new Date('2025-01-15T09:00:00Z');
  gas.globals.CacheService.getScriptCache().remove('v:Requests');

  const all = api(d, 'getDoctorReport', { from: '', to: '' });
  assert.equal(all.doctor, 'د. خالد');
  assert.deepEqual(all.rows.map(r => r.id), [b, a], 'sorted by date, rejected excluded');
  assert.deepEqual([all.summary.requests, all.summary.total, all.summary.unpriced], [2, 445, 1]);
  const ra = all.rows.find(r => r.id === a);
  assert.deepEqual(ra.items.map(i => [i.item, i.qty, i.price, i.total]), [['PROPHY PASTE', 2, 60, 120], ['DENTAL FLOSS', 2, 12.5, 25]]);
  assert.equal(ra.total, 145);
  assert.equal(all.top[0].item, 'Itero Sleeve');

  const jan = api(d, 'getDoctorReport', { from: '2025-01-01', to: '2025-01-31' });
  assert.deepEqual(jan.rows.map(r => r.id), [b]);
  const upTo = api(d, 'getDoctorReport', { from: '', to: '2025-06-30' }); // تراكمي حتى تاريخ
  assert.deepEqual(upTo.rows.map(r => r.id), [b]);
  throwsCode(() => api(d, 'getDoctorReport', { from: '2025-02-01', to: '2025-01-01' }), 'ERR_BAD_RANGE');

  // الإدارة: لأي طبيب؛ الممرضة والتموين: لا
  assert.deepEqual(api(q, 'getReportDoctors'), ['د. خالد']);
  throwsCode(() => api(q, 'getDoctorReport', {}), 'ERR_REQUIRED');
  assert.equal(api(q, 'getDoctorReport', { doctor: 'د. خالد' }).summary.total, 445);
  throwsCode(() => api(n, 'getDoctorReport', {}), 'ERR_FORBIDDEN');
  throwsCode(() => api(p, 'getDoctorReport', { doctor: 'د. خالد' }), 'ERR_FORBIDDEN');
});

test('lists hide completed requests older than 60 days unless the archive is asked for', () => {
  const D = 864e5;
  const { api, login } = boot(g => {
    const old = new Date(Date.now() - 120 * D), recent = new Date(Date.now() - 10 * D);
    g.seed('Requests', ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status', 'SubmittedAt', 'SentAt', 'ReceivedAt', 'ApprovedAt'], [
      ['OLD-RECV', old, 'عيادة الأسنان 1', 'د. خالد', 'سارة', 'شهري', 'تم الاستلام', old, old, old, old],
      ['OLD-REJ', old, 'عيادة الأسنان 1', 'د. خالد', 'سارة', 'شهري', 'مرفوض', old, '', '', ''],
      ['OLD-OPEN', old, 'عيادة الأسنان 1', 'د. خالد', 'سارة', 'شهري', 'قيد التجهيز', old, '', '', old],
      ['NEW-RECV', recent, 'عيادة الأسنان 1', 'د. خالد', 'سارة', 'شهري', 'تم الاستلام', recent, recent, recent, recent]
    ]);
    g.seed('RequestItems', ['RequestID', 'ItemName', 'RequestedQty'], [['OLD-RECV', 'A', 1], ['OLD-REJ', 'A', 1], ['OLD-OPEN', 'A', 1], ['NEW-RECV', 'A', 1]]);
  });
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const ids = l => l.map(r => r.id).sort();
  assert.deepEqual(ids(api(p, 'getRequests', {})), ['NEW-RECV', 'OLD-OPEN'], 'old completed hidden, old but still open kept');
  assert.deepEqual(ids(api(p, 'getRequests', { archive: true })), ['NEW-RECV', 'OLD-OPEN', 'OLD-RECV', 'OLD-REJ']);
  assert.deepEqual(ids(api(n, 'getMyRequests')), ['NEW-RECV', 'OLD-OPEN']);
  assert.equal(api(n, 'getMyRequests', { archive: true }).length, 4);
  assert.deepEqual(ids(api(d, 'getDoctorRequests')), ['NEW-RECV', 'OLD-OPEN']);
  assert.equal(api(d, 'getDoctorRequests', { archive: true }).length, 4, 'the doctor archive includes old received and rejected requests');
});

test('submitting a request never waits for the general write lock (peak 15–20 of the month); other writes still answer ERR_BUSY', () => {
  let busy = false, docBusy = false;
  const { api, login, gas } = boot(null, { lockBusy: () => busy, docLockBusy: () => docBusy });
  const n = login('سارة', '1111'), p = login('علي', '3333');
  const payload = { clinic: 'عيادة الأسنان 1', doctor: 'د. نورة', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'DENTAL FLOSS', qty: 1 }], clientKey: 'draft-peak-0001' };
  busy = true; // التموين/الأطباء يكتبون الآن
  const r = api(n, 'createRequest', payload);
  assert.equal(r.duplicate, false, 'the nurse submits while other writes hold the lock');
  assert.deepEqual(rows(gas, 'RequestItems').filter(x => x.RequestID === r.id).map(x => x.ItemName), ['PROPHY PASTE', 'DENTAL FLOSS']);
  throwsCode(() => api(p, 'bulkUpdateStatus', [r.id], 'قيد التجهيز'), 'ERR_BUSY'); // الكتابات الأخرى تبقى محمية بالقفل العام
  assert.ok(Array.isArray(api(n, 'getMyRequests')), 'reads keep working');
  busy = false;
  // إعادة الإرسال (انقطع الرد): نفس المسودة لا تتكرر
  assert.deepEqual(api(n, 'createRequest', payload), { duplicate: true, id: r.id });
  // حجز الرقم نفسه مشغول لحظياً → ERR_BUSY بدون أي كتابة، والإعادة تنجح
  docBusy = true;
  const before = rows(gas, 'Requests').length;
  throwsCode(() => api(n, 'createRequest', Object.assign({}, payload, { clientKey: 'draft-peak-0002', type: 'طارئ' })), 'ERR_BUSY');
  assert.equal(rows(gas, 'Requests').length, before, 'nothing saved');
  docBusy = false;
  assert.equal(api(n, 'createRequest', Object.assign({}, payload, { clientKey: 'draft-peak-0002', type: 'طارئ' })).duplicate, false);
});

test('request numbers stay sequential and unique per day, continuing from existing rows', () => {
  const { api, login, gas } = boot(g => {
    const day = new Date(Date.now() + 3 * 36e5).toISOString().slice(2, 10).replace(/-/g, '');
    g.seed('Requests', ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status'], [['REQ-' + day + '-041', new Date(), 'عيادة الأسنان 1', 'د. نورة', 'سارة', 'شهري', 'جديد']]);
  });
  const n = login('سارة', '1111');
  const ids = [1, 2, 3].map(i => api(n, 'createRequest', { doctor: 'د. نورة', type: i === 2 ? 'طارئ' : 'شهري', items: [{ name: 'DENTAL FLOSS', qty: i }], clientKey: 'seq-test-000' + i }).id);
  assert.deepEqual(ids.map(x => x.slice(-3)), ['042', '043', '044']);
  assert.equal(new Set(rows(gas, 'Requests').map(r => r.RequestID)).size, 4);
});

test('quality/executive statistics: by doctor, branch, clinic, items, with period and branch filters', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), r2 = login('ريم', '2222'), p = login('علي', '3333'), d = login('د. خالد', '4444'), q = login('منى', '5555'), a = login('المدير', '1234');
  const mk = (tok, clinic, doctor, items, extra) => api(tok, 'createRequest', Object.assign({ clinic, doctor, type: 'شهري', items }, extra || {})).id;
  const x1 = mk(n, 'عيادة الأسنان 1', 'د. خالد', [{ name: 'PROPHY PASTE', qty: 2 }]);                  // 120
  const x2 = mk(n, 'عيادة الأسنان 1', 'د. خالد', [{ name: 'Itero Sleeve', qty: 1 }], { branch: 'جدة' }); // 300 (فرع جدة)
  const x3 = mk(n, 'عيادة الأسنان 1', 'د. خالد', [{ name: 'DENTAL FLOSS', qty: 4 }]);                  // مرفوض
  const x4 = mk(r2, 'عيادة الأسنان 2', 'د. سعد', [{ name: 'DENTAL FLOSS', qty: 2 }]);                  // 25 (طبيب بلا حساب)
  api(d, 'doctorReview', x1, 'اعتمد', '', []);
  api(d, 'doctorReview', x2, 'اعتمد', '', [], [{ item: 'Itero Sleeve', qty: 1 }]);
  api(d, 'doctorReview', x3, 'رفض', 'لا', []);
  const st = api(q, 'getStatsReport', {});
  assert.deepEqual([st.summary.requests, st.summary.rejected, st.summary.value], [4, 1, 445], 'rejected value not counted');
  const kh = st.doctors.find(x => x.name === 'د. خالد');
  assert.deepEqual([kh.requests, kh.approved, kh.rejected, kh.value, kh.rejectRate], [3, 2, 1, 420, 33]);
  assert.ok(kh.avgApprovalHrs !== null, 'approval time measured');
  assert.equal(st.doctors[0].name, 'د. خالد', 'sorted by value');
  assert.deepEqual(st.branches.map(b => [b.name, b.requests, b.value]).sort(), [['الرياض', 2, 120], ['جدة', 2, 325]].sort());
  assert.equal(st.clinics.find(c => c.name === 'عيادة الأسنان 2').value, 25);
  assert.equal(st.topItems[0].item, 'Itero Sleeve');
  assert.equal(st.statuses['مرفوض'], 1);
  assert.deepEqual(api(q, 'getStatsReport', { branch: 'جدة' }).summary.requests, 2, 'branch filter');
  assert.equal(api(a, 'getStatsReport', { from: '2020-01-01', to: '2020-01-31' }).summary.requests, 0, 'period filter');
  throwsCode(() => api(q, 'getStatsReport', { from: '2025-02-01', to: '2025-01-01' }), 'ERR_BAD_RANGE');
  for (const tok of [n, p, d]) throwsCode(() => api(tok, 'getStatsReport', {}), 'ERR_FORBIDDEN');
});

test('prices: a date in the Price cell (Sheets turns "3/8" into a date) is never read as a huge number', () => {
  const { api, login } = boot(g => {
    g.seed('ItemsCatalog', ['ItemName', 'CommercialName', 'Category', 'Price'], [
      ['Itero Sleeve', 'Align', 'Scanner', new Date('2026-08-02T21:00:00Z')],  // = 1,785,704,400,000 لو قُرئ كرقم
      ['PROPHY BRUSH', '', '', '27.5'],
      ['MICRO BRUSH FINE', '', '', 4.95],
      ['GLOVES', '', '', '1,250.50 ر.س'],
      ['BAD', '', '', 5e9],
      ['TXT', '', '', 'غالي']
    ]);
  });
  const n = login('سارة', '1111'), d = login('د. خالد', '4444'), q = login('منى', '5555');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'Itero Sleeve', qty: 1 }, { name: 'PROPHY BRUSH', qty: 1 }, { name: 'MICRO BRUSH FINE', qty: 1 }, { name: 'GLOVES', qty: 2 }] }).id;
  const cat = api(d, 'getRequestItemsWithCatalog', id);
  assert.deepEqual(cat.map(i => i.price), [0, 27.5, 4.95, 1250.5], 'dates become 0, text prices are parsed');
  api(d, 'doctorReview', id, 'اعتمد', '', []);
  const rep = api(d, 'getDoctorReport', {});
  assert.equal(rep.summary.total, 2533.45, '27.5 + 4.95 + 2×1250.5 — no 1.7 trillion');
  assert.deepEqual(rep.badPrices, [{ item: 'Itero Sleeve', issue: 'date' }]);
  const st = api(q, 'getStatsReport', {});
  assert.equal(st.summary.value, 2533.45);
  assert.deepEqual(st.badPrices.map(b => b.item + ':' + b.issue).sort(), ['BAD:too_big', 'Itero Sleeve:date', 'TXT:text']);
});

test('doctor without an account: request can be dispatched without review', () => {
  const { api, login } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. نورة', type: 'طارئ', items: [{ name: 'DENTAL FLOSS', qty: 1 }] }).id;
  api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز');
  assert.deepEqual(api(p, 'bulkUpdateStatus', [id], 'تم الإرسال').updated, [id]);
  const det = api(n, 'getRequestDetail', id);
  assert.equal(det.status, 'تم الإرسال');
  assert.equal(det.kpi.unit, 'hours');
});

test('visibility: nurses and doctors only see their own requests', () => {
  const { api, login } = boot();
  const sara = login('سارة', '1111'), reem = login('ريم', '2222'), khaled = login('د. خالد', '4444');
  const id = api(sara, 'createRequest', { clinic: 'عيادة الجلدية 1', doctor: 'د. فهد', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 1 }] }).id;
  throwsCode(() => api(reem, 'getRequestDetail', id), 'ERR_FORBIDDEN');
  throwsCode(() => api(reem, 'addComment', id, 'hi'), 'ERR_FORBIDDEN');
  throwsCode(() => api(khaled, 'getRequestDetail', id), 'ERR_FORBIDDEN');
  assert.equal(api(reem, 'getMyRequests').length, 0);
  assert.equal(api(sara, 'getMyRequests').length, 1);
});

test('comments, item notes, complaints and notices', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), q = login('منى', '5555');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 1 }] }).id;
  const list = api(n, 'addComment', id, '<img src=x onerror=alert(1)>');
  assert.equal(list.length, 1);
  assert.equal(list[0].author, 'سارة');
  assert.equal(api(p, 'addComment', id, '   ').length, 1, 'blank comments ignored');
  api(p, 'addComment', id, '=HYPERLINK("http://evil","x")');
  const stored = gas.dump('Comments').map(r => r[4]);
  assert.ok(stored.some(v => v === '=HYPERLINK("http://evil","x")'));
  assert.ok(gas.forcedText.indexOf('=HYPERLINK("http://evil","x")') !== -1, 'formula forced to literal text');
  assert.equal(api(p, 'addItemNote', id, 'DENTAL FLOSS', 'غير متوفر').length, 1);
  assert.equal(api(n, 'getItemNotes', id, 'DENTAL FLOSS')[0].note, 'غير متوفر');

  throwsCode(() => api(n, 'addComplaint', id, 'تأخير', ''), 'ERR_REQUIRED');
  const c = api(n, 'addComplaint', id, 'تأخير', 'تأخر الطلب');
  assert.match(c.id, /^CMP-/);
  assert.ok(gas.mails.some(m => m.to.indexOf('mona@example.com') !== -1 && /بلاغ/.test(m.subject)));
  assert.equal(api(q, 'getComplaints', true).length, 1);
  throwsCode(() => api(p, 'resolveComplaint', c.id), 'ERR_FORBIDDEN'); // التموين لا يغلق البلاغات
  assert.equal(api(p, 'getComplaints', true).length, 1, 'procurement still sees the issue');
  api(q, 'resolveComplaint', c.id);
  assert.equal(api(q, 'getComplaints', true).length, 0);
  assert.equal(api(q, 'getComplaints', false)[0].resolvedBy, 'منى');

  throwsCode(() => api(n, 'addNotice', 'تموين', 'x'), 'ERR_FORBIDDEN');
  throwsCode(() => api(q, 'addNotice', 'مجهول', 'x'), 'ERR_BAD_TARGET');
  api(q, 'addNotice', 'تموين', 'للتموين فقط');
  api(q, 'addNotice', 'الكل', 'للجميع');
  assert.deepEqual(api(n, 'getNotices').map(x => x.message), ['للجميع']);
  assert.equal(api(p, 'getNotices').length, 2);
});

test('dashboard reports', () => {
  const { api, login } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), q = login('منى', '5555');
  const a = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. نورة', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 3 }] }).id;
  api(n, 'createRequest', { clinic: 'عيادة الجلدية 1', doctor: 'د. فهد', type: 'طارئ', items: [{ name: 'DENTAL FLOSS', qty: 2 }, { name: 'PROPHY PASTE', qty: 1 }] });
  api(p, 'bulkUpdateStatus', [a], 'قيد التجهيز');
  api(p, 'bulkUpdateStatus', [a], 'تم الإرسال');
  const s = api(q, 'getExecutiveStats', '');
  assert.equal(s.total, 2);
  assert.equal(s.typeCounts['طارئ'], 1);
  assert.equal(s.topItems[0].name, 'DENTAL FLOSS');
  assert.equal(s.topItems[0].qty, 5);
  const rep = api(q, 'getQualityReport', '');
  assert.equal(rep.rows.length, 1);
  assert.equal(rep.averages[0].clinic, 'عيادة الأسنان 1');
  const trend = api(q, 'getQualityTrend', 6);
  assert.equal(trend.length, 6);
  assert.equal(trend[5].count, 1);
  const month = trend[5].month;
  assert.equal(api(q, 'getExecutiveStats', month).total, 2);
  assert.equal(api(q, 'getExecutiveStats', '2001-01').total, 0);
});

test('admin: users & roles management with safety rails', () => {
  const { api, login, gas } = boot();
  const a = login('المدير', '1234');
  assert.ok(api(a, 'getUsers').every(u => u.password === undefined && u.Password === undefined));
  throwsCode(() => api(a, 'createUser', { name: 'سارة', password: '9999', role: 'ممرضة' }), 'ERR_USER_EXISTS');
  throwsCode(() => api(a, 'createUser', { name: 'جديد', password: '12', role: 'ممرضة' }), 'ERR_WEAK_PASSWORD');
  throwsCode(() => api(a, 'createUser', { name: 'جديد', password: '1234', role: 'غير موجود' }), 'ERR_ROLE_UNMAPPED');
  throwsCode(() => api(a, 'createUser', { name: 'جديد', password: '1234', role: 'ممرضة', email: 'bad' }), 'ERR_BAD_EMAIL');
  const users = api(a, 'createUser', { name: 'جديد', password: '1234', role: 'ممرضة', clinic: 'عيادة الأسنان 2' });
  assert.ok(users.some(u => u.name === 'جديد'));
  assert.match(rows(gas, 'Users').find(u => u.Name === 'جديد').Password, /^h1\$/);
  assert.equal(api(null, 'login', 'جديد', '1234').success, true);
  api(a, 'updateUser', 'جديد', { password: 'abcd', role: 'تموين', clinic: '', email: '' });
  assert.equal(api(null, 'login', 'جديد', 'abcd').user.screen, 'procurement');
  throwsCode(() => api(a, 'updateUser', 'المدير', { role: 'جودة' }), 'ERR_LAST_ADMIN');
  throwsCode(() => api(a, 'deleteUser', 'المدير'), 'ERR_DELETE_SELF');
  throwsCode(() => api(a, 'deleteRole', 'ممرضة'), 'ERR_ROLE_IN_USE');
  throwsCode(() => api(a, 'saveRole', 'أدمن', 'executive'), 'ERR_LAST_ADMIN');
  throwsCode(() => api(a, 'saveRole', 'مشرف', 'hacker'), 'ERR_BAD_SCREEN');
  assert.ok(api(a, 'saveRole', 'مشرف', 'dashboard').some(r => r.name === 'مشرف'));
  assert.ok(!api(a, 'deleteRole', 'مشرف').some(r => r.name === 'مشرف'));
  assert.ok(!api(a, 'deleteUser', 'جديد').some(u => u.name === 'جديد'));
});

test('doctors match clinics by name, list, specialty or branch; empty clinic = all clinics', () => {
  const { api, login } = boot(g => {
    g.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [
      ['Dental Clinic 8 - Buraydah', 'Buraydah', 'أسنان'], ['Derma Clinic 2 - Riyadh', 'Riyadh', 'Dermatology'], ['عيادة الأسنان 1', 'الرياض', 'أسنان']
    ]);
    g.seed('Doctors', ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty'], [
      ['Dr Exact', 'Dental Clinic 8 - Buraydah', '', ''],
      ['Dr BySpecialty', 'Dental', '', ''],
      ['Dr ArabicSpecialty', 'أسنان', '', ''],
      ['Dr Anywhere', '', '', ''],
      ['Dr List', 'Derma Clinic 2 - Riyadh, عيادة الأسنان 1', '', ''],
      ['Dr Branch', 'Buraydah', '', ''],
      ['Dr Derma', 'جلدية', '', '']
    ]);
    g.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email'], [['هيا', '1111', 'ممرضة', '', ''], ['المدير', '1234', 'تنفيذي', '', '']]);
  });
  const n = login('هيا', '1111');
  const names = c => api(n, 'getDoctors', c).map(d => d.name).sort();
  assert.deepEqual(names('Dental Clinic 8 - Buraydah'), ['Dr Anywhere', 'Dr ArabicSpecialty', 'Dr Branch', 'Dr BySpecialty', 'Dr Exact']);
  assert.deepEqual(names('Derma Clinic 2 - Riyadh'), ['Dr Anywhere', 'Dr Derma', 'Dr List']);
  assert.deepEqual(names('عيادة الأسنان 1'), ['Dr Anywhere', 'Dr ArabicSpecialty', 'Dr BySpecialty', 'Dr List']);
  assert.match(api(n, 'createRequest', { clinic: 'Dental Clinic 8 - Buraydah', doctor: 'Dr BySpecialty', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 1 }] }).id, /^REQ-/);
  throwsCode(() => api(n, 'createRequest', { clinic: 'Dental Clinic 8 - Buraydah', doctor: 'Dr Nobody', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 1 }] }), 'ERR_BAD_DOCTOR');
  const all = api(n, 'getDoctors', 'Dental Clinic 8 - Buraydah', { all: true });
  assert.ok(all.some(d => d.name === 'Dr Derma' && !d.here) && all.some(d => d.name === 'Dr Exact' && d.here), 'full list, with the clinic doctors flagged');
});

test('same clinic name in two branches (Sterilization): each request keeps its branch and reports split them', () => {
  const { api, login } = boot(g => {
    g.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email'], [['هند', '1111', 'ممرضة', 'Sterilization', ''], ['المدير', '1234', 'أدمن', '', '']]);
  });
  const n = login('هند', '1111'), a = login('المدير', '1234');
  const cfg = api(n, 'getConfig');
  assert.deepEqual(cfg.clinics.filter(c => c.name === 'Sterilization').map(c => c.branch), ['الرياض', 'جدة']);
  const mk = branch => api(n, 'createRequest', { clinic: 'Sterilization', branch: branch, type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 2 }] }).id;
  const r1 = mk('الرياض'), r2 = mk('جدة');
  assert.equal(api(a, 'getRequestDetail', r1).branch, 'الرياض');
  assert.equal(api(a, 'getRequestDetail', r2).branch, 'جدة');
  const names = api(a, 'getStatsReport', {}).clinics.map(c => c.name);
  assert.ok(names.includes('Sterilization — الرياض') && names.includes('Sterilization — جدة'), names.join(','));
});

test('backup: full copy of the spreadsheet into its own Drive folder, keeps the latest 30, admin only', () => {
  const { api, login, gas, ctx } = boot();
  const a = login('المدير', '1234'), n = login('سارة', '1111');
  assert.equal(api(a, 'getBackupStatus').last, null);
  throwsCode(() => api(n, 'backupNow'), 'ERR_FORBIDDEN');
  let st;
  for (let i = 0; i < 32; i++) st = api(a, 'backupNow');
  const folder = gas.globals.DriveApp.createFolder._folder;
  assert.equal(folder.copies.length, 32);
  assert.equal(folder.copies.filter(c => !c.trashed).length, 30, 'older copies go to the Drive trash');
  assert.ok(folder.copies[0].trashed && folder.copies[1].trashed && !folder.copies[31].trashed, 'the oldest are removed first');
  assert.match(st.last.name, /^مسار — نسخة \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(st.last.by, 'المدير');
  assert.equal(st.folderUrl, 'https://drive.google.com/drive/folders/folder1');
  ctx.dailyBackup();
  assert.equal(api(a, 'getBackupStatus').last.by, 'النظام (تلقائي)');
  assert.ok(rows(gas, 'Log').some(r => String(r.Action).indexOf('نسخة احتياطية') === 0), 'logged');
});

test('auto setup: the clinic sheet (Buraydah/Unayzah) becomes the approved 28 clinics on first run, references fixed, backup taken, runs once', () => {
  const sheetNow = [];
  for (let i = 1; i <= 8; i++) sheetNow.push(['Dental Clinic ' + i + ' - Buraydah', 'Buraydah', 'Dentistry']);
  for (let i = 1; i <= 4; i++) sheetNow.push(['Dental Clinic ' + i + ' - Unayzah', 'Unayzah', 'Dentistry']);
  for (let i = 1; i <= 3; i++) sheetNow.push(['Dermatology Clinic ' + i + ' - Buraydah', 'Buraydah', 'Dermatology']);
  sheetNow.push(['Dermatology Clinic 1 - Unayzah', 'Unayzah', 'Dermatology'], ['Dermatology Clinic 2 - Unayzah', 'Unayzah', 'Dermatology'],
    ['Steralization- Buraydah', 'Buraydah', 'Steralization'], ['Steralization- Unayzah', 'Unayzah', 'Steralization']);
  const { api, login, gas } = boot(g => {
    g.seed('Clinics', ['ClinicName', 'Branch', 'Type'], sheetNow);
    g.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email'], [
      ['هند', '1111', 'ممرضة', 'Steralization- Buraydah', ''], ['نورة', '1111', 'ممرضة', 'Dental Clinic 8 - Buraydah, Dermatology Clinic 1 - Buraydah', ''],
      ['المدير', '1234', 'أدمن', '', '']]);
  });
  const a = login('المدير', '1234');
  const cl = rows(gas, 'Clinics').filter(r => r.ClinicName);
  assert.equal(cl.length, 30, '28 clinics (10 dental in Unayzah) + a triage room per branch');
  assert.deepEqual(cl.filter(r => r.Branch === 'Unayzah').map(r => r.ClinicName),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => 'Dental Clinic ' + i + ' - Unayzah').concat(['Sterilization - Unayzah', 'Triage Room - Unayzah']));
  assert.deepEqual(cl.filter(r => r.Type === 'Dermatology').map(r => r.ClinicName), ['Derma Hydrafacial', 'Derma Clarity', 'Derma Gentle Pro', 'Derma CLINIC']);
  assert.equal(cl.filter(r => r.Branch === 'Buraydah' && r.Type === 'Dentistry').length, 12);
  assert.equal(api(a, 'getConfig').clinics.length, 30, 'the app sees the new list right away');
  const users = Object.fromEntries(rows(gas, 'Users').map(u => [u.Name, u.Clinic]));
  assert.equal(users['هند'], 'Sterilization - Buraydah', 'typo in the user clinic fixed');
  assert.equal(users['نورة'], 'Dental Clinic 8 - Buraydah, Dermatology Clinic 1 - Buraydah', 'unknown old names are left and reported');
  assert.ok(rows(gas, 'Log').some(r => /28 عيادة/.test(r.Action) && /Dermatology Clinic 1 - Buraydah/.test(r.Action)), 'change + names needing attention are logged');
  assert.equal(gas.globals.DriveApp.createFolder._folder.copies.length, 1, 'a backup was taken before changing the sheet');
  assert.ok(rows(gas, 'Settings').some(r => r.Key === 'LabTurnaroundDays') && rows(gas, 'LabMaterials').length === 8, 'lab settings seeded automatically');
  const demo = rows(gas, 'ItemsCatalog').filter(r => /TEST101$/.test(r.ItemName));
  assert.equal(demo.length, 8, 'demo custody tools added');
  assert.ok(demo.every(r => r.Ownership === 'عهدة' && Number(r.Price) > 0));
  assert.deepEqual(demo.filter(r => r.Serialized === 'نعم').map(r => r.ItemName).slice(0, 2), ['Handpiece Low Speed TEST101', 'Handpiece High Speed TEST101']);
  assert.ok(api(a, 'getAssetConfig').items.some(i => i.name === 'Handpiece Low Speed TEST101' && i.serialized), 'they show up as custody tools');
  gas.ss.getSheetByName('Clinics').getRange(2, 1).setValue('Dental Clinic 1 - Buraydah (renamed)');
  api(login('المدير', '1234'), 'getConfig');
  assert.equal(rows(gas, 'Clinics')[0].ClinicName, 'Dental Clinic 1 - Buraydah (renamed)', 'runs once only — later manual edits in the sheet are kept');
  assert.equal(gas.globals.DriveApp.createFolder._folder.copies.length, 1);
});

test('custody: standard per clinic, issue with serial numbers, nurse report with photo, procurement inspect → repair/return or damaged → replacement; finance sees cost', () => {
  const { api, login, gas } = boot(g => {
    g.seed('ItemsCatalog', ['ItemName', 'CommercialName', 'Category', 'Price', 'Ownership', 'Serialized'], [
      ['DENTAL FLOSS', 'Oral-B', 'Hygiene', 12.5, '', ''],
      ['Handpiece Low Speed', 'NSK', 'Handpiece', 1500, 'عهدة', 'نعم'],
      ['Handpiece High Speed', 'NSK', 'Handpiece', 2200, 'عهدة', 'نعم'],
      ['Curing Light', 'Woodpecker', 'Equipment', 800, 'عهدة', '']
    ]);
  });
  const n = login('سارة', '1111'), p = login('علي', '3333'), a = login('المدير', '1234'), f = login('نواف', '7777');
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const cfg = api(n, 'getAssetConfig');
  assert.deepEqual(cfg.items.map(i => [i.name, i.serialized]), [['Handpiece Low Speed', true], ['Handpiece High Speed', true], ['Curing Light', false]]);
  assert.deepEqual(cfg.clinics.sort(), ['عيادة الأسنان 1', 'عيادة الجلدية 1'].sort(), 'nurse sees her clinics only');
  // المعيار (التموين/الأدمن فقط)
  throwsCode(() => api(n, 'setClinicStandard', 'عيادة الأسنان 1', 'Handpiece Low Speed', 5), 'ERR_FORBIDDEN');
  throwsCode(() => api(p, 'setClinicStandard', 'عيادة الأسنان 1', 'DENTAL FLOSS', 5), 'ERR_NOT_ASSET');
  api(p, 'setClinicStandard', 'عيادة الأسنان 1', 'Handpiece Low Speed', 5);
  api(a, 'setClinicStandard', 'عيادة الأسنان 1', 'Curing Light', 1);
  // الصرف بالأرقام التسلسلية
  throwsCode(() => api(p, 'issueAssets', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', qty: 5 }), 'ERR_SERIAL_REQUIRED');
  throwsCode(() => api(p, 'issueAssets', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', serials: ['A1', 'A1'] }), 'ERR_SERIAL_DUP');
  const iss = api(p, 'issueAssets', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', serials: ['LS-001', 'LS-002', 'LS-003', 'LS-004'] });
  assert.equal(iss.ids.length, 4);
  throwsCode(() => api(p, 'issueAssets', { clinic: 'عيادة الجلدية 1', item: 'Handpiece Low Speed', serials: ['LS-002'] }), 'ERR_SERIAL_EXISTS:LS-002');
  api(p, 'issueAssets', { clinic: 'عيادة الأسنان 1', item: 'Curing Light', qty: 2, cost: 750 });
  let ca = api(n, 'getClinicAssets', { clinic: 'عيادة الأسنان 1' })[0];
  const ls = ca.items.find(i => i.item === 'Handpiece Low Speed');
  assert.deepEqual([ls.standard, ls.inClinic, ls.shortage], [5, 4, 1], 'standard vs actual: 1 short');
  assert.deepEqual(ls.assets.map(x => x.serial), ['LS-001', 'LS-002', 'LS-003', 'LS-004']);
  // تصحيح عهدة صُرفت بالغلط: تعديل الرقم/الكمية/العيادة ثم حذفها (التموين فقط)
  const wrong = api(p, 'issueAssets', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', serials: ['LS-09X'] }).ids[0];
  throwsCode(() => api(n, 'updateAsset', wrong, { serial: 'LS-090' }), 'ERR_FORBIDDEN');
  throwsCode(() => api(p, 'updateAsset', wrong, { serial: 'LS-001' }), 'ERR_SERIAL_EXISTS:LS-001');
  throwsCode(() => api(p, 'updateAsset', wrong, { serial: '' }), 'ERR_SERIAL_REQUIRED');
  let ed = api(p, 'updateAsset', wrong, { serial: 'LS-090', clinic: 'عيادة الجلدية 1', cost: 999, notes: 'تصحيح' });
  assert.deepEqual(ed.clinics.map(c => c.clinic).sort(), ['عيادة الأسنان 1', 'عيادة الجلدية 1'].sort(), 'both clinics refreshed on move');
  const moved = ed.clinics.find(c => c.clinic === 'عيادة الجلدية 1').items.find(i => i.item === 'Handpiece Low Speed').assets[0];
  assert.deepEqual([moved.id, moved.serial, moved.cost, moved.notes], [wrong, 'LS-090', 999, 'تصحيح']);
  assert.ok(rows(gas, 'Log').some(r => /تعديل عهدة/.test(r.Action) && /LS-09X ← LS-090/.test(r.Action)), 'edit is logged with old → new');
  throwsCode(() => api(n, 'deleteAsset', wrong), 'ERR_FORBIDDEN');
  ed = api(p, 'deleteAsset', wrong);
  assert.ok(!ed.clinics[0].items.some(i => i.assets.some(x => x.id === wrong)), 'deleted');
  throwsCode(() => api(p, 'deleteAsset', wrong), 'ERR_NOT_FOUND');
  const clId = api(p, 'getClinicAssets', { clinic: 'عيادة الأسنان 1' })[0].items.find(i => i.item === 'Curing Light').assets[0].id;
  throwsCode(() => api(p, 'updateAsset', clId, { qty: 0 }), 'ERR_BAD_QTY');
  api(p, 'updateAsset', clId, { qty: 3 });
  api(p, 'updateAsset', clId, { qty: 2 });
  // بلاغ الممرضة
  const lsAsset = ls.assets.find(x => x.serial === 'LS-002');
  throwsCode(() => api(n, 'reportAsset', { assetId: lsAsset.id, problem: 'خربانة' }), 'ERR_PHOTO_REQUIRED');
  throwsCode(() => api(login('ريم', '2222'), 'reportAsset', { assetId: lsAsset.id, problem: 'خربانة', photo: PNG }), 'ERR_FORBIDDEN');
  gas.mails.length = 0;
  const t1 = api(n, 'reportAsset', { assetId: lsAsset.id, problem: 'خربانة', description: 'صوت عالي ويسخن', photo: PNG, clientKey: 'asset-report-001' });
  assert.match(t1.id, /^TKT-\d{6}-001$/);
  assert.equal(api(n, 'reportAsset', { assetId: lsAsset.id, problem: 'خربانة', photo: PNG, clientKey: 'asset-report-001' }).id, t1.id, 'no duplicate on resend');
  assert.ok(gas.mails.some(m => m.to.includes('ali@example.com') && /بلاغ أداة/.test(m.subject) && /LS-002/.test(m.body)), 'procurement notified with the serial');
  throwsCode(() => api(n, 'reportAsset', { assetId: lsAsset.id, problem: 'خربانة', photo: PNG }), 'ERR_ASSET_BUSY');
  throwsCode(() => api(p, 'deleteAsset', lsAsset.id), 'ERR_ASSET_OPEN_TICKET');
  throwsCode(() => api(p, 'updateAsset', lsAsset.id, { clinic: 'عيادة الجلدية 1' }), 'ERR_ASSET_OPEN_TICKET');
  ca = api(n, 'getClinicAssets', { clinic: 'عيادة الأسنان 1' })[0];
  assert.deepEqual((x => [x.inClinic, x.away, x.shortage])(ca.items.find(i => i.item === 'Handpiece Low Speed')), [3, 1, 2], 'sent tool leaves the clinic count');
  assert.ok(api(p, 'getAlerts').some(al => al.code === 'alert_asset_new'));
  // أداة بكمية بدون رقم تسلسلي: قطعة تُفصل
  const cl = ca.items.find(i => i.item === 'Curing Light').assets[0];
  const t2 = api(n, 'reportAsset', { assetId: cl.id, problem: 'كفاءتها متدنية', description: 'الضوء ضعيف' });
  ca = api(n, 'getClinicAssets', { clinic: 'عيادة الأسنان 1' })[0];
  assert.deepEqual((x => [x.inClinic, x.away])(ca.items.find(i => i.item === 'Curing Light')), [1, 1]);
  // التموين: استلام بصورة الحالة ← قابلة للتصليح ← رجعت
  throwsCode(() => api(p, 'updateAssetTicket', t1.id, 'receive', {}), 'ERR_PHOTO_REQUIRED');
  throwsCode(() => api(p, 'updateAssetTicket', t1.id, 'repair', {}), 'ERR_BAD_TRANSITION');
  let tk = api(p, 'updateAssetTicket', t1.id, 'receive', { photo: PNG, note: 'التوربين تالف' });
  assert.deepEqual([tk.status, !!tk.inspectPhoto, tk.inspectNote], ['استلمها التموين', true, 'التوربين تالف']);
  tk = api(p, 'updateAssetTicket', t1.id, 'repair', { vendor: 'وكيل NSK', cost: 350 });
  assert.deepEqual([tk.status, tk.decision, tk.repairCost], ['قيد الصيانة', 'قابلة للتصليح', 350]);
  tk = api(p, 'updateAssetTicket', t1.id, 'return', { cost: 400 });
  assert.equal(tk.status, 'رجعت للعيادة');
  ca = api(n, 'getClinicAssets', { clinic: 'عيادة الأسنان 1' })[0];
  assert.equal(ca.items.find(i => i.item === 'Handpiece Low Speed').inClinic, 4, 'repaired tool is back in the clinic');
  // تالفة ← بديل يدوي برقم تسلسلي جديد
  const t3 = api(n, 'reportAsset', { assetId: lsAsset.id, problem: 'خربانة', photo: PNG });
  api(p, 'updateAssetTicket', t3.id, 'receive', { photo: PNG });
  tk = api(p, 'updateAssetTicket', t3.id, 'damaged', {});
  assert.deepEqual([tk.status, tk.lossValue], ['تالفة', 1500], 'loss = the tool cost');
  api(p, 'issueAssets', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', serials: ['LS-002'], ticketId: t3.id });
  assert.equal(api(p, 'getAssetTicket', t3.id).replacement.split(',').length, 1, 'replacement linked to the ticket');
  throwsCode(() => api(p, 'issueAssets', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', serials: ['LS-009'], ticketId: t3.id }), 'ERR_BAD_TRANSITION');
  // سجل الرقم التسلسلي: بلاغان على القطعة القديمة
  const found = api(p, 'findAsset', 'LS-002');
  assert.equal(found.length, 2, 'old damaged + new replacement share the serial');
  assert.equal(found.find(x => x.status === 'تالفة').tickets.length, 2);
  // المالية: ترى وتعدّل التكلفة؛ الممرضة لا
  throwsCode(() => api(n, 'setAssetTicketCost', t1.id, { repairCost: 1 }), 'ERR_FORBIDDEN');
  api(f, 'setAssetTicketCost', t1.id, { repairCost: 420 });
  const st = api(f, 'getAssetStats', {});
  assert.deepEqual([st.summary.tickets, st.summary.open, st.summary.damaged, st.summary.repairCost, st.summary.lossValue, st.summary.total], [3, 1, 1, 420, 1500, 1920]);
  assert.equal(st.byClinic[0].name, 'عيادة الأسنان 1');
  assert.deepEqual(st.serials.map(x => [x.serial, x.count]), [['LS-002', 2]], 'repeatedly failing serial');
  assert.ok(st.shortages.some(x => x.item === 'Curing Light' && x.shortage === 0) === false);
  assert.ok(api(login('منى', '5555'), 'getAssetStats', {}).summary, 'quality sees it');
  throwsCode(() => api(n, 'getAssetStats', {}), 'ERR_FORBIDDEN');
  // الطبيب يطّلع على عهدة عيادته فقط
  const d = login('د. خالد', '4444');
  assert.deepEqual(api(d, 'getClinicAssets', {}).map(c => c.clinic), ['عيادة الأسنان 1']);
  throwsCode(() => api(d, 'reportAsset', { assetId: cl.id, problem: 'أخرى', description: 'x' }), 'ERR_FORBIDDEN');
  // أصناف العهدة لا تُحسب على الطبيب
  const req = api(n, 'createRequest', { doctor: 'د. خالد', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 2 }, { name: 'Curing Light', qty: 1 }] });
  const rep = api(a, 'getDoctorReport', { doctor: 'د. خالد' });
  const row = rep.rows.find(r => r.id === req.id);
  assert.deepEqual(row.items.map(i => [i.item, i.total, i.company]), [['DENTAL FLOSS', 25, false], ['Curing Light', 0, true]]);
  assert.ok(t2.id);
});

test('nudge goes to whoever the request is waiting on: doctor → doctor, receipt → the nurse, prep → procurement', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444'), q = login('منى', '5555');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 2 }] }).id;
  gas.mails.length = 0;
  assert.equal(api(q, 'nudgeProcurement', id, '').owner, 'doctor');
  assert.deepEqual(gas.mails.map(m => m.to), ['khaled@example.com'], 'waiting on the doctor → only the doctor');
  api(d, 'doctorReview', id, 'اعتمد', '', []);
  gas.mails.length = 0;
  assert.equal(api(q, 'nudgeProcurement', id, '').owner, 'procurement');
  assert.ok(gas.mails.every(m => m.to.includes('ali@example.com')) && gas.mails.length === 1, 'prep → procurement');
  api(p, 'dispatchItems', id, ['PROPHY PASTE']);
  gas.mails.length = 0;
  const res = api(q, 'nudgeProcurement', id, 'أكّدي الاستلام');
  assert.equal(res.owner, 'nurse');
  assert.deepEqual(gas.mails.map(m => m.to), ['sara@example.com'], 'awaiting clinic receipt → the nurse, not procurement');
  assert.ok(res.comments.some(c => /التمريض/.test(c.message) && /أكّدي/.test(c.message)));
});

test('setup steps are independent: one failing step does not block the TEST101 tools; admin sees why and can re-run', () => {
  const { api, login, gas, ctx } = boot(g => {
    g.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [['Dental Clinic 1 - Buraydah', 'Buraydah', 'Dentistry']]);
  });
  const realMigrate = ctx.migrateClinics_;
  ctx.migrateClinics_ = () => { throw new Error('ERR_CONFLICT'); };
  const a = login('المدير', '1234');
  assert.equal(rows(gas, 'ItemsCatalog').filter(r => /TEST101$/.test(r.ItemName)).length, 8, 'demo tools added even though the clinics step failed');
  let st = api(a, 'getSetupStatus');
  assert.equal(st.done, false);
  assert.deepEqual(st.last.log.filter(x => !x.ok).map(x => [x.step, x.error]), [['clinics', 'ERR_CONFLICT']]);
  assert.equal(st.demoTools, 8);
  throwsCode(() => api(login('سارة', '1111'), 'runSetupNow'), 'ERR_FORBIDDEN');
  ctx.migrateClinics_ = realMigrate;
  st = api(a, 'runSetupNow');
  assert.equal(st.done, true);
  assert.ok(st.last.ok);
  assert.equal(rows(gas, 'ItemsCatalog').filter(r => /TEST101$/.test(r.ItemName)).length, 8, 're-running does not duplicate');
});

test('item statuses inside a request + undo a wrong shipment / status step with a reason, logged for quality', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444'), q = login('منى', '5555');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 3 }, { name: 'DENTAL FLOSS', qty: 3 }, { name: 'MICRO BRUSH FINE', qty: 3 }] }).id;
  throwsCode(() => api(p, 'setItemsStatus', id, ['PROPHY PASTE'], 'قيد التجهيز'), 'ERR_NEEDS_APPROVAL');
  api(d, 'doctorReview', id, 'اعتمد', '', []);
  // حالة كل صنف
  let full = api(p, 'setItemsStatus', id, ['PROPHY PASTE', 'DENTAL FLOSS'], 'قيد التجهيز');
  assert.equal(full.request.status, 'قيد التجهيز', 'working on items starts the request prep');
  full = api(p, 'setItemsStatus', id, ['DENTAL FLOSS'], 'بانتظار المندوب');
  full = api(p, 'setItemsStatus', id, ['DENTAL FLOSS'], 'استلم المندوب');
  assert.deepEqual(full.items.map(i => [i.item, i.itemStatus]), [['PROPHY PASTE', 'قيد التجهيز'], ['DENTAL FLOSS', 'استلم المندوب'], ['MICRO BRUSH FINE', '']]);
  throwsCode(() => api(p, 'setItemsStatus', id, ['DENTAL FLOSS'], 'قيد التجهيز'), 'ERR_REASON_REQUIRED');
  api(p, 'setItemsStatus', id, ['DENTAL FLOSS'], 'بانتظار المندوب', 'المندوب أرجعها ناقصة');
  const nurseItems = api(n, 'getRequestDetail', id).items;
  assert.equal(nurseItems.find(i => i.item === 'DENTAL FLOSS').itemStatus, 'بانتظار المندوب', 'the nurse sees each item status');
  // شحنة أُرسلت بالغلط ← تراجع مع السبب
  api(p, 'dispatchItems', id, ['PROPHY PASTE', 'DENTAL FLOSS', 'MICRO BRUSH FINE']);
  assert.equal(api(n, 'getRequestDetail', id).status, 'تم الإرسال');
  throwsCode(() => api(p, 'setItemsStatus', id, ['PROPHY PASTE'], 'قيد التجهيز'), 'ERR_NEEDS_APPROVAL');
  const plan = api(p, 'getRevertPlan', id);
  assert.deepEqual([plan.can, plan.kind, plan.batch, plan.status, plan.to], [true, 'shipment', 1, 'تم الإرسال', 'قيد التجهيز']);
  throwsCode(() => api(p, 'revertStep', id, ''), 'ERR_REASON_REQUIRED');
  throwsCode(() => api(n, 'revertStep', id, 'سبب'), 'ERR_FORBIDDEN');
  gas.mails.length = 0;
  const rv = api(p, 'revertStep', id, 'أُرسلت بالغلط لفرع آخر', { kind: 'shipment', batch: 1, status: 'تم الإرسال' });
  assert.equal(rv.request.request.status, 'قيد التجهيز', 'status back to the previous step');
  assert.ok(rv.request.items.every(i => i.sentQty === 0 && i.remainingQty === 3), 'the shipment is gone, everything is open again');
  assert.equal(rv.request.shipments.length, 0);
  assert.ok(gas.mails.some(m => m.to === 'sara@example.com' && /إلغاء شحنة/.test(m.subject) && /بالغلط/.test(m.body)), 'nurse told not to confirm it');
  // تراجع الحالة خطوة: قيد التجهيز ← معتمد من الطبيب
  assert.equal(api(p, 'getRevertPlan', id).kind, 'status');
  throwsCode(() => api(p, 'revertStep', id, 'سبب كافي', { kind: 'shipment', batch: 1, status: 'تم الإرسال' }), 'ERR_CONFLICT');
  api(p, 'revertStep', id, 'بدأنا التجهيز قبل الوقت');
  assert.equal(api(n, 'getRequestDetail', id).status, 'معتمد من الطبيب');
  assert.equal(api(p, 'getRevertPlan', id).can, false);
  throwsCode(() => api(p, 'revertStep', id, 'سبب'), 'ERR_NOTHING_TO_REVERT');
  // السجل: الجودة ترى كل التراجعات مع الوقت والسبب، والتفاصيل تعرضها
  const log = api(q, 'getReversals', {});
  assert.deepEqual(log.map(x => x.scope), ['حالة الطلب', 'إلغاء شحنة أُرسلت', 'حالة صنف: DENTAL FLOSS']);
  assert.ok(log.every(x => x.reason && x.time && x.user === 'علي'));
  assert.equal(api(n, 'getRequestDetail', id).reversals.length, 3);
  throwsCode(() => api(n, 'getReversals', {}), 'ERR_FORBIDDEN');
  // الشحنة المستلمة بالتوقيع لا يُتراجع عنها
  api(p, 'dispatchItems', id, ['PROPHY PASTE']);
  api(n, 'receiveShipment', id, 1, [{ item: 'PROPHY PASTE', qty: 3 }], 'سارة', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', '', '');
  assert.equal(api(p, 'getRevertPlan', id).reason, 'ERR_SHIPMENT_RECEIVED');
});

test('departments: dental/derma consumables, requests take the clinic department, dental and derma procurement each see their own', () => {
  const { api, login, gas } = boot(g => {
    g.seed('ItemsCatalog', ['ItemName', 'CommercialName', 'Category', 'Price', 'Department'], [
      ['DENTAL FLOSS', 'Oral-B', 'Hygiene', 12.5, 'أسنان'], ['PROPHY PASTE', 'Nupro', 'Hygiene', 60, 'Dental'],
      ['Botox Needle', '', 'Derma', 7.7, 'جلدية'], ['FACE MASK BRUSH', '', 'Derma', 60.5, 'Dermatology'],
      ['قفازات طبية M', '', 'Protection', 25, '']
    ]);
    g.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [['عيادة الأسنان 1', 'الرياض', 'أسنان'], ['عيادة الجلدية 1', 'الرياض', 'جلدية'], ['Sterilization', 'الرياض', 'Sterilization']]);
  });
  const n = login('سارة', '1111'), a = login('المدير', '1234');
  const cat = api(n, 'getConfig').catalog;
  assert.deepEqual(cat.map(c => [c.name, c.dept || '']), [['DENTAL FLOSS', 'أسنان'], ['PROPHY PASTE', 'أسنان'], ['Botox Needle', 'جلدية'], ['FACE MASK BRUSH', 'جلدية'], ['قفازات طبية M', '']]);
  throwsCode(() => api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'Botox Needle', qty: 1 }] }), 'ERR_ITEM_DEPT');
  const dental = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 2 }, { name: 'قفازات طبية M', qty: 1 }] }).id;
  const derma = api(n, 'createRequest', { clinic: 'عيادة الجلدية 1', doctor: 'د. نورة', type: 'شهري', items: [{ name: 'Botox Needle', qty: 5 }] }).id;
  const steril = api(n, 'createRequest', { clinic: 'Sterilization', type: 'شهري', items: [{ name: 'قفازات طبية M', qty: 3 }, { name: 'DENTAL FLOSS', qty: 1 }] }).id;
  assert.deepEqual(rows(gas, 'Requests').filter(r => [dental, derma, steril].includes(r.RequestID)).map(r => r.Department), ['أسنان', 'جلدية', '']);
  // حسابات تموين مقسمة
  api(a, 'createUser', { name: 'تموين أسنان', password: '1111', role: 'تموين', email: 'pd@example.com', department: 'أسنان' });
  api(a, 'createUser', { name: 'تموين جلدية', password: '1111', role: 'تموين', email: 'pk@example.com', department: 'جلدية' });
  assert.equal(api(a, 'getUsers').find(u => u.name === 'تموين جلدية').department, 'جلدية');
  const pd = login('تموين أسنان', '1111'), pk = login('تموين جلدية', '1111'), all = login('علي', '3333');
  const ids = t => (api(t, 'getRequests', {}).rows || api(t, 'getRequests', {})).map(r => r.id);
  assert.ok(ids(pd).includes(dental) && !ids(pd).includes(derma) && ids(pd).includes(steril), 'dental procurement: dental + shared');
  assert.ok(ids(pk).includes(derma) && !ids(pk).includes(dental) && ids(pk).includes(steril), 'derma procurement: derma + shared');
  assert.ok(ids(all).includes(dental) && ids(all).includes(derma), 'procurement without a department sees everything');
  assert.equal(api(pk, 'getConfig').user.department, 'جلدية');
  // الإيميل يصل لتموين القسم فقط (والعام)
  gas.mails.length = 0;
  api(n, 'createRequest', { clinic: 'عيادة الجلدية 1', doctor: 'د. نورة', type: 'طارئ', items: [{ name: 'FACE MASK BRUSH', qty: 1 }] });
  const to = gas.mails.map(m => m.to).join(',');
  assert.ok(to.includes('pk@example.com') && to.includes('ali@example.com') && !to.includes('pd@example.com'), to);
  // تعديل القسم ينعكس فوراً
  api(a, 'updateUser', 'تموين أسنان', { role: 'تموين', email: 'pd@example.com', department: 'جلدية' });
  assert.ok(ids(pd).includes(derma));
});

test('custody report works before the clinic inventory is registered: the unit is registered automatically with the ticket', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333');
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  throwsCode(() => api(n, 'reportAsset', { clinic: 'عيادة الأسنان 1', item: 'DENTAL FLOSS', problem: 'أخرى', description: 'x' }), 'ERR_NOT_ASSET');
  throwsCode(() => api(n, 'reportAsset', { clinic: 'عيادة الأسنان 2', item: 'Curing Light', problem: 'خربانة', photo: PNG }), 'ERR_FORBIDDEN');
  const t1 = api(n, 'reportAsset', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', serial: 'NEW-77', problem: 'خربانة', photo: PNG });
  const t2 = api(n, 'reportAsset', { clinic: 'عيادة الأسنان 1', item: 'Curing Light', problem: 'كفاءتها متدنية', description: 'ضعيف' });
  const assets = rows(gas, 'Assets');
  assert.deepEqual(assets.map(a => [a.Item, a.Serial, a.Status, a.Notes]), [['Handpiece Low Speed', 'NEW-77', 'مُرسلة للتموين', 'سُجّلت تلقائياً مع بلاغ'], ['Curing Light', '', 'مُرسلة للتموين', 'سُجّلت تلقائياً مع بلاغ']]);
  assert.deepEqual(api(p, 'getAssetTickets', {}).map(t => [t.id, t.serial]).sort(), [[t1.id, 'NEW-77'], [t2.id, '']].sort());
  // نفس الرقم وهو عليه بلاغ مفتوح → مرفوض
  throwsCode(() => api(n, 'reportAsset', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', serial: 'new-77', problem: 'خربانة', photo: PNG }), 'ERR_SERIAL_EXISTS');
  // القطعة المسجلة تُستخدم بدل إنشاء جديدة
  api(p, 'issueAssets', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', serials: ['REG-1'] });
  api(n, 'reportAsset', { clinic: 'عيادة الأسنان 1', item: 'Handpiece Low Speed', serial: 'REG-1', problem: 'كفاءتها متدنية', description: 'بطيء' });
  assert.equal(rows(gas, 'Assets').filter(a => a.Serial === 'REG-1').length, 1);
});

test('batch runs several reads in one execution with per-call errors, and rejects writes', () => {
  const { api, login } = boot();
  const n = login('سارة', '1111');
  const res = api(n, 'batch', [['getConfig', []], ['getMyRequests', []], ['getUsers', []], ['createRequest', [{}]], ['nope', []]]);
  assert.equal(res.length, 5);
  assert.equal(res[0].ok, true);
  assert.ok(Array.isArray(res[1].data));
  assert.deepEqual([res[2].ok, res[2].error.indexOf('ERR_FORBIDDEN') !== -1], [false, true]);
  assert.match(res[3].error, /ERR_UNKNOWN_FN/, 'writes are not allowed in a batch');
  assert.match(res[4].error, /ERR_UNKNOWN_FN/);
  throwsCode(() => api('bad', 'batch', [['getConfig', []]]), 'ERR_SESSION');
  assert.equal(api('', 'ping'), true, 'ping wakes the server without a session and returns no data');
  throwsCode(() => api(n, 'batch', []), 'ERR_BAD_BATCH');
});

test('doctor account with a short name sees and reviews requests for the full doctor name', () => {
  const { api, login, gas } = boot(g => {
    g.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [['Dental Clinic 8 - Buraydah', 'Buraydah', 'Dental']]);
    g.seed('Doctors', ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty'], [
      ['Dr. Sami Al-Duwaihi', 'Dental Clinic 8 - Buraydah', '', ''],
      ['Dr. Turki Al-Mutairi', 'Dental Clinic 8 - Buraydah', '', ''],
      ['Dr. Fahad Al-Harbi', 'Dental Clinic 8 - Buraydah', '', ''],
      ['Dr. Fahad Al-Qahtani', 'Dental Clinic 8 - Buraydah', '', '']
    ]);
    g.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email'], [
      ['Abhie', '1', 'ممرضة', '', ''], ['ahmed', '2', 'تموين', '', ''],
      ['Dr.Sami', '3', 'طبيب', '', 'sami@example.com'],
      ['د. تركي', '4', 'طبيب', '', ''],          // لا يطابق أي اسم → لا ربط
      ['Dr.Fahad', '5', 'طبيب', '', ''],          // يطابق طبيبين → لا تخمين
      ['المدير', '1234', 'تنفيذي', '', '']
    ]);
  });
  const n = login('Abhie', '1'), p = login('ahmed', '2'), sami = login('Dr.Sami', '3'), fahad = login('Dr.Fahad', '5');
  const mk = doc => api(n, 'createRequest', { clinic: 'Dental Clinic 8 - Buraydah', doctor: doc, type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 1 }] }).id;
  const a = mk('Dr. Sami Al-Duwaihi'), b = mk('Dr. Turki Al-Mutairi'), c = mk('Dr. Fahad Al-Harbi');
  assert.ok(gas.mails.some(m => m.to === 'sami@example.com' && /بانتظار مراجعتك/.test(m.subject)), 'review email reaches the linked account on submission');
  assert.deepEqual(api(sami, 'getDoctorRequests').map(r => r.id), [a]);
  assert.equal(api(sami, 'getAlerts')[0].n, 1);
  api(sami, 'doctorReview', a, 'اعتمد', '', []);
  assert.equal(api(sami, 'getRequestDetail', a).status, 'معتمد من الطبيب');
  throwsCode(() => api(sami, 'getRequestDetail', b), 'ERR_FORBIDDEN');
  assert.equal(api(fahad, 'getDoctorRequests').length, 0, 'ambiguous short name is not guessed');
  const list = api(p, 'getRequests', {});
  assert.equal(list.find(r => r.id === a).needsReview, true);
  assert.equal(list.find(r => r.id === b).needsReview, false, 'no linked account → can dispatch without review');
});

test('doGet renders the Index template and include_ is not exposed to the browser', () => {
  const { ctx, api } = boot();
  assert.ok(ctx.doGet());
  assert.equal(ctx.include_('JavaScript'), '<!-- JavaScript -->');
  throwsCode(() => api(null, 'include_', 'Code'), 'ERR_UNKNOWN_FN');
});

test('doPost returns JSON envelope for external hosting', () => {
  const { ctx } = boot();
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ fn: 'login', args: ['سارة', '1111'] }) } });
  const body = JSON.parse(out.getContent());
  assert.equal(body.ok, true);
  assert.equal(body.data.success, true);
  const bad = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ token: 'x', fn: 'getConfig' }) } }).getContent());
  assert.equal(bad.ok, false);
  assert.match(bad.error, /ERR_SESSION/);
});

test('works with a legacy sheet (old column set, existing data) without losing anything', () => {
  const { api, login, gas } = boot(g => {
    g.seed('Requests', ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status', 'SubmittedAt', 'SentAt', 'ReceivedAt', 'ReceiverName', 'SignatureURL'], [
      ['REQ-250101-5', new Date('2025-01-01T08:00:00Z'), 'عيادة الأسنان 1', 'د. خالد', 'سارة', 'شهري', 'تم الإرسال', new Date('2025-01-01T08:00:00Z'), new Date('2025-01-02T08:00:00Z'), '', '', '']
    ]);
    g.seed('RequestItems', ['RequestID', 'ItemName', 'RequestedQty', 'ApprovedQty', 'ReceivedQty'], [['REQ-250101-5', 'DENTAL FLOSS', 3, '', '']]);
    g.seed('ItemsCatalog', ['ItemName'], [['DENTAL FLOSS'], ['PROPHY PASTE']]);
    g.seed('Roles', ['RoleName', 'Screen'], []);  // تبويب أدوار فارغ → الأدوار الافتراضية
  });
  const n = login('سارة', '1111');
  const mine = api(n, 'getMyRequests');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].status, 'تم الإرسال');
  assert.equal(mine[0].itemCount, 1);
  const header = gas.dump('Requests')[0];
  assert.deepEqual(header.slice(0, 12), ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status', 'SubmittedAt', 'SentAt', 'ReceivedAt', 'ReceiverName', 'SignatureURL']);
  assert.ok(header.indexOf('RejectionReason') > 11, 'new columns appended at the end');
  assert.equal(mine[0].pendingShipments, 1, 'old sent request without dispatch dates = one shipment to receive');
  assert.equal(api(n, 'receiveShipment', 'REQ-250101-5', 1, [{ name: 'DENTAL FLOSS', qty: 3 }], 'سارة', '', '').complete, true);
  assert.equal(api(n, 'getMyRequests')[0].status, 'تم الاستلام');
  assert.equal(api(login('المدير', '1234'), 'getQualityReport', '2025-01').rows[0].hours, 24);
  assert.equal(api(login('علي', '3333'), 'getConfig').catalog[0].price, 0);
});

test('setupSheets is idempotent and seeds defaults on an empty spreadsheet', () => {
  const gas = createGas();
  const ctx = vm.createContext(Object.assign({ Buffer }, gas.globals));
  vm.runInContext(CODE, ctx);
  ctx.setupSheets();
  ctx.setupSheets();
  assert.equal(gas.dump('Users').length, 2);
  assert.equal(gas.dump('Roles').length, 11);
  assert.equal(gas.dump('ItemsCatalog').length, 18);
  const r = ctx.api(null, 'login', ['المدير', '1234']);
  assert.equal(r.user.screen, 'admin');
});

test('doctor-based request: clinic is optional (derived from the doctor); clinic consumables need a clinic and skip review', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111');
  const items = [{ name: 'PROPHY PASTE', qty: 2 }];
  // قائمة الأطباء بدون عيادة = أطباء عيادات الممرضة فقط
  const docs = api(n, 'getDoctors', '').map(d => d.name).sort();
  assert.deepEqual(docs, ['د. خالد', 'د. نورة', 'د. فهد'].sort());
  const r1 = api(n, 'createRequest', { doctor: 'د. خالد', type: 'شهري', items });
  const q1 = rows(gas, 'Requests').find(r => r.RequestID === r1.id);
  assert.equal(q1.Clinic, 'عيادة الأسنان 1', 'clinic comes from the doctor');
  assert.equal(q1.Branch, 'الرياض');
  assert.equal(q1.Status, 'مراجعة الطبيب');
  assert.equal(api(login('د. خالد', '4444'), 'getDoctorRequests').length, 1);
  throwsCode(() => api(n, 'createRequest', { doctor: 'د. غير موجود', type: 'شهري', items }), 'ERR_BAD_DOCTOR');
  // مستهلكات العيادة: بدون طبيب، العيادة إلزامية، وتذهب للتموين مباشرة
  throwsCode(() => api(n, 'createRequest', { type: 'شهري', items }), 'ERR_REQUIRED');
  const rd = api(n, 'createRequest', { clinic: 'عيادة الأسنان 2', type: 'شهري', items });
  const qd = rows(gas, 'Requests').find(r => r.RequestID === rd.id);
  assert.deepEqual([qd.Doctor, qd.Clinic, qd.Status, qd.Department], ['', 'عيادة الأسنان 2', 'جديد', 'أسنان'], 'dental clinic consumables: no doctor, straight to dental procurement');
  throwsCode(() => api(n, 'createRequest', { clinic: 'عيادة الجلدية 1', type: 'شهري', items }), 'ERR_CLINIC_SHARED_ONLY');
  const r2 = api(n, 'createRequest', { clinic: 'Sterilization', branch: 'الرياض', type: 'شهري', items: [{ name: 'قفازات طبية M', qty: 5 }] });
  const q2 = rows(gas, 'Requests').find(r => r.RequestID === r2.id);
  assert.deepEqual([q2.Doctor, q2.Clinic, q2.Status], ['', 'Sterilization', 'جديد']);
  const p = login('علي', '3333');
  const all = api(p, 'getRequests', {});
  const got = (all.rows || all).find(r => r.id === r2.id);
  assert.ok(got && got.cleared, 'clinic consumables are ready for procurement right away');
});

test('doctor accounts with joined names (ZakhirRais) or an explicit link receive their requests', () => {
  const { api, login } = boot(g => {
    g.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email', 'DoctorName'], [
      ['سارة', '1111', 'ممرضة', 'عيادة الأسنان 1', ''],
      ['ZakhirRais', '7777', 'طبيب', '', ''],
      ['نورة', '8888', 'طبيب', '', ''],
      ['المدير', '1234', 'تنفيذي', '', '']
    ]);
    g.seed('Doctors', ['DoctorName', 'Clinic', 'NurseName'], [
      ['Dr. Zakhir Rais', 'عيادة الأسنان 1', 'سارة'],
      ['د. نورة العتيبي', 'عيادة الأسنان 1', 'سارة'],
      ['Dr. Maha', 'عيادة الأسنان 1', 'سارة']
    ]);
  });
  const n = login('سارة', '1111');
  const items = [{ name: 'PROPHY PASTE', qty: 1 }];
  const a = api(n, 'createRequest', { doctor: 'Dr. Zakhir Rais', type: 'شهري', items });
  const z = login('ZakhirRais', '7777');
  const mine = api(z, 'getDoctorRequests');
  assert.deepEqual(mine.map(r => r.id), [a.id], 'the request reaches Dr. Zakhir Rais page');
  assert.equal(mine[0].status, 'مراجعة الطبيب');
  const admin = login('المدير', '1234');
  let links = api(admin, 'getDoctorLinks');
  assert.deepEqual(links.unlinked.sort(), ['Dr. Maha'], 'نورة matches د. نورة العتيبي by name tokens');
  // ربط صريح من شاشة المستخدمين
  api(admin, 'createUser', { name: 'maha', password: '9999', role: 'طبيب', clinic: '', email: '', doctorName: 'Dr. Maha' });
  links = api(admin, 'getDoctorLinks');
  assert.deepEqual(links.unlinked, []);
  const users = api(admin, 'getUsers');
  assert.deepEqual(users.find(u => u.name === 'maha').linked, ['Dr. Maha']);
  assert.deepEqual(users.find(u => u.name === 'ZakhirRais').linked, ['Dr. Zakhir Rais']);
  assert.deepEqual(users.find(u => u.name === 'نورة').linked, ['د. نورة العتيبي']);
  const b = api(n, 'createRequest', { doctor: 'Dr. Maha', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 3 }] });
  assert.deepEqual(api(login('maha', '9999'), 'getDoctorRequests').map(r => r.id), [b.id]);
});

test('roles split: legacy quality/executive/finance migrate; executive keeps full access until an admin exists', () => {
  const { api, login, gas } = boot(g => {
    g.seed('Roles', ['RoleName', 'Screen'], [['ممرضة', 'nurse'], ['تموين', 'procurement'], ['جودة', 'admin'], ['تنفيذي', 'admin'], ['مالية', 'dashboard']]);
    g.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email'], [
      ['منى', '5555', 'جودة', '', ''], ['المدير', '1234', 'تنفيذي', '', ''], ['نواف', '7777', 'مالية', '', ''], ['علي', '3333', 'تموين', '', '']
    ]);
  });
  const q = login('منى', '5555');
  assert.deepEqual(rows(gas, 'Roles').map(r => [r.RoleName, r.Screen]).sort(), [
    ['أدمن', 'admin'], ['ممرضة', 'nurse'], ['تموين', 'procurement'], ['جودة', 'quality'], ['تنفيذي', 'executive'], ['مالية', 'finance'], ['المعمل', 'lab'], ['مدير فرع', 'branch']].sort());
  const qc = api(q, 'getConfig');
  assert.equal(qc.user.screen, 'quality');
  assert.ok(qc.user.perms.includes('monitor') && !qc.user.perms.includes('users') && !qc.user.perms.includes('finance'));
  throwsCode(() => api(q, 'getUsers'), 'ERR_FORBIDDEN');
  assert.ok(api(q, 'getMonitor'));
  // لا يوجد أدمن بعد: التنفيذي يبقى بكل الصلاحيات حتى لا يُقفل النظام
  const e = login('المدير', '1234');
  assert.equal(api(e, 'getConfig').user.screen, 'executive');
  assert.equal(api(e, 'getConfig').hasAdmin, false);
  api(e, 'createUser', { name: 'admin', password: '9999', role: 'أدمن' });
  throwsCode(() => api(e, 'getUsers'), 'ERR_FORBIDDEN'); // بعد وجود الأدمن: صلاحيات التنفيذي الافتراضية فقط (فوراً)
  assert.ok(api(e, 'getExecutiveStats'));
  const a = login('admin', '9999');
  assert.equal(api(a, 'getConfig').user.perms.length, 15);
  const f = login('نواف', '7777');
  assert.ok(api(f, 'getFinance', {}).summary);
  throwsCode(() => api(f, 'getComplaints'), 'ERR_FORBIDDEN');
  throwsCode(() => api(f, 'getUsers'), 'ERR_FORBIDDEN');
  // تسجيل دخول ثانٍ لا يعيد الترقية (الأدوار صارت بصيغتها الجديدة)
  login('منى', '5555');
  assert.equal(rows(gas, 'Roles').filter(r => r.RoleName === 'أدمن').length, 1);
});

test('permissions per role are editable by the admin and enforced on the server (also in batches)', () => {
  const { api, login } = boot();
  const a = login('المدير', '1234');
  const q = login('منى', '5555');
  assert.ok(api(q, 'getStatsReport', {}));
  const roles = api(a, 'saveRole', 'جودة', 'quality', ['overview', 'monitor']);
  const jr = roles.find(r => r.name === 'جودة');
  assert.deepEqual([jr.custom, jr.perms], [true, ['overview', 'monitor']]);
  throwsCode(() => api(q, 'getStatsReport', {}), 'ERR_FORBIDDEN');
  assert.ok(api(q, 'getExecutiveStats'));
  const b = JSON.parse(JSON.stringify(api(q, 'batch', [['getStatsReport', [{}]], ['getMonitor', []]])));
  assert.deepEqual(b.map(x => x.ok), [false, true]);
  api(a, 'saveRole', 'جودة', 'quality', []);
  assert.deepEqual(api(q, 'getConfig').user.perms, []);
  throwsCode(() => api(q, 'getMonitor'), 'ERR_FORBIDDEN');
  // الرجوع للافتراضي (بدون قائمة)
  api(a, 'saveRole', 'جودة', 'quality');
  assert.ok(api(q, 'getStatsReport', {}));
  throwsCode(() => api(a, 'saveRole', 'أدمن', 'quality', []), 'ERR_LAST_ADMIN');
});

test('monitor: monthly window 15–20 and due on the 1st, emergency target 2h and limit 48h; nudge + daily digest reach procurement and quality', () => {
  const now = Date.now();
  const H = 36e5;
  const d = (ms) => new Date(ms);
  const ym = (back) => { const x = new Date(now); x.setUTCDate(15); x.setUTCMonth(x.getUTCMonth() - back); return x.toISOString().slice(0, 7); };
  const day = (back, dd) => new Date(ym(back) + '-' + String(dd).padStart(2, '0') + 'T10:00:00+03:00');
  const { api, login, gas, ctx } = boot(g => {
    g.seed('Requests', ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status', 'SubmittedAt', 'Branch', 'ReceivedAt'], [
      ['REQ-A', day(2, 17), 'عيادة الأسنان 1', 'د. نورة', 'سارة', 'شهري', 'جديد', day(2, 17), 'الرياض', ''],
      ['REQ-B', d(now - 50 * H), 'عيادة الأسنان 1', 'د. نورة', 'سارة', 'طارئ', 'قيد التجهيز', d(now - 50 * H), 'الرياض', ''],
      ['REQ-C', d(now - 30 * H), 'عيادة الجلدية 1', 'د. نورة', 'سارة', 'طارئ', 'جديد', d(now - 30 * H), 'الرياض', ''],
      ['REQ-D', d(now - 2 * H), 'عيادة الأسنان 1', 'د. نورة', 'سارة', 'طارئ', 'جديد', d(now - 2 * H), 'الرياض', ''],
      ['REQ-E', day(2, 3), 'عيادة الأسنان 2', 'د. سعد', 'ريم', 'شهري', 'تم الاستلام', day(2, 3), 'جدة', day(1, 5)]
    ]);
    g.seed('RequestItems', ['RequestID', 'ItemName', 'RequestedQty'], [['REQ-A', 'PROPHY PASTE', 2], ['REQ-B', 'DENTAL FLOSS', 1], ['REQ-C', 'DENTAL FLOSS', 1], ['REQ-D', 'DENTAL FLOSS', 1], ['REQ-E', 'DENTAL FLOSS', 1]]);
  });
  const q = login('منى', '5555');
  const m = api(q, 'getMonitor');
  assert.deepEqual(m.late.map(r => r.id).sort(), ['REQ-A', 'REQ-B']);
  assert.deepEqual(m.atRisk.map(r => r.id), ['REQ-C']);
  const A = m.late.find(r => r.id === 'REQ-A');
  assert.deepEqual([A.stage, A.owner, A.lateSubmit], ['prep', 'procurement', false]);
  assert.equal(m.late.find(r => r.id === 'REQ-B').stage, 'dispatch');
  // دورة الشهر حسب الطبيب (وليس العيادة)
  assert.deepEqual(m.cycle.doctors.map(x => x.doctor).sort(), ['د. خالد', 'د. سعد', 'د. فهد', 'د. نورة'].sort());
  assert.ok(m.cycle.doctors.every(x => ['ok', 'late', 'pending', 'missing'].includes(x.state)));
  assert.deepEqual(m.rules.window, [15, 20]);
  assert.deepEqual([m.rules.emergencyHours, m.rules.emergencyFastHours], [48, 2]);
  const k = api(q, 'getMonitor', { month: ym(2) }).kpis;
  assert.deepEqual([k.requests, k.monthly, k.lateSubmits, k.received, k.onTimeRate], [2, 2, 0, 1, 0], 'REQ-E: submitted early (day 3 is fine), received after the 1st');
  // بطاقات التموين تحمل علامة التأخير + تنبيه أعلى الشاشة
  const p = login('علي', '3333');
  const reqs = api(p, 'getRequests', {});
  const list = reqs.rows || reqs;
  assert.equal(list.find(r => r.id === 'REQ-A').overdue, true);
  assert.equal(list.find(r => r.id === 'REQ-D').overdue, false);
  assert.ok(api(p, 'getAlerts').some(x => x.code === 'alert_overdue_proc' && x.n === 2));
  assert.ok(api(q, 'getAlerts').some(x => x.code === 'alert_overdue' && x.n === 2));
  // تنبيه التموين من الجودة
  gas.mails.length = 0;
  api(q, 'nudgeProcurement', 'REQ-A', 'أسرعوا لو سمحتم');
  assert.ok(gas.mails.some(x => x.to.includes('ali@example.com') && /REQ-A/.test(x.subject)));
  assert.ok(rows(gas, 'Comments').some(c => c.RequestID === 'REQ-A' && /أسرعوا/.test(c.Message)));
  throwsCode(() => api(p, 'nudgeProcurement', 'REQ-A', 'x'), 'ERR_FORBIDDEN');
  // الملخص اليومي: فقط من المشغّل الزمني
  gas.mails.length = 0;
  assert.equal(ctx.dailyDigest(), 0);
  assert.equal(gas.mails.length, 0);
  assert.equal(ctx.dailyDigest({ triggerUid: 't1' }), 3);
  assert.ok(gas.mails.some(x => x.to.includes('ali@example.com')), 'procurement gets the digest');
  assert.ok(gas.mails.some(x => x.to.includes('mona@example.com')), 'quality gets the digest');
});

test('finance: spend summary and price editing written back to the catalog sheet as a number', () => {
  const { api, login, gas } = boot(g => {
    g.seed('ItemsCatalog', ['ItemName', 'CommercialName', 'Category', 'Price'], [
      ['PROPHY PASTE', 'Nupro', 'Hygiene', 60], ['Itero Sleeve', 'Align', 'Scanner', new Date('2026-08-03T00:00:00+03:00')], ['DENTAL FLOSS', '', '', 12.5]
    ]);
  });
  const n = login('سارة', '1111');
  api(n, 'createRequest', { doctor: 'د. نورة', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'Itero Sleeve', qty: 1 }] });
  const f = login('نواف', '7777');
  let prices = api(f, 'getPriceList');
  assert.equal(prices.find(p => p.name === 'Itero Sleeve').issue, 'date');
  throwsCode(() => api(f, 'setItemPrice', 'Itero Sleeve', 'abc'), 'ERR_BAD_PRICE');
  throwsCode(() => api(f, 'setItemPrice', 'Itero Sleeve', 2e6), 'ERR_BAD_PRICE');
  throwsCode(() => api(f, 'setItemPrice', 'غير موجود', 5), 'ERR_NOT_FOUND');
  throwsCode(() => api(n, 'setItemPrice', 'Itero Sleeve', 5), 'ERR_FORBIDDEN');
  assert.deepEqual(api(f, 'setItemPrice', 'itero sleeve', '٣٥٠'), { name: 'Itero Sleeve', price: 350, issue: '' });
  assert.equal(rows(gas, 'ItemsCatalog').find(r => r.ItemName === 'Itero Sleeve').Price, 350);
  assert.ok(rows(gas, 'Log').some(l => /تعديل سعر: Itero Sleeve/.test(l.Action) && l.User === 'نواف'));
  prices = api(f, 'getPriceList');
  assert.equal(prices.find(p => p.name === 'Itero Sleeve').issue, '');
  const fin = api(f, 'getFinance', {});
  assert.equal(fin.summary.approved, 470);
  assert.equal(fin.summary.requested, 470);
  assert.equal(fin.trend.length, 12);
  assert.equal(fin.trend[11].value, 470);
  assert.deepEqual(fin.badPrices, []);
  // المالية لا تعدّل إن سُحبت الصلاحية
  const a = login('المدير', '1234');
  api(a, 'saveRole', 'مالية', 'finance', ['finance']);
  throwsCode(() => api(f, 'setItemPrice', 'Itero Sleeve', 5), 'ERR_FORBIDDEN');
});

test('monthly requests after the 20th are never blocked — they are accepted and flagged as submitted late', () => {
  const { api, login, ctx } = boot();
  const n = login('سارة', '1111');
  const r = api(n, 'createRequest', { doctor: 'د. نورة', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 1 }] });
  assert.match(r.id, /^REQ-/, 'submission is accepted on any day');
  const day = (y, m, d) => new Date(y + '-' + m + '-' + d + 'T10:00:00+03:00');
  const dl = x => JSON.parse(JSON.stringify(ctx.deadline_({ type: 'شهري', status: 'جديد', submittedAt: x }, day('2026', '09', '10').getTime())));
  assert.equal(dl(day('2026', '09', '14')).lateSubmit, false, 'early is fine');
  assert.equal(dl(day('2026', '09', '17')).lateSubmit, false);
  assert.equal(dl(day('2026', '09', '20')).lateSubmit, false);
  assert.equal(dl(day('2026', '09', '21')).lateSubmit, true, 'after the 20th = submitted late');
  assert.equal(new Date(dl(day('2026', '09', '17')).dueAt).toISOString(), '2026-10-01T20:59:59.999Z', 'due by the end of the 1st (Riyadh)');
  assert.equal(new Date(dl(day('2026', '12', '18')).dueAt).toISOString(), '2027-01-01T20:59:59.999Z', 'December rolls over to January');
});

test('management roles (finance…) are added automatically when missing, so the admin can create a finance account', () => {
  const { api, login, gas } = boot(g => {
    g.seed('Roles', ['RoleName', 'Screen'], [['ممرضة', 'nurse'], ['تموين', 'procurement'], ['طبيب', 'doctor'], ['أدمن', 'admin']]);
    g.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email'], [['المدير', '1234', 'أدمن', '', '']]);
  });
  const a = login('المدير', '1234');
  const roles = api(a, 'getConfig').roles.map(r => r.name + ':' + r.screen).sort();
  assert.deepEqual(roles, ['أدمن:admin', 'تموين:procurement', 'تنفيذي:executive', 'جودة:quality', 'طبيب:doctor', 'مالية:finance', 'ممرضة:nurse', 'المعمل:lab', 'مدير فرع:branch'].sort());
  api(a, 'createUser', { name: 'المالية', password: '2468', role: 'مالية', email: 'finance@example.com' });
  const f = api(null, 'login', 'المالية', '2468');
  assert.equal(f.user.screen, 'finance');
  assert.deepEqual(f.user.perms.slice().sort(), ['assets', 'doctor_prices', 'finance', 'monitor', 'prices_edit', 'reports'].sort());
  login('المدير', '1234');
  assert.equal(rows(gas, 'Roles').filter(r => r.RoleName === 'مالية').length, 1, 'added once only');
});

test('executive role mapped to the legacy dashboard screen migrates and can still manage users (no admin yet)', () => {
  const { api, login, gas } = boot(g => {
    g.seed('Roles', ['RoleName', 'Screen'], [['ممرضة', 'nurse'], ['تموين', 'procurement'], ['تنفيذي', 'dashboard'], ['مشرف', 'dashboard']]);
    g.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email'], [['admin', '1234', 'تنفيذي', '', ''], ['سالم', '1111', 'مشرف', '', '']]);
  });
  const a = login('admin', '1234');
  const cfg = api(a, 'getConfig');
  assert.equal(cfg.user.screen, 'executive', 'تنفيذي on the old dashboard screen becomes executive');
  assert.ok(cfg.user.perms.includes('users'), 'no admin yet → full access, users screen visible');
  assert.equal(cfg.hasAdmin, false);
  assert.ok(api(a, 'getUsers').length === 2);
  // دور مخصص على الشاشة القديمة: أيضاً كامل الصلاحيات حتى يوجد أدمن (لا أحد يُقفل خارج إدارة المستخدمين)
  assert.ok(api(login('سالم', '1111'), 'getConfig').user.perms.includes('users'));
  assert.ok(rows(gas, 'Roles').some(r => r.RoleName === 'أدمن' && r.Screen === 'admin'));
  // إنشاء الأدمن وتحويل الحساب نفسه إليه
  api(a, 'updateUser', 'admin', { role: 'أدمن' });
  const a2 = login('admin', '1234');
  assert.equal(api(a2, 'getConfig').user.screen, 'admin');
  assert.ok(!api(login('سالم', '1111'), 'getConfig').user.perms.includes('users'), 'after an admin exists the legacy role gets its defaults');
});

test('draft resubmission after a lost connection never creates a duplicate request (client key)', () => {
  const { api, login, gas, ctx } = boot();
  const n = login('سارة', '1111');
  const draft = { doctor: 'د. نورة', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 2 }], clientKey: 'draft-abc-12345' };
  const first = api(n, 'createRequest', draft);
  assert.equal(first.duplicate, false);
  // الرد لم يصل للجهاز (انقطع الاتصال) → الممرضة تضغط «إرسال» مرة ثانية بعد انتهاء نافذة الدقيقتين
  Object.keys(gas.cache).forEach(k => { if (k.indexOf('dup:') === 0) delete gas.cache[k]; });
  const again = api(n, 'createRequest', draft);
  assert.deepEqual([again.duplicate, again.id], [true, first.id], 'same draft → same request');
  assert.equal(rows(gas, 'Requests').length, 1);
  assert.equal(rows(gas, 'Requests')[0].ClientKey, 'draft-abc-12345');
  // مسودة جديدة (مفتاح جديد) تُنشئ طلباً جديداً حتى لو نفس الأصناف
  Object.keys(gas.cache).forEach(k => { if (k.indexOf('dup:') === 0) delete gas.cache[k]; });
  const next = api(n, 'createRequest', Object.assign({}, draft, { clientKey: 'draft-xyz-67890' }));
  assert.equal(next.duplicate, false);
  assert.notEqual(next.id, first.id);
  // مفتاح ممرضة أخرى لا يكشف طلبها
  const r = login('ريم', '2222');
  const other = api(r, 'createRequest', { doctor: 'د. سعد', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 1 }], clientKey: 'draft-abc-12345' });
  assert.equal(other.duplicate, false);
  // مفتاح غير صالح يُتجاهل
  assert.equal(api(n, 'createRequest', Object.assign({}, draft, { items: [{ name: 'PROPHY PASTE', qty: 1 }], clientKey: '<bad>' })).duplicate, false);
  assert.ok(ctx);
});

test('lab: nurse sends a case with lines to different labs; lab moves it internal/external → ready → clinic; doctor follows; nurse confirms', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111');
  const cfg = api(n, 'getLabConfig');
  assert.deepEqual(cfg.labs.map(l => l.name), ['المعمل الداخلي', 'معمل النخبة', 'معمل الابتسامة'], 'inactive labs are hidden');
  assert.deepEqual(cfg.workTypes, ['Crown', 'Veneer', 'Bridge', 'Inlay', 'Onlay', 'Denture', 'Night Guard', 'Implant Crown', 'Temporary', 'Surgical Guide']);
  assert.deepEqual(cfg.materials, ['Zirconia', 'Emax', 'PFM', 'PMMA', 'Composite', 'Acrylic', 'Metal', 'Other']);
  assert.equal(cfg.turnaround, 10);
  const base = { doctor: 'د. خالد', patient: 'محمد أحمد', fileNo: 'F-1001', scanDate: '2026-01-05',
    lines: [{ lab: 'المعمل الداخلي', workType: 'Crown', material: 'Zirconia', details: 'سن 16 · لون A2' }, { lab: 'معمل النخبة', workType: 'Bridge', material: 'Emax', details: '14-16' }] };
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, base, { fileNo: '' })), 'ERR_REQUIRED');
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, base, { scanDate: '' })), 'ERR_SCAN_DATE');
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, base, { scanDate: '2099-01-01' })), 'ERR_SCAN_FUTURE');
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, base, { lines: [{ lab: 'المعمل الداخلي', workType: 'Crown', material: 'Wood' }] })), 'ERR_BAD_MATERIAL');
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, base, { lines: [{ lab: 'معمل موقوف', workType: 'Crown', material: 'PFM' }] })), 'ERR_BAD_LAB');
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, base, { lines: [{ lab: 'المعمل الداخلي', workType: 'شيء', material: 'PFM' }] })), 'ERR_BAD_WORKTYPE');
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, base, { doctor: 'د. سعد' })), 'ERR_BAD_DOCTOR');
  gas.mails.length = 0;
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const withPhotos = Object.assign({}, base, { lines: [Object.assign({}, base.lines[0], { photos: [PNG, PNG] }), base.lines[1]] });
  const c = api(n, 'createLabCase', Object.assign({}, withPhotos, { photos: [PNG], clientKey: 'lab-draft-00001' }));
  assert.match(c.id, /^LAB-\d{6}-001$/);
  assert.equal(api(n, 'createLabCase', Object.assign({}, base, { clientKey: 'lab-draft-00001' })).id, c.id, 'resend after lost response → no duplicate');
  assert.ok(gas.mails.some(m => m.to.includes('lab@example.com') && /حالة جديدة للمعمل/.test(m.subject)), 'lab account notified');
  const row = rows(gas, 'LabCases')[0];
  assert.deepEqual([row.Clinic, row.Branch, row.Patient, row.FileNo], ['عيادة الأسنان 1', 'الرياض', 'محمد أحمد', 'F-1001']);
  const got = api(n, 'getLabCase', c.id);
  assert.equal(new Date(got.neededBy).toISOString().slice(0, 10), '2026-01-15', 'due = scan date + 10 days (default turnaround)');
  assert.deepEqual(got.items.map(i => i.material), ['Zirconia', 'Emax']);
  assert.equal(api(n, 'getLabCase', c.id).attachments.length, 1);
  assert.deepEqual(api(n, 'getLabCase', c.id).items.map(i => i.attachments.length), [2, 0], 'photos are attached per work');
  // من يرى: الممرضة، الطبيب نفسه، المعمل — لا ممرضة أخرى ولا التموين
  assert.equal(api(n, 'getMyLabCases').length, 1);
  assert.equal(api(login('ريم', '2222'), 'getMyLabCases').length, 0);
  throwsCode(() => api(login('ريم', '2222'), 'getLabCase', c.id), 'ERR_FORBIDDEN');
  throwsCode(() => api(login('علي', '3333'), 'getLabCase', c.id), 'ERR_FORBIDDEN');
  const d = login('د. خالد', '4444');
  assert.deepEqual(api(d, 'getDoctorLabCases').map(x => x.id), [c.id]);
  throwsCode(() => api(d, 'updateLabItems', [c.id + '-1'], 'receive'), 'ERR_FORBIDDEN');
  api(d, 'addLabNote', c.id, 'انتبهوا للون');
  // المعمل
  const L = login('فني المعمل', '8888');
  assert.equal(api(L, 'getConfig').user.screen, 'lab');
  assert.ok(api(L, 'getAlerts').some(a => a.code === 'alert_lab_new'));
  const [i1, i2] = [c.id + '-1', c.id + '-2'];
  api(L, 'updateLabItems', [i1, i2], 'receive');
  throwsCode(() => api(L, 'updateLabItems', [i1], 'send'), 'ERR_BAD_TRANSITION');
  throwsCode(() => api(L, 'updateLabItems', [i2], 'external', { lab: 'المعمل الداخلي', expectedAt: '2099-01-05' }), 'ERR_BAD_LAB');
  throwsCode(() => api(L, 'updateLabItems', [i2], 'external', { lab: 'معمل النخبة' }), 'ERR_REQUIRED');
  api(L, 'updateLabItems', [i1], 'start');
  const afterExt = api(L, 'updateLabItems', [i2], 'external', { lab: 'معمل النخبة', expectedAt: '2099-01-05', cost: '250', note: 'أُرسل مع المندوب' })[0];
  const x2 = afterExt.items.find(i => i.id === i2);
  assert.deepEqual([x2.status, x2.externalLab, x2.cost], ['عند معمل خارجي', 'معمل النخبة', 250]);
  assert.ok(afterExt.notes.some(nn => /المندوب/.test(nn.message)) && afterExt.notes.some(nn => nn.author === 'د. خالد'));
  gas.mails.length = 0;
  api(L, 'updateLabItems', [i1, i2], 'ready');
  assert.ok(gas.mails.some(m => m.to === 'sara@example.com' && /جاهز/.test(m.subject)), 'nurse told it is ready');
  assert.ok(gas.mails.some(m => m.to === 'khaled@example.com'), 'doctor told it is ready');
  api(L, 'updateLabItems', [i1, i2], 'send');
  assert.ok(api(n, 'getAlerts').some(a => a.code === 'alert_lab_to_receive'));
  throwsCode(() => api(login('ريم', '2222'), 'confirmLabReceipt', c.id), 'ERR_NOT_FOUND');
  const done = api(n, 'confirmLabReceipt', c.id);
  assert.equal(done.status, 'استلمته العيادة');
  throwsCode(() => api(n, 'confirmLabReceipt', c.id), 'ERR_BAD_TRANSITION');
  // Delivered to Patient: المعمل يسجل تسليم المريض فتُغلق الحالة
  throwsCode(() => api(n, 'updateLabItems', [i1], 'patient'), 'ERR_FORBIDDEN');
  const closed = api(L, 'updateLabItems', [i1, i2], 'patient')[0];
  assert.equal(closed.status, 'سُلِّم للمريض');
  assert.ok(closed.items.every(i => i.patientAt));
  throwsCode(() => api(L, 'updateLabItems', [i1], 'patient'), 'ERR_BAD_TRANSITION');
  assert.match(api(n, 'createLabCase', Object.assign({}, base, { lines: [{ lab: 'المعمل الداخلي', workType: 'Crown', details: 'بدون مادة' }] })).id, /^LAB-/, 'material is optional');
});

test('lab v2: due = scan + turnaround (Settings / per lab), chosen branch, backfilled delivered case, old Arabic work types replaced', () => {
  const { api, login, gas } = boot(g => {
    g.seed('Labs', ['LabName', 'Type', 'Email', 'Phone', 'Active', 'TurnaroundDays'], [
      ['المعمل الداخلي', 'داخلي', 'lab@example.com', '', 'نعم', ''], ['معمل النخبة', 'خارجي', '', '', 'نعم', 14]]);
    g.seed('Settings', ['Key', 'Value', 'Notes'], [['LabTurnaroundDays', 7, '']]);
    g.seed('LabWorkTypes', ['WorkType'], [['تاج'], ['جسر'], ['طقم كامل'], ['طقم جزئي'], ['حافظ مسافة'], ['واقي ليلي'], ['تقويم متحرك'], ['قشور (فينير)'], ['حشوة خزفية (إنلاي/أونلاي)'], ['زراعة — تاج على زرعة'], ['أخرى']]);
  });
  const n = login('سارة', '1111');
  const cfg = api(n, 'getLabConfig');
  assert.equal(cfg.turnaround, 7);
  assert.equal(cfg.labs.find(l => l.name === 'معمل النخبة').turnaround, 14);
  assert.equal(cfg.workTypes[0], 'Crown', 'untouched old Arabic default list → the clinic list');
  const due = id => new Date(api(n, 'getLabCase', id).neededBy).toISOString().slice(0, 10);
  const a = api(n, 'createLabCase', { doctor: 'د. خالد', fileNo: '500', scanDate: '2026-03-01', lines: [{ lab: 'المعمل الداخلي', workType: 'Crown', material: 'PFM' }] });
  assert.equal(due(a.id), '2026-03-08', 'Settings.LabTurnaroundDays = 7');
  const b = api(n, 'createLabCase', { doctor: 'د. خالد', fileNo: '501', scanDate: '2026-03-01', branch: 'جدة',
    lines: [{ lab: 'المعمل الداخلي', workType: 'Crown', material: 'PFM' }, { lab: 'معمل النخبة', workType: 'Veneer', material: 'Emax' }] });
  assert.equal(due(b.id), '2026-03-15', 'the longest lab turnaround wins (14)');
  assert.equal(api(n, 'getLabCase', b.id).branch, 'جدة');
  throwsCode(() => api(n, 'createLabCase', { doctor: 'د. خالد', fileNo: '502', scanDate: '2026-03-01', branch: 'دبي', lines: [{ lab: 'المعمل الداخلي', workType: 'Crown', material: 'PFM' }] }), 'ERR_BAD_BRANCH');
  gas.mails.length = 0;
  const old = api(n, 'createLabCase', { doctor: 'د. خالد', fileNo: '503', scanDate: '2025-12-01', delivered: true, lines: [{ lab: 'المعمل الداخلي', workType: 'Crown', material: 'PFM' }] });
  const oc = api(n, 'getLabCase', old.id);
  assert.deepEqual([oc.status, oc.source], ['سُلِّم للمريض', 'إدخال سابق']);
  assert.equal(gas.mails.length, 0, 'backfilled case does not notify the lab');
  assert.ok(!api(login('فني المعمل', '8888'), 'getLabStats', {}).overdueNow.some(o => o.caseId === old.id), 'delivered case is never overdue');
});

test('lab import: old Google Form cases come in with their CASE- IDs, statuses and remakes; re-running skips them', () => {
  const { api, login, gas, ctx } = boot(g => {
    g.seed('LabImport', ['Timestamp', 'Case ID', 'Branch', 'Patient File No.', 'Doctor', 'Work Type', 'Material', 'Lab', 'Scan Date', 'Lab Due Date', 'Case status', 'Delivered to patient?', 'Remake reason', 'Notes'], [
      ['1/10/2026 10:00:00', 'CASE-00010', 'الرياض', '9001', 'د. خالد', 'Crown', 'Zirconia', 'المعمل الداخلي', '1/10/2026', '1/20/2026', 'Delivered to Patient', 'Yes', '', 'تمام'],
      ['2/01/2026 09:00:00', 'CASE-00011', 'الرياض', '9002', 'د. خالد', 'Bridge', 'Emax', 'معمل النخبة', '2/01/2026', '', 'Still at Lab', 'No', '', ''],
      ['2/05/2026 09:00:00', 'CASE-00012', 'جدة', '9003', 'د. سعد', 'Veneer', 'Emax', 'معمل النخبة', '2/05/2026', '2/15/2026', 'Received from Lab', 'No', 'لون', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '']
    ]);
  });
  const res = ctx.importLabCases_();
  assert.deepEqual([res.added, res.skipped], [3, 0]);
  const L = login('فني المعمل', '8888');
  const all = api(L, 'getLabCases', { archive: true });
  const byId = Object.fromEntries(all.map(c => [c.id, c]));
  assert.deepEqual(['CASE-00010', 'CASE-00011', 'CASE-00012'].map(id => byId[id] && byId[id].status), ['سُلِّم للمريض', 'استلمه المعمل', 'استلمته العيادة']);
  assert.equal(byId['CASE-00011'].items[0].material, 'Emax');
  assert.equal(new Date(byId['CASE-00011'].neededBy).toISOString().slice(0, 10), '2026-02-11', 'missing due date → scan + 10');
  assert.equal(byId['CASE-00012'].redoReason, 'لون');
  assert.equal(byId['CASE-00012'].source, 'فورم قوقل');
  assert.deepEqual(api(L, 'findLabCases', '9002').map(c => c.id), ['CASE-00011'], 'imported cases are found by file number');
  assert.deepEqual([ctx.importLabCases_().added, ctx.importLabCases_().skipped], [0, 3], 'safe to run again');
  assert.ok(rows(gas, 'Log').some(r => /استيراد 3 حالة/.test(r.Action)));
});

test('lab redo: nurse picks a previous case and the faulty line with a reason; lab sees it flagged; KPIs count redo per lab, cost and overdue', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), L = login('فني المعمل', '8888');
  const c = api(n, 'createLabCase', { doctor: 'د. خالد', fileNo: '7788', scanDate: todayISO(),
    lines: [{ lab: 'المعمل الداخلي', workType: 'Crown', material: 'Zirconia' }, { lab: 'معمل النخبة', workType: 'Bridge', material: 'Emax' }] });
  api(L, 'updateLabItems', [c.id + '-2'], 'external', { lab: 'معمل النخبة', expectedAt: '2099-01-20', cost: 400 });
  api(L, 'updateLabItems', [c.id + '-1', c.id + '-2'], 'ready');
  api(L, 'updateLabItems', [c.id + '-1', c.id + '-2'], 'send');
  api(n, 'confirmLabReceipt', c.id);
  const redoBase = { redoOf: c.id, redoItems: [c.id + '-2'], redoReason: 'لون', redoNote: 'اللون أغمق من المطلوب', redoScanDate: todayISO() };
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, redoBase, { redoReason: 'مزاج' })), 'ERR_REDO_REASON');
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, redoBase, { redoScanDate: '' })), 'ERR_SCAN_DATE');
  throwsCode(() => api(n, 'createLabCase', Object.assign({}, redoBase, { redoOf: 'LAB-000000-999' })), 'ERR_NOT_FOUND');
  // الإعادة برقم الملف: ممرضة أخرى تجد الحالة وتعيدها
  const other = login('ريم', '2222');
  assert.deepEqual(api(other, 'findLabCases', '7788').map(x => x.id), [c.id]);
  assert.deepEqual(api(L, 'findLabCases', c.id).map(x => x.id), [c.id]);
  assert.deepEqual(api(other, 'findLabCases', '77'), [], 'file number must match exactly');
  gas.mails.length = 0;
  const r = api(n, 'createLabCase', redoBase);
  assert.equal(r.id, c.id + '-R1', 'remake is a sub-number of the original case');
  assert.ok(gas.mails.some(m => /Remake/.test(m.subject) && /أغمق/.test(m.body)), 'lab gets the problem in the email');
  const redoRow = rows(gas, 'LabCases').findIndex(x => x.CaseID === r.id) + 2;
  assert.equal(gas.ss.getSheetByName('LabCases')._bg[redoRow], '#FFE0B2', 'remake row is orange in the sheet');
  assert.ok(gas.mails.some(m => m.to === 'khaled@example.com' && /إعادة/.test(m.subject)), 'doctor informed of the redo');
  const rc = api(L, 'getLabCase', r.id);
  assert.deepEqual([rc.redoOf, rc.redoReason, rc.redoNote, rc.items.length, rc.items[0].lab, rc.items[0].redoOfItem], [c.id, 'لون', 'اللون أغمق من المطلوب', 1, 'معمل النخبة', c.id + '-2']);
  assert.equal(rc.origin.id, c.id);
  assert.deepEqual(api(n, 'getLabCase', c.id).redoneBy, [r.id]);
  assert.ok(api(L, 'getAlerts').some(a => a.code === 'alert_lab_redo'));
  // متأخر: إرسالية موعدها مضى
  const late = api(n, 'createLabCase', { doctor: 'د. خالد', fileNo: '1', scanDate: '2020-01-01', lines: [{ lab: 'المعمل الداخلي', workType: 'Denture', material: 'Acrylic' }] });
  const st = api(L, 'getLabStats', {});
  assert.deepEqual([st.summary.cases, st.summary.redoCases, st.summary.items], [3, 1, 4]);
  const elite = st.labs.find(x => x.name === 'معمل النخبة');
  assert.deepEqual([elite.type, elite.items, elite.redo, elite.redoRate, elite.cost, elite.done], ['خارجي', 2, 1, 50, 400, 1]);
  assert.deepEqual(st.reasons, [{ reason: 'لون', count: 1 }]);
  assert.equal(elite.setDays, 10);
  assert.ok(st.materials.some(m => m.name === 'Emax' && m.redo === 1), 'redo counted per material');
  assert.ok(st.overdueNow.some(o => o.caseId === late.id));
  assert.equal(st.trend.length, 6);
  // الجودة تتابع وتنبّه المعمل؛ المالية بدون صلاحية
  const q = login('منى', '5555');
  assert.ok(api(q, 'getLabStats', {}).summary);
  gas.mails.length = 0;
  api(q, 'nudgeLab', late.id, 'المريض ينتظر');
  assert.ok(gas.mails.some(m => m.to.includes('lab@example.com') && /متأخرة/.test(m.subject)));
  throwsCode(() => api(login('نواف', '7777'), 'getLabStats', {}), 'ERR_FORBIDDEN');
  // إعادة للإعادة: R2 تابعة لنفس الإرسالية الأساسية، والسلسلة كاملة في التفاصيل
  const r2 = api(n, 'createLabCase', Object.assign({}, redoBase, { redoOf: r.id, redoItems: [r.id + '-1'], clientKey: 'redo-two-000001' }));
  assert.equal(r2.id, c.id + '-R2');
  assert.deepEqual(api(L, 'getLabCase', r2.id).chain.map(x => [x.id, x.remakeNo]), [[c.id, 0], [c.id + '-R1', 1], [c.id + '-R2', 2]]);
});

test('packed responses (columnar lists) round-trip exactly and are smaller', () => {
  const { ctx, api, login } = boot();
  const p = login('علي', '3333');
  // نفس فك الواجهة (JavaScript.html → unpack)
  const unpack = v => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(unpack);
    if (Array.isArray(v.__pk) && Array.isArray(v.r)) return v.r.map(row => Object.fromEntries(v.__pk.map((k, j) => [k, unpack(row[j])])));
    return Object.fromEntries(Object.keys(v).map(k => [k, unpack(v[k])]));
  };
  const n = login('سارة', '1111');
  for (let i = 0; i < 10; i++) api(n, 'createRequest', { clinic: 'Sterilization', branch: 'الرياض', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 1 + i }] });
  const plain = api(p, 'getRequests', {});
  const packed = JSON.parse(JSON.stringify(ctx.api(p, 'getRequests', [{}], { pk: 1 })));
  assert.ok(plain.length >= 10);
  assert.ok(Array.isArray(packed.__pk), 'long uniform list is packed');
  assert.deepEqual(unpack(packed), plain);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(plain).length * 0.7, 'packed is much smaller');
  // دفعة (batch) وأشكال متداخلة وقوائم قصيرة/غير متجانسة
  const b = [['getRequests', [{}]], ['getAlerts', []], ['getNotices', []]];
  assert.deepEqual(unpack(JSON.parse(JSON.stringify(ctx.api(p, 'batch', [b], { pk: 1 })))), api(p, 'batch', b));
  const mixed = [{ a: 1 }, { b: 2 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }];
  assert.deepEqual(unpack(JSON.parse(JSON.stringify(ctx.pack_(mixed)))), mixed);
  const nested = { list: Array.from({ length: 9 }, (_, i) => ({ id: i, tags: ['x', i], sub: Array.from({ length: 9 }, (_, j) => ({ j, s: '' })) })), n: null };
  assert.deepEqual(unpack(JSON.parse(JSON.stringify(ctx.pack_(nested)))), nested);
});

test('branch manager: sees only his branch (requests, details, reports, monitor, lab, complaints, custody), read-only', () => {
  const { api, login } = boot();
  const a = login('المدير', '1234');
  api(a, 'createUser', { name: 'مدير جدة', password: '9090', role: 'مدير فرع', branch: 'جدة' });
  api(a, 'createUser', { name: 'مدير غلط', password: '9191', role: 'مدير فرع', branch: 'فرع غير موجود' });
  assert.equal(api(a, 'getUsers').find(u => u.name === 'مدير جدة').branch, 'جدة');
  assert.equal(api(a, 'getUsers').find(u => u.name === 'مدير غلط').branch, '', 'unknown branch is not saved');
  const sara = login('سارة', '1111'), reem = login('ريم', '2222');
  const riyadh = api(sara, 'createRequest', { clinic: 'Sterilization', branch: 'الرياض', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 1 }] }).id;
  const jeddah = api(reem, 'createRequest', { clinic: 'Sterilization', branch: 'جدة', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 2 }] }).id;
  const labR = api(sara, 'createLabCase', { doctor: 'د. خالد', fileNo: '11', scanDate: '2020-01-01', lines: [{ lab: 'المعمل الداخلي', workType: 'Denture', material: 'Acrylic' }] }).id;
  const labJ = api(reem, 'createLabCase', { doctor: 'د. سعد', fileNo: '22', scanDate: '2020-01-01', lines: [{ lab: 'المعمل الداخلي', workType: 'Denture', material: 'Acrylic' }] }).id;
  api(sara, 'addComplaint', riyadh, 'تأخير', 'من الرياض');

  const b = api(null, 'login', 'مدير جدة', '9090');
  assert.equal(b.user.screen, 'branch');
  assert.equal(b.user.branch, 'جدة');
  assert.deepEqual(b.user.perms.slice().sort(), ['assets', 'boxes', 'complaints', 'lab_view', 'monitor', 'overview', 'reports'].sort());
  const m = b.token;
  const ids = api(m, 'getRequests', {}).map(r => r.id);
  assert.ok(ids.includes(jeddah) && !ids.includes(riyadh), 'only his branch requests');
  assert.equal(api(m, 'getRequestDetail', jeddah).id, jeddah);
  throwsCode(() => api(m, 'getRequestDetail', riyadh), 'ERR_NOT_FOUND');
  assert.deepEqual(api(m, 'getStatsReport', {}).branches.map(x => x.name), ['جدة'], 'reports only his branch');
  assert.ok(api(m, 'getMonitor', {}).late.every(r => r.branch === 'جدة'));
  assert.deepEqual(api(m, 'getMonitor', {}).cycle.doctors.map(d => d.doctor), ['د. سعد'], 'monthly cycle: only doctors of his branch');
  const cases = api(m, 'getLabStats', {}).summary.cases;
  assert.equal(cases, 1, 'lab KPIs only for his branch');
  assert.equal(api(m, 'getLabCase', labJ).id, labJ);
  throwsCode(() => api(m, 'getLabCase', labR), 'ERR_FORBIDDEN');
  // تنبيه وشكاوى: مسموح لفرعه فقط
  api(m, 'nudgeProcurement', jeddah, 'متى يوصل؟');
  throwsCode(() => api(m, 'nudgeProcurement', riyadh, 'x'), 'ERR_NOT_FOUND');
  api(m, 'addComplaint', jeddah, 'تأخير', 'من مدير الفرع');
  const comps = api(m, 'getComplaints', false);
  assert.ok(comps.length === 1 && comps[0].requestId === jeddah, 'complaints of his branch only');
  // العهدة: عيادات فرعه فقط
  assert.ok(api(m, 'getClinicAssets', {}).every(c => c.branch === 'جدة'));
  // مشاهدة فقط: لا اعتماد ولا إرسال ولا تعديل
  throwsCode(() => api(m, 'dispatchItems', jeddah, ['PROPHY PASTE']), 'ERR_FORBIDDEN');
  throwsCode(() => api(m, 'bulkUpdateStatus', [jeddah], 'تم الإرسال'), 'ERR_FORBIDDEN');
  throwsCode(() => api(m, 'getFinance', {}), 'ERR_FORBIDDEN');
  // بدون فرع (أو فرع غير صالح) = كل الفروع؛ والجودة ترى الكل
  const all = api(login('مدير غلط', '9191'), 'getRequests', {}).map(r => r.id);
  assert.ok(all.includes(riyadh) && all.includes(jeddah));
  const q = api(login('منى', '5555'), 'getRequests', {}).map(r => r.id);
  assert.ok(q.includes(riyadh) && q.includes(jeddah));
});

test('boxes: dispatch loads the doctor box → driver scan delivers with photo → nurse receives → box stays; move on request', () => {
  const { api, login, gas } = boot();
  const reem = login('ريم', '2222'), p = login('علي', '3333');
  const id = api(reem, 'createRequest', { doctor: 'د. سعد', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'DENTAL FLOSS', qty: 1 }] }).id;
  api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز');
  api(p, 'dispatchItems', id, ['PROPHY PASTE']);
  let bx = api(p, 'getBoxes');
  assert.equal(bx.boxes.length, 1);
  const box = bx.boxes[0];
  assert.deepEqual([box.id, box.owner, box.status, box.location, box.destination, box.loads.map(l => l.request + '#' + l.batch)],
    ['BOX-001', 'د. سعد', 'جاهز للنقل', 'التموين', 'جدة', [id + '#1']], 'doctor box created and loaded, destination = request branch');
  assert.ok(box.k.length >= 24 && bx.driverToken.length >= 24);
  // مهام السواق برابط سري
  throwsCode(() => api(null, 'driverTasks', { k: 'wrong' }), 'ERR_BAD_LINK');
  assert.deepEqual(api(null, 'driverTasks', { k: bx.driverToken }).map(x => [x.id, x.destination]), [['BOX-001', 'جدة']]);
  // صفحة البوكس بالـ QR: بلا أسعار أو أصناف
  throwsCode(() => api(null, 'boxInfo', { box: 'BOX-001', k: 'nope' }), 'ERR_BAD_LINK');
  const info = api(null, 'boxInfo', { box: 'BOX-001', k: box.k });
  assert.deepEqual(info.places, ['التموين', 'الرياض', 'جدة']);
  assert.ok(!/PROPHY|price|سعر/.test(JSON.stringify(info)), 'no items or prices on the public page');
  const d = { box: 'BOX-001', k: box.k, to: 'جدة', driver: 'أبو فهد', photo: PNG, clientKey: 'dlv-000001' };
  throwsCode(() => api(null, 'boxDeliver', Object.assign({}, d, { photo: '' })), 'ERR_PHOTO_REQUIRED');
  throwsCode(() => api(null, 'boxDeliver', Object.assign({}, d, { driver: '' })), 'ERR_DRIVER_NAME');
  throwsCode(() => api(null, 'boxDeliver', Object.assign({}, d, { to: 'الدمام' })), 'ERR_BAD_PLACE');
  throwsCode(() => api(null, 'boxDeliver', Object.assign({}, d, { k: 'x' })), 'ERR_BAD_LINK');
  throwsCode(() => api(null, 'boxDeliver', Object.assign({}, d, { to: 'التموين' })), 'ERR_SAME_PLACE');
  const res = api(null, 'boxDeliver', d);
  assert.deepEqual([res.box.status, res.box.location], ['وصل الفرع', 'جدة']);
  assert.equal(api(null, 'boxDeliver', d).duplicate, true, 'double tap is ignored');
  throwsCode(() => api(null, 'boxDeliver', Object.assign({}, d, { clientKey: 'dlv-000009' })), 'ERR_SAME_PLACE');
  assert.equal(rows(gas, 'BoxMoves').filter(m => m.Action === 'تسليم').length, 1);
  // الممرضة: الطلب «وصل الفرع» + تنبيه + تعليق
  const mine = api(reem, 'getMyRequests').find(r => r.id === id);
  assert.equal(mine.atBranch, true);
  assert.ok(api(reem, 'getAlerts').some(a => a.code === 'alert_box_arrived'));
  const det = api(reem, 'getRequestDetail', id);
  assert.deepEqual([det.shipments[0].delivered.to, det.shipments[0].delivered.by], ['جدة', 'أبو فهد']);
  assert.ok(det.shipments[0].delivered.photo);
  assert.ok(api(reem, 'getComments', id).some(c => /وصل البوكس/.test(c.message)));
  assert.deepEqual(api(null, 'driverTasks', { k: bx.driverToken }), [], 'nothing left to move');
  // الاستلام: البوكس يبقى في الفرع فارغاً
  api(reem, 'receiveShipment', id, 1, [{ name: 'PROPHY PASTE', qty: 2 }], 'ريم', '', '', '');
  bx = api(p, 'getBoxes');
  assert.deepEqual([bx.boxes[0].status, bx.boxes[0].location, bx.boxes[0].loads.length], ['فارغ', 'جدة', 0]);
  assert.equal(api(reem, 'getMyRequests').find(r => r.id === id).atBranch, false);
  // التموين يطلب إرجاعه ← مهمة للسواق ← تسليم للتموين بدون شحنة
  api(p, 'requestBoxMove', 'BOX-001', 'التموين');
  assert.deepEqual(api(null, 'driverTasks', { k: bx.driverToken }).map(x => [x.id, x.status, x.location, x.destination]), [['BOX-001', 'مطلوب نقله', 'جدة', 'التموين']]);
  api(null, 'boxDeliver', Object.assign({}, d, { to: 'التموين', clientKey: 'dlv-000002' }));
  bx = api(p, 'getBoxes');
  assert.deepEqual([bx.boxes[0].status, bx.boxes[0].location], ['فارغ', 'التموين']);
  // الإرسال الثاني يحمّل نفس البوكس
  api(p, 'dispatchItems', id, ['DENTAL FLOSS']);
  bx = api(p, 'getBoxes');
  assert.deepEqual([bx.boxes.length, bx.boxes[0].status, bx.boxes[0].loads.map(l => l.batch)], [1, 'جاهز للنقل', [2]]);
  // البوكس لطلب «مستهلكات عيادة» باسم العيادة؛ وبوكس يدوي لطباعة الستيكر مبكراً
  assert.equal(api(p, 'addBox', 'د. خالد').id, 'BOX-002');
  assert.equal(api(p, 'addBox', 'د. خالد').id, 'BOX-002', 'one box per owner');
  // مدير الفرع/الممرضة لا يرون شاشة البوكسات
  throwsCode(() => api(reem, 'getBoxes'), 'ERR_FORBIDDEN');
});

test('boxes: one box per owner + branch, procurement can change owner/branch on send, past requests get boxes', () => {
  const { api, login, gas } = boot();
  const reem = login('ريم', '2222'), p = login('علي', '3333');
  const mk = n => api(reem, 'createRequest', { doctor: 'د. سعد', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'DENTAL FLOSS', qty: n }] }).id;
  const a = mk(1), b = mk(2), c = mk(3);
  assert.equal(new Set([a, b, c]).size, 3);
  api(p, 'bulkUpdateStatus', [a, b, c], 'قيد التجهيز');
  // فرع غير صالح يوقف الإرسال بدون كتابة شحنة
  throwsCode(() => api(p, 'dispatchItems', a, ['PROPHY PASTE'], { owner: 'د. سعد', branch: 'الدمام' }), 'ERR_BAD_PLACE');
  assert.ok(!(gas.dump('ShipmentItems') || []).some(r => r[0] === a), 'no shipment written');
  api(p, 'dispatchItems', a, ['PROPHY PASTE'], { owner: 'د. سعد', branch: 'جدة' });
  api(p, 'dispatchItems', b, ['PROPHY PASTE'], { owner: 'د. سعد', branch: 'جدة' });
  let bx = api(p, 'getBoxes').boxes;
  assert.deepEqual(bx.map(x => [x.id, x.owner, x.branch, x.loads.length]), [['BOX-001', 'د. سعد', 'جدة', 2]], 'same doctor + branch → same box');
  // نفس الطبيب في فرع آخر = بوكس آخر · وصاحب البوكس يمكن تغييره (التعقيم)
  api(p, 'dispatchItems', c, ['PROPHY PASTE'], { owner: 'د. سعد', branch: 'الرياض' });
  api(p, 'bulkUpdateStatus', [a], 'تم الإرسال', { [a]: { owner: 'التعقيم', branch: 'جدة' } });
  bx = api(p, 'getBoxes').boxes;
  assert.deepEqual(bx.map(x => [x.id, x.owner, x.branch, x.destination]), [['BOX-001', 'د. سعد', 'جدة', 'جدة'], ['BOX-002', 'د. سعد', 'الرياض', 'الرياض'], ['BOX-003', 'التعقيم', 'جدة', 'جدة']]);
  assert.deepEqual(api(p, 'addBox', 'د. سعد', 'الرياض').id, 'BOX-002', 'manual add finds the doctor box of that branch');
  throwsCode(() => api(p, 'addBox', 'د. سعد', 'الدمام'), 'ERR_BAD_PLACE');
  // بأثر رجعي: نمسح البوكسات (كأنها قبل الميزة) ← تُنشأ وتُحمَّل الشحنات غير المستلمة، وتكرار التشغيل لا يكرر شيئاً
  api(reem, 'receiveShipment', b, 1, [{ name: 'PROPHY PASTE', qty: 2 }], 'ريم', '', '', '');
  for (const n of ['Boxes', 'BoxMoves']) { const sh = gas.ss.getSheetByName(n); sh._data.splice(1); }
  const r1 = api(p, 'backfillBoxes');
  assert.deepEqual([r1.requests, r1.loaded], [3, 3], 'a#1, a#2 and c#1 are sent but not received; b#1 was received');
  bx = api(p, 'getBoxes').boxes;
  const saad = bx.find(x => x.owner === 'د. سعد' && x.branch === 'جدة');
  assert.ok(saad && saad.loads.length === 3 && saad.status === 'جاهز للنقل', 'all 3 unreceived shipments of his جدة requests are in his جدة box');
  assert.equal(bx.filter(x => x.owner === 'د. سعد').length, 1, 'past requests use the request branch (جدة) and doctor');
  const r2 = api(p, 'backfillBoxes');
  assert.deepEqual([r2.created, r2.loaded], [0, 0]);
  throwsCode(() => api(reem, 'backfillBoxes'), 'ERR_FORBIDDEN');
});

test('derma doctor: review and approve without any price or value anywhere (catalog, items, report, detail)', () => {
  const { api, login } = boot();
  const a = login('المدير', '1234');
  api(a, 'createUser', { name: 'د. فهد', password: '8181', role: 'طبيب', doctorName: 'د. فهد' });
  const sara = login('سارة', '1111');
  const id = api(sara, 'createRequest', { doctor: 'د. فهد', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 3 }] }).id;
  const res = api(null, 'login', 'د. فهد', '8181', { doctor: [['getDoctorRequests', []]] });
  assert.equal(res.user.noPrices, true, 'derma doctor flagged (from her clinic department)');
  const f = res.token;
  const priceKey = /"(price|total|value|cost|priceIssue|badPrices|unpriced)"\s*:/;
  assert.ok(!priceKey.test(JSON.stringify(res)), 'login payload (config + preload) has no prices');
  const items = api(f, 'getRequestItemsWithCatalog', id);
  assert.equal(items[0].item, 'PROPHY PASTE');
  for (const [fn, args] of [['getConfig', []], ['getDoctorRequests', []], ['getRequestItemsWithCatalog', [id]], ['getRequestDetail', [id]], ['getDoctorReport', [{}]],
    ['batch', [[['getConfig', []], ['getDoctorReport', [{}]]]]]]) {
    assert.ok(!priceKey.test(JSON.stringify(api(f, fn, ...args))), fn + ' has no prices for the derma doctor');
  }
  // الاعتماد يعمل كالمعتاد
  api(f, 'doctorReview', id, 'اعتمد', '', [{ name: 'PROPHY PASTE', qty: 2 }]);
  assert.equal(api(sara, 'getRequestDetail', id).status, 'معتمد من الطبيب');
  // طبيب الأسنان والتموين يرون الأسعار كالمعتاد
  const k = api(null, 'login', 'د. خالد', '4444');
  assert.ok(!k.user.noPrices);
  assert.ok(k.config.catalog.find(c => c.name === 'PROPHY PASTE').price > 0);
  assert.ok(api(login('علي', '3333'), 'getConfig').catalog.find(c => c.name === 'PROPHY PASTE').price > 0);
  // قسم الحساب صراحةً (Department = جلدية) يكفي حتى لو عيادته غير ذلك
  api(a, 'updateUser', 'د. خالد', { role: 'طبيب', department: 'جلدية', doctorName: '' });
  assert.equal(api(null, 'login', 'د. خالد', '4444').user.noPrices, true);
});

test('iTero: scan date + iTero case No. + file No. + doctor → lab case without work lines, searchable by iTero No.', () => {
  const { api, login } = boot();
  const n = login('سارة', '1111');
  throwsCode(() => api(n, 'createLabCase', { itero: '', doctor: 'د. خالد', fileNo: '55', scanDate: '2020-01-01' }), 'ERR_ITERO_NO');
  throwsCode(() => api(n, 'createLabCase', { itero: 'IT-1', doctor: 'د. خالد', fileNo: '', scanDate: '2020-01-01' }), 'ERR_REQUIRED');
  const r = api(n, 'createLabCase', { itero: 'IT-778899', doctor: 'د. خالد', fileNo: '55', scanDate: '2020-01-01' });
  const c = api(n, 'getLabCase', r.id);
  assert.equal(c.iteroNo, 'IT-778899');
  assert.deepEqual([c.items.length, c.items[0].workType, c.items[0].lab, c.fileNo], [1, 'iTero', 'المعمل الداخلي', '55']);
  assert.ok(api(login('فني المعمل', '8888'), 'getLabCases', {}).some(x => x.id === r.id && x.iteroNo === 'IT-778899'), 'lab sees the iTero case');
  assert.equal(api(n, 'findLabCases', 'IT-778899')[0].id, r.id);
  // اختيار المعمل من القائمة (داخلي أو خارجي)
  assert.equal(api(n, 'getLabConfig').iteroLab, 'المعمل الداخلي', 'default iTero lab is sent to the form');
  const ext = api(n, 'createLabCase', { itero: 'IT-5', lab: 'معمل النخبة', doctor: 'د. خالد', fileNo: '56', scanDate: '2020-01-01' });
  assert.equal(api(n, 'getLabCase', ext.id).items[0].lab, 'معمل النخبة');
  throwsCode(() => api(n, 'createLabCase', { itero: 'IT-6', lab: 'معمل غير موجود', doctor: 'د. خالد', fileNo: '57', scanDate: '2020-01-01' }), 'ERR_BAD_LAB');
});

test('setup adds the missing Unayzah dental clinics up to 10 (keeps everything else)', () => {
  const { api, login, gas } = boot(g => {
    g.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [
      ['Dental Clinic 1 - Buraydah', 'Buraydah', 'Dentistry'], ['Dental Clinic 1 - Unayzah', 'Unayzah', 'Dentistry'],
      ['Dental Clinic 2 - Unayzah', 'Unayzah', 'Dentistry'], ['My Renamed Clinic', 'Unayzah', 'Dentistry']]);
    // نظام قائم سبق تجهيزه بإصدار أقدم: الترحيل الأول لا يُعاد
    g.globals.PropertiesService.getScriptProperties().setProperty('setup:done', '2026-10-setup-v4');
  });
  const cfg = api(login('المدير', '1234'), 'getConfig');
  const un = cfg.clinics.filter(c => c.branch === 'Unayzah' && /^Dental Clinic \d+ - Unayzah$/.test(c.name)).map(c => c.name);
  assert.equal(un.length, 10);
  assert.ok(cfg.clinics.some(c => c.name === 'My Renamed Clinic'), 'other clinics are kept');
  assert.equal(rows(gas, 'Clinics').filter(r => r.ClinicName === 'Dental Clinic 1 - Unayzah').length, 1, 'no duplicates');
});

test('backdated requests: nurse records a past received request, tagged and kept out of timing KPIs; closes by setting', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111');
  const cfg = api(n, 'getConfig');
  assert.match(cfg.backdateUntil, /^\d{4}-\d{2}-\d{2}$/, 'open window is sent to the nurse');
  assert.equal(api(login('علي', '3333'), 'getConfig').backdateUntil, '', 'nurses only');
  const day = new Date(Date.now() - 40 * 864e5 + 3 * 36e5).toISOString().slice(0, 10);
  const base = { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 3 }, { name: 'DENTAL FLOSS', qty: 2 }] };
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { backdate: todayISO() })), 'ERR_BACKDATE_DATE');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { backdate: '2020-01-01' })), 'ERR_BACKDATE_DATE');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { backdate: 'x' })), 'ERR_BACKDATE_DATE');
  const mails = gas.mails.length;
  const id = api(n, 'createRequest', Object.assign({}, base, { backdate: day, clientKey: 'bd-key-0001' })).id;
  assert.equal(api(n, 'createRequest', Object.assign({}, base, { backdate: day, clientKey: 'bd-key-0001' })).duplicate, true);
  assert.equal(gas.mails.length, mails, 'no doctor/procurement notifications');
  const r = api(n, 'getMyRequests').find(x => x.id === id);
  assert.equal(r.status, 'تم الاستلام');
  assert.equal(r.backdated, true);
  assert.equal(r.pendingShipments, 0);
  assert.equal(new Date(r.date).toISOString().slice(0, 10), day);
  const it = rows(gas, 'RequestItems').filter(x => x.RequestID === id);
  assert.deepEqual(it.map(x => [x.RequestedQty, x.ApprovedQty, x.ReceivedQty]), [[3, 3, 3], [2, 2, 2]]);
  // لا يظهر لدى الطبيب للمراجعة، ولا يدخل في الأزمنة
  const q = login('منى', '5555');
  const st = api(q, 'getStatsReport', { all: true });
  assert.ok(st.summary.requests >= 1);
  const mon = api(q, 'getMonitor', day.slice(0, 7));
  assert.ok(!mon.late.some(x => x.id === id));
  assert.equal(mon.kpis.requests, 0, 'kept out of the monthly performance KPIs');
  // الإقفال من Settings
  const off = boot(g => g.seed('Settings', ['Key', 'Value', 'Notes'], [['BackdateUntil', 'off', '']]));
  const n2 = off.login('سارة', '1111');
  assert.equal(off.api(n2, 'getConfig').backdateUntil, '');
  throwsCode(() => off.api(n2, 'createRequest', Object.assign({}, base, { backdate: day })), 'ERR_BACKDATE_CLOSED');
});

test('doctor billing: fixed (clinic) doctors carry their whole clinic, box doctors only their own requests — each request once', () => {
  const { api, login } = boot(g => {
    g.seed('Doctors', ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty', 'Billing'], [
      ['د. خالد', 'عيادة الأسنان 1', 'سارة', 'تقويم', 'عيادة'],
      ['د. نورة', 'عيادة الأسنان 1', 'سارة', '', 'بوكس'],
      ['د. فهد', 'عيادة الجلدية 1', 'سارة', 'ليزر', 'عيادة'],
      ['د. سعد', 'عيادة الأسنان 2', 'ريم', '', '']
    ]);
  });
  const n = login('سارة', '1111');
  const mk = (doctor, clinic, qty) => api(n, 'createRequest', { clinic, doctor, type: 'شهري', items: [{ name: 'PROPHY PASTE', qty }] });
  mk('د. نورة', 'عيادة الأسنان 1', 1);   // بوكس → نورة
  mk('د. فهد', 'عيادة الأسنان 1', 2);    // ثابت في عيادة أخرى، طلب في عيادة خالد → خالد
  mk('د. خالد', 'عيادة الأسنان 1', 3);   // → خالد
  api(n, 'createRequest', { clinic: 'Sterilization', branch: 'الرياض', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 4 }] }); // بلا طبيب
  const st = api(login('منى', '5555'), 'getStatsReport', {});
  const b = Object.fromEntries(st.billing.map(x => [x.name, x]));
  assert.deepEqual([b['د. خالد'].basis, b['د. خالد'].clinic, b['د. خالد'].requests, b['د. خالد'].value], ['clinic', 'عيادة الأسنان 1', 2, 300]);
  assert.deepEqual([b['د. نورة'].basis, b['د. نورة'].requests, b['د. نورة'].value], ['box', 1, 60]);
  assert.equal(b[''].value, 240, 'shared areas are not billed to a doctor');
  assert.equal(st.billing.reduce((s, x) => s + x.value, 0), st.summary.value, 'every riyal counted exactly once');
  assert.ok(!b['د. فهد'], 'his request in another fixed clinic goes to that clinic');
});

test('doctors live: open requests per doctor by stage, for quality/executive only', () => {
  const { api, login } = boot();
  const n = login('سارة', '1111');
  const items = [{ name: 'PROPHY PASTE', qty: 1 }];
  const a = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items }).id; // له حساب → مراجعة الطبيب
  api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'طارئ', items });
  const c = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. نورة', type: 'شهري', items }).id; // بدون حساب → جديد
  const q = login('منى', '5555');
  const live = api(q, 'getDoctorsLive');
  const k = live.rows.find(r => r.doctor === 'د. خالد'), nr = live.rows.find(r => r.doctor === 'د. نورة');
  assert.equal(k.ids.review.length, 2);
  assert.ok(k.ids.review.includes(a));
  assert.deepEqual(nr.ids.new, [c]);
  assert.ok(live.totals.review >= 2 && live.totals.new >= 1);
  assert.deepEqual(live.cols, ['review', 'new', 'approved', 'prep', 'sent']);
  throwsCode(() => api(login('علي', '3333'), 'getDoctorsLive'), 'ERR_FORBIDDEN');
});

test('doctor prices: no prices by default; executive / quality / finance grant or withhold per doctor', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. سعد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 2 }] }).id;
  const a = login('المدير', '1234');
  api(a, 'createUser', { name: 'د. سعد', password: '9876', role: 'طبيب' });
  const view = () => { const d = login('د. سعد', '9876'); return { user: api(d, 'getConfig').user, items: api(d, 'getRequestItemsWithCatalog', id), rep: api(d, 'getDoctorReport', {}) }; };
  let v = view();
  assert.equal(v.user.priceView, 'none', 'dental doctor sees no prices by default');
  assert.equal(v.user.noPrices, true);
  assert.ok(!JSON.stringify(v.items).match(/"price"/) && v.rep.summary.total === undefined, 'no price or value reaches the browser');
  // الجودة / التنفيذي / المالية يمنحون الأسعار
  for (const [who, pass] of [['منى', '5555'], ['فيصل', '6666'], ['نواف', '7777']]) {
    assert.ok(api(login(who, pass), 'getDoctorPriceAccess').some(x => x.name === 'د. سعد'), who + ' manages doctor prices');
  }
  const q = login('منى', '5555');
  const list = api(q, 'setDoctorPriceAccess', 'د. سعد', true);
  assert.equal(list.find(x => x.name === 'د. سعد').allowed, true);
  assert.equal(rows(gas, 'Users').find(u => u.Name === 'د. سعد').PriceView, 'يرى الأسعار', 'saved readable in the sheet');
  v = view();
  assert.equal(v.user.priceView, 'all');
  assert.equal(v.items[0].price, 60);
  assert.equal(v.rep.summary.total, 120);
  api(q, 'setDoctorPriceAccess', 'د. سعد', false);
  assert.equal(view().user.noPrices, true, 'withheld again');
  throwsCode(() => api(login('علي', '3333'), 'getDoctorPriceAccess'), 'ERR_FORBIDDEN');
  throwsCode(() => api(q, 'setDoctorPriceAccess', 'علي', true), 'ERR_NOT_FOUND');
  // القيم القديمة «المستهلكات فقط» تُعامل بدون أسعار
  const t2 = boot(g => g.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email', 'PriceView'], [['د. خالد', '4444', 'طبيب', '', '', 'المستهلكات فقط'], ['المدير', '1234', 'أدمن', '', '', '']]));
  assert.equal(t2.api(t2.login('د. خالد', '4444'), 'getConfig').user.priceView, 'none');
});

test('branch manager: no prices or values anywhere (requests, reports, lab, custody) unless granted', () => {
  const { api, login, gas } = boot();
  const a = login('المدير', '1234');
  api(a, 'createUser', { name: 'مدير جدة', password: '9090', role: 'مدير فرع', branch: 'جدة' });
  const reem = login('ريم', '2222');
  const id = api(reem, 'createRequest', { clinic: 'Sterilization', branch: 'جدة', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 2 }] }).id;
  api(reem, 'createLabCase', { doctor: 'د. سعد', fileNo: '22', scanDate: '2020-01-01', lines: [{ lab: 'المعمل الداخلي', workType: 'Denture', material: 'Acrylic' }] });
  const MONEY = /"(price|total|value|avgValue|cost|repairCost|lossValue|activeValue|lineValue|unitPrice|unpriced|badPrices)":/;
  const look = () => {
    const m = login('مدير جدة', '9090');
    const out = { user: api(m, 'getConfig').user, reqs: api(m, 'getRequests', {}), detail: api(m, 'getRequestDetail', id), stats: api(m, 'getStatsReport', {}),
      exec: api(m, 'getExecutiveStats', ''), lab: api(m, 'getLabStats', {}), cases: api(m, 'getLabCases', {}), assets: api(m, 'getAssetStats', {}), clinics: api(m, 'getClinicAssets', {}) };
    return out;
  };
  let v = look();
  assert.equal(v.user.noPrices, true, 'branch manager: no prices by default');
  assert.equal(v.user.priceView, 'none');
  for (const k of ['reqs', 'detail', 'stats', 'exec', 'lab', 'cases', 'assets', 'clinics']) assert.ok(!MONEY.test(JSON.stringify(v[k])), k + ' carries no price or value');
  assert.ok(v.exec.count >= 1, 'request count still reaches the overview');
  // التنفيذي يمنح الأسعار لمدير الفرع من صفحة «أسعار الأطباء»
  const f = login('فيصل', '6666');
  assert.equal(api(f, 'getDoctorPriceAccess').find(x => x.name === 'مدير جدة').role, 'branch');
  api(f, 'setDoctorPriceAccess', 'مدير جدة', true);
  assert.equal(rows(gas, 'Users').find(u => u.Name === 'مدير جدة').PriceView, 'يرى الأسعار');
  v = look();
  assert.equal(v.user.priceView, 'all');
  assert.ok(v.stats.summary.value > 0, 'granted: values come back');
  api(f, 'setDoctorPriceAccess', 'مدير جدة', false);
  assert.equal(look().user.noPrices, true, 'withheld again');
});

test('doctor survey: every 50 days, open 10 days; reminders for those who did not answer; results for quality/executive', () => {
  const { api, login, gas, ctx } = boot();
  const a = login('المدير', '1234');
  assert.ok(rows(gas, 'SurveyQuestions').length >= 14, 'default questions seeded in the sheet');
  assert.ok(rows(gas, 'Settings').some(r => r.Key === 'SurveyStart'), 'first cycle starts on setup day');
  const d = login('د. خالد', '4444');
  const my = api(d, 'getMySurvey');
  assert.equal(my.open, true); assert.equal(my.done, false);
  assert.ok(api(d, 'getAlerts').some(x => x.code === 'alert_survey'), 'doctor is notified until he answers');
  const ans = {};
  my.questions.forEach(q => { ans[q.id] = q.type === 'nps' ? 9 : q.type === 'stars' ? 4 : ''; });
  throwsCode(() => api(d, 'submitSurvey', Object.assign({}, ans, { Q1: 7 })), 'ERR_SURVEY_REQUIRED');
  throwsCode(() => api(d, 'submitSurvey', Object.assign({}, ans, { Q2: '' })), 'ERR_SURVEY_REQUIRED');
  ans.Q14 = 'أسرع لو سمحتوا';
  assert.equal(api(d, 'submitSurvey', ans).ok, true);
  assert.equal(api(d, 'submitSurvey', ans).duplicate, true, 'one answer per cycle');
  assert.equal(api(d, 'getMySurvey').done, true);
  assert.ok(!api(d, 'getAlerts').some(x => x.code === 'alert_survey'), 'notice disappears after answering');
  const q = login('منى', '5555');
  const res = api(q, 'getSurveyResults', '');
  assert.equal(res.answered, 1);
  assert.ok(res.total >= 1 && res.pending.every(p => p.user !== 'د. خالد'));
  assert.equal(res.questions.find(x => x.id === 'Q1').avg, 4);
  assert.equal(res.questions.find(x => x.id === 'Q12').nps, 100);
  assert.equal(res.questions.find(x => x.id === 'Q14').texts[0].text, 'أسرع لو سمحتوا');
  assert.equal(res.responses[0].doctor, 'د. خالد', 'answers are by doctor name');
  assert.equal(res.avg, 4);
  throwsCode(() => api(login('علي', '3333'), 'getSurveyResults', ''), 'ERR_FORBIDDEN');
  // الدورة: مفتوحة 10 أيام من كل 50
  const start = new Date(ctx.surveyCycle_().opens).getTime();
  assert.equal(ctx.surveyCycle_(start + 9.9 * 864e5).open, true);
  assert.equal(ctx.surveyCycle_(start + 10.1 * 864e5).open, false);
  const c2 = ctx.surveyCycle_(start + 50.5 * 864e5);
  assert.ok(c2.open && c2.n === 2);
});

test('survey: the first cycle opens 50 days after the update (an earlier auto start is deferred once)', () => {
  const day = ms => new Date(ms + 3 * 36e5).toISOString().slice(0, 10);
  const fresh = boot(g => g.seed('Settings', ['Key', 'Value', 'Notes'], []));
  const d = fresh.login('د. خالد', '4444');
  assert.equal(fresh.api(d, 'getMySurvey').open, false, 'nothing pops up right after the update');
  assert.ok(!fresh.api(d, 'getAlerts').some(x => x.code === 'alert_survey'));
  assert.equal(String(rows(fresh.gas, 'Settings').find(r => r.Key === 'SurveyStart').Value).replace(/^'/, ''), day(Date.now() + 50 * 864e5));
  // نظام حُدّث سابقاً وكتب تاريخ اليوم تلقائياً ولم يُجب أحد: يُؤجَّل 50 يوماً
  const old = boot(g => {
    g.seed('Settings', ['Key', 'Value', 'Notes'], [['SurveyStart', day(Date.now()), 'تاريخ أول دورة لاستبيان الأطباء (YYYY-MM-DD)']]);
    g.globals.PropertiesService.getScriptProperties().setProperty('setup:done', '2026-10-setup-v7');
  });
  assert.equal(old.api(old.login('د. خالد', '4444'), 'getMySurvey').open, false, 'an already-open first cycle is pushed back');
  // تاريخ وضعه الأدمن بنفسه لا يُلمس
  const manual = boot();
  assert.equal(manual.api(manual.login('د. خالد', '4444'), 'getMySurvey').open, true);
});

test('catalog: ItemType column (مستهلك / ماتيريال) is added to ItemsCatalog automatically, Category untouched', () => {
  const { login, gas } = boot();
  login('ريم', '2222');
  const h = gas.dump('ItemsCatalog')[0];
  assert.ok(h.includes('ItemType') && h.includes('Category'));
});

test('derma device rooms (Hydrafacial / Clarity / Gentle Pro) take clinic consumables like sterilization and triage', () => {
  const { api, login } = boot(gas => gas.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [
    ['عيادة الأسنان 1', 'الرياض', 'أسنان'], ['عيادة الجلدية 1', 'الرياض', 'جلدية'], ['Sterilization', 'الرياض', 'تعقيم'],
    ['Derma Hydrafacial', 'الرياض', 'Dermatology'], ['Derma Clarity', 'الرياض', 'Dermatology'], ['Derma Gentle Pro', 'الرياض', 'Dermatology']
  ]));
  const n = login('سارة', '1111');
  for (const room of ['Derma Hydrafacial', 'Derma Clarity', 'Derma Gentle Pro']) {
    const r = api(n, 'createRequest', { clinic: room, type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 1 }] });
    assert.match(r.id, /^REQ-/, room + ': clinic consumables accepted');
  }
  throwsCode(() => api(n, 'createRequest', { clinic: 'عيادة الجلدية 1', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 2 }] }), 'ERR_CLINIC_SHARED_ONLY');
  const reqs = api(n, 'getMyRequests').filter(r => /Derma (Hydrafacial|Clarity|Gentle Pro)/.test(r.clinic));
  assert.equal(reqs.length, 3);
  assert.ok(reqs.every(r => !r.doctor && r.department === 'جلدية'), 'no doctor, dermatology department');
});

test('procurement cancels requests in bulk with a reason: nurse sees it and is emailed; shipped requests are skipped', () => {
  const { api, login, gas } = boot(g => { const u = g.ss.getSheetByName('Users')._data; u.find(r => r[0] === 'ريم')[u[0].indexOf('Email')] = 'reem@example.com'; });
  const reem = login('ريم', '2222'), p = login('علي', '3333');
  const mk = n => api(reem, 'createRequest', { doctor: 'د. سعد', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'DENTAL FLOSS', qty: n }] }).id;
  const a = mk(1), b = mk(2), c = mk(3);
  api(p, 'bulkUpdateStatus', [b, c], 'قيد التجهيز');
  api(p, 'dispatchItems', c, ['PROPHY PASTE']);
  throwsCode(() => api(p, 'cancelRequests', [a], ' '), 'ERR_REASON_REQUIRED');
  throwsCode(() => api(reem, 'cancelRequests', [a], 'x'), 'ERR_FORBIDDEN');
  const res = api(p, 'cancelRequests', [a, b, c, 'REQ-NOPE'], 'الصنف غير متوفر لدى المورد');
  assert.deepEqual(res.cancelled.sort(), [a, b].sort());
  assert.deepEqual(res.skipped.map(x => [x.id, x.reason]), [[c, 'ERR_HAS_SHIPMENTS'], ['REQ-NOPE', 'ERR_NOT_FOUND']]);
  const mine = api(reem, 'getMyRequests');
  const ra = mine.find(r => r.id === a);
  assert.deepEqual([ra.status, ra.cancelReason, ra.cancelledBy], ['ملغي', 'الصنف غير متوفر لدى المورد', 'علي']);
  assert.equal(mine.find(r => r.id === c).status, 'قيد التجهيز');
  assert.ok(gas.mails.some(m => /أُلغي طلبك/.test(m.subject) && /غير متوفر/.test(m.body)), 'nurse emailed with the reason');
  assert.ok(api(reem, 'getComments', a).some(x => /أُلغي الطلب/.test(x.message)));
  assert.equal(api(reem, 'getRequestDetail', a).cancelReason, 'الصنف غير متوفر لدى المورد');
  // ملغي = منتهٍ: لا يُلغى مرة ثانية ولا يظهر متأخراً عند الطبيب
  assert.deepEqual(api(p, 'cancelRequests', [a], 'مرة ثانية').skipped.map(x => x.reason), ['ERR_BAD_TRANSITION']);
  assert.ok(!api(p, 'getRequests', {}).find(r => r.id === a).overdue);
});

test('sheet change trigger: a plain cell edit does not invalidate every lookup cache; row deletes do', () => {
  const { ctx, login } = boot();
  login('ريم', '2222');
  const ver = () => ctx.cache_().get('v:Users');
  ctx.MEMO_ = {};
  const v0 = ver();
  ctx.onSheetChange({ changeType: 'EDIT', source: null });
  assert.equal(ver(), v0, 'EDIT keeps the Users cache');
  ctx.onSheetChange({ changeType: 'REMOVE_ROW', source: null });
  assert.notEqual(ver(), v0, 'REMOVE_ROW refreshes lookups');
});

test('lab supplies: lab raises a request with no doctor or approval; procurement hands it over directly (no box, no signature)', () => {
  const { api, login, gas } = boot();
  const lab = login('فني المعمل', '8888'), p = login('علي', '3333'), reem = login('ريم', '2222');
  const id = api(lab, 'createRequest', { type: 'شهري', doctor: 'د. سعد', items: [{ name: 'PROPHY PASTE', qty: 4 }, { name: 'DENTAL FLOSS', qty: 2 }] }).id;
  let r = api(lab, 'getMyRequests').find(x => x.id === id);
  assert.deepEqual([r.clinic, r.doctor, r.status, r.needsReview], ['مستهلكات المعمل', '', 'جديد', false], 'no doctor even if one is sent, no review');
  assert.ok(api(p, 'getRequests', {}).some(x => x.id === id), 'procurement sees it');
  throwsCode(() => api(reem, 'getRequestDetail', id), 'ERR_FORBIDDEN');
  // جزء الآن ← مستلَم فوراً بلا بوكس ولا توقيع، والطلب يبقى مفتوحاً للباقي
  api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز');
  api(p, 'dispatchItems', id, [{ name: 'PROPHY PASTE', qty: 3 }]);
  r = api(lab, 'getMyRequests').find(x => x.id === id);
  assert.deepEqual([r.pendingShipments, r.remainingQty, r.status === 'تم الاستلام'], [0, 3, false], 'partial handover: nothing to sign, 3 units left');
  api(p, 'dispatchItems', id, [{ name: 'PROPHY PASTE' }, { name: 'DENTAL FLOSS' }]);
  r = api(lab, 'getMyRequests').find(x => x.id === id);
  assert.deepEqual([r.status, r.pendingShipments], ['تم الاستلام', 0]);
  assert.equal((api(p, 'getBoxes').boxes || []).length, 0, 'no box for lab supplies');
  const items = api(lab, 'getRequestDetail', id).items;
  assert.deepEqual(items.map(i => [i.item, i.receivedQty]).sort(), [['DENTAL FLOSS', 2], ['PROPHY PASTE', 4]]);
  // الإرسال بالجملة كذلك يسلّم مباشرة
  const id2 = api(lab, 'createRequest', { type: 'طارئ', items: [{ name: 'DENTAL FLOSS', qty: 1 }] }).id;
  api(p, 'bulkUpdateStatus', [id2], 'قيد التجهيز');
  api(p, 'bulkUpdateStatus', [id2], 'تم الإرسال', {});
  assert.equal(api(lab, 'getMyRequests').find(x => x.id === id2).status, 'تم الاستلام');
  assert.ok(!(gas.dump('Boxes') || [[]]).slice(1).length);
});

test('boxes view for branch managers / operations: own branch only (all if no branch), no QR tokens or driver link', () => {
  const { api, login } = boot();
  const a = login('المدير', '1234'), p = login('علي', '3333'), reem = login('ريم', '2222');
  api(a, 'createUser', { name: 'مدير جدة', password: '9090', role: 'مدير فرع', branch: 'جدة' });
  api(a, 'createUser', { name: 'مدير التشغيل', password: '9292', role: 'مدير فرع' });
  const mk = n => api(reem, 'createRequest', { doctor: 'د. سعد', type: 'طارئ', items: [{ name: 'PROPHY PASTE', qty: n }] }).id;
  const x = mk(1), y = mk(2);
  api(p, 'bulkUpdateStatus', [x, y], 'قيد التجهيز');
  api(p, 'dispatchItems', x, ['PROPHY PASTE'], { owner: 'د. سعد', branch: 'جدة' });
  api(p, 'dispatchItems', y, ['PROPHY PASTE'], { owner: 'د. خالد', branch: 'الرياض' });
  const j = api(login('مدير جدة', '9090'), 'getBoxes');
  assert.equal(j.readOnly, true);
  assert.deepEqual(j.boxes.map(b => b.owner), ['د. سعد'], 'جدة manager sees only جدة boxes');
  assert.ok(!('driverToken' in j) && j.boxes.every(b => !('k' in b)), 'no QR token or driver link');
  assert.ok(j.boxes[0].loads.length === 1 && j.boxes[0].history.length > 0, 'location, loads and last moves are shown');
  const ops = api(login('مدير التشغيل', '9292'), 'getBoxes');
  assert.deepEqual(ops.boxes.map(b => b.owner).sort(), ['د. خالد', 'د. سعد'].sort(), 'no branch = all branches');
  assert.ok(api(p, 'getBoxes').driverToken, 'procurement still gets the driver link');
  throwsCode(() => api(reem, 'getBoxes'), 'ERR_FORBIDDEN');
  throwsCode(() => api(login('مدير جدة', '9090'), 'requestBoxMove', 'BOX-001', 'التموين'), 'ERR_FORBIDDEN');
});

test('nurse cancels her own request raised by mistake — only at doctor review or «new» before procurement starts; doctor is told', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const items = [{ name: 'PROPHY PASTE', qty: 2 }];
  const r = api(n, 'createRequest', { doctor: 'د. خالد', type: 'شهري', items });
  assert.equal(api(d, 'getDoctorRequests')[0].status, 'مراجعة الطبيب');
  throwsCode(() => api(login('ريم', '2222'), 'withdrawRequest', r.id), 'ERR_FORBIDDEN');
  throwsCode(() => api(p, 'withdrawRequest', r.id), 'ERR_FORBIDDEN');
  gas.mails.length = 0;
  assert.equal(api(n, 'withdrawRequest', r.id, 'اخترت الطبيب الخطأ'), true);
  const q = rows(gas, 'Requests').find(x => x.RequestID === r.id);
  assert.deepEqual([q.Status, q.CancelReason, q.CancelledBy], ['ملغي', 'اخترت الطبيب الخطأ', 'سارة']);
  assert.ok(gas.mails.some(m => /أُلغي طلب كان بانتظار مراجعتك/.test(m.subject)), 'doctor notified');
  assert.ok(rows(gas, 'Log').some(l => l.RequestID === r.id && /ألغت الممرضة الطلب/.test(l.Action)));
  throwsCode(() => api(n, 'withdrawRequest', r.id), 'ERR_WITHDRAW_REVIEW_ONLY');
  // بعد الإلغاء ترفع نفس الطلب فوراً كطلب جديد (لا يُعتبر مكرراً للملغي)
  // بعد اعتماد الطبيب لا تلغيه الممرضة (التموين يلغيه بسبب)
  const r2 = api(n, 'createRequest', { doctor: 'د. خالد', type: 'شهري', items });
  assert.ok(r2.id !== r.id && !r2.duplicate, 'same request raised again right after cancelling is a new request');
  api(d, 'doctorReview', r2.id, 'اعتمد', '', []);
  throwsCode(() => api(n, 'withdrawRequest', r2.id), 'ERR_WITHDRAW_REVIEW_ONLY');
  // مستهلكات العيادة («جديد» عند التموين): تُلغى ما دام التموين لم يبدأ فيها، بلا إيميل للطبيب
  const r3 = api(n, 'createRequest', { clinic: 'Sterilization', branch: 'الرياض', type: 'شهري', items });
  gas.mails.length = 0;
  api(n, 'withdrawRequest', r3.id);
  assert.equal(rows(gas, 'Requests').find(x => x.RequestID === r3.id).Status, 'ملغي');
  assert.equal(gas.mails.length, 0, 'no doctor email for a request that never went to a doctor');
  const r5 = api(n, 'createRequest', { clinic: 'Sterilization', branch: 'الرياض', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 5 }] });
  api(p, 'bulkUpdateStatus', [r5.id], 'قيد التجهيز');
  throwsCode(() => api(n, 'withdrawRequest', r5.id), 'ERR_WITHDRAW_REVIEW_ONLY');
  // السبب اختياري
  const r4 = api(n, 'createRequest', { doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 7 }] });
  api(n, 'withdrawRequest', r4.id);
  assert.equal(rows(gas, 'Requests').find(x => x.RequestID === r4.id).CancelReason, 'رُفع بالغلط');
});

test('nurse edits the items of her request (qty change / remove) under the same rules as cancelling', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const r = api(n, 'createRequest', { doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'DENTAL FLOSS', qty: 4 }, { name: 'قفازات طبية M', qty: 1 }] });
  throwsCode(() => api(login('ريم', '2222'), 'editRequestItems', r.id, [{ item: 'PROPHY PASTE', qty: 1 }]), 'ERR_FORBIDDEN');
  throwsCode(() => api(p, 'editRequestItems', r.id, [{ item: 'PROPHY PASTE', qty: 1 }]), 'ERR_FORBIDDEN');
  throwsCode(() => api(n, 'editRequestItems', r.id, [{ item: 'PROPHY PASTE', qty: -1 }]), 'ERR_BAD_QTY');
  throwsCode(() => api(n, 'editRequestItems', r.id, [{ item: 'PROPHY PASTE', qty: 0 }, { item: 'DENTAL FLOSS', qty: 0 }, { item: 'قفازات طبية M', qty: 0 }]), 'ERR_ALL_ZERO');
  assert.equal(api(n, 'editRequestItems', r.id, [{ item: 'PROPHY PASTE', qty: 5 }, { item: 'DENTAL FLOSS', qty: 0 }, { item: 'قفازات طبية M', qty: 1 }]).changed, 2);
  const its = rows(gas, 'RequestItems').filter(x => x.RequestID === r.id).map(x => [x.ItemName, x.RequestedQty]);
  assert.deepEqual(its, [['PROPHY PASTE', 5], ['قفازات طبية M', 1]], 'qty changed and the removed item is gone');
  assert.ok(rows(gas, 'Log').some(l => l.RequestID === r.id && /عدّلت الممرضة الأصناف: PROPHY PASTE: 2 ← 5، حذف DENTAL FLOSS \(4\)/.test(l.Action)), 'change logged old → new');
  const doc = api(d, 'getRequestDetail', r.id);
  assert.deepEqual(doc.items.map(i => i.item), ['PROPHY PASTE', 'قفازات طبية M'], 'doctor reviews the edited request');
  assert.equal(api(n, 'editRequestItems', r.id, [{ item: 'PROPHY PASTE', qty: 5 }]).changed, 0, 'no change = no-op');
  // بعد اعتماد الطبيب: لا تعديل
  api(d, 'doctorReview', r.id, 'اعتمد', '', []);
  throwsCode(() => api(n, 'editRequestItems', r.id, [{ item: 'PROPHY PASTE', qty: 1 }]), 'ERR_WITHDRAW_REVIEW_ONLY');
  // «جديد» (مستهلكات عيادة) يُعدّل حتى يبدأ التموين
  const r2 = api(n, 'createRequest', { clinic: 'Sterilization', branch: 'الرياض', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 3 }] });
  api(n, 'editRequestItems', r2.id, [{ item: 'PROPHY PASTE', qty: 6 }]);
  assert.equal(rows(gas, 'RequestItems').find(x => x.RequestID === r2.id).RequestedQty, 6);
  api(p, 'bulkUpdateStatus', [r2.id], 'قيد التجهيز');
  throwsCode(() => api(n, 'editRequestItems', r2.id, [{ item: 'PROPHY PASTE', qty: 1 }]), 'ERR_WITHDRAW_REVIEW_ONLY');
});

test('nurse free-text item: added to the catalog with its type and clinic department; limits and duplicates enforced', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333');
  const catRows = () => rows(gas, 'ItemsCatalog');
  const before = catRows().length;
  const r = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', type: 'شهري', items: [
    { name: 'Sterile saliva ejector', qty: 3, free: true, type: 'مستهلك' },
    { name: 'PROPHY PASTE', qty: 1 }
  ] });
  assert.match(r.id, /^REQ-/);
  const added = catRows().slice(before);
  assert.equal(added.length, 1, 'one new catalog row');
  assert.deepEqual([added[0].ItemName, added[0].Category, added[0].ItemType, added[0].Department], ['Sterile saliva ejector', 'حر — من الممرضة', 'مستهلك', 'أسنان']);
  assert.ok(rows(gas, 'RequestItems').some(x => x.RequestID === r.id && x.ItemName === 'Sterile saliva ejector' && Number(x.RequestedQty) === 3));
  // the same name again is now a catalog item: no second row
  api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', type: 'شهري', items: [{ name: 'sterile SALIVA ejector', qty: 1, free: true, type: 'ماتيريال' }] });
  assert.equal(catRows().length, before + 1, 'existing item is not duplicated');
  // a name that already exists in the catalog is never re-added as a free item
  api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', type: 'شهري', items: [{ name: 'DENTAL FLOSS', qty: 1, free: true, type: 'مستهلك' }] });
  assert.equal(catRows().length, before + 1);
  throwsCode(() => api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', type: 'شهري', items: [{ name: 'Free one', qty: 1, free: true, type: 'تجربة' }] }), 'ERR_FREE_ITEM_TYPE');
  throwsCode(() => api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', type: 'شهري', items: [{ name: 'x', qty: 1, free: true, type: 'مستهلك' }] }), 'ERR_FREE_ITEM_NAME');
  const six = ['A1 item', 'B1 item', 'C1 item', 'D1 item', 'E1 item', 'F1 item'].map(name => ({ name, qty: 1, free: true, type: 'مستهلك' }));
  throwsCode(() => api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', type: 'شهري', items: six }), 'ERR_FREE_ITEMS_MAX');
  throwsCode(() => api(p, 'createRequest', { clinic: 'عيادة الأسنان 1', type: 'شهري', items: [{ name: 'Only nurses', qty: 1, free: true, type: 'مستهلك' }] }), 'ERR_FORBIDDEN');
  assert.equal(catRows().length, before + 1, 'rejected requests add nothing');
});
