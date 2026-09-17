/**
 * شغّل هذه الدالة مرة واحدة فقط بعد ربط المشروع بالـ Google Sheet
 * تنشئ كل التبويبات المطلوبة بالأعمدة الصحيحة.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsDef = {
    'Users':        ['Name', 'Password', 'Role', 'Clinic', 'Email'],
    'Clinics':      ['ClinicName', 'Branch', 'Type'],
    'Doctors':      ['DoctorName', 'Clinic', 'NurseName'],
    'ItemsCatalog': ['ItemName'],
    'Requests':     ['RequestID', 'Date', 'Clinic', 'Doctor', 'Nurse', 'Type', 'Status',
                      'SubmittedAt', 'SentAt', 'ReceivedAt', 'ReceiverName', 'SignatureURL'],
    'RequestItems': ['RequestID', 'ItemName', 'RequestedQty', 'ApprovedQty', 'ReceivedQty'],
    'Log':          ['Timestamp', 'RequestID', 'Action', 'User'],
    'Comments':     ['Timestamp', 'RequestID', 'Author', 'Role', 'Message'],
    'Notices':      ['Timestamp', 'FromRole', 'FromName', 'ToRole', 'Message']
  };

  Object.keys(sheetsDef).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var headers = sheetsDef[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, headers.length);
  });

  // حذف الشيت الافتراضي الفارغ إن وجد
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(def);
  }

  // مستخدم مدير افتراضي أول مرة فقط (غيّر كلمة السر بعد أول دخول)
  var usersSheet = ss.getSheetByName('Users');
  if (usersSheet.getLastRow() === 1) {
    usersSheet.appendRow(['المدير', '1234', 'تنفيذي', '', '']);
  }

  // كتالوج أصناف مبدئي (مأخوذ من نموذج استلام فعلي) - عدّله كما تحتاج
  var itemsSheet = ss.getSheetByName('ItemsCatalog');
  if (itemsSheet.getLastRow() === 1) {
    var seedItems = [
      'MICRO BRUSH FINE', 'MICRO BRUSH SUPER FINE', 'PROPHY PASTE', 'PROPHY BRUSH',
      'MIXING PED', 'Itero Sleeve', 'IVOCLAR TETRIC N BOND 6G', 'Etchant Blue Tip',
      'INVISALIGN REMOVAL', 'Ivoclar Tetric-N A2', 'Shofu Flowable Plus A2',
      'B&E ACID ETCH x3 Sy x5ml', 'Ver-Dent Needle bur', 'JOTA WHITE STONE',
      'PD METAL STRIP DUBBLE SAID x12', 'PD METAL STRIP ONE SIDE x12', 'DENTAL FLOSS'
    ];
    itemsSheet.getRange(2, 1, seedItems.length, 1).setValues(seedItems.map(function (i) { return [i]; }));
  }

  SpreadsheetApp.getUi().alert('تم إنشاء كل التبويبات بنجاح. عدّل بيانات Users / Clinics / Doctors قبل الاستخدام.');
}
/** نظام طلبات المستلزمات - ApexCare Clinics */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('نظام طلبات المستلزمات - ApexCare')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

/* ---------------- تسجيل الدخول ---------------- */

function checkLogin(name, password) {
  const data = sheet('Users').getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(name).trim() && String(data[i][1]) === String(password)) {
      return { success: true, name: data[i][0], role: data[i][2], clinic: data[i][3], email: data[i][4] };
    }
  }
  return { success: false };
}

/* ---------------- بيانات مرجعية ---------------- */

function getClinics() {
  return sheet('Clinics').getDataRange().getValues().slice(1)
    .filter(r => r[0]).map(r => ({ name: r[0], branch: r[1], type: r[2] }));
}

function getDoctors(clinicFilter) {
  return sheet('Doctors').getDataRange().getValues().slice(1)
    .filter(r => r[0] && (!clinicFilter || r[1] === clinicFilter))
    .map(r => ({ name: r[0], clinic: r[1], nurse: r[2] }));
}

function getItemsCatalog() {
  return sheet('ItemsCatalog').getDataRange().getValues().slice(1)
    .map(r => r[0]).filter(String);
}

function addItemToCatalog(itemName) {
  itemName = String(itemName).trim();
  if (!itemName) return getItemsCatalog();
  const existing = getItemsCatalog();
  if (existing.indexOf(itemName) === -1) sheet('ItemsCatalog').appendRow([itemName]);
  return getItemsCatalog();
}

/* ---------------- الطلبات ---------------- */

function generateRequestId() {
  const s = sheet('Requests');
  const seq = s.getLastRow(); // يشمل صف العناوين، يعطي رقم تسلسلي كافٍ
  return 'REQ-' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyMMdd') + '-' + seq;
}

function createRequest(payload) {
  const id = generateRequestId();
  const now = new Date();
  sheet('Requests').appendRow([
    id, now, payload.clinic, payload.doctor, payload.nurse, payload.type,
    'جديد', now, '', '', '', ''
  ]);
  const itemsSheet = sheet('RequestItems');
  const catalog = getItemsCatalog();
  payload.items.forEach(function (it) {
    itemsSheet.appendRow([id, it.name, it.qty, '', '']);
    if (catalog.indexOf(it.name) === -1) { sheet('ItemsCatalog').appendRow([it.name]); catalog.push(it.name); }
  });
  logAction(id, 'إنشاء طلب (' + payload.type + ')', payload.nurse);
  notifyProcurement(id, payload);
  return id;
}

function notifyProcurement(id, payload) {
  const users = sheet('Users').getDataRange().getValues();
  const emails = users.slice(1).filter(r => r[2] === 'تموين').map(r => r[4]).filter(String);
  if (emails.length) {
    MailApp.sendEmail(emails.join(','), 'طلب مستلزمات جديد - ' + id,
      'تم رفع طلب جديد.\nرقم الطلب: ' + id +
      '\nالعيادة: ' + payload.clinic +
      '\nالطبيب: ' + payload.doctor +
      '\nالممرضة: ' + payload.nurse +
      '\nنوع الطلب: ' + payload.type);
  }
}

function notifyNurseSent(requestRow) {
  const users = sheet('Users').getDataRange().getValues();
  const nurseRow = users.slice(1).find(r => r[0] === requestRow[4]);
  if (nurseRow && nurseRow[4]) {
    MailApp.sendEmail(nurseRow[4], 'تم إرسال طلبك - ' + requestRow[0],
      'تم إرسال طلبك رقم ' + requestRow[0] + ' الخاص بعيادة ' + requestRow[2] +
      '.\nيرجى تأكيد الاستلام من داخل النظام عند وصول الطلب.');
  }
}

function logAction(requestId, action, user) {
  sheet('Log').appendRow([new Date(), requestId, action, user]);
}

function getRequests(filters) {
  filters = filters || {};
  return sheet('Requests').getDataRange().getValues().slice(1)
    .filter(function (r) {
      if (!r[0]) return false;
      if (filters.status && r[6] !== filters.status) return false;
      if (filters.clinic && r[2] !== filters.clinic) return false;
      if (filters.nurse && r[4] !== filters.nurse) return false;
      if (filters.month) {
        var m = Utilities.formatDate(new Date(r[1]), 'Asia/Riyadh', 'yyyy-MM');
        if (m !== filters.month) return false;
      }
      return true;
    })
    .map(function (r) {
      return {
        id: r[0], date: r[1], clinic: r[2], doctor: r[3], nurse: r[4], type: r[5],
        status: r[6], submittedAt: r[7], sentAt: r[8], receivedAt: r[9],
        receiver: r[10], signature: r[11]
      };
    })
    .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
}

function getRequestItems(requestId) {
  return sheet('RequestItems').getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0] === requestId; })
    .map(function (r) {
      return { item: r[1], requestedQty: r[2], approvedQty: r[3], receivedQty: r[4] };
    });
}

function updateItemApproval(requestId, itemName, approvedQty) {
  const s = sheet('RequestItems');
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === requestId && data[i][1] === itemName) {
      s.getRange(i + 1, 4).setValue(approvedQty);
    }
  }
}

function bulkUpdateStatus(requestIds, newStatus) {
  const s = sheet('Requests');
  requestIds.forEach(function (id) {
    const data = s.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
        s.getRange(i + 1, 7).setValue(newStatus);
        if (newStatus === 'تم الإرسال') {
          s.getRange(i + 1, 9).setValue(new Date());
          notifyNurseSent(s.getRange(i + 1, 1, 1, 12).getValues()[0]);
        }
        logAction(id, 'تغيير الحالة إلى: ' + newStatus, 'التموين');
        break;
      }
    }
  });
}

function receiveRequest(requestId, receivedItems, receiverName, signatureDataUrl) {
  let signatureUrl = '';
  if (signatureDataUrl) signatureUrl = saveSignature(requestId, signatureDataUrl);

  const s = sheet('Requests');
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === requestId) {
      s.getRange(i + 1, 7).setValue('تم الاستلام');
      s.getRange(i + 1, 10).setValue(new Date());
      s.getRange(i + 1, 11).setValue(receiverName);
      s.getRange(i + 1, 12).setValue(signatureUrl);
      break;
    }
  }

  const ri = sheet('RequestItems');
  const rdata = ri.getDataRange().getValues();
  receivedItems.forEach(function (it) {
    for (let i = 1; i < rdata.length; i++) {
      if (rdata[i][0] === requestId && rdata[i][1] === it.name) {
        ri.getRange(i + 1, 5).setValue(it.qty);
        break;
      }
    }
  });
  logAction(requestId, 'استلام وتوقيع', receiverName);
}

function saveSignature(requestId, dataUrl) {
  const folderName = 'ApexCare-Signatures';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const base64 = dataUrl.split(',')[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', requestId + '.png');
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/* ---------------- تقرير الجودة ---------------- */

function getQualityReport(month) {
  const requests = getRequests(month ? { month: month } : {});
  const rows = requests.filter(function (r) { return r.submittedAt && r.sentAt; })
    .map(function (r) {
      const hours = (new Date(r.sentAt) - new Date(r.submittedAt)) / 36e5;
      return { id: r.id, clinic: r.clinic, doctor: r.doctor, type: r.type, hours: Math.round(hours * 10) / 10 };
    });
  const byClinic = {};
  rows.forEach(function (r) {
    if (!byClinic[r.clinic]) byClinic[r.clinic] = [];
    byClinic[r.clinic].push(r.hours);
  });
  const averages = Object.keys(byClinic).map(function (c) {
    const arr = byClinic[c];
    const avg = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    return { clinic: c, avgHours: Math.round(avg * 10) / 10, count: arr.length };
  });
  return { rows: rows, averages: averages };
}

/* ---------------- اتجاه الأداء الشهري (للتتبع) ---------------- */

function getQualityTrend(monthsBack) {
  monthsBack = monthsBack || 6;
  const all = sheet('Requests').getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0] && r[7] && r[8]; }) // له SubmittedAt و SentAt
    .map(function (r) {
      return {
        month: Utilities.formatDate(new Date(r[1]), 'Asia/Riyadh', 'yyyy-MM'),
        hours: (new Date(r[8]) - new Date(r[7])) / 36e5
      };
    });

  const byMonth = {};
  all.forEach(function (r) { (byMonth[r.month] = byMonth[r.month] || []).push(r.hours); });

  const months = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(Utilities.formatDate(d, 'Asia/Riyadh', 'yyyy-MM'));
  }

  return months.map(function (m) {
    const arr = byMonth[m] || [];
    const avg = arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0;
    return { month: m, avgHours: Math.round(avg * 10) / 10, count: arr.length };
  });
}

function addComment(requestId, author, role, message) {
  message = String(message || '').trim();
  if (!message) return getComments(requestId);
  sheet('Comments').appendRow([new Date(), requestId, author, role, message]);
  return getComments(requestId);
}

function getComments(requestId) {
  return sheet('Comments').getDataRange().getValues().slice(1)
    .filter(function (r) { return r[1] === requestId; })
    .map(function (r) { return { time: r[0], requestId: r[1], author: r[2], role: r[3], message: r[4] }; })
    .sort(function (a, b) { return new Date(a.time) - new Date(b.time); });
}

// آخر الملاحظات على كل الطلبات - لقسم الجودة/الإدارة التنفيذية
function getAllComments(limit) {
  limit = limit || 30;
  return sheet('Comments').getDataRange().getValues().slice(1)
    .map(function (r) { return { time: r[0], requestId: r[1], author: r[2], role: r[3], message: r[4] }; })
    .sort(function (a, b) { return new Date(b.time) - new Date(a.time); })
    .slice(0, limit);
}

/* ---------------- تنبيهات/ملاحظات عامة بين الإدارات ---------------- */
// ToRole = 'تموين' أو 'ممرضة' أو 'الكل'

function addNotice(fromRole, fromName, toRole, message) {
  message = String(message || '').trim();
  if (!message) return;
  sheet('Notices').appendRow([new Date(), fromRole, fromName, toRole, message]);
}

function getNotices(forRole) {
  return sheet('Notices').getDataRange().getValues().slice(1)
    .filter(function (r) { return r[3] === forRole || r[3] === 'الكل'; })
    .map(function (r) { return { time: r[0], fromRole: r[1], fromName: r[2], toRole: r[3], message: r[4] }; })
    .sort(function (a, b) { return new Date(b.time) - new Date(a.time); })
    .slice(0, 20);
}

/* ---------------- لوحة الإدارة التنفيذية / الجودة ---------------- */

function getExecutiveStats(month) {
  const all = getRequests(month ? { month: month } : {});
  const statusCounts = {};
  all.forEach(function (r) { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

  // الأصناف الأكثر طلباً (بديل تقريبي عن دوران المخزون - النظام لا يتتبع كميات المخزون الفعلية بالمستودع)
  const itemTotals = {};
  const ids = all.map(function (r) { return r.id; });
  sheet('RequestItems').getDataRange().getValues().slice(1)
    .filter(function (r) { return ids.indexOf(r[0]) !== -1; })
    .forEach(function (r) {
      itemTotals[r[1]] = (itemTotals[r[1]] || 0) + (Number(r[2]) || 0);
    });
  const topItems = Object.keys(itemTotals)
    .map(function (name) { return { name: name, qty: itemTotals[name] }; })
    .sort(function (a, b) { return b.qty - a.qty; })
    .slice(0, 8);

  const qr = getQualityReport(month);
  const overallAvg = qr.rows.length
    ? Math.round(qr.rows.reduce(function (s, r) { return s + r.hours; }, 0) / qr.rows.length * 10) / 10
    : 0;

  return {
    total: all.length,
    statusCounts: statusCounts,
    overallAvgHours: overallAvg,
    byClinic: qr.averages,
    topItems: topItems,
    recentComments: getAllComments(10)
  };
}
