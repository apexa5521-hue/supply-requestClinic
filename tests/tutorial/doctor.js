/* فيديو الطبيب — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This video is for doctors. You will learn how to review and approve your requests, read your report, follow your patients\' lab work, and answer the satisfaction survey.',
    ar: 'هذا الفيديو للأطباء: كيف تراجع طلباتك وتعتمدها، وتقرأ تقريرك، وتتابع أعمال مرضاك في المعمل، وتجيب على استبيان الرضا.' },
  survey: { en: 'Every 50 days, a short satisfaction survey opens for ten days. It appears when you sign in. Tap the stars, choose a number from zero to ten, write a note if you like, and tap Send. If you tap Later, a notice stays at the top until you answer.',
    ar: 'كل 50 يومًا يُفتح استبيان رضا قصير لمدة عشرة أيام، ويظهر لك عند الدخول. اضغط النجوم، واختر رقمًا من صفر إلى عشرة، واكتب ملاحظة إن أردت، ثم «إرسال». وإذا ضغطت «لاحقًا» يبقى تنبيه أعلى صفحتك حتى تجيب.' },
  login: { en: 'Open the system link, write your name and password, and tap Sign in.',
    ar: 'افتح رابط النظام، واكتب اسمك ورقمك السري، ثم اضغط «تسجيل الدخول».' },
  page: { en: 'Your page opens on Reviews. The cards at the top count your requests: waiting for your review, approved, sent to the branch, and received. Tap any card to show only those requests.',
    ar: 'تفتح صفحتك على «المراجعات». البطاقات بالأعلى تعرض أعداد طلباتك: بانتظار مراجعتك، المعتمدة، المرسلة للفرع، والمستلمة. اضغط أي بطاقة لعرض طلباتها فقط.' },
  open: { en: 'Tap a request to open it. You see each item and the quantity the nurse asked for. Prices appear only if the management gave you price access.',
    ar: 'اضغط على الطلب لفتحه، وسترى كل صنف والكمية التي طلبتها الممرضة. الأسعار تظهر فقط إذا منحتك الإدارة صلاحية الأسعار.' },
  edit: { en: 'If a quantity is too much or too little, change it. You can also write a note on any item.',
    ar: 'إذا كانت الكمية أكثر أو أقل من اللازم عدّلها، ويمكنك كتابة ملاحظة على أي صنف.' },
  approve: { en: 'Then tap Approve. The request goes to procurement right away, and the nurse can follow it.',
    ar: 'ثم اضغط «اعتماد»، فيذهب الطلب للتموين مباشرة وتتابعه الممرضة.' },
  reject: { en: 'If something is wrong, write the reason and tap Reject. The request goes back to the nurse to fix it and send it again.',
    ar: 'إذا كان هناك خطأ، اكتب السبب واضغط «رفض»، فيعود الطلب للممرضة لتصحيحه وإرساله مرة أخرى.' },
  report: { en: 'Tap Requests report to see what you ordered. Choose one month, or cumulative until a date.',
    ar: 'اضغط «تقرير الطلبات» لترى ما طلبته: لشهر واحد، أو تراكميًا حتى تاريخ معين.' },
  reportview: { en: 'The report shows each request with its items and quantities, and the prices if you have price access. You can print it or save it as PDF.',
    ar: 'يعرض التقرير كل طلب بأصنافه وكمياته، والأسعار إن كانت لديك صلاحيتها، ويمكنك طباعته أو حفظه PDF.' },
  lab: { en: 'On the Lab page, you follow your patients\' lab work: where each case is now, and when it is due.',
    ar: 'في صفحة «المعمل» تتابع أعمال مرضاك: أين وصلت كل إرسالية، ومتى موعدها.' },
  derma: { en: 'By default, doctors see no prices at all, for dental and dermatology. Only the items and quantities. Price access is given by the executive management, quality or finance.',
    ar: 'افتراضيًا لا يرى الأطباء أي أسعار، أسنان أو جلدية، فقط الأصناف والكميات. صلاحية الأسعار تمنحها الإدارة التنفيذية أو الجودة أو المالية.' },
  password: { en: 'To change your password, tap the lock icon at the bottom, then write the old and the new password.',
    ar: 'لتغيير رقمك السري اضغط أيقونة القفل بالأسفل، واكتب الرقم القديم ثم الجديد.' },
  done: { en: 'That\'s it. Please review your requests quickly, so your clinic gets its supplies on time. Thank you!',
    ar: 'هذا كل شيء. نرجو مراجعة الطلبات بسرعة حتى تصل مستلزمات عيادتك في وقتها. شكرًا لك!' }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' },
  review: { en: 'Review & approve', ar: 'المراجعة والاعتماد' },
  report: { en: 'Your report', ar: 'تقريرك' },
  lab: { en: 'Lab work', ar: 'المعمل' },
  derma: { en: 'Prices', ar: 'الأسعار' },
  survey: { en: 'Survey', ar: 'الاستبيان' },
  pw: { en: 'Password', ar: 'الرقم السري' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  // طلبان بانتظار المراجعة (اعتماد ورفض) + طلب لطبيبة الجلدية
  const r1 = (await h.api('createRequest', [{ branch: 'Buraydah', doctor: 'Dr. Khalid', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 6 }, { name: 'Composite A2', qty: 3 }] }], ['Sara', '1111'])).id;
  const r2 = (await h.api('createRequest', [{ branch: 'Buraydah', doctor: 'Dr. Khalid', type: 'طارئ', items: [{ name: 'Etchant Blue Tip', qty: 10 }] }], ['Sara', '1111'])).id;
  await h.api('createRequest', [{ branch: 'Buraydah', doctor: 'Dr. Lama', type: 'شهري', items: [{ name: 'Hyaluronic filler 1ml', qty: 4 }, { name: 'Numbing cream', qty: 2 }] }], ['Huda', '1313']);
  await page.evaluate(() => { window.print = () => {}; });

  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Dr. Khalid', '4444'); });
  await scene('survey', 'survey', async () => {
    await page.waitForSelector('.modal .sv-form', { timeout: 8000 });
    await wait(600);
    const n = await page.locator('.modal .sv-stars').count();
    for (let i = 0; i < n; i++) {
      const st = page.locator('.modal .sv-stars').nth(i).locator('.sv-b').nth(i % 3 === 0 ? 3 : 4);
      await st.scrollIntoViewIfNeeded(); await st.click(); await wait(150);
    }
    await page.locator('.modal .sv-nps .sv-b[data-v="9"]').scrollIntoViewIfNeeded();
    await click('.modal .sv-nps .sv-b[data-v="9"]');
    await type('.modal textarea[data-q="Q14"]', 'Please add the delivery time to the box');
    await click('#svSend'); await wait(1200);
  });
  await scene('page', 'review', async () => {
    await page.waitForSelector('#docList .req');
    for (const i of [1, 2, 3, 4]) await highlight('#docKpis .kpi:nth-child(' + i + ')', 1300);
  });
  await scene('open', 'review', async () => {
    await click(`#docList [data-id="${r1}"]`);
    await page.waitForSelector('#rvItems table'); await wait(600);
    await highlight('#rvItems table', 2000);
  });
  await scene('edit', 'review', async () => {
    await point('.rvQty >> nth=0');
    await page.fill('.rvQty >> nth=0', '4'); await page.dispatchEvent('.rvQty >> nth=0', 'input');
    await wait(500);
    await type('.rvNote >> nth=0', 'Four boxes are enough this month');
  });
  await scene('approve', 'review', async () => { await click('#rvApprove'); await wait(1200); });
  await scene('reject', 'review', async () => {
    await click(`#docList [data-id="${r2}"]`);
    await page.waitForSelector('#rvItems table'); await wait(500);
    await type('#rvReason', 'We still have etchant in stock');
    await click('#rvReject');
    await page.waitForSelector('[data-yes]'); await wait(600);
    await click('[data-yes]'); await wait(1200);
  });
  await scene('report', 'report', async () => {
    await click('#docReportBtn');
    await page.waitForSelector('#repGo');
    await point('[data-seg-name="repMode"][data-v="cum"]');
    await highlight('[data-seg-name="repMode"]', 1200);
    await click('#repGo');
  });
  await scene('reportview', 'report', async () => {
    await page.waitForSelector('.rep .rep-tiles'); await wait(500);
    await h.scroll(400, '.modal-body');
    await highlight('.rep-grand', 1500);
    await point('#repPrint');
    await page.keyboard.press('Escape');
  });
  await scene('lab', 'lab', async () => {
    await h.nav('labdoc');
    await page.waitForSelector('#labList .lab-card');
    await highlight('#labList .lab-card', 1600);
    await click('#labList .lab-card [data-act="labOpen"]');
    await wait(1500);
    await page.keyboard.press('Escape');
  });
  await scene('derma', 'derma', async () => {
    await h.logout(); await h.login('Dr. Lama', '4646');
    if (!(await page.$('#docList'))) await h.nav('reviews');
    await page.waitForSelector('#docList .req');
    await click('#docList .req [data-id]');
    await page.waitForSelector('#rvItems table'); await wait(800);
    await highlight('#rvItems table', 2200);
    await page.keyboard.press('Escape');
  });
  await scene('password', 'pw', async () => {
    await click('#pwBtn');
    await page.waitForSelector('#pwCur');
    await highlight('#pwCur', 900); await highlight('#pwNew', 900);
    await page.keyboard.press('Escape');
  });
  await scene('done', '', async () => { await wait(600); });
}

if (require.main === module) makeTutorial({ id: 'doctor', langs: ['ar'], surveyFor: 'Dr. Khalid', scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
