/* فيديو مدير الفرع — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This video is for branch managers. Your account shows only your branch: its requests, its lab cases, its custody tools, and its complaints. It is view only.',
    ar: 'هذا الفيديو لمدراء الفروع: حسابك يعرض فرعك فقط — طلباته وإرساليات المعمل وأدوات العهدة والبلاغات — وهو للاطلاع فقط.' },
  login: { en: 'Sign in with your name and password. Your branch appears next to your name.',
    ar: 'سجّل الدخول باسمك ورقمك السري، ويظهر اسم فرعك بجانب اسمك.' },
  overview: { en: 'The Overview shows this month in numbers: how many requests, how many are received, and how many are still open.',
    ar: 'صفحة «نظرة عامة» تعرض الشهر بالأرقام: عدد الطلبات، والمستلم منها، والمفتوح.' },
  charts: { en: 'Below, you see the trend over the last months, and the requests of each clinic in your branch.',
    ar: 'وتحتها اتجاه الطلبات في الأشهر الأخيرة، وطلبات كل عيادة في فرعك.' },
  open: { en: 'Tap any request to see its items, its stages, and its comments.',
    ar: 'اضغط أي طلب لترى أصنافه ومراحله وتعليقاته.' },
  monitor: { en: 'Follow-up shows late requests in your branch: who is holding each one, and for how long.',
    ar: 'صفحة «المتابعة» تعرض الطلبات المتأخرة في فرعك: عند من كل طلب، وكم له.' },
  nudge: { en: 'Tap Nudge to send a reminder to whoever is holding the request.',
    ar: 'اضغط «تنبيه» لإرسال تذكير لمن عنده الطلب.' },
  reports: { en: 'Reports gives you the month for your branch: by clinic, by doctor and by item. You can print it or export it to Excel.',
    ar: 'صفحة «التقارير» تعطيك الشهر لفرعك: حسب العيادة والطبيب والصنف، ويمكنك طباعته أو تصديره Excel.' },
  lab: { en: 'Lab KPIs show your branch cases: turnaround, on-time rate, redos and overdue work.',
    ar: 'صفحة «مؤشرات المعمل» تعرض إرساليات فرعك: زمن الإنجاز، والالتزام بالموعد، والإعادات، والمتأخر.' },
  custody: { en: 'The Custody dashboard shows the tools in your clinics, any shortage against the standard, and the open tickets.',
    ar: 'لوحة «العهدة» تعرض أدوات عياداتك، والنقص عن المعيار، والبلاغات المفتوحة.' },
  complaints: { en: 'Complaints shows the problems reported in your branch, and whether they are solved.',
    ar: 'صفحة «البلاغات» تعرض المشاكل المرفوعة في فرعك، وهل حُلّت أم لا.' },
  done: { en: 'That\'s it. Check your branch every day, and nudge anything that is late. Thank you!',
    ar: 'هذا كل شيء. تابع فرعك يوميًا، ونبّه على أي شيء متأخر. شكرًا لك!' }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, ov: { en: 'Overview', ar: 'نظرة عامة' }, mon: { en: 'Follow-up', ar: 'المتابعة' },
  rep: { en: 'Reports', ar: 'التقارير' }, lab: { en: 'Lab', ar: 'المعمل' }, cus: { en: 'Custody', ar: 'العهدة' }, comp: { en: 'Complaints', ar: 'البلاغات' }
};

async function flow(h) {
  const { page, scene, click, point, highlight, wait } = h;
  await page.evaluate(() => { window.print = () => {}; });
  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Nawaf', '7777'); await highlight('#userRole', 1800); });
  await scene('overview', 'ov', async () => {
    if (!(await page.$('#dashKpis'))) await h.nav('overview');
    await page.waitForSelector('#dashKpis .kpi'); await wait(600);
    await highlight('#dashKpis', 2200);
  });
  await scene('charts', 'ov', async () => {
    await page.$eval('#trendChart', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(1500);
    await page.$eval('#clinicChart', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(1500);
  });
  await scene('open', 'ov', async () => {
    const d = '#dashRows [data-act="detail"] >> nth=0';
    await page.locator(d).scrollIntoViewIfNeeded(); await wait(500);
    await click(d); await wait(2200);
    await page.keyboard.press('Escape'); await wait(400);
  });
  await scene('monitor', 'mon', async () => {
    await h.nav('monitor');
    await page.waitForSelector('#monBody'); await wait(1000);
    await highlight('#monBody', 2000);
  });
  await scene('nudge', 'mon', async () => {
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
  });
  await scene('complaints', 'comp', async () => {
    await h.nav('complaints');
    await page.waitForSelector('#cList'); await wait(800);
    await highlight('#cChips', 1000); await highlight('#cList', 1500);
  });
  await scene('done', '', async () => { await h.nav('overview'); });
}

if (require.main === module) makeTutorial({ id: 'branch', langs: ['ar'], noMoney: true, scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
