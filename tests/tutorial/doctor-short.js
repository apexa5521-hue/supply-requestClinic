/* فيديو قصير للطبيب — المراجعة والاعتماد والمعمل (بدون أي ذكر للأسعار) */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This short video shows doctors how to review and approve their requests, and follow their patients\' lab work.',
    ar: 'فيديو قصير للأطباء: كيف تراجع طلباتك وتعتمدها، وتتابع أعمال مرضاك في المعمل.' },
  login: { en: 'Open the system link, write your name and password, and tap Sign in.',
    ar: 'افتح رابط النظام، واكتب اسمك ورقمك السري، ثم اضغط «تسجيل الدخول».' },
  page: { en: 'Your page opens on Reviews. The cards at the top count your requests: waiting for your review, approved, sent, and received.',
    ar: 'تفتح صفحتك على «المراجعات». البطاقات بالأعلى تعرض أعداد طلباتك: بانتظار مراجعتك، المعتمدة، المرسلة، والمستلمة.' },
  open: { en: 'Tap a request to open it. You see each item and the quantity the nurse asked for.',
    ar: 'اضغط على الطلب لفتحه، وسترى كل صنف والكمية التي طلبتها الممرضة.' },
  edit: { en: 'If a quantity is too much or too little, change it. You can also write a note on any item.',
    ar: 'إذا كانت الكمية أكثر أو أقل من اللازم عدّلها، ويمكنك كتابة ملاحظة على أي صنف.' },
  approve: { en: 'Then tap Approve. The request goes to procurement right away.',
    ar: 'ثم اضغط «اعتماد»، فيذهب الطلب للتموين مباشرة.' },
  reject: { en: 'If something is wrong, write the reason and tap Reject. The request goes back to the nurse.',
    ar: 'إذا كان هناك خطأ، اكتب السبب واضغط «رفض»، فيعود الطلب للممرضة.' },
  lab: { en: 'On the Lab page, follow your patients\' lab work: where each case is now, and when it is due.',
    ar: 'في صفحة «المعمل» تابع أعمال مرضاك: أين وصلت كل إرسالية، ومتى موعدها.' },
  done: { en: 'That\'s it. Please review your requests quickly, so your clinic gets its supplies on time. Thank you!',
    ar: 'هذا كل شيء. نرجو مراجعة الطلبات بسرعة حتى تصل مستلزمات عيادتك في وقتها. شكرًا لك!' }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' },
  review: { en: 'Review & approve', ar: 'المراجعة والاعتماد' },
  lab: { en: 'Lab work', ar: 'المعمل' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  // د. سعد بدون صلاحية أسعار — لا تظهر أي أسعار في التفاصيل
  const r1 = (await h.api('createRequest', [{ branch: 'Unayzah', doctor: 'Dr. Saad', type: 'شهري', items: [{ name: 'MICRO BRUSH FINE', qty: 6 }, { name: 'Cotton rolls', qty: 3 }] }], ['Mona', '1212'])).id;
  const r2 = (await h.api('createRequest', [{ branch: 'Unayzah', doctor: 'Dr. Saad', type: 'طارئ', items: [{ name: 'Etchant Blue Tip', qty: 10 }] }], ['Mona', '1212'])).id;

  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Dr. Saad', '4545'); });
  await scene('page', 'review', async () => {
    if (!(await page.$('#docList'))) await h.nav('reviews');
    await page.waitForSelector('#docList .req');
    for (const i of [1, 2, 3, 4]) await highlight('#docKpis .kpi:nth-child(' + i + ')', 1000);
  });
  await scene('open', 'review', async () => {
    await click(`#docList [data-id="${r1}"]`);
    await page.waitForSelector('#rvItems table'); await wait(600);
    await highlight('#rvItems table', 1800);
  });
  await scene('edit', 'review', async () => {
    await point('.rvQty >> nth=0');
    await page.fill('.rvQty >> nth=0', '4'); await page.dispatchEvent('.rvQty >> nth=0', 'input');
    await wait(500);
    await type('.rvNote >> nth=0', 'Four are enough this month');
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
  await scene('lab', 'lab', async () => {
    await h.nav('labdoc');
    await page.waitForSelector('#labList .lab-card');
    await highlight('#labList .lab-card', 1600);
    await click('#labList .lab-card [data-act="labOpen"]');
    await wait(1500);
    await page.keyboard.press('Escape');
  });
  await scene('done', '', async () => { await h.nav('reviews'); });
}

if (require.main === module) makeTutorial({ id: 'doctor-short', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
