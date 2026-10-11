/* فيديو المالية — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: "هذا الفيديو لفريق المالية: متابعة الصرف، وتكلفة كل طبيب، وتصحيح أسعار الكتالوج." },
  period: { ar: "اختر شهرًا، أو تراكميًا حتى تاريخ، أو كل الفترات، وفلتر بالفرع، ثم «تحديث»." },
  tiles: { ar: "قيمة المطلوب، والمعتمد، ووفر مراجعة الطبيب، والمُرسل، والمستلم، والصرف في آخر 12 شهرًا." },
  prices: { ar: "عدّل أي سعر واضغط «حفظ» فيُكتب في الشيت ويُسجَّل. واعرض الأسعار الخاطئة فقط لتصحيحها بسرعة." },
  assets: { ar: "تكلفة الإصلاح وقيمة الأدوات التالفة في لوحة «العهدة»، ويمكنك تعديل تكلفة أي بلاغ." },
  docprices: { ar: "تمنح الأسعار لأي طبيب أو تحجبها، وكل الجداول تُصدَّر Excel. شكرًا لك." }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, fin: { en: 'Spending', ar: 'الصرف' }, bill: { en: 'Doctor billing', ar: 'حسبة الأطباء' },
  price: { en: 'Catalog prices', ar: 'أسعار الكتالوج' }, dp: { en: 'Doctor prices', ar: 'أسعار الأطباء' }
};

async function flow(h) {
  const { page, scene, click, point, highlight, wait } = h;
  await page.evaluate(() => { window.print = () => {}; });
  await scene('intro', '', async () => {
    await wait(500);
  });
  await scene('period', 'fin', async () => {
    await h.login('Hessa', '2222'); if (!(await page.$('#fnBody'))) await h.nav('finance');
    await page.waitForSelector('[data-act="fnGo"]');
    await highlight('[data-seg-name="fnMode"]', 1200);
    await click('[data-seg-name="fnMode"][data-v="all"]'); await wait(400);
    await point('#fnBranch'); await highlight('#fnBranch', 900);
    await click('[data-act="fnGo"]'); await wait(1500);
  });
  await scene('tiles', 'fin', async () => {
    await page.waitForSelector('#fnBody .rp-tile'); await wait(500);
    await highlight('#fnBody .rp-tiles', 2600);
    await page.$eval('#fnBody canvas, #fnBody .chart-box', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await wait(1800); await h.scroll(1100); await wait(1200);
  });
  await scene('prices', 'price', async () => {
    await page.$eval('#fnPriceCard', el => el.scrollIntoView({ block: 'start', behavior: 'smooth' })).catch(() => {});
    await page.waitForSelector('#fnPrices .price-in'); await wait(800);
    const row = '#fnPrices tr:has-text("Gloves M")';
    await point(row + ' .price-in');
    await page.fill(row + ' .price-in', '32'); await wait(400);
    await click(row + ' [data-act="priceSave"]'); await wait(1200);
    if (await page.$('#fnIssues')) { await point('#fnIssues'); await highlight('#fnIssues', 900); }
  });
  await scene('assets', 'price', async () => {
    await h.nav('assetsdash');
    await wait(1500);
    await h.scroll(450); await wait(1500);
    await h.scroll(0);
  });
  await scene('docprices', 'dp', async () => {
    await h.nav('docprices');
    await page.waitForSelector('#dpBody [data-act="dpSet"]'); await wait(500);
    await click('#dpBody [data-act="dpSet"][data-u="Dr. Lama"]'); await wait(1300);
    await h.nav('finance'); await page.waitForSelector('[data-act="fnCsv"]').catch(() => {});
    await point('[data-act="fnCsv"]'); await highlight('[data-act="fnCsv"]', 1200);
    await h.scroll(0);
  });
}

if (require.main === module) makeTutorial({ id: 'finance', voiceLang: 'ar', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
