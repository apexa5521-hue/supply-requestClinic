/* فيديو الجودة — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This video is for the quality team. You will learn how to follow deadlines, nudge late requests, review every undo, close complaints, and send notices.',
    ar: 'هذا الفيديو لفريق الجودة: كيف تتابع المواعيد، وتنبّه على المتأخر، وتراجع كل تراجع، وتغلق البلاغات، وترسل التعاميم.' },
  login: { en: 'Sign in with your name and password.',
    ar: 'سجّل الدخول باسمك ورقمك السري.' },
  monitor: { en: 'Deadlines and follow-up is your main page. Monthly requests are submitted from the 15th to the 20th and received by the 1st. Emergency requests must be sent within 24 hours.',
    ar: 'صفحة «المواعيد والمتابعة» هي صفحتك الأساسية: الطلب الشهري يُرفع من 15 إلى 20 ويُستلم قبل يوم 1، والطارئ يُرسل خلال 24 ساعة.' },
  cycle: { en: 'The monthly cycle shows which doctors have not submitted yet. The cards count overdue requests, and the time of each stage.',
    ar: 'الدورة الشهرية تعرض الأطباء الذين لم يرفعوا طلبهم بعد، والبطاقات تعرض المتأخر وزمن كل مرحلة.' },
  late: { en: 'The past due list shows each late request, where it is stuck, and for how long. Tap Nudge to remind whoever is holding it.',
    ar: 'قائمة المتأخر تعرض كل طلب متأخر، وأين يقف، وكم له. اضغط «تنبيه» لتذكير من عنده الطلب.' },
  undo: { en: 'At the bottom, the undo log lists every step that procurement undid, with the reason, the person and the time.',
    ar: 'وفي الأسفل سجل التراجعات: كل خطوة تراجع عنها التموين، مع السبب والشخص والوقت.' },
  complaints: { en: 'Complaints shows every problem reported by the nurses. Open the request to check, then tap Close when it is solved.',
    ar: 'صفحة «البلاغات» تعرض كل مشكلة رفعتها الممرضات. افتح الطلب للتحقق، ثم اضغط «إغلاق» عند حلها.' },
  reports: { en: 'Reports gives you the month by doctor, branch and clinic, with approval time and dispatch time.',
    ar: 'صفحة «التقارير» تعطيك الشهر حسب الطبيب والفرع والعيادة، مع زمن الاعتماد وزمن الإرسال.' },
  notices: { en: 'To send a notice, choose who receives it: procurement, nursing, doctors, or everyone. Write the message and tap Send. It appears on their page.',
    ar: 'لإرسال تعميم اختر الجهة: التموين أو التمريض أو الأطباء أو الجميع، واكتب الرسالة واضغط «إرسال»، فتظهر في صفحتهم.' },
  live: { en: 'Doctors live shows every doctor\'s open requests by stage: doctor review, new, approved, in preparation and sent. It refreshes every minute. Tap any number to see those requests.',
    ar: 'صفحة «الأطباء — مباشر» تعرض طلبات كل طبيب المفتوحة حسب المرحلة: مراجعة الطبيب، جديد، معتمد، قيد التجهيز، تم الإرسال، وتتحدث كل دقيقة. اضغط أي رقم لفتح طلباته.' },
  survey: { en: 'Doctor survey shows the satisfaction results of each cycle: response rate, average stars, the recommend score, every question, branches, trends and written notes. While the survey is open, remind the doctors who have not answered.',
    ar: 'صفحة «استبيان الأطباء» تعرض نتائج كل دورة: نسبة الإجابة، ومتوسط النجوم، ومؤشر التوصية، وكل سؤال، والفروع، والاتجاه، والملاحظات المكتوبة. وأثناء فتح الاستبيان ذكّر الأطباء الذين لم يجيبوا.' },
  prices: { en: 'Doctor prices: by default, doctors see no prices. From this page you grant or withhold prices for each doctor. Every change is logged with your name.',
    ar: 'صفحة «أسعار الأطباء»: افتراضيًا لا يرى الأطباء أي أسعار، ومن هنا تمنح الأسعار لأي طبيب أو تحجبها، وكل تغيير يُسجَّل باسمك.' },
  done: { en: 'That\'s it. Check the late list every morning, and close complaints as soon as they are solved. Thank you!',
    ar: 'هذا كل شيء. راجع قائمة المتأخر كل صباح، وأغلق البلاغات فور حلها. شكرًا لك!' }
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

  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Noor', '5555'); });
  await scene('monitor', 'mon', async () => {
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
  });
  await scene('done', '', async () => { await h.nav('monitor'); });
}

if (require.main === module) makeTutorial({ id: 'quality', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
