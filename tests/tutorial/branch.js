/* فيديو مدير الفرع — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: "هذا الفيديو لمدراء الفروع: حسابك يعرض فرعك فقط، وفيه اعتماد طلبات الهاوس كيبر ومسؤولي التعقيم والأشعة في فرعك." },
  approvals: { ar: "«الاعتمادات»: طلبات الهاوس كيبر ومسؤولي فرعك تنتظرك هنا، ويصلك إشعار بكل طلب. افتح الطلب، وعدّل الكمية إن لزم، ثم «اعتماد» فيذهب للتموين." },
  reject: { ar: "وإن لم يكن مناسبًا: اكتب السبب واضغط «رفض»، فيرجع لصاحبه مع السبب ليصححه ويعيد إرساله لك." },
  overview: { ar: "«نظرة عامة»: الشهر بالأرقام: عدد الطلبات، والمستلم، والمفتوح، واتجاه الأشهر الأخيرة، وطلبات كل عيادة." },
  monitor: { ar: "«المتابعة»: الطلبات المتأخرة في فرعك: عند من كل طلب، وكم له. اضغط «تنبيه» لتذكير من عنده الطلب." },
  reports: { ar: "«التقارير»: الشهر لفرعك حسب العيادة والطبيب والصنف، والطباعة والتصدير Excel." },
  lab: { ar: "«مؤشرات المعمل»: إرساليات فرعك: زمن الإنجاز، والالتزام بالموعد، والإعادات." },
  custody: { ar: "«العهدة» و«البلاغات»: أدوات عياداتك والنقص عن المعيار، والمشاكل المرفوعة وهل حُلّت." },
  boxes: { ar: "«البوكسات»: أين بوكس كل طبيب الآن وآخر حركة له. شكرًا لك، وتابع فرعك يوميًا." }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, ap: { ar: 'الاعتمادات' }, ov: { en: 'Overview', ar: 'نظرة عامة' }, mon: { en: 'Follow-up', ar: 'المتابعة' },
  rep: { en: 'Reports', ar: 'التقارير' }, lab: { en: 'Lab', ar: 'المعمل' }, cus: { en: 'Custody', ar: 'العهدة والبوكسات' }, comp: { en: 'Complaints', ar: 'البلاغات' }
};

async function flow(h) {
  const { page, scene, click, point, highlight, wait } = h;
  await page.evaluate(() => { window.print = () => {}; });
  // شحنة لفرع بريدة حتى تظهر بوكساته
  await h.api('dispatchItems', ['REQ-260925-014', ['PROPHY PASTE', 'DENTAL FLOSS']], ['Ali', '3333']);
  const hk1 = (await h.api('createRequest', [{ clinic: 'Housekeeper', type: 'شهري', items: [{ name: 'Gloves M', qty: 6 }, { name: 'Cotton rolls', qty: 4 }] }], ['Reem', '1414'])).id;
  const hk2 = (await h.api('createRequest', [{ clinic: 'Housekeeper', type: 'طارئ', items: [{ name: 'Indicator tape', qty: 10 }] }], ['Reem', '1414'])).id;
  await scene('intro', '', async () => {
    await wait(500);
  });
  await scene('approvals', 'ap', async () => {
    await h.login('Nawaf', '7777'); await highlight('#userRole', 1200);
    await h.nav('reviews');
    await page.waitForSelector(`#docList [data-id="${hk1}"]`); await wait(400);
    await highlight('#docList', 1300);
    await click(`#docList [data-id="${hk1}"]`);
    await page.waitForSelector('#rvItems table'); await wait(500);
    await point('.rvQty >> nth=0');
    await page.fill('.rvQty >> nth=0', '4'); await page.dispatchEvent('.rvQty >> nth=0', 'input'); await wait(500);
    await click('#rvApprove'); await wait(1200);
  });
  await scene('reject', 'ap', async () => {
    await page.waitForSelector(`#docList [data-id="${hk2}"]`);
    await click(`#docList [data-id="${hk2}"]`);
    await page.waitForSelector('#rvItems table'); await wait(500);
    await h.type('#rvReason', 'Not urgent, add it to the monthly request');
    await click('#rvReject');
    await page.waitForSelector('[data-yes]'); await wait(500);
    await click('[data-yes]'); await wait(1200);
  });
  await scene('overview', 'ov', async () => {
    await h.nav('overview');
    await page.waitForSelector('#dashKpis .kpi >> visible=true'); await wait(600);
    await highlight('#dashKpis', 2200);
    await page.$eval('#trendChart', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(1500);
    await page.$eval('#clinicChart', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(1500);
  });
  await scene('monitor', 'mon', async () => {
    await h.nav('monitor');
    await page.waitForSelector('#monBody'); await wait(1000);
    await highlight('#monBody', 2000);
    const n = '#monBody [data-act="monNudge"] >> nth=0';
    if (await page.$('#monBody [data-act="monNudge"]')) {
      await page.locator(n).scrollIntoViewIfNeeded(); await click(n); await wait(1200);
      await page.waitForSelector('.modal #nSend'); await highlight('.modal #nMsg', 1200);
      await click('.modal #nSend'); await wait(1200);
    } else await wait(1500);
  });
  await scene('reports', 'rep', async () => {
    await h.nav('reports');
    await page.waitForSelector('[data-act="rpGo"]'); await wait(500);
    await click('[data-act="rpGo"]'); await wait(1500);
    await page.waitForSelector('#rpStats .rp-tile').catch(() => {});
    await highlight('#rpStats', 1800);
    await h.scroll(700); await wait(1200);
  });
  await scene('lab', 'lab', async () => {
    await h.nav('labkpi');
    await page.waitForSelector('#lkBody .rp-tile'); await wait(600);
    await highlight('#lkBody .rp-tiles', 2000);
  });
  await scene('custody', 'cus', async () => {
    await h.nav('assetsdash');
    await page.waitForSelector('#asStats'); await wait(1200);
    await highlight('#asStats', 2000);
    await h.nav('complaints');
    await page.waitForSelector('#cList'); await wait(800);
    await highlight('#cChips', 1000); await highlight('#cList', 1500);
  });
  await scene('boxes', 'cus', async () => {
    await h.nav('boxes');
    await page.waitForSelector('#bxList .box-card').catch(() => {});
    await highlight('#bxList .box-card', 2200);
    await h.nav('overview');
  });
}

if (require.main === module) makeTutorial({ id: 'branch', voiceLang: 'ar', langs: ['ar'], noMoney: true, scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
