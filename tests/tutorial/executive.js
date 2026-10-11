/* فيديو المدير التنفيذي — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: "هذا الفيديو للمدير التنفيذي: الشركة كاملة بنظرة واحدة، الطلبات والصرف والمعمل والعهدة، لكل الفروع." },
  kpis: { ar: "«نظرة عامة»: إجمالي الطلبات، ومتوسط زمن التنفيذ، والطوارئ، ونسبة الاستلام، والبلاغات المفتوحة." },
  month: { ar: "اختر شهرًا أو «كل الفترة»، والرسوم تعرض اتجاه زمن التنفيذ وكل عيادة والأصناف الأكثر طلبًا." },
  reports: { ar: "«التقارير»: مقارنة الفروع والعيادات والأطباء، وتقرير أي طبيب بالأسعار، والتصدير Excel." },
  lab: { ar: "«مؤشرات المعمل»: زمن الإنجاز، والالتزام بالموعد، والإعادات، وتكلفة المعامل الخارجية." },
  custody: { ar: "«العهدة»: الأدوات التالفة والمفقودة، وتكلفة الإصلاح، وأي عيادة أقل من معيارها." },
  workflow: { ar: "«سير العمل»: رحلة الطلب كاملة من الممرضة حتى الاستلام، ومن المسؤول في كل خطوة." },
  live: { ar: "طلبات كل طبيب المفتوحة مباشرة، ونتائج استبيان الرضا. كل ما تراه مباشر من النظام. شكرًا لك." }
};
const steps = {
  live: { en: 'Doctors — live', ar: 'الأطباء — مباشر' }, survey: { en: 'Doctor survey', ar: 'استبيان الأطباء' }, prices: { en: 'Doctor prices', ar: 'أسعار الأطباء' },
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, ov: { en: 'Overview', ar: 'نظرة عامة' }, rep: { en: 'Reports', ar: 'التقارير' },
  lab: { en: 'Lab', ar: 'المعمل' }, cus: { en: 'Custody', ar: 'العهدة' }, wf: { en: 'Workflow', ar: 'سير العمل' }
};

async function flow(h) {
  const { page, scene, click, point, highlight, wait } = h;
  await page.evaluate(() => { window.print = () => {}; });
  await scene('intro', '', async () => {
    await wait(500);
  });
  await scene('kpis', 'ov', async () => {
    await h.login('Faisal', '6666');
    if (!(await page.$('#dashKpis'))) await h.nav('overview');
    await page.waitForSelector('#dashKpis .kpi'); await wait(600);
    for (const i of [1, 2, 3, 4, 5]) await highlight('#dashKpis .kpi:nth-child(' + i + ')', 900);
  });
  await scene('month', 'ov', async () => {
    await point('[data-change="dashMonth"]'); await highlight('[data-change="dashMonth"]', 1200);
    await click('[data-act="dashAll"]'); await wait(1500);
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
  await scene('live', 'live', async () => {
    await h.nav('doctorslive');
    await page.waitForSelector('#dlBody .rp-table'); await wait(600);
    await highlight('#dlTiles', 1500);
    await click('#dlBody .dl-n >> nth=0'); await wait(1600);
    await page.keyboard.press('Escape');
    await h.nav('surveys');
    await page.waitForSelector('#svBody .rp-tile'); await wait(600);
    await highlight('#svBody .rp-tiles', 1600);
    if (await page.$('#svBody [data-act="svRemind"]')) { await point('#svBody [data-act="svRemind"] >> nth=0'); await highlight('#svBody [data-act="svRemind"] >> nth=0', 900); }
    await h.scroll(700); await wait(1500);
    await h.nav('overview');
  });
}

if (require.main === module) makeTutorial({ id: 'executive', voiceLang: 'ar', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
