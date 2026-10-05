/* فيديو المالية — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This video is for the finance team. You will learn how to follow spending, see what each doctor costs, fix catalog prices, and decide which doctors see prices.',
    ar: 'هذا الفيديو لفريق المالية: كيف تتابع الصرف، وترى تكلفة كل طبيب، وتصحح أسعار الكتالوج، وتحدد من يرى الأسعار من الأطباء.' },
  login: { en: 'Sign in with your name and password. Your page opens on Finance.',
    ar: 'سجّل الدخول باسمك ورقمك السري، وتفتح صفحتك على «المالية».' },
  period: { en: 'Choose the period: one month, cumulative up to a date, or all time. You can also filter by branch. Then tap Update.',
    ar: 'اختر الفترة: شهر، أو تراكمي حتى تاريخ، أو كل الفترات، ويمكنك الفلترة بالفرع، ثم اضغط «تحديث».' },
  tiles: { en: 'The cards show the value requested, the value approved, what the doctor review saved, what was sent and received, and emergency spending.',
    ar: 'البطاقات تعرض قيمة المطلوب، والمعتمد، ووفر مراجعة الطبيب، والمُرسل، والمستلم، وقيمة الطارئ.' },
  trend: { en: 'The chart shows spending over the last twelve months, and the tables split it by branch and by clinic.',
    ar: 'الرسم يعرض الصرف في آخر اثني عشر شهرًا، والجداول توزعه حسب الفرع والعيادة.' },
  billing: { en: 'Doctor billing: a fixed doctor carries all the consumables of their clinic. A box doctor carries only what is requested in their name. Each request is counted once.',
    ar: 'الحسبة المالية للأطباء: الطبيب الثابت تُحسب عليه كل مستهلكات عيادته، وطبيب البوكس يُحسب عليه ما يُطلب باسمه فقط، وكل طلب يُحسب مرة واحدة.' },
  prices: { en: 'Catalog prices: edit any price and tap Save. It is written straight to the sheet as a number, and the change is logged. Show only the wrong prices to fix them quickly.',
    ar: 'أسعار الكتالوج: عدّل أي سعر واضغط «حفظ»، فيُكتب في الشيت مباشرة كرقم ويُسجَّل التعديل. واعرض الأسعار الخاطئة فقط لتصحيحها بسرعة.' },
  docprices: { en: 'Doctor prices: doctors see no prices by default. Grant or withhold prices for each doctor from here.',
    ar: 'أسعار الأطباء: الأطباء لا يرون الأسعار افتراضيًا، ومن هنا تمنح الأسعار لأي طبيب أو تحجبها.' },
  export: { en: 'Every table can be exported to Excel.',
    ar: 'كل الجداول يمكن تصديرها إلى Excel.' },
  done: { en: 'That\'s it. Review spending every month, and keep catalog prices correct. Thank you!',
    ar: 'هذا كل شيء. راجع الصرف كل شهر، وحافظ على صحة أسعار الكتالوج. شكرًا لك!' }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, fin: { en: 'Spending', ar: 'الصرف' }, bill: { en: 'Doctor billing', ar: 'حسبة الأطباء' },
  price: { en: 'Catalog prices', ar: 'أسعار الكتالوج' }, dp: { en: 'Doctor prices', ar: 'أسعار الأطباء' }
};

async function flow(h) {
  const { page, scene, click, point, highlight, wait } = h;
  await page.evaluate(() => { window.print = () => {}; });
  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Hessa', '2222'); if (!(await page.$('#fnBody'))) await h.nav('finance'); });
  await scene('period', 'fin', async () => {
    await page.waitForSelector('[data-act="fnGo"]');
    await highlight('[data-seg-name="fnMode"]', 1200);
    await click('[data-seg-name="fnMode"][data-v="all"]'); await wait(400);
    await point('#fnBranch'); await highlight('#fnBranch', 900);
    await click('[data-act="fnGo"]'); await wait(1500);
  });
  await scene('tiles', 'fin', async () => {
    await page.waitForSelector('#fnBody .rp-tile'); await wait(500);
    await highlight('#fnBody .rp-tiles', 2600);
  });
  await scene('trend', 'fin', async () => {
    await page.$eval('#fnBody canvas, #fnBody .chart-box', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await wait(1800); await h.scroll(1100); await wait(1200);
  });
  await scene('billing', 'bill', async () => {
    const sel = '#fnBody section.card:has-text("Doctor billing")';
    await page.$eval(sel, el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await wait(800); await highlight(sel, 2500);
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
  await scene('docprices', 'dp', async () => {
    await h.nav('docprices');
    await page.waitForSelector('#dpBody [data-act="dpSet"]'); await wait(500);
    await click('#dpBody [data-act="dpSet"][data-u="Dr. Lama"]'); await wait(1300);
  });
  await scene('export', 'fin', async () => {
    await h.nav('finance'); await page.waitForSelector('[data-act="fnCsv"]').catch(() => {});
    await point('[data-act="fnCsv"]'); await highlight('[data-act="fnCsv"]', 1200);
  });
  await scene('done', '', async () => { await h.scroll(0); });
}

if (require.main === module) makeTutorial({ id: 'finance', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
