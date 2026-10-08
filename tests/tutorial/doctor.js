/* فيديو الطبيب — صوت إنجليزي + ترجمة عربية · بدون أي ذكر أو ظهور للأسعار (طبيب بلا صلاحية أسعار) */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: 'هذا الفيديو للأطباء: كيف تراجع طلباتك وتعتمدها، وتقرأ تقريرك، وتتابع أعمال مرضاك في المعمل.' },
  login: { ar: 'افتح رابط النظام، واكتب اسمك ورقمك السري، ثم اضغط «تسجيل الدخول».' },
  survey: { ar: 'كل 50 يومًا يُفتح استبيان رضا قصير لمدة عشرة أيام. اضغط النجوم، واختر رقمًا من 0 إلى 10، ثم «إرسال».' },
  page: { ar: 'البطاقات بالأعلى تعرض أعداد طلباتك: بانتظار مراجعتك، والمعتمدة، والمرسلة، والمستلمة. اضغط أي بطاقة لعرض طلباتها.' },
  open: { ar: 'اضغط الطلب لفتحه، وسترى كل صنف والكمية التي طلبتها الممرضة.' },
  edit: { ar: 'إذا كانت الكمية أكثر أو أقل من اللازم عدّلها، ويمكنك كتابة ملاحظة على أي صنف.' },
  approve: { ar: 'ثم اضغط «اعتماد»، فيذهب الطلب للتموين مباشرة.' },
  reject: { ar: 'إذا كان هناك خطأ اكتب السبب واضغط «رفض»، فيعود للممرضة لتصحيحه وإعادة إرساله.' },
  nurseedit: { ar: 'إذا ألغت الممرضة طلبًا قبل مراجعتك يختفي من مراجعاتك ويصلك إيميل، فلا حاجة لأي إجراء. وإذا عدّلت الأصناف تراها محدّثة والتعديل مكتوب في التعليقات.' },
  report: { ar: 'اضغط «تقرير الطلبات» لترى ما طلبته لشهر أو تراكميًا، واطبعه أو احفظه PDF.' },
  lab: { ar: 'تابع أعمال مرضاك: أين وصلت كل إرسالية، ومتى موعدها.' },
  password: { ar: 'لتغيير رقمك السري اضغط أيقونة القفل. شكرًا لك، وراجع الطلبات بسرعة حتى تصل مستلزماتك في وقتها.' }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' },
  review: { en: 'Review & approve', ar: 'المراجعة والاعتماد' },
  report: { en: 'Your report', ar: 'تقريرك' },
  lab: { en: 'Lab work', ar: 'المعمل' },
  survey: { en: 'Survey', ar: 'الاستبيان' },
  pw: { en: 'Password', ar: 'الرقم السري' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  // د. سعد بلا صلاحية أسعار: طلبان بانتظار المراجعة (اعتماد ورفض)
  const r1 = (await h.api('createRequest', [{ branch: 'Unayzah', doctor: 'Dr. Saad', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 6 }, { name: 'Composite A2', qty: 3 }] }], ['Mona', '1212'])).id;
  const r2 = (await h.api('createRequest', [{ branch: 'Unayzah', doctor: 'Dr. Saad', type: 'طارئ', items: [{ name: 'Etchant Blue Tip', qty: 10 }] }], ['Mona', '1212'])).id;
  const r3 = (await h.api('createRequest', [{ branch: 'Unayzah', doctor: 'Dr. Saad', type: 'شهري', items: [{ name: 'MICRO BRUSH FINE', qty: 8 }, { name: 'Cotton rolls', qty: 5 }] }], ['Mona', '1212'])).id;
  await h.api('editRequestItems', [r3, [{ item: 'MICRO BRUSH FINE', qty: 4 }, { item: 'Cotton rolls', qty: 5 }]], ['Mona', '1212']);
  await page.evaluate(() => { window.print = () => {}; });

  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Dr. Saad', '4545'); });
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
  await scene('nurseedit', 'review', async () => {
    await click(`#docList [data-id="${r3}"]`);
    await page.waitForSelector('#rvItems table'); await wait(600);
    await highlight('#rvItems table', 2200);
    await page.keyboard.press('Escape'); await wait(400);
  });
  await scene('report', 'report', async () => {
    await click('#docReportBtn');
    await page.waitForSelector('#repGo');
    await point('[data-seg-name="repMode"][data-v="cum"]');
    await highlight('[data-seg-name="repMode"]', 900);
    await click('#repGo');
    await page.waitForSelector('.rep .rep-tiles'); await wait(400);
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
  await scene('password', 'pw', async () => {
    await click('#pwBtn');
    await page.waitForSelector('#pwCur');
    await highlight('#pwCur', 900); await highlight('#pwNew', 900);
    await page.keyboard.press('Escape');
  });
}

if (require.main === module) makeTutorial({ id: 'doctor', voiceLang: 'ar', langs: ['ar'], surveyFor: 'Dr. Saad', noMoney: true, scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
