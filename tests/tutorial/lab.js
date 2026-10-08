/* فيديو المعمل — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: "هذا الفيديو لفريق المعمل: استلام الإرساليات، ونقل كل عمل بين مراحله، والمعمل الخارجي، ثم إرجاع العمل للعيادة." },
  board: { ar: "كل إرسالية من الممرضات تظهر هنا. الأزرار تفلتر: جديد، قيد العمل، عند معمل خارجي، جاهز للإرسال، والمتأخر." },
  card: { ar: "كل بطاقة تعرض رقم الملف والطبيب والعيادة وتاريخ السكان وموعد التسليم، وكل عمل بحالته." },
  receive: { ar: "عند وصول الإرسالية اضغط «استلام»، ثم «بدء العمل»." },
  external: { ar: "إذا ذهب العمل لمعمل خارجي اضغط «معمل خارجي»، واختر المعمل وموعد الرجوع." },
  ready: { ar: "اضغط «جاهز» فتصل رسالة للممرضة والطبيب، ثم «إرسال للعيادة»، والممرضة تؤكد الاستلام." },
  itero: { ar: "حالات iTero لها رقم حالة خاص. والحالة المرسلة مباشرة لمعمل خارجي تظهر بعلامة بنفسجية «للعلم فقط»." },
  details: { ar: "«التفاصيل» تعرض من نفّذ كل خطوة ومتى. وللبحث اكتب رقم ملف المريض أو رقم الإرسالية." },
  kpi: { ar: "«مؤشرات المعمل»: متوسط زمن الإنجاز، والالتزام بالموعد، والإعادات، والأعمال الخارجية، والمتأخر." },
  supply: { ar: "المعمل يطلب مستهلكاته بنفسه، ويذهب للتموين مباشرة. والتموين يسلّمها يدًا بيد بدون بوكس. شكرًا لك." }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, board: { en: 'Lab board', ar: 'لوحة المعمل' }, work: { en: 'Stages', ar: 'المراحل' },
  ext: { en: 'External lab', ar: 'المعمل الخارجي' }, supply: { en: 'Lab supplies', ar: 'مستهلكات المعمل' }, back: { en: 'Back to clinic', ar: 'الإرجاع للعيادة' }, find: { en: 'Find a case', ar: 'البحث' }, kpi: { en: 'KPIs', ar: 'المؤشرات' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const day = n => { const d = new Date(Date.now() - n * 864e5); return d.toISOString().slice(0, 10); };
  const L1 = (await h.api('createLabCase', [{ branch: 'Buraydah', doctor: 'Dr. Khalid', fileNo: '20981', scanDate: day(1), lines: [{ lab: 'Internal Lab', workType: 'Crown', details: 'Tooth 36, A2' }] }], ['Sara', '1111'])).id;
  await h.api('createLabCase', [{ branch: 'Buraydah', doctor: 'Dr. Khalid', fileNo: '21044', scanDate: day(0), itero: '88213457' }], ['Sara', '1111']);
  const btn = a => `[data-act="labDo"][data-a="${a}"][data-case="${L1}"]`;
  const card = `#labList .lab-card:has([data-act="labOpen"][data-id="${L1}"])`;
  const focus = async () => { await page.$eval(card, el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await wait(700); };

  await scene('intro', '', async () => {
    await wait(500);
  });
  await scene('board', 'board', async () => {
    await h.login('Lab Tech', '8888'); await page.waitForSelector('#labList .lab-card');
    for (const g of ['new', 'work', 'external', 'ready', 'late']) await highlight('#labChips .chip[data-g="' + g + '"]', 1100);
  });
  await scene('card', 'board', async () => {
    await focus();
    await highlight(card + ' .req-sub', 1800);
    await highlight(card + ' .lab-items', 1400);
  });
  await scene('receive', 'work', async () => {
    await focus();
    await click(btn('receive')); await wait(1300);
    await click(btn('start')); await wait(1300);
  });
  await scene('external', 'ext', async () => {
    await click(btn('external'));
    await page.waitForSelector('.modal #laLab'); await wait(500);
    await point('.modal #laLab'); await wait(400);
    await page.fill('.modal #laExp', day(-5)); await wait(400);
    await click('.modal #laOk'); await wait(1400);
  });
  await scene('ready', 'back', async () => {
    await focus(); await click(btn('ready')); await wait(1400);
    await focus(); await click(btn('send')); await wait(1400);
  });
  await scene('itero', 'board', async () => {
    await page.$eval('#labList .tag.itero', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await wait(700); await highlight('#labList .tag.itero', 2000);
    await page.$eval('#labList .tag.ext-lab', el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await wait(700); await highlight('#labList .lab-card:has(.tag.ext-lab)', 2400);
  });
  await scene('details', 'board', async () => {
    await focus();
    await click(card + ' .req-actions [data-act="labOpen"]');
    await page.waitForSelector('.modal #lcBody'); await wait(1500);
    await h.scroll(600, '.modal-body'); await wait(800);
    await page.keyboard.press('Escape');
    await h.scroll(0);
    await type('[data-input="labQ"]', '20981'); await wait(1500);
    await highlight('#labList .lab-card', 1200);
    await page.fill('[data-input="labQ"]', ''); await page.dispatchEvent('[data-input="labQ"]', 'input');
  });
  await scene('kpi', 'kpi', async () => {
    await h.nav('labkpi');
    await page.waitForSelector('#lkBody .rp-tile'); await wait(800);
    await highlight('#lkBody', 1500);
    await h.scroll(500); await wait(1200);
  });
  await scene('supply', 'supply', async () => {
    await h.nav('new');
    await page.waitForSelector('#itemSearch'); await wait(500);
    await highlight('.new-layout .card .hint', 1400);
    await type('#itemSearch', 'prophy');
    await page.waitForSelector('#comboList .combo-opt'); await wait(400);
    await page.keyboard.press('Enter'); await wait(300);
    await type('#itemSearch', 'cotton');
    await page.waitForSelector('#comboList .combo-opt'); await wait(400);
    await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await wait(500);
    await click('.item-line:nth-child(1) [data-d="1"]'); await wait(300);
    await click('#submitBtn'); await wait(1500);
    await h.nav('mine');
    await page.waitForSelector('#mineList .req'); await wait(500);
    await highlight('#mineList .req >> nth=0', 2200);
    await h.nav('labboard');
  });
}

if (require.main === module) makeTutorial({ id: 'lab', voiceLang: 'ar', noMoney: true, langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
