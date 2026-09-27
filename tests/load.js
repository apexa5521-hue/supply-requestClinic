/* اختبار الحِمل: هل يعلق أو يبطئ النظام مع كثرة الطلبات؟
   التشغيل: node tests/load.js [عدد الطلبات، الافتراضي 5000]
   يقيس (على Code.gs الحقيقي فوق المحاكي):
   1) زمن المعالجة وعدد رحلات الخدمات لكل عملية على بيانات ضخمة
   2) حجم الرد المرسل للمتصفح
   3) رفع 1200 طلب متتالٍ في يوم واحد: أرقام فريدة، بدون تباطؤ تراكمي
   4) أن الكاش يبقى فعّالاً مع حجم البيانات (بدون قراءة الشيت) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const { createGas } = require('./gas-mock');
const { seedFixtures } = require('./fixtures');

const N = Number(process.argv[2]) || 5000;
const COST = { read: 90, write: 70, append: 110, meta: 40, cache: 12, lock: 30, mail: 450, drive: 700, flush: 60 };

const gas = createGas({ digest: (s, l) => Array.from(crypto.createHash(l === 16 ? 'md5' : 'sha256').update(s, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)) });
seedFixtures(gas);
(function big() {
  const items = ['MICRO BRUSH FINE', 'PROPHY PASTE', 'DENTAL FLOSS', 'Etchant Blue Tip', 'Ivoclar Tetric-N A2', 'Itero Sleeve', 'قفازات طبية M'];
  const st = ['مراجعة الطبيب', 'معتمد من الطبيب', 'قيد التجهيز', 'تم الإرسال', 'تم الاستلام', 'تم الاستلام', 'تم الاستلام'];
  const req = [], ri = [], log = [];
  for (let i = 0; i < N; i++) {
    const id = 'REQ-24' + String(i).padStart(6, '0');
    const d = new Date(Date.UTC(2024, i % 12, 1 + (i % 27)));
    const s = st[i % st.length];
    const sent = s === 'تم الإرسال' || s === 'تم الاستلام';
    req.push([id, d, i % 2 ? 'عيادة الأسنان 1' : 'عيادة الأسنان 2', i % 2 ? 'د. خالد' : 'د. سعد', i % 2 ? 'سارة' : 'ريم', i % 5 ? 'شهري' : 'طارئ', s, d, sent ? d : '', s === 'تم الاستلام' ? d : '', '', '', i % 2 ? 'الرياض' : 'جدة', s === 'مراجعة الطبيب' ? '' : d]);
    for (let k = 0; k < 6; k++) ri.push([id, items[(i + k) % items.length] + (k === 6 ? '' : ''), 3, 3, s === 'تم الاستلام' ? 3 : '', sent ? d : '', sent ? 1 : '']);
    for (let k = 0; k < 10; k++) log.push([d, id, 'إجراء ' + k, 'علي']);
  }
  gas.seed('Requests', ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status', 'SubmittedAt', 'SentAt', 'ReceivedAt', 'ReceiverName', 'SignatureURL', 'Branch', 'ApprovedAt'], req);
  gas.seed('RequestItems', ['RequestID', 'ItemName', 'RequestedQty', 'ApprovedQty', 'ReceivedQty', 'DispatchedAt', 'DispatchBatch'], ri);
  gas.seed('Log', ['Timestamp', 'RequestID', 'Action', 'User'], log);
})();
const ctx = vm.createContext(Object.assign({ Buffer }, gas.globals));
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
const login = (n, p) => ctx.api(null, 'login', [n, p]).token;
const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444'), q = login('منى', '5555');

function measure(label, token, fn, args) {
  const before = JSON.parse(JSON.stringify(gas.ops));
  const t0 = process.hrtime.bigint();
  let out, err = '';
  try { out = ctx.api(token, fn, args || []); } catch (e) { err = e.message; }
  const cpu = Number(process.hrtime.bigint() - t0) / 1e6;
  let est = 0; const by = {};
  Object.keys(gas.ops.byKind).forEach(k => { const x = gas.ops.byKind[k] - (before.byKind[k] || 0); if (x) { by[k] = x; est += x * (COST[k] || 50); } });
  const bytes = out === undefined ? 0 : Buffer.byteLength(JSON.stringify(out));
  return { label, cpu: Math.round(cpu), est: Math.round(est), calls: gas.ops.calls - before.calls, kb: Math.round(bytes / 1024), by, err };
}
const rows = [];
const m = (l, t, f, a) => { const r = measure(l, t, f, a); rows.push(r); return r; };
m('getRequests (cold cache)', p, 'getRequests', [{}]);
m('getRequests', p, 'getRequests', [{}]);
m('getMyRequests (nurse)', n, 'getMyRequests');
m('getDoctorRequests', d, 'getDoctorRequests');
m('getAlerts (procurement)', p, 'getAlerts');
m('getRequestDetail', n, 'getRequestDetail', ['REQ-24000001']);
m('getExecutiveStats', q, 'getExecutiveStats', ['']);
m('getDoctorReport (cumulative)', d, 'getDoctorReport', [{ from: '', to: '' }]);
const warmReads = rows.slice(1).reduce((a, r) => a + (r.by.read || 0), 0);

// رفع 1200 طلب متتالي (أكثر من 999 في يوم واحد)
const ids = new Set();
const times = [];
for (let i = 0; i < 1200; i++) {
  const t0 = process.hrtime.bigint();
  const res = ctx.api(n, 'createRequest', [{ clinic: 'عيادة الأسنان 1', doctor: 'د. خالد', type: i % 7 ? 'شهري' : 'طارئ', items: [{ name: 'PROPHY PASTE', qty: 1 + (i % 50) }, { name: 'DENTAL FLOSS', qty: 1 + Math.floor(i / 50) }] }]);
  times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  if (res.duplicate) throw new Error('unexpected duplicate at ' + i);
  ids.add(res.id);
}
const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
const first = avg(times.slice(0, 100)), last = avg(times.slice(-100));
m('getRequests after +1200', p, 'getRequests', [{}]);
m('doctorReview (approve)', d, 'doctorReview', [[...ids][5], 'اعتمد', '', []]);
m('bulk prep 50 requests', p, 'bulkUpdateStatus', [[...ids].slice(0, 50), 'قيد التجهيز']);

console.log(`\nLoad: ${N} requests · ${N * 6} items · ${N * 10} log rows\n`);
console.log('operation'.padEnd(34) + 'cpu ms'.padStart(8) + 'est ms'.padStart(8) + 'calls'.padStart(7) + 'KB'.padStart(7) + '  breakdown');
rows.forEach(r => console.log(r.label.padEnd(34) + String(r.cpu).padStart(8) + String(r.est).padStart(8) + String(r.calls).padStart(7) + String(r.kb).padStart(7) + '  ' + JSON.stringify(r.by) + (r.err ? '  ERR ' + r.err : '')));
console.log(`\n1200 submissions: unique ids ${ids.size}/1200 · avg first 100 = ${first} ms, last 100 = ${last} ms (cpu, node)`);
console.log('warm reads touching the sheet: ' + warmReads);
const errs = rows.filter(r => r.err);
assert.equal(errs.length, 0, 'errors: ' + errs.map(r => r.label + ' ' + r.err).join('; '));
assert.equal(ids.size, 1200, 'every submitted request gets a unique number (even beyond 999/day)');
console.log('\nLOAD OK');
