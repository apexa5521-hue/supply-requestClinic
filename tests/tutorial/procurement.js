/* فيديو التموين — صوت عربي (الشرح المعتمد) */
const { makeTutorial } = require('./engine');

const scenes = {
  intro: { ar: 'هذا الفيديو للتموين: تجهيز الطلبات، وإرسالها على شحنات، وتصحيح الخطأ، والبوكسات، وأدوات العهدة.' },
  login: { ar: 'سجّل الدخول باسمك ورقمك السري. حسابك يعرض طلبات قسمك فقط: أسنان أو جلدية.' },
  list: { ar: 'كل بطاقة ملوّنة بلون مرحلتها، والأزرار بالأعلى تفلتر حسب المرحلة: لدى الطبيب، معتمد، جديد، قيد التجهيز، مرسل جزئيًا، وصل الفرع.' },
  filters: { ar: 'اختر طبيبًا لتظهر طلباته فقط، أو فلتر بالفرع أو العيادة أو الشهر، أو ابحث.' },
  dental: { ar: 'مستهلكات العيادة تصلك الآن من كل عيادات الأسنان أيضًا، بحالة «جديد» وبدون طبيب.' },
  open: { ar: 'الكميات هي ما اعتمده الطبيب. حدّد حالة كل صنف: قيد التجهيز، أو بانتظار المندوب، أو استلم المندوب.' },
  sub: { ar: 'إذا لم يتوفر صنف اعتمده الطبيب، اضغط «إضافة مستهلك بديل» تحت الصنف، واختر البديل من الكتالوج. يرجع البديل للطبيب ليوافق عليه، ولا يُرسل قبل موافقته.' },
  ship: { ar: 'حدّد الأصناف واكتب كمية هذه الشحنة، ويمكنك إرسال جزء الآن والباقي لاحقًا.' },
  boxpick: { ar: 'اسم الطبيب والفرع معبّآن من الطلب، ويظهر هل تُحمَّل في بوكس موجود أو جديد. اضغط «تحميل في البوكس وإرسال».' },
  undo: { ar: 'أرسلت بالخطأ؟ اضغط «تراجع عن آخر خطوة» واكتب السبب. كل تراجع يُسجَّل لفريق الجودة.' },
  cancel: { ar: 'لإلغاء طلبات حدّدها واضغط «إلغاء الطلب» واكتب السبب، ويصل الممرضة إيميل. ولاحظ: الممرضة نفسها تقدر تعدّل أو تلغي طلبها ما دام «جديد» ولم تبدأ فيه.' },
  boxes: { ar: 'صفحة «البوكسات» تعرض مكان كل بوكس: جاهز للنقل، أو في الفرع، أو فارغ. اطبع ستيكر QR لكل بوكس وثبّته عليه، فيرتبط البوكس بطبيبه دائمًا. وأرسل رابط «الشحنات» للسواق مرة واحدة.' },
  move: { ar: 'تحتاج البوكس؟ اضغط «طلب نقل» واختر المكان، فيظهر في «الشحنات» عند السواق.' },
  std: { ar: 'العهدة لأدوات العيادات مثل الهاندبيس: حدّد المعيار لكل عيادة.' },
  issue: { ar: 'عند وصول طلب أداة من الممرضة لعيادة معيّنة، مثل عيادة 2: قبل إرسال الهاندبيس افتح صفحة «العهدة»، واضغط «صرف عهدة» تحت العيادة التي طلبتها، واكتب الرقم التسلسلي لكل قطعة (Enter للقطعة التالية)، ثم اضغط «صرف» وأرسلها مع السواق.' },
  edit: { ar: 'صرفت بالغلط؟ اضغط على الرقم التسلسلي: تقدر تصحّح الرقم أو الكمية، أو تنقلها لعيادة ثانية، أو تحذفها. كل تعديل يُسجَّل، والأداة التي عليها بلاغ مفتوح لا تُحذف.' },
  tickets: { ar: 'استلم الأداة بصورة حالتها، ثم قرّر: قابلة للتصليح، أو تالفة، أو مفقودة، واصرف بديلها.' },
  complaints: { ar: 'المشاكل المرفوعة على الطلبات: اقرأها ورد في تعليقات الطلب. شكرًا لك، وجهّز المعتمد بسرعة.' }
};
const steps = {
  login: { ar: 'تسجيل الدخول' }, req: { ar: 'الطلبات' }, ship: { ar: 'الشحنات' },
  undo: { ar: 'التصحيح' }, boxes: { ar: 'البوكسات' }, custody: { ar: 'العهدة' }, comp: { ar: 'البلاغات' }
};

async function flow(h) {
  const { page, scene, click, type, point, highlight, wait } = h;
  const ID = 'REQ-260927-016';
  const row = `.req[data-rid="${ID}"]`, exp = `#exp-${ID}`;
  await page.evaluate(() => { window.print = () => {}; });
  // طلب معتمد من د. سعد (له حساب): لمشهد المستهلك البديل
  const subId = (await h.api('createRequest', [{ branch: 'Unayzah', doctor: 'Dr. Saad', type: 'شهري', items: [{ name: 'PROPHY PASTE', qty: 3 }, { name: 'Cotton rolls', qty: 4 }] }], ['Mona', '1212'])).id;
  await h.api('doctorReview', [subId, 'اعتمد', '', []], ['Dr. Saad', '4545']);
  const dentalId = (await h.api('createRequest', [{ clinic: 'Dental Clinic 1', type: 'شهري', items: [{ name: 'Cotton rolls', qty: 6 }, { name: 'Gloves M', qty: 4 }] }], ['Sara', '1111'])).id;
  await scene('intro', '', async () => { await wait(500); });
  await scene('login', 'login', async () => { await h.login('Ali', '3333'); await highlight('#userRole', 1500); });
  await scene('list', 'req', async () => {
    await page.waitForSelector('#procList .req');
    await highlight('#procList .req >> nth=0', 1300);
    for (const g of ['review', 'docok', 'ready', 'prep', 'partial', 'arrived']) await highlight('.chip[data-g="' + g + '"]', 900);
  });
  await scene('filters', 'req', async () => {
    const d = '[data-change="procDoctor"]';
    await point(d);
    const doc = await page.$eval(d, el => (Array.from(el.options).find(o => o.value === 'Dr. Saad') || el.options[1] || {}).value || '');
    if (doc) { await page.selectOption(d, doc); await wait(1500); await page.selectOption(d, ''); await wait(400); }
    await highlight('[data-change="procBranch"]', 900);
  });
  await scene('dental', 'req', async () => {
    await click('.chip[data-g="ready"]'); await wait(600);
    const dRow = `.req[data-rid="${dentalId}"]`;
    await page.waitForSelector(dRow);
    await page.locator(dRow).scrollIntoViewIfNeeded(); await wait(300);
    await highlight(dRow, 2600);
  });
  await scene('open', 'req', async () => {
    await click('.chip[data-g="all"]'); await page.waitForSelector(row);
    await page.locator(row).scrollIntoViewIfNeeded();
    await click(row + ' .req-actions [data-act="procToggle"]');
    await page.waitForSelector(exp + ' .dsp-table'); await wait(500);
    await highlight(exp + ' .dsp-table', 1300);
    const sel = exp + ' .item-st >> nth=0';
    await point(sel);
    await page.selectOption(sel, 'بانتظار المندوب'); await wait(1300);
    if (!(await page.$(exp + ' .dsp'))) await click(row + ' .req-actions [data-act="procToggle"]');
  });
  await scene('sub', 'req', async () => {
    const srow = `.req[data-rid="${subId}"]`, sexp = `#exp-${subId}`;
    await page.locator(srow).scrollIntoViewIfNeeded();
    await click(srow + ' .req-actions [data-act="procToggle"]');
    await page.waitForSelector(sexp + ' [data-act="subItem"]'); await wait(500);
    await click(sexp + ' [data-act="subItem"] >> nth=0');
    await page.waitForSelector('.modal #subItem'); await wait(400);
    await type('.modal #subItem', 'Gloves M');
    await type('.modal #subNote', 'Nupro is out of stock this week');
    await click('.modal #subOk'); await wait(1300);
    await highlight(sexp + ' .sub-tag >> nth=0', 1500).catch(() => {});
    await click(srow + ' .req-actions [data-act="procToggle"]'); await wait(400);
    await page.locator(row).scrollIntoViewIfNeeded();
  });
  await scene('ship', 'ship', async () => {
    await page.waitForSelector(exp + ' .dsp');
    const q = exp + ' input.dsp-qty >> nth=0';
    await point(q); await page.fill(q, '1'); await page.dispatchEvent(q, 'input'); await wait(500);
    await click(exp + ' [data-act="dispatch"]'); await page.waitForSelector('.modal #bxpOk'); await wait(500);
  });
  await scene('boxpick', 'ship', async () => {
    await highlight('.modal .bxp-owner', 1200); await highlight('.modal .bxp-branch', 1000);
    await page.waitForSelector('.modal .bxp-hint .i').catch(() => {}); await highlight('.modal .bxp-hint', 1200);
    await click('.modal #bxpOk'); await wait(1200);
    await page.waitForSelector(row + ' .ship-left').catch(() => {});
  });
  await scene('undo', 'undo', async () => {
    await click(row + ' [data-act="revertStep"]');
    await page.waitForSelector('.modal #rvReason'); await wait(400);
    await type('.modal #rvReason', 'Sent before the vendor delivered');
    await click('.modal #rvOk'); await wait(1200);
  });
  await scene('cancel', 'undo', async () => {
    const cid = await page.evaluate(id => (S.proc.list.find(r => r.id !== id && ['جديد', 'معتمد من الطبيب', 'قيد التجهيز'].indexOf(r.status) !== -1 && !(r.shipmentCount > 0)) || {}).id, ID);
    if (!cid) throw new Error('no cancellable request in the demo data');
    await click('.chip[data-g="all"]'); await wait(400);
    const cRow = `.req[data-rid="${cid}"]`;
    await page.locator(cRow).scrollIntoViewIfNeeded(); await wait(300);
    await click(cRow + ' .req-main > .check');
    await page.waitForSelector('#bulkbar.show [data-act="bulkCancel"]'); await wait(300);
    await click('#bulkbar [data-act="bulkCancel"]');
    await page.waitForSelector('.modal #cnReason'); await wait(300);
    await type('.modal #cnReason', 'Item not available at the supplier this month');
    await click('.modal #cnOk'); await wait(1300);
    await page.locator(cRow + ' .cancel-box').scrollIntoViewIfNeeded().catch(() => {});
    await highlight(cRow + ' .cancel-box', 1500);
    await h.scroll(0);
  });
  await scene('boxes', 'boxes', async () => {
    await h.nav('boxes');
    await page.waitForSelector('#bxList .box-card');
    await highlight('#bxList .box-card', 1500);
    await point('[data-act="bxPrintAll"]'); await highlight('[data-act="bxPrintAll"]', 1300);
    await highlight('#bxDrvUrl', 1500);
  });
  await scene('move', 'boxes', async () => {
    await click('#bxList [data-act="bxMove"]');
    await page.waitForSelector('#bmTo'); await wait(500);
    await click('#bmOk'); await wait(1200);
  });
  await scene('std', 'custody', async () => {
    await h.nav('assets');
    await click('[data-seg-name="asTab"][data-v="clinics"]');
    await page.waitForSelector('#asClinics [data-act="asStd"][data-clinic="Dental Clinic 2"]');
    await page.locator('#asClinics [data-act="asStd"][data-clinic="Dental Clinic 2"]').first().scrollIntoViewIfNeeded(); await wait(400);
    await click('#asClinics [data-act="asStd"][data-clinic="Dental Clinic 2"]');
    await page.waitForSelector('.modal #sdQty'); await wait(300);
    await page.selectOption('.modal #sdItem', 'Handpiece Low Speed'); await wait(300);
    await type('.modal #sdQty', '5');
    await click('.modal #sdOk'); await wait(1100);
  });
  await scene('issue', 'custody', async () => {
    await click('#asClinics [data-act="asIssue"][data-clinic="Dental Clinic 2"]');
    await page.waitForSelector('.modal #isItem'); await wait(400);
    await page.selectOption('.modal #isItem', 'Handpiece Low Speed'); await wait(400);
    await type('.modal #isSer .input >> nth=0', 'NSK-2004');
    await page.press('.modal #isSer .input >> nth=0', 'Enter'); await wait(300);
    await page.keyboard.type('NSK-2005', { delay: 60 }); await wait(400);
    await highlight('.modal #isSerN', 900);
    await click('.modal #isOk'); await wait(1300);
  });
  await scene('edit', 'custody', async () => {
    const card = '#asClinics section:has-text("Dental Clinic 2")';
    await page.waitForSelector(card + ' button.as-unit:has-text("NSK-2005")');
    await click(card + ' button.as-unit:has-text("NSK-2005")');
    await page.waitForSelector('.modal #aeSer'); await wait(400);
    await type('.modal #aeSer', 'NSK-2006');
    await highlight('.modal #aeClinic', 1000);
    await point('.modal #aeDel'); await highlight('.modal #aeDel', 1000);
    await click('.modal #aeOk'); await wait(1200);
  });
  // بلاغ من الممرضة على هاندبيس حتى تظهر قائمة البلاغات
  await page.evaluate(png => {
    const tk = __api(null, 'login', ['Sara', '1111']).token;
    const c = __api(tk, 'getClinicAssets', [{ clinic: 'Dental Clinic 1' }])[0];
    const a = c.items.find(i => i.item === 'Handpiece Low Speed').assets.find(x => x.serial === 'NSK-1001');
    __api(tk, 'reportAsset', [{ assetId: a.id, problem: 'خربانة', description: 'Loud noise and overheating', photo: 'data:image/png;base64,' + png, clientKey: 'tut-asset-1' }]);
  }, h.png.toString('base64'));
  await scene('tickets', 'custody', async () => {
    await click('[data-seg-name="asTab"][data-v="tickets"]');
    await page.waitForSelector('#asTickets .req').catch(() => {});
    await highlight('#asTickets .req', 1100);
    if (await page.$('#asTickets [data-act="asTicket"]')) {
      await click('#asTickets [data-act="asTicket"]');
      await wait(1500);
      await h.scroll(5000, '.modal-body'); await wait(1200);
      await page.keyboard.press('Escape');
    }
  });
  await scene('complaints', 'comp', async () => {
    await h.nav('complaints');
    await page.waitForSelector('#cList .req').catch(() => {});
    await highlight('#cList .req', 1800);
  });
}

if (require.main === module) makeTutorial({ id: 'procurement', noMoney: true, voiceLang: 'ar', langs: ['ar'], scenes, steps, flow }).catch(e => { console.error('TUTORIAL FAILED', e); process.exit(1); });
module.exports = { scenes, steps, flow };
