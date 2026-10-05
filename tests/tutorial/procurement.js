/* فيديو التموين — صوت إنجليزي + ترجمة عربية */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { en: 'This video is for procurement. You will learn how to prepare requests, send them in shipments, fix a mistake, and manage boxes and custody tools.',
    ar: 'هذا الفيديو للتموين: كيف تجهّز الطلبات، وترسلها على شحنات، وتصحح الخطأ، وتدير البوكسات وأدوات العهدة.' },
  login: { en: 'Sign in with your name and password. Your account shows only your department: dental or dermatology.',
    ar: 'سجّل الدخول باسمك ورقمك السري. حسابك يعرض طلبات قسمك فقط: أسنان أو جلدية.' },
  list: { en: 'The Requests page shows all requests. The chips at the top filter by stage: with the doctor, ready to prepare, in preparation, partially sent, and more. You can also filter by branch, or search.',
    ar: 'صفحة «الطلبات» تعرض كل الطلبات. الأزرار بالأعلى تفلتر حسب المرحلة: لدى الطبيب، جاهز للتجهيز، قيد التجهيز، مرسل جزئيًا، وغيرها. ويمكنك الفلترة بالفرع أو البحث.' },
  open: { en: 'Open a request that is ready. You see each item with the quantity the doctor approved. This is exactly what you prepare.',
    ar: 'افتح طلبًا جاهزًا، وسترى كل صنف بالكمية التي اعتمدها الطبيب، وهي بالضبط ما تجهّزه.' },
  itemst: { en: 'Set the status of each item: preparing, waiting for the vendor, or received from the vendor. The request moves to In preparation by itself.',
    ar: 'حدّد حالة كل صنف: قيد التجهيز، أو بانتظار المندوب، أو استلم المندوب، وينتقل الطلب لـ«قيد التجهيز» تلقائيًا.' },
  ship: { en: 'To send, tick the items and set the quantity for this shipment. You can send part now and the rest later. Then tap Send shipment.',
    ar: 'للإرسال حدّد الأصناف واكتب كمية هذه الشحنة، ويمكنك إرسال جزء الآن والباقي لاحقًا. ثم اضغط «إرسال الشحنة».' },
  left: { en: 'The card shows exactly what is left. When everything is sent, the request becomes Sent, and the nurse is notified.',
    ar: 'تعرض البطاقة المتبقي بالضبط، وعند إرسال كل شيء تصبح الحالة «تم الإرسال» وتُبلَّغ الممرضة.' },
  undo: { en: 'Sent something by mistake? Tap Undo last step, write the reason, and confirm. Every undo is recorded for the quality team.',
    ar: 'أرسلت شيئًا بالخطأ؟ اضغط «تراجع عن آخر خطوة»، واكتب السبب، ثم أكّد. كل تراجع يُسجَّل لفريق الجودة.' },
  print: { en: 'From the request details you can print the request, or save it as PDF.',
    ar: 'من تفاصيل الطلب يمكنك طباعته أو حفظه PDF.' },
  boxes: { en: 'The Boxes page shows where each doctor\'s box is: ready to deliver, at a branch, or empty. Print the QR stickers, and send the driver tasks link to the driver once.',
    ar: 'صفحة «البوكسات» تعرض مكان بوكس كل طبيب: جاهز للنقل، أو في الفرع، أو فارغ. اطبع ستيكرات QR، وأرسل رابط مهام السواق للسواق مرة واحدة.' },
  move: { en: 'Need a box back? Tap Request move and choose the place. It appears in the driver\'s tasks right away.',
    ar: 'تحتاج البوكس؟ اضغط «طلب نقل» واختر المكان، فيظهر في مهام السواق مباشرة.' },
  custody: { en: 'Custody is for company tools, like handpieces. Set the standard for each clinic, issue tools with their serial numbers, and handle broken tool reports.',
    ar: 'العهدة لأدوات الشركة مثل الهاندبيس: حدّد المعيار لكل عيادة، واصرف الأدوات بأرقامها التسلسلية، وتابع بلاغات الأدوات التالفة.' },
  complaints: { en: 'Complaints shows problems reported on requests. Read them and reply in the request comments. The quality team closes them.',
    ar: 'صفحة «البلاغات» تعرض المشاكل المرفوعة على الطلبات؛ اقرأها ورد في تعليقات الطلب، وفريق الجودة يغلقها.' },
  done: { en: 'That\'s it. Prepare approved requests quickly, and send what you have. Thank you!',
    ar: 'هذا كل شيء. جهّز الطلبات المعتمدة بسرعة وأرسل المتوفر. شكرًا لك!' }
};
const steps = {
  login: { en: 'Sign in', ar: 'تسجيل الدخول' }, req: { en: 'Requests', ar: 'الطلبات' }, ship: { en: 'Shipments', ar: 'الشحنات' },
  undo: { en: 'Undo', ar: 'التراجع' }, boxes: { en: 'Boxes', ar: 'البوكسات' }, custody: { en: 'Custody', ar: 'العهدة' }, comp: { en: 'Complaints', ar: 'البلاغات' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const ID = 'REQ-260927-016';
  const row = `.req[data-rid="${ID}"]`, exp = `#exp-${ID}`;
  await page.evaluate(() => { window.print = () => {}; });
  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Ali', '3333'); await highlight('#userRole', 1500); });
  await scene('list', 'req', async () => {
    await page.waitForSelector('#procList .req');
    for (const g of ['review', 'ready', 'prep', 'partial']) await highlight('.chip[data-g="' + g + '"]', 1300);
    await point('[data-change="procBranch"]'); await highlight('[data-change="procBranch"]', 1200);
  });
  await scene('open', 'req', async () => {
    await click('.chip[data-g="ready"]');
    await page.waitForSelector(row); await highlight(row, 1000);
    // «الكل» حتى يبقى الطلب ظاهرًا بعد تغيّر مرحلته
    await click('.chip[data-g="all"]'); await page.waitForSelector(row);
    await click(row + ' .req-actions [data-act="procToggle"]');
    await page.waitForSelector(exp + ' .dsp-table'); await wait(600);
    await highlight(exp + ' .dsp-table', 1800);
  });
  await scene('itemst', 'req', async () => {
    const sel = exp + ' .item-st >> nth=0';
    await point(sel);
    await page.selectOption(sel, 'بانتظار المندوب'); await wait(1500);
    if (!(await page.$(exp + ' .dsp'))) await click(row + ' .req-actions [data-act="procToggle"]');
    await highlight(row + ' .badge', 1000);
  });
  await scene('ship', 'ship', async () => {
    await page.waitForSelector(exp + ' .dsp');
    const q = exp + ' input.dsp-qty >> nth=0';
    await point(q); await page.fill(q, '1'); await page.dispatchEvent(q, 'input'); await wait(500);
    await click(exp + ' [data-act="dispatch"]'); await page.waitForSelector('.modal #bxpOk'); await wait(900); await click('.modal #bxpOk'); await wait(1200);
  });
  await scene('left', 'ship', async () => {
    await page.waitForSelector(row + ' .ship-left').catch(() => {});
    await highlight(row + ' .ship-left', 1800);
    if (!(await page.$(exp + ' [data-change="dspAll"]'))) await click(row + ' .req-actions [data-act="procToggle"]');
    await page.check(exp + ' [data-change="dspAll"]'); await wait(400);
    await click(exp + ' [data-act="dispatch"]'); await page.waitForSelector('.modal #bxpOk'); await wait(900); await click('.modal #bxpOk'); await wait(1200);
    await highlight(row + ' .badge', 1200);
  });
  await scene('undo', 'undo', async () => {
    await click(row + ' [data-act="revertStep"]');
    await page.waitForSelector('.modal #rvReason'); await wait(500);
    await type('.modal #rvReason', 'Sent before the vendor delivered');
    await click('.modal #rvOk'); await wait(1200);
  });
  await scene('print', 'req', async () => {
    await click(`[data-act="detail"][data-id="${ID}"]`);
    await page.waitForSelector('#dPrint'); await wait(800);
    await point('#dPrint'); await highlight('#dPrint', 1000);
    await page.keyboard.press('Escape');
  });
  await scene('boxes', 'boxes', async () => {
    await h.nav('boxes');
    await page.waitForSelector('#bxList .box-card');
    await highlight('#bxList .box-card', 1500);
    await point('[data-act="bxPrintAll"]'); await highlight('#bxDrvUrl', 1500);
  });
  await scene('move', 'boxes', async () => {
    await click('#bxList [data-act="bxMove"]');
    await page.waitForSelector('#bmTo'); await wait(500);
    await click('#bmOk'); await wait(1200);
  });
  await scene('custody', 'custody', async () => {
    await h.nav('assets');
    await click('[data-seg-name="asTab"][data-v="clinics"]');
    await wait(1000);
    const card = page.locator('#asClinics .card', { hasText: 'Dental Clinic 1' }).first();
    await card.scrollIntoViewIfNeeded().catch(() => {}); await wait(600);
    await card.evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'smooth' })).catch(() => {});
    await wait(2500);
  });
  await scene('complaints', 'comp', async () => {
    await h.nav('complaints');
    await page.waitForSelector('#cList .req').catch(() => {});
    await highlight('#cList .req', 1800);
  });
  await scene('done', '', async () => { await h.nav('requests'); });
}

if (require.main === module) makeTutorial({ id: 'procurement', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
