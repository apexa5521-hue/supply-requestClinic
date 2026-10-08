/* فيديو الجودة — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: "هذا الفيديو لفريق الجودة: متابعة المواعيد، والتنبيه على المتأخر، ومراجعة التراجعات، والبلاغات، والتعاميم." },
  monitor: { ar: "الطلب الشهري يُرفع من 15 إلى 20 ويُستلم قبل يوم 1، والطارئ يُرسل خلال 24 ساعة." },
  cycle: { ar: "الأطباء الذين لم يرفعوا طلبهم بعد، والمتأخر، وزمن كل مرحلة." },
  late: { ar: "كل طلب متأخر وأين يقف وكم له. اضغط «تنبيه» لتذكير من عنده الطلب." },
  undo: { ar: "كل خطوة تراجع عنها التموين مع السبب والشخص والوقت. وإلغاء الممرضة لطلبها مسجّل بالسبب أيضًا." },
  complaints: { ar: "كل مشكلة رفعتها الممرضات. افتح الطلب للتحقق، ثم اضغط «إغلاق» عند حلها." },
  reports: { ar: "الشهر حسب الطبيب والفرع والعيادة، مع زمن الاعتماد وزمن الإرسال." },
  notices: { ar: "لإرسال تعميم اختر الجهة: التموين أو التمريض أو الأطباء أو الجميع، واكتب الرسالة واضغط «إرسال»." },
  live: { ar: "«الأطباء — مباشر»: طلبات كل طبيب المفتوحة حسب المرحلة، وتتحدث كل دقيقة." },
  survey: { ar: "«استبيان الأطباء»: نسبة الإجابة، ومتوسط النجوم، ومؤشر التوصية، والملاحظات. وذكّر من لم يجب." },
  prices: { ar: "«أسعار الأطباء»: افتراضيًا لا يرى الأطباء الأسعار، ومن هنا تمنحها أو تحجبها. شكرًا لك، وراجع المتأخر كل صباح." }
};
const steps = {
  live: { en: 'Doctors — live', ar: 'الأطباء — مباشر' }, survey: { en: 'Doctor survey', ar: 'استبيان الأطباء' }, prices: { en: 'Doctor prices', ar: 'أسعار الأطباء' },
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, mon: { en: 'Follow-up', ar: 'المتابعة' }, undo: { en: 'Undo log', ar: 'سجل التراجعات' },
  comp: { en: 'Complaints', ar: 'البلاغات' }, rep: { en: 'Reports', ar: 'التقارير' }, not: { en: 'Notices', ar: 'التعاميم' }
};

async function flow(h) {
  const { page, scene, click, type, highlight, wait } = h;
  // تراجع واحد على الأقل يظهر في السجل
  try {
    await h.api('dispatchItems', ['REQ-260925-014', ['PROPHY PASTE']], ['Ali', '3333']);
    await h.api('revertStep', ['REQ-260925-014', 'Sent before the vendor delivered'], ['Ali', '3333']);
  } catch (e) { console.log('[quality] revert seed:', e.message); }
  await page.evaluate(() => { window.print = () => {}; });

  await scene('intro', '', async () => {
    await wait(500);
  });
  await scene('monitor', 'mon', async () => {
    await h.login('Noor', '5555');
    if (!(await page.$('#monBody'))) await h.nav('monitor');
    await page.waitForSelector('#monBody .card'); await wait(800);
    await highlight('#monBody .card >> nth=0', 2500);
  });
  await scene('cycle', 'mon', async () => {
    await h.scroll(250); await wait(1500);
  });
  await scene('late', 'mon', async () => {
    const n = '#monBody [data-act="monNudge"] >> nth=0';
    await page.locator(n).scrollIntoViewIfNeeded(); await wait(800);
    await click(n);
    await page.waitForSelector('.modal #nSend'); await highlight('.modal #nMsg', 1200);
    await click('.modal #nSend'); await wait(1200);
  });
  await scene('undo', 'undo', async () => {
    await page.$eval('#monRev', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(1000);
    await highlight('#monRev', 2500);
  });
  await scene('complaints', 'comp', async () => {
    await h.nav('complaints');
    await page.waitForSelector('#cList .req'); await wait(600);
    await highlight('#cList .req >> nth=0', 1500);
    await click('#cList [data-act="resolve"] >> nth=0'); await wait(1200);
  });
  await scene('reports', 'rep', async () => {
    await h.nav('reports');
    await click('[data-act="rpGo"]'); await wait(1200);
    await page.waitForSelector('#rpStats .rp-tile').catch(() => {});
    await highlight('#rpStats', 1500);
    await h.scroll(700); await wait(1200);
  });
  await scene('notices', 'not', async () => {
    await h.nav('notices');
    await page.waitForSelector('#noticeMsg');
    await click('[data-seg-name="noticeTarget"][data-v="ممرضة"]'); await wait(400);
    await type('#noticeMsg', 'Please confirm receipt on the same day the box arrives.');
    await click('[data-act="sendNotice"]'); await wait(1500);
    await highlight('#noticeList', 1200);
  });
  await scene('live', 'live', async () => {
    await h.nav('doctorslive');
    await page.waitForSelector('#dlBody .rp-table'); await wait(600);
    await highlight('#dlTiles', 1500);
    await click('#dlBody .dl-n >> nth=0'); await wait(1600);
    await page.keyboard.press('Escape');
  });
  await scene('survey', 'survey', async () => {
    await h.nav('surveys');
    await page.waitForSelector('#svBody .rp-tile'); await wait(600);
    await highlight('#svBody .rp-tiles', 1600);
    if (await page.$('#svBody [data-act="svRemind"]')) { await point('#svBody [data-act="svRemind"] >> nth=0'); await highlight('#svBody [data-act="svRemind"] >> nth=0', 900); }
    await h.scroll(700); await wait(1500);
  });
  await scene('prices', 'prices', async () => {
    await h.nav('docprices');
    await page.waitForSelector('#dpBody [data-act="dpSet"]'); await wait(500);
    await highlight('#dpBody .rp-table', 1200);
    await click('#dpBody [data-act="dpSet"][data-u="Dr. Saad"]'); await wait(1200);
    await h.nav('monitor');
  });
}

if (require.main === module) makeTutorial({ id: 'quality', voiceLang: 'ar', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
