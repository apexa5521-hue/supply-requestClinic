/* فيديو المالية — صوت عربي: الصرف، حسبة الأطباء، صرف الطبيب حسب الفرع، الأسعار والأصناف، القواعد والإعدادات */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: 'هذا الفيديو لفريق المالية: متابعة الصرف، وما يُحسب على كل طبيب في كل فرع، وتصحيح الأسعار والأصناف.' },
  period: { ar: 'اختر شهرًا، أو تراكميًا حتى تاريخ، أو كل الفترات، وفلتر بالفرع، ثم اضغط «تحديث».' },
  tiles: { ar: 'قيمة المطلوب، والمعتمد، ووفر مراجعة الطبيب، والمُرسل، والمستلم، والصرف في آخر 12 شهرًا، ثم الصرف حسب الفرع والعيادة.' },
  billing: { ar: '«الحسبة المالية للأطباء»: طبيب العيادة الثابت يتحمل مستهلكات عيادته كلها، وطبيب البوكس يتحمل ما يُطلب باسمه فقط، وكل طلب يُحسب مرة واحدة.' },
  docbranch: { ar: '«صرف الطبيب حسب الفرع»: لكل طبيب ما صُرف عليه في بريدة، وما صُرف في عنيزة، كل فرع منفصل، مستهلك وماتيريال، ثم إجماليه في الفرعين. ابحث باسم الطبيب، واضغط التصدير لملف Excel.' },
  charges: { ar: '«حسبة الأطباء»: حدد لكل طبيب ما يُحسب عليه: المستهلك فقط، أو الماتيريال فقط، أو الاثنين. يطبَّق فورًا على كل التقارير السابقة واللاحقة.' },
  prices: { ar: 'في أسعار الكتالوج: عدّل السعر واضغط «حفظ»، ويُسجَّل التعديل باسمك. واعرض الأسعار الخاطئة فقط لتصحيحها بسرعة.' },
  catalog: { ar: 'تبويب «الأصناف»: تضيف صنفًا جديدًا، أو تعدّل اسمه وسعره ونوعه: مستهلك أو ماتيريال.' },
  rules: { ar: '«قواعد الطلبات»: نافذة الطلب الشهري، ويوم الصرف، وحدود الطلبات الطارئة. التعديل يطبَّق فورًا ويظهر للممرضات والأطباء.' },
  settings: { ar: 'وفي «الإعدادات» تحدد آخر تاريخ يُسمح فيه بتسجيل الطلبات بتاريخ سابق. شكرًا لك.' }
};
const steps = {
  fin: { ar: 'الصرف' }, bill: { ar: 'حسبة الأطباء' }, db: { ar: 'الطبيب حسب الفرع' },
  price: { ar: 'الأسعار والأصناف' }, rules: { ar: 'القواعد والإعدادات' }
};

async function flow(h) {
  const { page, scene, click, point, highlight, wait } = h;
  await page.evaluate(() => { window.print = () => {}; });
  const toCard = async sel => { await page.$eval(sel, el => el.scrollIntoView({ block: 'start', behavior: 'smooth' })).catch(() => {}); await wait(900); };
  await scene('intro', '', async () => { await wait(500); });
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
    await page.$eval('#finChart', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await wait(1800);
  });
  await scene('billing', 'bill', async () => {
    await page.waitForSelector('#fnBody section.card:has(.bill-box), #fnBody section.card:has(.bill-clinic)').catch(() => {});
    const sel = '#fnBody section.card:has(.bill-clinic), #fnBody section.card:has(.bill-box)';
    if (await page.$(sel)) { await toCard(sel); await highlight(sel, 3200); } else await wait(2000);
  });
  await scene('docbranch', 'db', async () => {
    await page.waitForSelector('#fnDocBranch');
    await toCard('#fnDocBranch');
    await highlight('#fnDocBranch thead', 2600);
    await highlight('#fnDocBranch tbody tr >> nth=0', 1800);
    await h.type('#fnDocBranch [data-input="fnDbQ"]', 'Khalid'); await wait(900);
    await page.fill('#fnDocBranch [data-input="fnDbQ"]', ''); await page.dispatchEvent('#fnDocBranch [data-input="fnDbQ"]', 'input'); await wait(500);
    await point('[data-act="fnDbCsv"]'); await highlight('[data-act="fnDbCsv"]', 1300);
  });
  await scene('charges', 'bill', async () => {
    await toCard('#fnChargeCard');
    await page.waitForSelector('#fnCharges .ch-sel[data-doc="Dr. Saad"]');
    await h.select('#fnCharges .ch-sel[data-doc="Dr. Saad"]', 'consumable'); await wait(1200);
    await highlight('#fnCharges tr:has([data-doc="Dr. Saad"])', 1500);
  });
  await scene('prices', 'price', async () => {
    await toCard('#fnPriceCard');
    await page.waitForSelector('#fnPrices .price-in'); await wait(600);
    const row = '#fnPrices tr:has-text("Gloves M")';
    await point(row + ' .price-in');
    await page.fill(row + ' .price-in', '32'); await wait(400);
    await click(row + ' [data-act="priceSave"]'); await wait(1200);
    if (await page.$('#fnIssues')) { await point('#fnIssues'); await highlight('#fnIssues', 900); }
  });
  await scene('catalog', 'price', async () => {
    await h.nav('catalog');
    await page.waitForSelector('#caList tr'); await wait(600);
    await highlight('#caList', 1500);
    await click('[data-act="caEdit"] >> nth=1'); await wait(1300);
    await page.keyboard.press('Escape'); await wait(500);
  });
  await scene('rules', 'rules', async () => {
    await h.nav('rules');
    await page.waitForSelector('#rlBox .rl-in'); await wait(500);
    await highlight('#rlBox .grid-2 section >> nth=0', 1800);
    await highlight('#rlBox .grid-2 section >> nth=1', 1800);
    await page.$eval('#rlBox .rule-bar', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {}); await wait(1200);
  });
  await scene('settings', 'rules', async () => {
    await h.nav('settings');
    await page.waitForSelector('#stk_BackdateUntil'); await wait(500);
    await point('#stk_BackdateUntil'); await highlight('#stk_BackdateUntil', 2000);
    await h.nav('finance');
  });
}

if (require.main === module) makeTutorial({ id: 'finance', voiceLang: 'ar', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
