/* فيديو المدير التنفيذي — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This video is for the executive manager. You will see the whole company at a glance: requests, spending, lab work and custody tools, for every branch.',
    ar: 'هذا الفيديو للمدير التنفيذي: ترى الشركة كاملة بنظرة واحدة — الطلبات والصرف وأعمال المعمل وأدوات العهدة، لكل الفروع.' },
  login: { en: 'Sign in with your name and password.',
    ar: 'سجّل الدخول باسمك ورقمك السري.' },
  kpis: { en: 'The Overview shows the key numbers: total requests, average fulfilment time, emergencies, the received rate, and open issues.',
    ar: 'صفحة «نظرة عامة» تعرض الأرقام الأساسية: إجمالي الطلبات، ومتوسط زمن التنفيذ، والطوارئ، ونسبة الاستلام، والبلاغات المفتوحة.' },
  month: { en: 'Choose a month, or All time, and every number updates.',
    ar: 'اختر شهرًا أو «كل الفترة» فتتحدث كل الأرقام.' },
  charts: { en: 'The charts show the fulfilment time trend, each clinic, and the most requested items.',
    ar: 'الرسوم تعرض اتجاه زمن التنفيذ، وكل عيادة، والأصناف الأكثر طلبًا.' },
  reports: { en: 'Reports compares branches, clinics and doctors: requests, value, approval time and dispatch time. Filter by branch, and export to Excel.',
    ar: 'صفحة «التقارير» تقارن الفروع والعيادات والأطباء: الطلبات والقيمة وزمن الاعتماد والإرسال، مع فلتر الفرع والتصدير Excel.' },
  docrep: { en: 'You can also open any doctor\'s report with prices, for one month or cumulative.',
    ar: 'ويمكنك فتح تقرير أي طبيب بالأسعار، لشهر أو تراكميًا.' },
  lab: { en: 'Lab KPIs show turnaround, on-time rate, redos, and what the external labs cost.',
    ar: 'صفحة «مؤشرات المعمل» تعرض زمن الإنجاز، والالتزام بالموعد، والإعادات، وتكلفة المعامل الخارجية.' },
  custody: { en: 'The Custody dashboard shows damaged and lost tools, repair cost, and any clinic below its standard.',
    ar: 'لوحة «العهدة» تعرض الأدوات التالفة والمفقودة، وتكلفة الإصلاح، وأي عيادة أقل من معيارها.' },
  workflow: { en: 'Workflow explains the full journey of a request, from the nurse to receipt, and who is responsible at each step.',
    ar: 'صفحة «سير العمل» تشرح رحلة الطلب كاملة من الممرضة حتى الاستلام، ومن المسؤول في كل خطوة.' },
  done: { en: 'That\'s it. Everything you see is live, straight from the system. Thank you!',
    ar: 'هذا كل شيء. كل ما تراه مباشر من النظام. شكرًا لك!' }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, ov: { en: 'Overview', ar: 'نظرة عامة' }, rep: { en: 'Reports', ar: 'التقارير' },
  lab: { en: 'Lab', ar: 'المعمل' }, cus: { en: 'Custody', ar: 'العهدة' }, wf: { en: 'Workflow', ar: 'سير العمل' }
};

async function flow(h) {
  const { page, scene, click, point, highlight, wait } = h;
  await page.evaluate(() => { window.print = () => {}; });
  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Faisal', '6666'); });
  await scene('kpis', 'ov', async () => {
    if (!(await page.$('#dashKpis'))) await h.nav('overview');
    await page.waitForSelector('#dashKpis .kpi'); await wait(600);
    for (const i of [1, 2, 3, 4, 5]) await highlight('#dashKpis .kpi:nth-child(' + i + ')', 900);
  });
  await scene('month', 'ov', async () => {
    await point('[data-change="dashMonth"]'); await highlight('[data-change="dashMonth"]', 1200);
    await click('[data-act="dashAll"]'); await wait(1500);
  });
  await scene('charts', 'ov', async () => {
    await page.$eval('#trendChart', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(1600);
    await page.$eval('#dashTop', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(1600);
  });
  await scene('reports', 'rep', async () => {
    await h.nav('reports');
    await click('[data-act="rpGo"]'); await wait(1200);
    await page.waitForSelector('#rpStats .rp-tile').catch(() => {});
    await highlight('#rpStats', 1500);
    await point('#rpBranch'); await highlight('#rpBranch', 900);
    await point('[data-act="rpCsv"]'); await highlight('[data-act="rpCsv"]', 900);
    await h.scroll(600); await wait(1200);
  });
  await scene('docrep', 'rep', async () => {
    await page.$eval('#rpDocCard', el => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await wait(900);
    await page.selectOption('#rpDoctor', { index: 1 }).catch(() => {});
    await click('[data-act="rpDoc"]'); await wait(2000);
  });
  await scene('lab', 'lab', async () => {
    await h.nav('labkpi');
    await page.waitForSelector('#lkBody .rp-tile'); await wait(600);
    await highlight('#lkBody .rp-tiles', 1800);
    await h.scroll(500); await wait(1000);
  });
  await scene('custody', 'cus', async () => {
    await h.nav('assetsdash');
    await page.waitForSelector('#asStats'); await wait(1000);
    await highlight('#asStats', 1800);
  });
  await scene('workflow', 'wf', async () => {
    await h.nav('workflow'); await wait(1200);
    await h.scroll(500); await wait(1500);
  });
  await scene('done', '', async () => { await h.nav('overview'); });
}

if (require.main === module) makeTutorial({ id: 'executive', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
