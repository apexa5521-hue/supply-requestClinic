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

function boot(extraSeed) {
  const gas = createGas({
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

test('login: locks out after 5 failed attempts', () => {
  const { api } = boot();
  for (let i = 0; i < 5; i++) assert.equal(api(null, 'login', 'علي', 'bad').success, false);
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

test('config: nurse sees only her clinics and no prices', () => {
  const { api, login } = boot();
  const cfg = api(login('سارة', '1111'), 'getConfig');
  assert.deepEqual(cfg.clinics.map(c => c.name).sort(), ['عيادة الأسنان 1', 'عيادة الجلدية 1'].sort());
  assert.ok(cfg.catalog.length >= 7);
  assert.ok(cfg.catalog.every(c => c.price === undefined));
  const proc = api(login('علي', '3333'), 'getConfig');
  assert.equal(proc.catalog.find(c => c.name === 'PROPHY PASTE').price, 60);
  assert.equal(proc.roles.length, 0, 'roles only for admin');
  assert.equal(api(login('المدير', '1234'), 'getConfig').roles.length, 5);
});

test('createRequest: validation', () => {
  const { api, login } = boot();
  const n = login('سارة', '1111');
  const base = { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 2 }] };
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { clinic: 'عيادة الأسنان 2' })), 'ERR_FORBIDDEN');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { doctor: 'د. فهد' })), 'ERR_BAD_DOCTOR');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { type: 'x' })), 'ERR_BAD_TYPE');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { items: [] })), 'ERR_NO_ITEMS');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { items: [{ name: 'A', qty: 0 }] })), 'ERR_BAD_QTY');
  throwsCode(() => api(n, 'createRequest', Object.assign({}, base, { items: [{ name: 'A', qty: -3 }] })), 'ERR_BAD_QTY');
});

test('createRequest: success, merge duplicates, new catalog item, email, double-submit guard', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111');
  const payload = {
    clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'طارئ',
    items: [{ name: 'PROPHY PASTE', qty: 2 }, { name: 'prophy paste', qty: 3 }, { name: 'صنف جديد تماماً', qty: 1 }],
    nurse: 'منتحل'
  };
  const res = api(n, 'createRequest', payload);
  assert.match(res.id, /^REQ-\d{6}-001$/);
  assert.equal(res.duplicate, false);
  const req = rows(gas, 'Requests').find(r => r.RequestID === res.id);
  assert.equal(req.Nurse, 'سارة', 'nurse comes from the session, not the payload');
  assert.equal(req.Status, 'جديد');
  const items = rows(gas, 'RequestItems').filter(r => r.RequestID === res.id);
  assert.equal(items.length, 2);
  assert.equal(items.find(i => i.ItemName === 'PROPHY PASTE').RequestedQty, 5);
  assert.ok(rows(gas, 'ItemsCatalog').some(c => c.ItemName === 'صنف جديد تماماً'));
  assert.ok(gas.mails.some(m => m.to.indexOf('ali@example.com') !== -1 && /طارئ/.test(m.subject)));
  const again = api(n, 'createRequest', payload);
  assert.equal(again.duplicate, true);
  assert.equal(again.id, res.id);
  const second = api(n, 'createRequest', Object.assign({}, payload, { type: 'شهري' }));
  assert.match(second.id, /-002$/);
});

test('full workflow: prep → review → approve → partial dispatch → receive', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 4 }, { name: 'DENTAL FLOSS', qty: 10 }] }).id;

  // لا يمكن الإرسال قبل الاعتماد
  let r = api(p, 'bulkUpdateStatus', [id], 'تم الإرسال');
  assert.deepEqual(r.updated, []);
  assert.equal(r.skipped[0].reason, 'ERR_NEEDS_APPROVAL');
  r = api(p, 'bulkUpdateStatus', [id], 'مراجعة الطبيب');
  assert.equal(r.skipped[0].reason, 'ERR_BAD_TRANSITION', 'must prepare before review');

  assert.deepEqual(api(p, 'bulkUpdateStatus', [id, 'REQ-NOPE'], 'قيد التجهيز').updated, [id]);
  api(p, 'updateItemApproval', id, 'DENTAL FLOSS', 8);
  assert.deepEqual(api(p, 'bulkUpdateStatus', [id], 'مراجعة الطبيب').updated, [id]);
  assert.ok(gas.mails.some(m => m.to === 'khaled@example.com'));
  throwsCode(() => api(p, 'updateItemApproval', id, 'DENTAL FLOSS', 9), 'ERR_LOCKED');

  // الطبيب
  assert.equal(api(d, 'getDoctorRequests').length, 1);
  const withPrices = api(d, 'getRequestItemsWithCatalog', id);
  assert.equal(withPrices.find(i => i.item === 'PROPHY PASTE').price, 60);
  throwsCode(() => api(d, 'doctorReview', id, 'رفض', '', []), 'ERR_REASON_REQUIRED');
  api(d, 'doctorReview', id, 'اعتمد', 'تمام', [{ item: 'DENTAL FLOSS', note: 'نوع شمعي' }]);
  throwsCode(() => api(d, 'doctorReview', id, 'اعتمد', '', []), 'ERR_BAD_TRANSITION');

  // إرسال جزئي ثم كامل
  let ds = api(p, 'dispatchItems', id, ['PROPHY PASTE']);
  assert.equal(ds.allSent, false);
  assert.equal(api(p, 'getRequestItemsFull', id).dispatchStatus['PROPHY PASTE'], true);
  ds = api(p, 'dispatchItems', id, ['DENTAL FLOSS']);
  assert.equal(ds.allSent, true);
  assert.ok(gas.mails.some(m => m.to === 'sara@example.com' && /تم إرسال طلبك/.test(m.subject)));

  // ممرضة أخرى لا تستطيع الاستلام
  const other = login('ريم', '2222');
  throwsCode(() => api(other, 'receiveRequest', id, [], 'ريم', '', ''), 'ERR_FORBIDDEN');
  throwsCode(() => api(n, 'receiveRequest', id, [], '', '', ''), 'ERR_REQUIRED');
  const rec = api(n, 'receiveRequest', id, [{ name: 'PROPHY PASTE', qty: 4 }, { name: 'DENTAL FLOSS', qty: 6 }], 'سارة', PNG, PNG);
  assert.ok(rec.signatureUrl && rec.receiptUrl);
  assert.equal(gas.files.length, 2);
  throwsCode(() => api(n, 'receiveRequest', id, [], 'سارة', '', ''), 'ERR_BAD_TRANSITION');

  const det = api(n, 'getRequestDetail', id);
  assert.equal(det.status, 'تم الاستلام');
  assert.equal(typeof det.submittedAt, 'string', 'dates are serialized');
  assert.equal(det.items.find(i => i.item === 'DENTAL FLOSS').receivedQty, 6);
  assert.equal(det.items.find(i => i.item === 'DENTAL FLOSS').notes[0].note, 'نوع شمعي');
  assert.equal(det.comments[0].message, 'تمام');
  assert.equal(det.kpi.unit, 'days');
  assert.ok(det.log.length >= 6);

  const stats = api(login('منى', '5555'), 'getExecutiveStats', '');
  assert.equal(stats.total, 1);
  assert.equal(stats.shortages, 1, 'DENTAL FLOSS received 6 of approved 8');
});

test('doctor rejection returns to procurement and can be re-prepared', () => {
  const { api, login, gas } = boot();
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444');
  const id = api(n, 'createRequest', { clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: 'شهري', items: [{ name: 'Itero Sleeve', qty: 50 }] }).id;
  api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز');
  api(p, 'bulkUpdateStatus', [id], 'مراجعة الطبيب');
  api(d, 'doctorReview', id, 'رفض', 'الكمية كبيرة', []);
  let req = api(n, 'getMyRequests')[0];
  assert.equal(req.status, 'مرفوض');
  assert.equal(req.rejectionReason, 'الكمية كبيرة');
  assert.ok(gas.mails.some(m => m.to === 'sara@example.com' && /رفض/.test(m.subject)));
  assert.deepEqual(api(p, 'bulkUpdateStatus', [id], 'قيد التجهيز').updated, [id]);
  req = api(n, 'getMyRequests')[0];
  assert.equal(req.rejectionReason, '');
  const alerts = api(n, 'getAlerts');
  assert.ok(Array.isArray(alerts));
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
  const id = api(sara, 'createRequest', { clinic: 'عيادة الجلدية 1', doctor: 'د. فهد', type: 'شهري', items: [{ name: 'X', qty: 1 }] }).id;
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
  api(p, 'resolveComplaint', c.id);
  assert.equal(api(q, 'getComplaints', true).length, 0);
  assert.equal(api(q, 'getComplaints', false)[0].resolvedBy, 'علي');

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
  throwsCode(() => api(a, 'saveRole', 'تنفيذي', 'dashboard'), 'ERR_LAST_ADMIN');
  throwsCode(() => api(a, 'saveRole', 'مشرف', 'hacker'), 'ERR_BAD_SCREEN');
  assert.ok(api(a, 'saveRole', 'مشرف', 'dashboard').some(r => r.name === 'مشرف'));
  assert.ok(!api(a, 'deleteRole', 'مشرف').some(r => r.name === 'مشرف'));
  assert.ok(!api(a, 'deleteUser', 'جديد').some(u => u.name === 'جديد'));
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
  api(n, 'receiveRequest', 'REQ-250101-5', [{ name: 'DENTAL FLOSS', qty: 3 }], 'سارة', '', '');
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
  assert.equal(gas.dump('Roles').length, 7);
  assert.equal(gas.dump('ItemsCatalog').length, 18);
  const r = ctx.api(null, 'login', ['المدير', '1234']);
  assert.equal(r.user.screen, 'admin');
});
