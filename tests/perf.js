/* قياس تكلفة كل استدعاء API على بيانات بحجم واقعي (عدد رحلات خدمة Sheets/Cache/Mail/Drive).
   التشغيل: node tests/perf.js   — يطبع جدولاً بالتكلفة التقديرية بالمللي ثانية */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { createGas } = require('./gas-mock');
const { seedFixtures } = require('./fixtures');

// تقدير تقريبي لزمن كل رحلة في Apps Script الحقيقي (مللي ثانية)
const COST = { read: 90, write: 70, append: 110, meta: 40, cache: 12, lock: 30, mail: 450, drive: 700, flush: 60 };
const CELL_MS = 0.004; // نقل البيانات للقراءات الكبيرة

function big(gas, N) {
  const items = ['MICRO BRUSH FINE', 'PROPHY PASTE', 'DENTAL FLOSS', 'Etchant Blue Tip', 'Ivoclar Tetric-N A2', 'Itero Sleeve', 'قفازات طبية M'];
  const st = ['جديد', 'قيد التجهيز', 'معتمد من الطبيب', 'تم الإرسال', 'تم الاستلام'];
  const req = [], ri = [], log = [], com = [];
  for (let i = 0; i < N; i++) {
    const id = 'REQ-2501' + String(i).padStart(4, '0');
    const d = new Date(Date.UTC(2025, i % 12, 1 + (i % 27)));
    const s = st[i % st.length];
    req.push([id, d, 'عيادة الأسنان 1', 'د. خالد', 'سارة', i % 4 ? 'شهري' : 'طارئ', s, d, s === 'تم الإرسال' || s === 'تم الاستلام' ? d : '', s === 'تم الاستلام' ? d : '', '', '']);
    for (let k = 0; k < 6; k++) ri.push([id, items[(i + k) % items.length] + (k > 5 ? k : ''), 3, 3, '', s === 'تم الإرسال' || s === 'تم الاستلام' ? d : '', s === 'تم الإرسال' || s === 'تم الاستلام' ? 1 : '']);
    for (let k = 0; k < 10; k++) log.push([d, id, 'إجراء ' + k, 'علي']);
    if (i % 2) com.push([d, id, 'سارة', 'ممرضة', 'ملاحظة']);
  }
  gas.seed('Requests', ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status', 'SubmittedAt', 'SentAt', 'ReceivedAt', 'ReceiverName', 'SignatureURL'], req);
  gas.seed('RequestItems', ['RequestID', 'ItemName', 'RequestedQty', 'ApprovedQty', 'ReceivedQty', 'DispatchedAt', 'DispatchBatch'], ri);
  gas.seed('Log', ['Timestamp', 'RequestID', 'Action', 'User'], log);
  gas.seed('Comments', ['Timestamp', 'RequestID', 'Author', 'Role', 'Message'], com);
}

function boot(N) {
  const gas = createGas({ digest: (str, len) => Array.from(crypto.createHash(len === 16 ? 'md5' : 'sha256').update(str, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)) });
  seedFixtures(gas);
  big(gas, N);
  const ctx = vm.createContext(Object.assign({ Buffer }, gas.globals));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
  return { gas, ctx };
}

function measure(gas, ctx, label, token, fn, args) {
  const trace = gas.ops.trace; delete gas.ops.trace;
  const before = JSON.parse(JSON.stringify(gas.ops));
  if (process.env.PERF_TRACE) gas.ops.trace = [];
  const t0 = process.hrtime.bigint();
  let err = '';
  try { ctx.api(token, fn, args); } catch (e) { err = e.message; }
  const cpu = Number(process.hrtime.bigint() - t0) / 1e6;
  const by = {};
  let est = (gas.ops.cells - before.cells) * CELL_MS;
  Object.keys(gas.ops.byKind).forEach(k => { const n = gas.ops.byKind[k] - (before.byKind[k] || 0); if (n) { by[k] = n; est += n * (COST[k] || 50); } });
  if (gas.ops.trace && (process.env.PERF_TRACE === '*' || label.indexOf(process.env.PERF_TRACE) !== -1)) console.log('\n── ' + label + '\n  ' + gas.ops.trace.join('\n  '));
  delete gas.ops.trace; void trace;
  return { label, calls: gas.ops.calls - before.calls, est: Math.round(est), cpu: Math.round(cpu), by, err };
}

function run(N) {
  const { gas, ctx } = boot(N);
  const rows = [];
  const login = (n, p) => ctx.api(null, 'login', [n, p]).token;
  const n = login('سارة', '1111'), p = login('علي', '3333'), d = login('د. خالد', '4444'), q = login('منى', '5555');
  const plan = { procurement: [['getRequests', [{}]], ['getComplaints', [false]], ['getAlerts', []], ['getNotices', []]] };
  ctx.api(null, 'login', ['علي', '3333', plan]); // تسخين
  rows.push(measure(gas, ctx, 'login + preload (procurement)', null, 'login', ['علي', '3333', plan]));
  // طلب بانتظار الطبيب (مباشرة في الشيت — لم يعد التموين يعيد الطلبات للطبيب)
  const rv = 'REQ-25010006';
  { const sh = gas.ss.getSheetByName('Requests'); const H = sh._data[0]; sh._data.find(r => r[0] === rv)[H.indexOf('Status')] = 'مراجعة الطبيب'; ctx.api(p, 'getRequests', [{}]); ctx.onEdit && ctx.onEdit({ range: { getSheet: () => sh } }); }
  const id = 'REQ-25010002'; // معتمد من الطبيب
  const m = (l, t, f, a) => rows.push(measure(gas, ctx, l, t, f, a || []));
  m('nurse getConfig (cold cache)', n, 'getConfig');
  m('nurse getConfig', n, 'getConfig');
  m('nurse getMyRequests (cold cache)', n, 'getMyRequests');
  m('nurse getMyRequests', n, 'getMyRequests');
  m('nurse getAlerts', n, 'getAlerts');
  m('nurse batch(config+mine+alerts+notices)', n, 'batch', [[['getConfig', []], ['getMyRequests', []], ['getAlerts', []], ['getNotices', []]]]);
  m('nurse getRequestDetail', n, 'getRequestDetail', [id]);
  m('proc getRequests', p, 'getRequests', [{}]);
  m('proc getRequests (again)', p, 'getRequests', [{}]);
  m('proc getRequestItemsFull', p, 'getRequestItemsFull', [id]);
  m('proc getAlerts', p, 'getAlerts');
  m('proc dispatchItems (2 of 6)', p, 'dispatchItems', [id, ['PROPHY PASTE', 'DENTAL FLOSS']]);
  m('proc bulk send rest', p, 'bulkUpdateStatus', [[id], 'تم الإرسال']);
  m('nurse getMyRequests (after write)', n, 'getMyRequests');
  m('nurse receiveShipment', n, 'receiveShipment', [id, 1, [{ name: 'PROPHY PASTE', qty: 3 }], 'سارة', '', '', '']);
  m('nurse getRequestDetail (after receipt)', n, 'getRequestDetail', [id]);
  m('doctor getDoctorRequests', d, 'getDoctorRequests');
  m('doctor approve (doctorReview)', d, 'doctorReview', [rv, 'اعتمد', '', []]);
  m('proc updateItemApproval', p, 'updateItemApproval', ['REQ-25010005', 'PROPHY PASTE', 2]);
  m('quality getExecutiveStats', q, 'getExecutiveStats', ['']);
  m('quality getAlerts', q, 'getAlerts');
  m('quality getMonitor', q, 'getMonitor');
  m('quality getStatsReport (all)', q, 'getStatsReport', [{}]);
  m('quality login + preload', null, 'login', ['منى', '5555', { quality: [['getExecutiveStats', ['']], ['getQualityReport', ['']], ['getQualityTrend', [6]], ['getComplaints', [false]], ['getAlerts', []]] }]);
  const f = login('نواف', '7777');
  m('finance getFinance (all)', f, 'getFinance', [{}]);
  const L = login('فني المعمل', '8888');
  m('lab getLabCases', L, 'getLabCases', [{}]);
  m('lab getLabStats', L, 'getLabStats', [{}]);
  return rows;
}

const N = Number(process.argv[2]) || 600;
const rows = run(N);
console.log(`\n${N} requests · ${N * 6} items · ${N * 10} log rows\n`);
console.log('endpoint'.padEnd(44) + 'calls'.padStart(6) + 'est ms'.padStart(9) + 'cpu ms'.padStart(8) + '  breakdown');
rows.forEach(r => console.log(r.label.padEnd(44) + String(r.calls).padStart(6) + String(r.est).padStart(9) + String(r.cpu).padStart(8) + '  ' + JSON.stringify(r.by) + (r.err ? '  ERR ' + r.err : '')));
if (process.env.PERF_JSON) fs.writeFileSync(process.env.PERF_JSON, JSON.stringify(rows));
